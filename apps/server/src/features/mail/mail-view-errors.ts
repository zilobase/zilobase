export class MailViewServiceError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409) {
    super(message)
    this.name = "MailViewServiceError"
  }
}
