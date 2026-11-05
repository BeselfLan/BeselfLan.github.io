import { describe, expect, it } from "vitest";
import { bootFlavour, content } from "./index";

const phoneShaped = (s: string): boolean => /(?:\+?\d[\s().-]*){10,}/.test(s);
const everything = JSON.stringify({ content, bootFlavour });

describe("safety", () => {
  it("detector works on values built at runtime", () => {
    const d = "9".repeat(3);
    expect(phoneShaped("9".repeat(10))).toBe(true);
    expect(phoneShaped([d, d, "9".repeat(4)].join("-"))).toBe(true);
    expect(phoneShaped("2021-2024")).toBe(false);
  });

  it("no phone-shaped value in content or bootFlavour", () => {
    expect(phoneShaped(everything)).toBe(false);
  });

  it("RISC-V never appears", () => {
    expect(everything).not.toMatch(/risc-?v/i);
  });

  it("the unmeasured 15x claim never appears", () => {
    expect(everything).not.toMatch(/\b15\s*x\b|\bx\s*15\b/i);
  });

  const trivia = content.entries.find((e) => e.id === "trivia-knockouts");
  it.skipIf(!trivia)("trivia makes no parallel claim", () => {
    expect(JSON.stringify(trivia)).not.toMatch(/parallel/i);
  });
});
