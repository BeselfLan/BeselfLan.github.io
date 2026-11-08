"use client";

import { useId, type ReactNode } from "react";
import type { ContentProvider } from "@/content/provider";
import { period } from "./format";

// The sections under the card (plan 8). Everything is shown as the content
// package has it: no icon (no hobby icon file exists), no count, no
// adjective. A list with no records renders nothing, so there is no empty
// heading. The title bar has the h2, so these are h3, and a school or a hobby
// is an h4.

function Section({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section data-about-section={name} aria-labelledby={id}>
      <h3
        id={id}
        className="mb-2 border-b border-white/15 pb-1 text-base font-semibold"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function AboutSections({ content }: { content: ContentProvider }) {
  const education = content.education();
  const courses = content.courses();
  const certifications = content.certifications();
  const hobbies = content.hobbies();

  return (
    <>
      {education.length > 0 && (
        <Section name="education" title="Education">
          <div className="flex flex-col gap-3">
            {education.map((e) => (
              <article key={e.id} data-education={e.id}>
                <h4 className="font-medium">{e.school}</h4>
                <p>{e.program}</p>
                <p className="text-white/70">
                  {`${e.location} · ${period(e.period)}`}
                </p>
                {e.gpa && <p className="text-white/70">{`GPA ${e.gpa}`}</p>}
                <Bullets items={e.highlights} />
              </article>
            ))}
          </div>
        </Section>
      )}

      {courses.length > 0 && (
        <Section name="coursework" title="Coursework">
          <ul className="space-y-1">
            {courses.map((c) => (
              <li key={`${c.code ?? ""} ${c.name}`}>
                {c.code && (
                  <>
                    <span className="font-mono text-white/70">
                      {c.code}
                    </span>{" "}
                  </>
                )}
                {c.name}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {certifications.length > 0 && (
        <Section name="certifications" title="Certifications">
          <ul className="space-y-1">
            {certifications.map((c) => (
              <li key={`${c.name} ${c.issuer}`}>
                {`${c.name} · ${c.issuer}${c.year ? ` (${c.year})` : ""}`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {hobbies.length > 0 && (
        <Section name="hobbies" title="Hobbies">
          <div className="flex flex-col gap-3">
            {hobbies.map((h) => (
              <article key={h.id} data-hobby={h.id}>
                <h4 className="font-medium">{h.name}</h4>
                <p className="text-white/70">{period(h.period)}</p>
                <Bullets items={h.bullets} />
              </article>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
