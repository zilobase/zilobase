export class GoogleCalendarConnectorError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, options: { code: string; status?: number }) {
    super(message);
    this.name = "GoogleCalendarConnectorError";
    this.code = options.code;
    this.status = options.status;
  }
}
