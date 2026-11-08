import { describe, expect, it } from "vitest";
import { bareUrl, handleOf, initials, period } from "./format";

describe("initials", () => {
  it("takes the first letter of the first and last words, uppercased", () => {
    expect(initials("Beself Lan")).toBe("BL");
    expect(initials("ada mary park")).toBe("AP");
  });

  it("gives one letter for one word and a question mark for nothing", () => {
    expect(initials("Cher")).toBe("C");
    expect(initials("cher")).toBe("C");
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });

  it("ignores extra spaces and keeps a letter outside the basic plane whole", () => {
    expect(initials("  ada   park  ")).toBe("AP");
    expect(initials("\u{1D4D0}da park")).toBe("\u{1D4D0}P");
  });
});

describe("handleOf and bareUrl", () => {
  it("reads the handle from the last path segment", () => {
    expect(handleOf("https://github.com/ada-park/")).toBe("ada-park");
    expect(handleOf("https://github.com/ada-park")).toBe("ada-park");
    expect(handleOf("https://github.com/ada-park?tab=repos")).toBe("ada-park");
  });

  it("falls back to the host when there is no path", () => {
    expect(handleOf("https://github.com")).toBe("github.com");
  });

  it("drops the protocol and a trailing slash", () => {
    expect(bareUrl("https://ada.example.com/")).toBe("ada.example.com");
    expect(bareUrl("http://x.dev")).toBe("x.dev");
    expect(bareUrl("https://github.com/ada-park")).toBe("github.com/ada-park");
  });
});

describe("period", () => {
  it("joins two years with an en dash", () => {
    expect(period({ start: "2001", end: "2005" })).toBe("2001–2005");
  });

  it("reads Since while it is current or has no end", () => {
    expect(period({ start: "2010-09", end: "present" })).toBe("Since 2010");
    expect(period({ start: "2010" })).toBe("Since 2010");
  });

  it("gives one year when it starts and ends in it, and never a month", () => {
    expect(period({ start: "2012-01", end: "2012-06" })).toBe("2012");
    expect(period({ start: "2011-12", end: "2013-02" })).toBe("2011–2013");
  });
});
