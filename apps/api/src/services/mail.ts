export interface ContactMail {
  to: string;
  name: string;
  email: string;
  message: string;
}
export type SendMail = (mail: ContactMail) => Promise<void>;

export const DEFAULT_FROM = "BeselfOS <onboarding@resend.dev>";

/**
 * Sends through Resend. The key is only ever an argument here. A refusal
 * throws a plain Error holding the status: pino copies every enumerable
 * property of an error into the log, so nothing else is attached.
 */
export function resendMailer(
  apiKey: string,
  from: string = DEFAULT_FROM,
): SendMail {
  return async (mail) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: `Portfolio message from ${mail.name}`,
        text: `From: ${mail.name} <${mail.email}>\n\n${mail.message}`,
        reply_to: mail.email,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`mail provider returned ${res.status}`);
  };
}
