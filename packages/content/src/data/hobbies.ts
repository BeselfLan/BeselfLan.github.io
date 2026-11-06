import type { Hobby } from "../schema";

export const hobbies: Hobby[] = [
  {
    id: "piano",
    name: "Piano",
    period: { start: "2014", end: "present" },
    bullets: [
      "Helped develop dedication, patience, and time-management skills",
      "Participated in piano recital performances developing confidence",
    ],
    icon: "/icons/entries/piano.svg",
  },
  {
    id: "swimming",
    name: "Swimming",
    period: { start: "2012", end: "present" },
    bullets: [
      "Completed Lifesaving Society Swimmer 1-6, Bronze Star, Bronze Medallion, and Bronze Cross",
      "Understand basic first aid and lifeguarding techniques with Emergency First Aid with CPR-B certification",
    ],
    icon: "/icons/entries/swimming.svg",
  },
  {
    // Adds no new text: name, period and bullets come from the entry of the
    // same id.
    id: "competitive-programming",
    name: "Competitive Programming",
    period: { start: "2021", end: "present" },
    bullets: [
      "Competed in the CCC Senior Division in 2023 and 2024, earning distinction both years, and in the ICPC North American Qualifier.",
      "Active on DMOJ, Codeforces and AtCoder, with 300+ problems solved.",
    ],
    icon: "/icons/entries/competitive-programming.svg",
  },
];
