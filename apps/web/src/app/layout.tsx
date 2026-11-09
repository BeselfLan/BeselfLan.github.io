import { content, featuredEntries } from "@beself/content";
import type { Metadata } from "next";
import { Ubuntu, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

const ubuntu = Ubuntu({
  weight: ["400", "500", "700"],
  variable: "--font-ui",
  subsets: ["latin"],
});

const ubuntuMono = Ubuntu_Mono({
  weight: ["400", "700"],
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeselfOS",
  description: "Beself Lan's portfolio",
};

const LINK = "underline underline-offset-2";

/**
 * What a visitor sees with JavaScript off (plan 8.4). It is an overlay because
 * `<main>` is `fixed inset-0`, so a block in normal flow would sit under the
 * laptop. The list is the Projects app's default Featured set, in the same
 * order. It is rendered on the server from the content package and shows no
 * location, period, phone number or address (D18). React does not hydrate
 * `<noscript>`, and Next rejects extra exports from a layout, so this stays
 * module-local.
 */
function NoscriptFallback() {
  const { profile } = content;
  return (
    <noscript>
      <div
        data-noscript-fallback=""
        className="fixed inset-0 z-50 overflow-y-auto bg-os-dark px-6 py-10 text-os-panel-fg"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-sm opacity-80">
            This site is BeselfOS, a desktop that runs in your browser. It needs
            JavaScript, which is off, so here is the short version.
          </p>
          <h2 className="text-2xl font-bold">{profile.name}</h2>
          <p>{profile.tagline}</p>
          <p>
            Email:{" "}
            <a className={LINK} href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
          </p>
          <p>
            GitHub:{" "}
            <a className={LINK} href={profile.github}>
              {profile.github.replace(/^https?:\/\//, "")}
            </a>
          </p>
          <h3 id="noscript-projects" className="text-xl font-bold">
            Projects
          </h3>
          <ul
            aria-labelledby="noscript-projects"
            className="flex flex-col gap-3"
          >
            {featuredEntries().map((e) => (
              <li key={e.id}>
                {e.links.github !== undefined ? (
                  <a className={`${LINK} font-medium`} href={e.links.github}>
                    {e.title}
                  </a>
                ) : (
                  <span className="font-medium">{e.title}</span>
                )}
                <p className="text-sm opacity-80">{e.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </noscript>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${ubuntu.variable} ${ubuntuMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <NoscriptFallback />
      </body>
    </html>
  );
}
