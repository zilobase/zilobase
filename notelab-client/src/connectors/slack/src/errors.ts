export class SlackConnectorError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { code?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "SlackConnectorError";
    this.code = options.code;
    this.status = options.status;
  }
}
