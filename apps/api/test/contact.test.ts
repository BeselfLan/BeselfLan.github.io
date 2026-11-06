import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "./helpers.ts";

const env = { RESEND_API_KEY: "key-marker", CONTACT_TO: "owner@owner.test" };
const valid = {
  name: "Visitor Name",
  email: "visitor@visitor.test",
  message: "Hello from a visitor",
};

const sendMail = vi.fn(async (_mail: unknown) => {});
const app = (over: Record<string, string | undefined> = {}, deps = {}) =>
  makeApp({ ...env, ...over } as Record<string, string>, {
    sendMail,
    ...deps,
  });
const post = (
  a: ReturnType<typeof app>,
  body: unknown = valid,
  ip = "1.1.1.1",
) =>
  request(a)
    .post("/api/contact")
    .set("X-Forwarded-For", ip)
    .send(body as object);

beforeEach(() => {
  sendMail.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("unexpected network call");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const errorShape = (body: { error: object }) => {
  expect(Object.keys(body)).toEqual(["error"]);
  expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
};

describe("contact", () => {
  it("sends a valid message", async () => {
    const res = await post(app());
    expect(res.status).toBe(202);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      to: "owner@owner.test",
      name: "Visitor Name",
      email: "visitor@visitor.test",
      message: "Hello from a visitor",
    });
  });

  it.each([
    ["missing name", { email: valid.email, message: valid.message }, ""],
    ["bad email", { ...valid, email: "not-an-email" }, "not-an-email"],
    ["missing message", { name: valid.name, email: valid.email }, ""],
    ["blank message", { ...valid, message: "   " }, ""],
    ["line break in name", { ...valid, name: "A\nBcc: x" }, "Bcc: x"],
    [
      "name of 101 characters",
      { ...valid, name: "n".repeat(101) },
      "n".repeat(101),
    ],
    [
      "message of 5001 characters",
      { ...valid, message: "m".repeat(5001) },
      "m".repeat(5001),
    ],
  ])("rejects bad input: %s", async (_n, body, echoed) => {
    const res = await post(app(), body);
    expect(res.status).toBe(400);
    errorShape(res.body);
    if (echoed) expect(res.text).not.toContain(echoed);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ["filled", "http://spam.test", false],
    ["empty", "", true],
  ])("honeypot: %s", async (_n, website, sends) => {
    const res = await post(app(), { ...valid, website });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(sends ? 1 : 0);
  });

  it("a filled honeypot stays quiet with mail unset", async () => {
    const res = await post(app({ RESEND_API_KEY: undefined }), {
      ...valid,
      website: "x",
    });
    expect(res.status).toBe(202);
  });

  it("the recipient is fixed", async () => {
    await post(app(), { ...valid, to: "evil@evil.test", cc: "c@evil.test" });
    expect(sendMail).toHaveBeenCalledWith({
      to: "owner@owner.test",
      name: valid.name,
      email: valid.email,
      message: valid.message,
    });
  });

  describe("rate limit", () => {
    it("allows 5 and blocks the 6th", async () => {
      const a = app();
      for (let i = 0; i < 5; i++) expect((await post(a)).status).toBe(202);
      const sixth = await post(a);
      expect(sixth.status).toBe(429);
      errorShape(sixth.body);
      expect(sixth.body.error.code).toBe("rate_limited");
      expect(sendMail).toHaveBeenCalledTimes(5);
    });

    it("the window is 15 minutes", async () => {
      const res = await post(app());
      expect(res.headers["ratelimit-policy"]).toContain("q=5; w=900");
    });

    it("limits per client", async () => {
      const a = app();
      for (let i = 0; i < 6; i++) await post(a);
      expect((await post(a, valid, "2.2.2.2")).status).toBe(202);
    });

    it("a spoofed entry does not escape the limit", async () => {
      const a = app();
      for (const left of [
        "1.1.1.1",
        "2.2.2.2",
        "4.4.4.4",
        "5.5.5.5",
        "6.6.6.6",
      ]) {
        expect((await post(a, valid, `${left}, 3.3.3.3`)).status).toBe(202);
      }
      expect((await post(a, valid, "7.7.7.7, 3.3.3.3")).status).toBe(429);
    });

    it("covers contact only", async () => {
      const a = app();
      for (let i = 0; i < 6; i++) await post(a);
      expect(
        (await request(a).get("/health").set("X-Forwarded-For", "1.1.1.1"))
          .status,
      ).toBe(200);
    });

    it("runs before the body is read", async () => {
      const a = app();
      for (let i = 0; i < 5; i++) {
        await request(a)
          .post("/api/contact")
          .set("X-Forwarded-For", "1.1.1.1")
          .set("Content-Type", "application/json")
          .send("{not json");
      }
      expect((await post(a)).status).toBe(429);
    });
  });

  it.each([
    ["RESEND_API_KEY", { RESEND_API_KEY: undefined }],
    ["CONTACT_TO", { CONTACT_TO: undefined }],
  ])("mail not configured: %s unset", async (_n, over) => {
    const res = await post(app(over));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("mail_not_configured");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("mail failure", async () => {
    sendMail.mockRejectedValueOnce(new Error("provider-marker"));
    const res = await post(app());
    expect(res.status).toBe(502);
    errorShape(res.body);
    expect(res.text).not.toContain("provider-marker");
  });

  it("the key and visitor text stay out of logs", async () => {
    const lines: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("key-marker", { status: 401 })),
    );
    const a = makeApp(env, {
      logLevel: "info",
      logStream: { write: (m) => void lines.push(m) },
    });
    const body = {
      name: "Name Marker",
      email: "mark@mark.test",
      message: "Message Marker",
    };
    const res = await request(a)
      .post("/api/contact")
      .set("X-Forwarded-For", "1.1.1.1")
      .send(body);
    expect(res.status).toBe(502);
    expect(res.text).not.toContain("key-marker");
    const log = lines.join("");
    expect(log).toContain("401");
    for (const secret of [
      "key-marker",
      "Name Marker",
      "mark@mark.test",
      "Message Marker",
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it("malformed JSON is a 400", async () => {
    const res = await request(app())
      .post("/api/contact")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.text).not.toContain("not json");
  });

  it("an oversized body is a 413", async () => {
    const res = await post(app(), { ...valid, message: "m".repeat(40_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("another content type is a 400", async () => {
    const res = await request(app())
      .post("/api/contact")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(400);
  });

  it("the site's origin can post", async () => {
    const a = app();
    const pre = await request(a)
      .options("/api/contact")
      .set("Origin", "https://a.test")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe("https://a.test");
    expect(pre.headers["access-control-allow-headers"]).toBeDefined();
    for (let i = 0; i < 5; i++) expect((await post(a)).status).toBe(202);
  });
});
