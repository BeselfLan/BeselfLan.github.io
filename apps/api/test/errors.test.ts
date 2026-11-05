import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/middleware/errors.ts";
import { makeApp } from "./helpers.ts";

describe("errors", () => {
  it("hides internals", async () => {
    const app = makeApp(
      {},
      {
        readManifest: () => Promise.reject(new Error("internal-marker")),
      },
    );
    const res = await request(app).get("/health");
    expect(res.status).toBe(500);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
    expect(res.text).not.toContain("internal-marker");
  });

  it("keeps an ApiError's status and code", async () => {
    const app = makeApp(
      {},
      {
        readManifest: () =>
          Promise.reject(new ApiError(418, "teapot", "short")),
      },
    );
    const res = await request(app).get("/health");
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ error: { code: "teapot", message: "short" } });
  });

  it("unknown route returns a JSON 404", async () => {
    const res = await request(makeApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "not_found", message: "Not found" },
    });
  });
});
