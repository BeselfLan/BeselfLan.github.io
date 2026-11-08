import type { Profile } from "@beself/content";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { staticContent } from "@/content/static";
import type { ContentProvider } from "@/content/provider";
import type { AppApi } from "@/os/apps/types";
import AboutApp from "./AboutApp";
import about from "./index";

// The component is rendered directly with an api made of vi.fn()s, as the
// Hello test does. The fake content has invented values that differ from the
// real ones, so a hard-coded value cannot pass.

// The detector from packages/content/src/content.test.ts.
const PHONE = /(?:\+?\d[\s().-]*){10,}|(?:\d[^A-Za-z0-9]{0,3}){9,}\d/;

const PROFILE: Profile = {
  name: "Ada Mary Park",
  tagline: "Test tagline",
  location: "Testville",
  email: "ada@example.com",
  github: "https://github.com/ada-park",
  site: "https://ada.example.com",
  summary: ["Summary one", "Summary two"],
  spokenLanguages: [],
};

const SCHOOLS = [
  {
    id: "north",
    school: "North Valley College",
    program: "Applied Testing (BSc)",
    location: "Testville, TX",
    period: { start: "2001", end: "2005" },
    gpa: "3.1/4.0",
    highlights: ["Won the test prize"],
  },
  {
    id: "south",
    school: "South Hill Academy",
    program: "Diploma of Examples",
    location: "Hilltown, TX",
    period: { start: "1997-09", end: "2001-06" },
    highlights: [],
  },
];

interface Fake {
  profile?: Partial<Profile>;
  education?: typeof SCHOOLS;
  courses?: { code?: string; name: string }[];
  certifications?: { name: string; issuer: string; year?: string }[];
  hobbies?: {
    id: string;
    name: string;
    period: { start: string; end?: string };
    bullets: string[];
    icon: string;
  }[];
}

function fakeContent(over: Fake = {}): ContentProvider {
  const profile = { ...PROFILE, ...over.profile };
  const education = over.education ?? SCHOOLS;
  const courses = over.courses ?? [
    { name: "Basket Weaving" },
    { code: "BW101", name: "Advanced Weaving" },
  ];
  const certifications = over.certifications ?? [
    { name: "Cert A", issuer: "Issuer A", year: "2011" },
    { name: "Cert B", issuer: "Issuer B" },
  ];
  const hobbies = over.hobbies ?? [
    {
      id: "chess",
      name: "Chess",
      period: { start: "2015-03", end: "present" },
      bullets: ["Plays on weekends"],
      icon: "/unused.svg",
    },
    {
      id: "rowing",
      name: "Rowing",
      period: { start: "2008", end: "2012" },
      bullets: [],
      icon: "/unused.svg",
    },
  ];
  return {
    profile: () => profile,
    education: () => education,
    courses: () => courses,
    certifications: () => certifications,
    hobbies: () => hobbies,
  } as unknown as ContentProvider;
}

function makeApi(content: ContentProvider = fakeContent()) {
  const mocks = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn(() => () => {}),
    bounds: vi.fn(() => ({ width: 760, height: 560 })),
    registerShortcut: vi.fn(() => () => {}),
  };
  const api = {
    ...mocks,
    content,
    media: { status: () => "unknown" },
  } as unknown as AppApi;
  return { api, mocks };
}

function mount(content?: ContentProvider) {
  const made = makeApi(content);
  const view = render(<AboutApp windowId="about" args={{}} api={made.api} />);
  return { ...made, ...view };
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const sectionNames = () =>
  [...document.querySelectorAll("[data-about-section]")].map((s) =>
    s.getAttribute("data-about-section"),
  );

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}
afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard;
});

/** Every text node on its own: joined text would glue a year range to a GPA. */
function textNodes(root: Node): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    out.push(n.textContent ?? "");
  }
  return out;
}

