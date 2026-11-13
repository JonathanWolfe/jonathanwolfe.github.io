import { basename } from "node:path";

export const root = `${import.meta.dir}/..`;
export const path = (name: string) => `${root}/${name}`;

export type Entry = { heading: string; dates: string; bullets: string[]; text: string };

const source = await Bun.file(path("readme.md")).text();
const lines = source.split("\n").map((line) => line.trimEnd());

const nameIndex = lines.findIndex((line) => line.startsWith("# "));
const imageUrl = source.match(/!\[[^\]]*\]\(([^)]+)\)/)![1];

const sections = new Map<string, string[]>();
let current: string[] = [];

for (const line of lines) {
  if (line.startsWith("## ")) sections.set(line.slice(3), (current = []));
  else current.push(line);
}

const section = (title: string) => sections.get(title) ?? [];
const bullets = (block: string[]) => block.filter((l) => /^[*-] /.test(l)).map((l) => l.slice(2));
export const paragraphs = (block: string[]) =>
  block
    .join("\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

function entries(title: string): Entry[] {
  return section(title)
    .join("\n")
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [heading, ...rest] = chunk.split("\n");
      const dates = rest.find((l) => l.startsWith("##### "))?.slice(6).trim() ?? "";
      const body = rest.filter((l) => !l.startsWith("##### "));

      return { heading, dates, bullets: bullets(body), text: paragraphs(body.filter((l) => !/^[*-] /.test(l))).join(" ") };
    });
}

const formatDate = (iso: string) => iso.replace(/^(\d{4})-(\d{2})$/, "$2/$1");

export function formatDates(range: string) {
  const [start, end] = range.split(" - ");

  return `${formatDate(start)} - ${end ? formatDate(end) : "Present"}`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function formatDatesLong(range: string) {
  const [start, end] = range.split(" - ");

  return `${monthYear(start)} – ${end ? monthYear(end) : "PRESENT"}`;
}

export const graduated = (range: string) => `Graduated: ${range.split(" - ").pop()!.slice(0, 4)}`;

export const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const inline = (markdown: string) => Bun.markdown.html(markdown).replace(/^<p>|<\/p>\n?$/g, "");

export function splitHeading(heading: string) {
  const match = heading.match(/^(.+), (\[.+\]\(.+\)|[^[]+)$/);

  return { role: match![1], company: match![2] };
}

export function splitEducation(heading: string) {
  const [school, ...degree] = heading.split(" - ");

  return { school, degree: degree.join(" - ") };
}

const contact = Object.fromEntries(
  section("Contact")
    .filter((l) => l.includes(": "))
    .map((l) => l.split(/: (.*)/s).slice(0, 2)),
);
const location = [contact.City, contact.Country, contact["Postal Code"]].join(" ");
const profiles = section("Profiles").filter(Boolean);

const urlOf = (markdown: string) => markdown.match(/\]\(([^)]+)\)/)![1];
const visibleLink = (url: string) => `[${url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}](${url})`;

export const resume = {
  name: lines[nameIndex].slice(2),
  label: lines.slice(nameIndex + 1).find((line) => line.trim() && !line.startsWith("!"))!,
  imageName: basename(imageUrl),
  image: Bun.file(path(basename(imageUrl))),
  about: [location, contact.Email, contact.Website, contact.Phone],
  profiles,
  atsContact: [location, contact.Phone, contact.Email, visibleLink(urlOf(contact.Website))],
  atsProfiles: profiles.map((profile) => visibleLink(urlOf(profile))),
  summary: paragraphs(section("Summary")),
  work: entries("Work"),
  education: entries("Education"),
  skillBullets: bullets(section("Skills")),
  languageBullets: bullets(section("Languages")),
  interestBullets: bullets(section("Interests")),
  skills: bullets(section("Skills")).map((line) => {
    const match = line.match(/^(.+?) in (.+?) \((.+)\)$/);

    return match ? { level: match[1], title: match[2], items: match[3].split(", ") } : { level: "", title: line, items: [] };
  }),
  languages: bullets(section("Languages")).map((line) => {
    const match = line.match(/^(.+?) in (.+)$/);

    return match ? { language: match[2], level: match[1] } : { language: line, level: "" };
  }),
  interests: bullets(section("Interests")).map((line) => {
    const match = line.match(/^(.+?) \((.+)\)$/);

    return match ? { title: match[1], items: match[2].split(", ") } : { title: line, items: [] };
  }),
  references: section("References")
    .filter((l) => l.startsWith(">"))
    .map((l) => l.replace(/^>\s*/, "").match(/^(.*?) -- <cite>(.*)<\/cite>$/)!)
    .map((match) => ({ quote: match[1], author: match[2] })),
};

export type Resume = typeof resume;
