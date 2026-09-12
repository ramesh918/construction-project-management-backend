export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
