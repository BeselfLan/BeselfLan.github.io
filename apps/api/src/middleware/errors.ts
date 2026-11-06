import type { ErrorRequestHandler, RequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Not found" } });
};

// Express recognises an error handler by its four parameters. `next` is used
// once the response has started: Express then closes the connection.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    req.log.error(err);
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  // A client error raised below us: a body-parser failure (bad JSON, too
  // large) or a malformed URL escape in a route parameter. Their messages can
  // quote the request, so the text here is fixed.
  const { status } = err as { status?: unknown };
  if (typeof status === "number" && status >= 400 && status < 500) {
    const tooLarge = status === 413;
    // A handler upstream may already have set a type, such as a served file's.
    res.removeHeader("Content-Type");
    res.status(status).json({
      error: {
        code: tooLarge ? "payload_too_large" : "bad_request",
        message: tooLarge ? "Request body too large" : "Bad request",
      },
    });
    return;
  }
  // Logged, never echoed: the message may hold paths or internals.
  req.log.error(err);
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error" },
  });
};
