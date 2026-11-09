// Error with an HTTP status that the error handler turns into a JSON response.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
