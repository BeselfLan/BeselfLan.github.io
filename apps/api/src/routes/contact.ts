import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Config } from "../config.ts";
import { ApiError } from "../middleware/errors.ts";
import { resendMailer, type SendMail } from "../services/mail.ts";

export type { SendMail };

const ContactSchema = z.object({
  // A line break is refused because the name goes in the mail subject.
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n]*$/),
  email: z.email().max(254),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
});

export function contactRouter(deps: {
  config: Config;
  sendMail?: SendMail;
}): Router {
  const router = Router();
  const { config } = deps;
  // Built here, not at module scope, so each app has its own count.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new ApiError(429, "rate_limited", "Too many messages, try again later"),
      ),
  });

  // The limiter runs before the parser, so bad requests use up the limit too.
  router.post(
    "/api/contact",
    limiter,
    express.json({ limit: "32kb" }),
    async (req, res) => {
      // Express 5 leaves req.body undefined when nothing was parsed.
      const parsed = ContactSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "invalid_contact", "Invalid contact message");
      }
      const { name, email, message, website } = parsed.data;
      // A bot gets the same answer as a real send, and no mail.
      if (website !== undefined && website.trim() !== "") {
        res.status(202).json({ ok: true });
        return;
      }
      const apiKey = config.RESEND_API_KEY;
      const to = config.CONTACT_TO;
      if (!apiKey || !to) {
        throw new ApiError(
          503,
          "mail_not_configured",
          "Mail is not configured",
        );
      }
      const send = deps.sendMail ?? resendMailer(apiKey, config.CONTACT_FROM);
      try {
        await send({ to, name, email, message });
      } catch (err) {
        // An ApiError is not logged by errorHandler, so log it here.
        req.log.error(err);
        throw new ApiError(502, "mail_failed", "Could not send the message");
      }
      res.status(202).json({ ok: true });
    },
  );
  return router;
}
