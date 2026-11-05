import cors from "cors";

/** Exact-match allowlist: no regex, no prefix or suffix checks. */
export function corsMiddleware(origins: readonly string[]) {
  const allowed = new Set(origins);
  return cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, health checks) are not CORS.
      callback(null, origin === undefined || allowed.has(origin));
    },
  });
}
