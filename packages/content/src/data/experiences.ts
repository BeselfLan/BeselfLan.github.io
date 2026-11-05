import type { Entry } from "../schema";

/** Kinds: experience, volunteer. */
export const experiences: Entry[] = [
  {
    id: "thornhill-cs-club",
    kind: "experience",
    title: "Computer Programming Club Executive",
    org: "Thornhill Secondary School",
    role: "Executive",
    period: { start: "2021", end: "2024" },
    tech: [],
    summary:
      "Executive of the school programming club, teaching and running contests.",
    bullets: [
      "Coordinated with other executive members to teach programming concepts after school.",
      "Taught algorithms and data structures alongside the other executives.",
      "Wrote technical questions and hosted monthly programming contests to support club coding practice.",
    ],
    links: {},
    icon: "/icons/entries/thornhill-cs-club.svg",
    featured: true,
    order: 130,
    bootLabel: "Thornhill Secondary",
  },
  {
    id: "kortright-volunteer",
    kind: "volunteer",
    title: "Kortright Centre for Conservation",
    role: "Volunteer",
    period: { start: "2022", end: "2023" },
    tech: [],
    summary:
      "Volunteered at the Kortright Centre for Conservation helping visitors with events.",
    bullets: [
      "Helped explain events to the public.",
      "Worked with staff to organize activities and keep a positive environment.",
      "Managed resources such as campfires, hot chocolate and maple syrup.",
    ],
    links: {},
    icon: "/icons/entries/kortright-volunteer.svg",
    featured: false,
    order: 140,
    bootLabel: "Kortright Centre",
  },
  {
    id: "thornhill-concerts",
    kind: "volunteer",
    title: "Thornhill Secondary School Concerts",
    role: "Volunteer",
    period: { start: "2022", end: "2024" },
    tech: [],
    summary:
      "Volunteered at school concerts, setting up the stage and moving equipment.",
    bullets: [
      "Helped set up the stage between performances.",
      "Split roles with other volunteers to move equipment efficiently.",
      "Communicated with supervisors about performance time changes and other issues.",
    ],
    links: {},
    icon: "/icons/entries/thornhill-concerts.svg",
    featured: false,
    order: 150,
    bootLabel: "TSS Concerts",
  },
  {
    id: "music-council",
    kind: "volunteer",
    title: "Thornhill Secondary Music Council Member",
    period: { start: "2022", end: "2024" },
    tech: [],
    summary: "Member of the school music council, helping plan music events.",
    bullets: [
      "Brainstormed events and ideas such as event names and parties.",
      "Helped organize music-related events such as concerts.",
      "Worked with other members to set up and take down decorations.",
    ],
    links: {},
    icon: "/icons/entries/music-council.svg",
    featured: false,
    order: 160,
    bootLabel: "Music Council",
  },
];
