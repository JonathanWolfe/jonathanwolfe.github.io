const root = `${import.meta.dir}/..`;

export const path = (name: string) => `${root}/${name}`;

export type Entry = {
  heading: string;
  dates: string;
  bullets: string[];
  text: string;
};

const source = await Bun.file(path('readme.md')).text();

const lines = source.split('\n').map((line) => line.trimEnd());

const nameIndex = lines.findIndex((line) => line.startsWith('# '));

const sections = new Map<string, string[]>();

let current: string[] = [];

for (const line of lines) {
  if (line.startsWith('## ')) {
    sections.set(line.slice(3), (current = []));
  } else {
    current.push(line);
  }
}

const section = (title: string) => sections.get(title) ?? [];

const isBullet = (line: string) => /^[*-] /.test(line);

const bullets = (block: string[]) =>
  block.filter(isBullet).map((line) => line.slice(2));

const paragraphs = (block: string[]) =>
  block
    .join('\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean);

function entries(title: string): Entry[] {
  return section(title)
    .join('\n')
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [heading, ...rest] = chunk.split('\n');

      const dates =
        rest
          .find((line) => line.startsWith('##### '))
          ?.slice(6)
          .trim() ?? '';

      const body = rest.filter((line) => !line.startsWith('##### '));

      return {
        heading,
        dates,
        bullets: bullets(body),
        text: paragraphs(body.filter((line) => !isBullet(line))).join(' '),
      };
    });
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const monthYear = (iso: string) =>
  MONTH_FORMAT.format(new Date(`${iso}-01T00:00:00Z`));

export function parseDates(range: string) {
  const [start, end] = range.split(' - ');

  return { start, end };
}

const PRINT_BULLETS = [4, 4, 2, 2] as const;

export const printBullets = (index: number): number =>
  PRINT_BULLETS[index] ?? 0;

export const graduated = (range: string) =>
  `Graduated: ${range.split(' - ').pop()!.slice(0, 4)}`;

export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const inline = (markdown: string) =>
  Bun.markdown.html(markdown).replace(/^<p>|<\/p>\n?$/g, '');

export function splitHeading(heading: string) {
  const match = heading.match(/^(.+), (\[.+\]\(.+\)|[^[]+)$/);

  return { role: match![1], company: match![2] };
}

export function splitEducation(heading: string) {
  const [school, ...degree] = heading.split(' - ');

  return { school, degree: degree.join(' - ') };
}

const contact = Object.fromEntries(
  section('Contact')
    .filter((line) => line.includes(': '))
    .map((line): [string, string] => {
      const [key, value] = line.split(/: (.*)/s);

      return [key, value];
    }),
);

const location = [contact.City, contact.Country].join(' ');

const urlOf = (markdown: string) => markdown.match(/\]\(([^)]+)\)/)![1];

const visibleLink = (url: string) =>
  `[${url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}](${url})`;

const references = [
  ...section('References')
    .filter((line) => line.startsWith('>'))
    .map((line) => line.replace(/^>\s*/, ''))
    .join(' ')
    .matchAll(/(.+?) -- <cite>(.+?)<\/cite>/g),
].map((match) => ({ quote: match[1].trim(), author: match[2] }));

export const resume = {
  name: lines[nameIndex].slice(2),

  label: lines
    .slice(nameIndex + 1)
    .find((line) => line.trim() && !line.startsWith('!'))!,

  contact: [
    location,
    contact.Phone,
    contact.Email,
    visibleLink(urlOf(contact.Website)),
  ],

  profiles: section('Profiles')
    .filter(Boolean)
    .map((profile) => visibleLink(urlOf(profile))),

  summary: paragraphs(section('Summary')),

  work: entries('Work'),

  education: entries('Education'),

  skills: paragraphs(section('Skills')),

  interests: bullets(section('Interests')),

  references,
};

export type Resume = typeof resume;
