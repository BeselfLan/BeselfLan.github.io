"use client";

import type { AppProps, NoArgs } from "@/os/apps/types";
import { AboutSections } from "./AboutSections";
import { ProfileCard } from "./ProfileCard";

// The About app (plan 8): a neofetch-style card, then education, coursework,
// certifications and hobbies. Every value is read through `api.content`, and
// the app reaches the OS only through `api`. Its one OS call is `notify`, when
// the email has been copied. The root scrolls, because the content area is
// shorter than the content.
export default function AboutApp({ api }: AppProps<NoArgs>) {
  return (
    <div
      data-about=""
      className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-sm text-os-panel-fg"
    >
      {/* The lead's registry test finds the app by this heading, as it does
          Projects. The title bar has the same name, so it is not drawn. */}
      <h2 className="sr-only">About</h2>
      <ProfileCard profile={api.content.profile()} notify={api.notify} />
      <AboutSections content={api.content} />
    </div>
  );
}
