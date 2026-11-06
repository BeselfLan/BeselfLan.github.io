import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FROM,
  resendMailer,
  type ContactMail,
} from "../src/services/mail.ts";

const mail: ContactMail = {
  to: "owner@owner.test",
  name: "Visitor Name",
  email: "visitor@visitor.test",
  message: "Hello there",
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => {
    throw new Error("unexpected network call");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    init,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
};

describe("resend mailer", () => {
  it("calls the provider", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await resendMailer("key-marker")(mail);
    const { url, init, body } = lastCall();
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer key-marker",
    );
    expect(body.to).toEqual(["owner@owner.test"]);
    expect(body.text).toContain("Hello there");
  });

  it("sets the sender and reply address", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await resendMailer("k", "Me <me@sender.test>")(mail);
    expect(lastCall().body.from).toBe("Me <me@sender.test>");
    expect(lastCall().body.reply_to).toBe("visitor@visitor.test");
    fetchMock.mockClear();
    await resendMailer("k")(mail);
    expect(lastCall().body.from).toBe(DEFAULT_FROM);
  });

  it("a refusal carries only the status", async () => {
    fetchMock.mockResolvedValue(new Response("key-marker", { status: 401 }));
    const err = await resendMailer("key-marker")(mail).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain("key-marker");
    expect(Object.keys(err as Error)).toEqual([]);
  });
});
