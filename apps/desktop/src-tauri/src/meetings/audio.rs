use std::collections::VecDeque;

pub(super) fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

#[cfg(test)]
fn resample_linear(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let target_len = (samples.len() as f64 / ratio).floor() as usize;
    (0..target_len)
        .map(|index| {
            let position = index as f64 * ratio;
            let lower = position.floor() as usize;
            let upper = (lower + 1).min(samples.len() - 1);
            let fraction = (position - lower as f64) as f32;
            samples[lower] + (samples[upper] - samples[lower]) * fraction
        })
        .collect()
}

#[derive(Default)]
pub(super) struct StreamingLinearResampler {
    from_rate: u32,
    input: VecDeque<f32>,
    position: f64,
}

impl StreamingLinearResampler {
    pub(super) fn process(&mut self, samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
        if from_rate == to_rate {
            return samples.to_vec();
        }
        if self.from_rate != from_rate {
            self.from_rate = from_rate;
            self.input.clear();
            self.position = 0.0;
        }
        self.input.extend(samples.iter().copied());
        let ratio = from_rate as f64 / to_rate as f64;
        let mut output = Vec::new();
        while self.position + 1.0 < self.input.len() as f64 {
            let lower = self.position.floor() as usize;
            let upper = lower + 1;
            let fraction = (self.position - lower as f64) as f32;
            let left = self.input.get(lower).copied().unwrap_or_default();
            let right = self.input.get(upper).copied().unwrap_or(left);
            output.push(left + (right - left) * fraction);
            self.position += ratio;
        }
        let consumed = self.position.floor() as usize;
        self.input.drain(..consumed.min(self.input.len()));
        self.position -= consumed as f64;
        output
    }
}

#[cfg(test)]
mod tests {
    use super::{downmix_to_mono, resample_linear, StreamingLinearResampler};

    #[test]
    fn downmixes_interleaved_stereo_frames() {
        assert_eq!(downmix_to_mono(&[1.0, -1.0, 0.5, 0.5], 2), vec![0.0, 0.5]);
    }

    #[test]
    fn resamples_to_the_transcription_rate() {
        let source = vec![0.25; 480];
        let result = resample_linear(&source, 48_000, 24_000);
        assert_eq!(result.len(), 240);
        assert!(result.iter().all(|sample| *sample == 0.25));
    }

    #[test]
    fn streaming_resampling_preserves_fractional_state_between_chunks() {
        let mut resampler = StreamingLinearResampler::default();
        let first = resampler.process(&vec![0.25; 241], 48_000, 24_000);
        let second = resampler.process(&vec![0.25; 239], 48_000, 24_000);
        assert_eq!(first.len() + second.len(), 240);
        assert!(first.iter().chain(&second).all(|sample| *sample == 0.25));
    }
}
