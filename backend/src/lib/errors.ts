// Единый формат ошибок API — соответствует матрице ошибок из use-cases.md (UC-1, UC-2).
// Пример: throw new ApiError(409, "slot_full", { available_seats: 0 })

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, details?: Record<string, unknown>) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
