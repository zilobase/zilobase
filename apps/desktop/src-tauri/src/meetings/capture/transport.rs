use super::*;

pub(super) struct MeetingAudioTransport {
    pub(super) active_sources: Vec<AudioSource>,
    pub(super) connected_at: Option<Instant>,
    pub(super) disabled: bool,
    pub(super) pending: HashMap<AudioSource, PendingMeetingAudio>,
    pub(super) protocol: String,
    pub(super) reconnect_attempts: u8,
    pub(super) replay_frames: VecDeque<MeetingAudioPacket>,
    pub(super) socket: Option<WebSocket<MaybeTlsStream<std::net::TcpStream>>>,
    pub(super) url: String,
}

#[derive(Clone)]
pub(super) struct MeetingAudioPacket {
    pub(super) bytes: Vec<u8>,
    pub(super) end_sequence: u64,
    pub(super) sequence: u64,
    pub(super) source: AudioSource,
}

#[derive(Default)]
pub(super) struct PendingMeetingAudio {
    pub(super) samples: Vec<f32>,
    pub(super) sequence: Option<u64>,
}

impl MeetingAudioTransport {
    pub(super) fn from_config(config: &MeetingCaptureConfig) -> Result<Option<Self>, String> {
        match (&config.audio_websocket_url, &config.audio_ticket) {
            (Some(url), Some(ticket)) => Self::from_parts(url.clone(), ticket.clone()).map(Some),
            (None, None) => Ok(None),
            _ => Err("Meeting audio URL and ticket must be provided together".into()),
        }
    }

    pub(super) fn from_parts(url: String, ticket: String) -> Result<Self, String> {
        let parsed = url::Url::parse(&url)
            .map_err(|_| "The meeting audio WebSocket URL is invalid".to_string())?;
        if !matches!(parsed.scheme(), "ws" | "wss") {
            return Err("Meeting audio transport must use WebSocket".into());
        }
        Ok(Self {
            active_sources: Vec::new(),
            connected_at: None,
            disabled: false,
            pending: HashMap::new(),
            protocol: format!("zilobase.meeting-audio.v2, zilobase.meeting-audio.auth.{ticket}"),
            reconnect_attempts: 0,
            replay_frames: VecDeque::with_capacity(TRANSPORT_REPLAY_CAPACITY),
            socket: None,
            url,
        })
    }

    pub(super) fn update_credentials(&mut self, url: String, ticket: String) {
        self.url = url;
        self.protocol = format!("zilobase.meeting-audio.v2, zilobase.meeting-audio.auth.{ticket}");
    }

    pub(super) fn connect(&mut self) -> Result<(), String> {
        let mut request = self
            .url
            .as_str()
            .into_client_request()
            .map_err(|error| format!("Could not create meeting audio request: {error}"))?;
        request.headers_mut().insert(
            SEC_WEBSOCKET_PROTOCOL,
            HeaderValue::from_str(&self.protocol)
                .map_err(|_| "Meeting audio ticket is invalid".to_string())?,
        );
        let (socket, _) = tungstenite::connect(request)
            .map_err(|error| format!("Could not connect meeting transcription: {error}"))?;
        let mut socket = socket;
        set_transport_read_timeout(&mut socket)?;
        self.socket = Some(socket);
        self.connected_at = Some(Instant::now());
        Ok(())
    }

    pub(super) fn connect_ready(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        self.connect()?;
        self.send_control(serde_json::json!({
            "sources": &self.active_sources,
            "type": "recording.configure",
        }))?;
        let events = match self.wait_for_event("meeting.ready") {
            Ok(events) => events,
            Err(error) => {
                self.socket = None;
                self.connected_at = None;
                return Err(error);
            }
        };
        self.apply_ready_watermark(&events)?;
        Ok(events)
    }

