import type { Certification, Course, Education } from "../schema";

export const education: Education[] = [
  {
    id: "utm",
    school: "University of Toronto Mississauga",
    program: "Specialist Computer Science + Minor Applied Statistics (HBSc)",
    location: "Mississauga, ON",
    period: { start: "2024", end: "2029" },
    gpa: "3.8/4.0",
    highlights: [],
  },
  {
    id: "thornhill-ss",
    school: "Thornhill Secondary School",
    program: "High school diploma",
    location: "Thornhill, ON",
    period: { start: "2020", end: "2024" },
    highlights: [
      "AP score of 5 for Computer Science A and BC Calculus",
      "Distinction in Waterloo Canadian Computing Contest Senior Division 2023 & 2024",
      "Distinction in Waterloo Canadian Senior Mathematics Contest 2024",
      "Honour Society 2021-2024",
    ],
  },
];

export const courses: Course[] = [
  { name: "Intro to Information Security" },
  { name: "Operating Systems" },
  { name: "Fundamentals of Robotics" },
  { code: "CSC209", name: "Software Tools & System Design" },
  { code: "CSCB58", name: "Computer Organization" },
  { code: "MAT223/224", name: "Linear Algebra I & II" },
  { code: "CSC311", name: "Introduction to Machine Learning" },
  { code: "CSC263", name: "Data Structures and Analysis" },
  { code: "CSC207", name: "Software Design" },
  { code: "CSC108/148", name: "Introduction to Computer Science" },
  { code: "STAB52", name: "Introduction to Probability I & II" },
  { code: "CSC236", name: "Introduction to the Theory of Computation" },
  { code: "MGTA01", name: "Introduction to Business" },
];

export const certifications: Certification[] = [
  { name: "Emergency First Aid with CPR-B", issuer: "Lifesaving Society" },
  { name: "Bronze Cross", issuer: "Lifesaving Society" },
  { name: "Bronze Medallion", issuer: "Lifesaving Society" },
  { name: "Bronze Star", issuer: "Lifesaving Society" },
];
