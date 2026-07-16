export function getErrorDetails(error) {
  if (!error) return { message: "Unknown error" };

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack
    };
  }

  if (typeof error === "string") return { message: error };

  if (typeof error === "object") {
    return {
      message:
        error.message ||
        error.error_description ||
        error.details ||
        error.hint ||
        JSON.stringify(error),
      code: error.code,
      details: error.details,
      hint: error.hint,
      status: error.status
    };
  }

  return { message: String(error) };
}

export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}