    pub(super) fn send_frame(
        &mut self,
        source: AudioSource,
        sequence: u64,
        samples: &[f32],
    ) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            return Ok(Vec::new());
        }
        let discontinuous = self.pending.get(&source).is_some_and(|pending| {
            pending.sequence.is_some_and(|start| {
                start.saturating_add((pending.samples.len() / FRAME_SAMPLES) as u64) != sequence
            })
        });
        let mut events = if discontinuous {
            self.flush_frame(source)?
        } else {
            Vec::new()
        };
        let pending = self.pending.entry(source).or_default();
        pending.sequence.get_or_insert(sequence);
        pending.samples.extend_from_slice(samples);
        if pending.samples.len() < TRANSPORT_BATCH_SAMPLES {
            return Ok(events);
        }
        events.extend(self.flush_frame(source)?);
        Ok(events)
    }

    pub(super) fn flush_frame(
        &mut self,
        source: AudioSource,
    ) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            self.pending.remove(&source);
            return Ok(Vec::new());
        }
        let pending = self.pending.remove(&source).unwrap_or_default();
        if pending.samples.is_empty() {
            return Ok(Vec::new());
        }
        let sequence = pending.sequence.unwrap_or_default();
        let samples = pending.samples;
        let mut bytes = Vec::with_capacity(9 + samples.len() * 2);
        bytes.extend_from_slice(&sequence.to_le_bytes());
        bytes.push(meeting_audio_source_code(source));
        for sample in &samples {
            let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            bytes.extend_from_slice(&pcm.to_le_bytes());
        }

        let frame_count = samples.len().div_ceil(FRAME_SAMPLES) as u64;
        let end_sequence = sequence
            .checked_add(frame_count.saturating_sub(1))
            .ok_or_else(|| "Meeting audio sequence overflowed".to_string())?;
        let packet = MeetingAudioPacket {
            bytes,
            end_sequence,
            sequence,
            source,
        };
        let mut events = Vec::new();

        for attempt in 0..2 {
            if self.reconnect_attempts >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS {
                self.disabled = true;
                return Err("Meeting transcription is unavailable after repeated reconnects; local recording continues".into());
            }
            if self.socket.is_none() {
                match self.connect_ready() {
                    Ok(ready_events) => events.extend(ready_events),
                    Err(error) => {
                        self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
                        if self.reconnect_attempts >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS {
                            self.disabled = true;
                        }
                        return Err(error);
                    }
                }
            }
            if self.connected_at.is_some_and(|connected_at| {
                connected_at.elapsed() >= TRANSCRIPTION_STABLE_CONNECTION
            }) {
                self.reconnect_attempts = 0;
            }
            let result = self
                .socket
                .as_mut()
                .expect("meeting audio socket was connected")
                .send(tungstenite::Message::Binary(packet.bytes.clone().into()));
            if result.is_ok() {
                self.remember_packet(packet);
                events.extend(self.read_server_events());
                return Ok(events);
            }
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
            if attempt == 0 {
                thread::sleep(Duration::from_millis(100));
            }
        }
        Err("Meeting transcription disconnected; local recording continues".into())
    }

    pub(super) fn flush_frames(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = Vec::new();
        for source in self.active_sources.clone() {
            events.extend(self.flush_frame(source)?);
        }
        Ok(events)
    }

    pub(super) fn pause(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = self.flush_frames()?;
        if self.disabled {
            return Ok(events);
        }
        if self.socket.is_none() {
            events.extend(self.connect_ready()?);
        }
        self.send_control(serde_json::json!({ "type": "recording.pause" }))?;
        events.extend(self.wait_for_event("recording.paused")?);
        Ok(events)
    }

    pub(super) fn resume(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            return Ok(Vec::new());
        }
        if self.socket.is_none() {
            return self.connect_ready();
        } else {
            self.send_control(serde_json::json!({ "type": "recording.resume" }))?;
        }
        match self.wait_for_event("meeting.ready") {
            Ok(events) => {
                self.apply_ready_watermark(&events)?;
                Ok(events)
            }
            Err(_error) if self.socket.is_none() && !self.disabled => self.connect_ready(),
            Err(error) => Err(error),
        }
    }

    pub(super) fn stop(
        &mut self,
        duration_ms: u64,
    ) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = match self.flush_frames() {
            Ok(events) => events,
            Err(_error) if self.disabled => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        if self.disabled {
            return Ok(events);
        }
        if self.socket.is_none() {
            events.extend(self.connect_ready()?);
        }
        self.send_control(serde_json::json!({
            "durationMs": duration_ms,
            "type": "recording.stop",
        }))?;
        events.extend(self.wait_for_event("recording.flush.completed")?);
        Ok(events)
    }

    pub(super) fn send_control(&mut self, value: serde_json::Value) -> Result<(), String> {
        let result = self
            .socket
            .as_mut()
            .ok_or_else(|| "Meeting transcription is disconnected".to_string())?
            .send(tungstenite::Message::Text(value.to_string().into()));
        if let Err(error) = result {
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
            return Err(format!("Could not control meeting transcription: {error}"));
        }
        Ok(())
    }

    pub(super) fn wait_for_event(
        &mut self,
        expected: &str,
    ) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut collected = Vec::new();
        loop {
            let events = self.read_server_events();
            for event in events {
                if event.kind == "recording.error" {
                    return Err(event
                        .message
                        .unwrap_or_else(|| "Meeting transcription failed".into()));
                }
                let complete = event.kind == expected;
                collected.push(event);
                if complete {
                    return Ok(collected);
                }
            }
            if self.disabled || self.socket.is_none() {
                return Err("Meeting transcription connection closed".into());
            }
            if Instant::now() >= deadline {
                return Err(format!("Timed out waiting for {expected}"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    pub(super) fn apply_ready_watermark(
        &mut self,
        events: &[MeetingAudioServerEvent],
    ) -> Result<(), String> {
        let Some(next_sequences) = events
            .iter()
            .rev()
            .find(|event| event.kind == "meeting.ready")
            .and_then(|event| event.next_sequences.as_ref())
        else {
            return Ok(());
        };
        self.replay_frames = self
            .replay_frames
            .drain(..)
            .filter_map(|packet| {
                let next_sequence = next_sequences.get(&packet.source).copied().unwrap_or(0);
                trim_meeting_audio_packet(packet, next_sequence)
            })
            .collect();
        let socket = self
            .socket
            .as_mut()
            .ok_or_else(|| "Meeting transcription connection closed".to_string())?;
        for packet in &self.replay_frames {
            socket
                .send(tungstenite::Message::Binary(packet.bytes.clone().into()))
                .map_err(|error| format!("Could not replay meeting audio: {error}"))?;
        }
        Ok(())
    }

    pub(super) fn remember_packet(&mut self, packet: MeetingAudioPacket) {
        self.replay_frames.push_back(packet);
        if self.replay_frames.len() > TRANSPORT_REPLAY_CAPACITY {
            self.replay_frames.pop_front();
        }
    }

    pub(super) fn close(&mut self, reason: &'static str) {
        let _ = self.flush_frames();
        if let Some(mut socket) = self.socket.take() {
            let _ = socket.close(Some(CloseFrame {
                code: CloseCode::Normal,
                reason: reason.into(),
            }));
        }
    }

    pub(super) fn read_server_events(&mut self) -> Vec<MeetingAudioServerEvent> {
        let mut events = Vec::new();
        let mut connection_closed = false;
        if let Some(socket) = self.socket.as_mut() {
            loop {
                match socket.read() {
                    Ok(tungstenite::Message::Text(text)) => {
                        if let Ok(event) = serde_json::from_str::<MeetingAudioServerEvent>(&text) {
                            events.push(event);
                        }
                    }
                    Ok(tungstenite::Message::Close(frame)) => {
                        if frame.is_some_and(|frame| {
                            u16::from(frame.code) == MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE
                        }) {
                            self.disabled = true;
                        } else {
                            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
                        }
                        self.socket = None;
                        self.connected_at = None;
                        break;
                    }
                    Ok(_) => {}
                    Err(tungstenite::Error::Io(error))
                        if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
                    {
                        break;
                    }
                    Err(
                        tungstenite::Error::ConnectionClosed | tungstenite::Error::AlreadyClosed,
                    ) => {
                        connection_closed = true;
                        break;
                    }
                    Err(_) => {
                        connection_closed = true;
                        break;
                    }
                }
            }
        }
        if connection_closed {
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
        }
        if let Some(ticket) = events
            .iter()
            .rev()
            .find(|event| event.kind == "recording.ticket")
            .and_then(|event| event.token.clone())
        {
            self.update_credentials(self.url.clone(), ticket);
        }
        events
    }
}

pub(super) fn trim_meeting_audio_packet(
    packet: MeetingAudioPacket,
    next_sequence: u64,
) -> Option<MeetingAudioPacket> {
    if packet.end_sequence < next_sequence {
        return None;
    }
    if packet.sequence >= next_sequence {
        return Some(packet);
    }
    let skipped_frames = usize::try_from(next_sequence - packet.sequence).ok()?;
    let skipped_bytes = skipped_frames.checked_mul(FRAME_SAMPLES * 2)?;
    let pcm = packet.bytes.get(9 + skipped_bytes..)?;
    if pcm.is_empty() {
        return None;
    }
    let mut bytes = Vec::with_capacity(9 + pcm.len());
    bytes.extend_from_slice(&next_sequence.to_le_bytes());
    bytes.push(meeting_audio_source_code(packet.source));
    bytes.extend_from_slice(pcm);
    Some(MeetingAudioPacket {
        bytes,
        end_sequence: packet.end_sequence,
        sequence: next_sequence,
        source: packet.source,
    })
}

pub(super) fn meeting_audio_source_code(source: AudioSource) -> u8 {
    match source {
        AudioSource::Microphone => 0,
        AudioSource::System => 1,
    }
}

pub(super) fn spawn_transport_worker(
    app: AppHandle,
    meeting_id: String,
    mut transport: MeetingAudioTransport,
) -> TransportWorker {
    let (commands, receiver) = mpsc::sync_channel(TRANSPORT_CHANNEL_CAPACITY);
    let (control, control_receiver) = mpsc::channel();
    let _ = thread::Builder::new()
        .name("meeting-audio-transport".into())
        .spawn(move || {
            let mut paused = false;
            let mut stopping = false;
            loop {
                while let Ok(message) = control_receiver.try_recv() {
                    if matches!(
                        &message,
                        TransportControl::Pause { .. } | TransportControl::Stop { .. }
                    ) {
                        drain_transport_frames(&app, &meeting_id, &mut transport, &receiver);
                    }
                    apply_transport_control(
                        &app,
                        &meeting_id,
                        &mut transport,
                        &mut paused,
                        &mut stopping,
                        message,
                    );
                }
                if stopping {
                    break;
                }
                if paused {
                    match control_receiver.recv_timeout(Duration::from_millis(100)) {
                        Ok(message) => {
                            if matches!(&message, TransportControl::Stop { .. }) {
                                drain_transport_frames(
                                    &app,
                                    &meeting_id,
                                    &mut transport,
                                    &receiver,
                                );
                            }
                            apply_transport_control(
                                &app,
                                &meeting_id,
                                &mut transport,
                                &mut paused,
                                &mut stopping,
                                message,
                            );
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    continue;
                }
                let command = match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(command) => command,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                match command {
                    TransportCommand::Frame {
                        samples,
                        sequence,
                        source,
                    } => {
                        if let Ok(events) = transport.send_frame(source, sequence, &samples) {
                            emit_transport_events(&app, &meeting_id, events);
                        }
                    }
                }
            }
            transport.close("Meeting stopped");
        });
    TransportWorker { commands, control }
}

pub(super) fn set_transport_read_timeout(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> Result<(), String> {
    let timeout = Some(Duration::from_millis(1));
    match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => stream.set_read_timeout(timeout),
        MaybeTlsStream::Rustls(stream) => stream.sock.set_read_timeout(timeout),
        _ => Ok(()),
    }
    .map_err(|error| format!("Could not configure meeting transcription: {error}"))
}

pub(super) fn apply_transport_control(
    app: &AppHandle,
    meeting_id: &str,
    transport: &mut MeetingAudioTransport,
    paused: &mut bool,
    stopping: &mut bool,
    control: TransportControl,
) {
    match control {
        TransportControl::Pause { response } => {
            let result = transport.pause();
            if let Ok(events) = &result {
                *paused = true;
                emit_transport_events(app, meeting_id, events.clone());
            }
            let _ = response.send(result.map(|_| ()));
        }
        TransportControl::Resume { response } => {
            let result = transport.resume();
            if let Ok(events) = &result {
                *paused = false;
                emit_transport_events(app, meeting_id, events.clone());
            }
            let _ = response.send(result.map(|_| ()));
        }
        TransportControl::RefreshCredentials { ticket, url } => {
            transport.update_credentials(url, ticket);
        }
        TransportControl::Stop {
            duration_ms,
            response,
        } => {
            let result = transport.stop(duration_ms);
            if let Ok(events) = &result {
                emit_transport_events(app, meeting_id, events.clone());
            }
            *stopping = true;
            let _ = response.send(result.map(|_| ()));
        }
    }
}

pub(super) fn emit_transport_events(
    app: &AppHandle,
    meeting_id: &str,
    events: Vec<MeetingAudioServerEvent>,
) {
    for event in events {
        if event.kind != "transcript.delta" {
            continue;
        }
        let Some(item_id) = event.item_id else {
            continue;
        };
        let Some(source) = event.source else { continue };
        let Some(start_ms) = event.start_ms else {
            continue;
        };
        let Some(text) = event.text else { continue };
        let Some(updated_at) = event.updated_at else {
            continue;
        };
        let _ = app.emit(
            "meeting-capture-transcript",
            MeetingTranscriptDraft {
                item_id,
                meeting_id: meeting_id.to_string(),
                source,
                start_ms,
                text,
                updated_at,
            },
        );
    }
}

pub(super) fn drain_transport_frames(
    app: &AppHandle,
    meeting_id: &str,
    transport: &mut MeetingAudioTransport,
    receiver: &mpsc::Receiver<TransportCommand>,
) {
    while let Ok(TransportCommand::Frame {
        samples,
        sequence,
        source,
    }) = receiver.try_recv()
    {
        if let Ok(events) = transport.send_frame(source, sequence, &samples) {
            emit_transport_events(app, meeting_id, events);
        }
    }
}