describe("the app", () => {
  it("opens with a heading named About, which the title bar also carries", () => {
    mount();
    const h2 = screen.getByRole("heading", { level: 2, name: "About" });
    expect(h2.classList.contains("sr-only")).toBe(true);
    // First in the content, before the card.
    expect(
      h2.compareDocumentPosition(q("[data-about-card]")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("the card follows the profile", () => {
  it("shows the name, the tagline, the rows and the summary", () => {
    mount();
    const card = q("[data-about-card]")!;
    expect(
      within(card).getByRole("heading", { level: 3, name: "Ada Mary Park" }),
    ).toBeTruthy();
    expect(within(card).getByText("Test tagline")).toBeTruthy();
    expect(within(card).getByText("Testville")).toBeTruthy();
    expect(within(card).getByText("Summary one")).toBeTruthy();
    expect(within(card).getByText("Summary two")).toBeTruthy();
    expect(q("[data-about-header]")!.textContent).toBe("ada-park@beselfos");
    expect(q("[data-about-tile]")!.textContent).toBe("AP");
    expect(q("[data-about-tile]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("links the email, GitHub and the site", () => {
    mount();
    const mail = screen.getByRole("link", { name: "ada@example.com" });
    expect(mail.getAttribute("href")).toBe("mailto:ada@example.com");

    const github = screen.getByRole("link", { name: "github.com/ada-park" });
    const site = screen.getByRole("link", { name: "ada.example.com" });
    expect(github.getAttribute("href")).toBe("https://github.com/ada-park");
    expect(site.getAttribute("href")).toBe("https://ada.example.com");
    for (const link of [github, site]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("follows a different profile", () => {
    mount(
      fakeContent({
        profile: {
          name: "Bo Chen",
          github: "https://github.com/bo-chen/",
          email: "bo@example.org",
        },
      }),
    );
    expect(screen.getByRole("heading", { name: "Bo Chen" })).toBeTruthy();
    expect(q("[data-about-header]")!.textContent).toBe("bo-chen@beselfos");
    expect(q("[data-about-tile]")!.textContent).toBe("BC");
    expect(
      screen.getByRole("link", { name: "bo@example.org" }).getAttribute("href"),
    ).toBe("mailto:bo@example.org");
  });
});

describe("languages and avatar appear only when set", () => {
  it("has no Languages row for an empty list", () => {
    mount();
    expect(screen.queryByText("Languages")).toBeNull();
  });

  it("joins the languages when there are some", () => {
    mount(fakeContent({ profile: { spokenLanguages: ["Esperanto", "Ido"] } }));
    expect(screen.getByText("Languages")).toBeTruthy();
    expect(screen.getByText("Esperanto, Ido")).toBeTruthy();
  });

  it("shows the avatar in place of the tile", () => {
    mount(fakeContent({ profile: { avatar: "/me.png" } }));
    const img = screen.getByRole("img", { name: "Ada Mary Park" });
    expect(img.getAttribute("src")).toBe("/me.png");
    expect(q("[data-about-tile]")).toBeNull();
  });

  it("draws no image otherwise", () => {
    mount();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("the sections follow the content", () => {
  it("lists education with its school, program, place and years", () => {
    mount();
    const north = q('[data-education="north"]')!;
    expect(
      within(north).getByRole("heading", {
        level: 4,
        name: "North Valley College",
      }),
    ).toBeTruthy();
    expect(within(north).getByText("Applied Testing (BSc)")).toBeTruthy();
    expect(within(north).getByText("Testville, TX · 2001–2005")).toBeTruthy();

    const south = q('[data-education="south"]')!;
    expect(within(south).getByText("South Hill Academy")).toBeTruthy();
    // A month is never printed.
    expect(within(south).getByText("Hilltown, TX · 1997–2001")).toBeTruthy();
  });

  it("shows GPA and highlights only where the record has them", () => {
    mount();
    const north = q('[data-education="north"]')!;
    const south = q('[data-education="south"]')!;
    expect(within(north).getByText("GPA 3.1/4.0")).toBeTruthy();
    expect(within(north).getByText("Won the test prize")).toBeTruthy();
    expect(south.textContent).not.toContain("GPA");
    expect(south.querySelector("ul")).toBeNull();
  });

  it("lists courses with and without a code", () => {
    mount();
    const section = q('[data-about-section="coursework"]')!;
    const items = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["Basket Weaving", "BW101 Advanced Weaving"]);
  });

  it("shows the certification year only when there is one", () => {
    mount();
    const section = q('[data-about-section="certifications"]')!;
    const items = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["Cert A · Issuer A (2011)", "Cert B · Issuer B"]);
  });

  it("reads Since for a current hobby and a year range for a past one", () => {
    mount();
    const chess = q('[data-hobby="chess"]')!;
    expect(within(chess).getByRole("heading", { name: "Chess" })).toBeTruthy();
    expect(within(chess).getByText("Since 2015")).toBeTruthy();
    expect(within(chess).getByText("Plays on weekends")).toBeTruthy();

    const rowing = q('[data-hobby="rowing"]')!;
    expect(within(rowing).getByText("2008–2012")).toBeTruthy();
    expect(rowing.querySelector("ul")).toBeNull();
  });

  it("keeps the order: education, coursework, certifications, hobbies", () => {
    mount();
    expect(sectionNames()).toEqual([
      "education",
      "coursework",
      "certifications",
      "hobbies",
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Ada Mary Park",
      "Education",
      "Coursework",
      "Certifications",
      "Hobbies",
    ]);
  });
});

describe("empty sections are left out", () => {
  it("renders no heading for a list with nothing in it", () => {
    mount(fakeContent({ courses: [], certifications: [] }));
    expect(sectionNames()).toEqual(["education", "hobbies"]);
    expect(screen.queryByRole("heading", { name: "Coursework" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Certifications" }),
    ).toBeNull();
  });

  it("renders only the card when everything is empty", () => {
    mount(
      fakeContent({
        education: [],
        courses: [],
        certifications: [],
        hobbies: [],
      }),
    );
    expect(sectionNames()).toEqual([]);
    expect(q("[data-about-card]")).not.toBeNull();
  });
});

describe("the real content renders, with no phone number", () => {
  function mountReal() {
    return mount(staticContent);
  }

  it("shows every record the content package has", () => {
    mountReal();
    const text = q("[data-about]")!.textContent ?? "";
    expect(
      screen.getByRole("heading", {
        name: "University of Toronto Mississauga",
      }),
    ).toBeTruthy();
    for (const e of staticContent.education()) {
      expect(text).toContain(e.school);
      expect(text).toContain(e.program);
    }
    for (const c of staticContent.courses()) expect(text).toContain(c.name);
    for (const c of staticContent.certifications()) {
      expect(text).toContain(c.name);
    }
    for (const h of staticContent.hobbies()) expect(text).toContain(h.name);
    expect(text).toContain(staticContent.profile().name);
  });

  it("has no tel link, no phone-shaped text node and no phone-shaped href", () => {
    mountReal();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    for (const text of textNodes(q("[data-about]")!)) {
      expect(PHONE.test(text), `text "${text}"`).toBe(false);
    }
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href")!;
      expect(PHONE.test(href), `href ${href}`).toBe(false);
    }
  });

  it("draws no image, so no file is requested that does not exist", () => {
    mountReal();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Copy email", () => {
  const button = () => screen.getByRole("button", { name: "Copy email" });
  const status = () => screen.getByRole("status").textContent;

  it("starts with an empty status", () => {
    mount();
    expect(status()).toBe("");
  });

  it("copies the address, says so, and notifies once", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    const { mocks } = mount();

    await act(async () => {
      fireEvent.click(button());
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("ada@example.com");
    expect(status()).toBe("Copied email");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith({
      title: "Copied email",
      body: "ada@example.com",
    });
  });

  it("does not notify until the write has finished", async () => {
    let finish: () => void = () => {};
    setClipboard({
      writeText: vi.fn(() => new Promise<void>((done) => (finish = done))),
    });
    const { mocks } = mount();

    await act(async () => {
      fireEvent.click(button());
    });
    expect(status()).toBe("");
    expect(mocks.notify).not.toHaveBeenCalled();

    await act(async () => {
      finish();
    });
    expect(status()).toBe("Copied email");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("clears the status on the next press, so a repeat is read out", async () => {
    let finish: () => void = () => {};
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(
        () => new Promise<void>((done) => (finish = done)),
      );
    setClipboard({ writeText });
    mount();

    await act(async () => {
      fireEvent.click(button());
    });
    expect(status()).toBe("Copied email");

    await act(async () => {
      fireEvent.click(button());
    });
    expect(status()).toBe("");
    await act(async () => {
      finish();
    });
    expect(status()).toBe("Copied email");
  });

  it("says it could not copy, and notifies nothing, when the write is refused", async () => {
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error("no"))) });
    const { mocks } = mount();

    await act(async () => {
      fireEvent.click(button());
    });
    expect(status()).toBe("Couldn't copy the email");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does the same, without throwing, when there is no clipboard", async () => {
    setClipboard(undefined);
    const { mocks } = mount();

    await act(async () => {
      fireEvent.click(button());
    });
    expect(status()).toBe("Couldn't copy the email");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("calls only notify on the api, and only after a copy", async () => {
    setClipboard({ writeText: vi.fn(() => Promise.resolve()) });
    const { mocks } = mount();
    for (const [name, fn] of Object.entries(mocks)) {
      if (name !== "notify") expect(fn, name).not.toHaveBeenCalled();
    }
    expect(mocks.notify).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(button());
    });
    for (const [name, fn] of Object.entries(mocks)) {
      if (name !== "notify") expect(fn, name).not.toHaveBeenCalled();
    }
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});

describe("the definition", () => {
  it("keeps the values the lead's tests pin", () => {
    expect(about.id).toBe("about");
    expect(about.name).toBe("About");
    expect(about.window).toMatchObject({ width: 760, height: 600 });
    expect(about.dock).toEqual({ pinned: true, order: 3 });
    expect(about.singleton).toBe(true);
    expect(about.showInAppGrid).toBe(true);
    expect(about.deepLink?.parse(new URLSearchParams())).toEqual({});
  });
});
