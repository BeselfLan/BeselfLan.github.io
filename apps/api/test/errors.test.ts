import type { Request, Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.ts";
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

describe("started responses", () => {
  it("leaves a started response to Express", () => {
    const err = new Error("x");
    const req = { log: { error: vi.fn() } };
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const next = vi.fn();
    errorHandler(
      err,
      req as unknown as Request,
      res as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.log.error).toHaveBeenCalledWith(err);
  });
});
