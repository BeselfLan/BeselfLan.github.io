"use client";

import type { Profile } from "@beself/content";
import { useId, useState, type ReactNode } from "react";
import type { AppApi } from "@/os/apps/types";
import { Button } from "@/os/ui/Button";
import { bareUrl, handleOf, initials } from "./format";

// A neofetch-style card (plan 8). Every row is a field of the profile: there
// is no "Uptime" or "Kernel", because a made-up row would be a made-up claim.
// The swatches are decoration, in the OS palette.
const SWATCHES = [
  "bg-os-orange",
  "bg-os-aubergine",
  "bg-os-dark",
  "bg-os-panel",
  "bg-os-panel-fg",
  "bg-white/20",
  "bg-white/40",
  "bg-white/60",
];

const COPIED = "Copied email";
const FAILED = "Couldn't copy the email";

const LINK = "text-os-orange underline underline-offset-2 hover:brightness-110";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-white/60">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {bareUrl(href)}
    </a>
  );
}

/**
 * The profile as a card, with a button that copies the email. A copy that
 * worked says so in the window and pushes a notification; one that failed
 * says so and pushes nothing. The status stays until the next press.
 */
export function ProfileCard({
  profile,
  notify,
}: {
  profile: Profile;
  notify: AppApi["notify"];
}) {
  const nameId = useId();
  const [status, setStatus] = useState("");
  const header = `${handleOf(profile.github)}@beselfos`;

  async function copy() {
    // Empty first, so a second press changes the live region and is read out.
    setStatus("");
    let copied = false;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(profile.email);
      copied = true;
    } catch {
      // Refused, or no clipboard in this context: reported below.
    }
    if (copied) {
      setStatus(COPIED);
      notify({ title: COPIED, body: profile.email });
    } else {
      setStatus(FAILED);
    }
  }

  return (
    <section
      data-about-card=""
      aria-labelledby={nameId}
      className="flex flex-wrap gap-6"
    >
      {profile.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized is on, so next/image adds nothing
        <img
          src={profile.avatar}
          alt={profile.name}
          className="size-32 shrink-0 rounded-os-lg object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          data-about-tile=""
          className="flex size-32 shrink-0 items-center justify-center rounded-os-lg bg-os-aubergine font-mono text-5xl font-bold text-white"
        >
          {initials(profile.name)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p data-about-header="" className="font-mono text-os-orange">
          {header}
        </p>
        <p aria-hidden="true" className="font-mono text-os-orange">
          {"-".repeat(header.length)}
        </p>
        <h3 id={nameId} className="mt-2 text-xl font-semibold">
          {profile.name}
        </h3>
        <p className="text-white/80">{profile.tagline}</p>

        <dl className="mt-3 flex flex-col gap-1">
          <Row label="Location">{profile.location}</Row>
          <Row label="Email">
            <a href={`mailto:${profile.email}`} className={LINK}>
              {profile.email}
            </a>
          </Row>
          <Row label="GitHub">
            <ExternalLink href={profile.github} />
          </Row>
          <Row label="Site">
            <ExternalLink href={profile.site} />
          </Row>
          {profile.spokenLanguages.length > 0 && (
            <Row label="Languages">{profile.spokenLanguages.join(", ")}</Row>
          )}
        </dl>

        <ul className="mt-3 list-disc space-y-1 pl-5">
          {profile.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <div aria-hidden="true" className="mt-3 flex gap-1">
          {SWATCHES.map((swatch) => (
            <span key={swatch} className={`size-4 rounded-os-sm ${swatch}`} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void copy()}>
            Copy email
          </Button>
          <p role="status" className="text-white/80">
            {status}
          </p>
        </div>
      </div>
    </section>
  );
}
