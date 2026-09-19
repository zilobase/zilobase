const MessageType = {
  Auth: 2,
  Awareness: 1,
} as const;

class IncomingMessage {
  constructor(_message: Uint8Array) {}

  readVarString() {
    return "";
  }

  readVarUint() {
    return -1;
  }
}

class OutgoingMessage {
  constructor(_address: string) {}

  writeTokenSyncRequest() {
    return this;
  }

  toUint8Array() {
    return new Uint8Array();
  }
}

export { IncomingMessage, MessageType, OutgoingMessage };
