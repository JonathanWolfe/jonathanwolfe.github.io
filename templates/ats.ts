import {
  type Entry,
  escapeXml,
  graduated,
  inline,
  monthYear,
  parseDates,
  type Resume,
  splitEducation,
  splitHeading,
} from '../src/resume';

export const screenshot = { width: 816, scale: 2 } as const;

const SEPARATOR = '<span aria-hidden="true"> | </span>' as const;

const lines = (items: string[]) => items.join('\n');

const slug = (title: string) => title.toLowerCase().replace(/\W+/g, '-');

const paragraph = (text: string) => `<p>${inline(text)}</p>`;

const listItem = (item: string) => `<li>${inline(item)}</li>`;

const list = (items: string[]) => `
  <ul>
    ${lines(items.map(listItem))}
  </ul>
`;

const joined = (items: string[]) => items.map(inline).join(SEPARATOR);

const section = (title: string, content: string) => `
  <section aria-labelledby="${slug(title)}">
    <h2 id="${slug(title)}">${title}</h2>
    ${content}
  </section>
`;

const time = (iso: string) =>
  `<time datetime="${iso}">${monthYear(iso)}</time>`;

function renderDates(range: string) {
  const { start, end } = parseDates(range);

  return `${time(start)} - ${end ? time(end) : 'Present'}`;
}

const head = (title: string, organization: string, dates: string) => `
  <div class="head">
    <h3><span class="title">${title}</span>${SEPARATOR}${organization}</h3>
    <span class="dates">${dates}</span>
  </div>
`;

function renderWork(entry: Entry) {
  const { role, company } = splitHeading(entry.heading);

  return `
    <article>
      ${head(role, inline(company), renderDates(entry.dates))}
      ${paragraph(entry.text)}
      ${list(entry.bullets)}
    </article>
  `;
}

function renderEducation(entry: Entry) {
  const { school, degree } = splitEducation(entry.heading);

  return `
    <article>
      ${head(degree, school, graduated(entry.dates))}
    </article>
  `;
}

const renderReference = (reference: Resume['references'][number]) => `
  <figure>
    <blockquote>
      <p>${reference.quote}</p>
    </blockquote>
    <figcaption>${reference.author}</figcaption>
  </figure>
`;

const renderHeader = (resume: Resume) => `
  <header>
    <h1>${resume.name}</h1>
    <p class="label">${resume.label}</p>
    <address>
      <p>${joined(resume.contact)}</p>
      <p>${joined(resume.profiles)}</p>
    </address>
  </header>
`;

export async function render(resume: Resume) {
  const css = await Bun.file(`${import.meta.dir}/ats.css`).text();

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <title>${escapeXml(resume.name)} - Resume</title>
        <style>${css}</style>
      </head>
      <body>
        ${renderHeader(resume)}

        <main>
          ${section('Professional Summary', lines(resume.summary.map(paragraph)))}

          ${section('Work Experience', lines(resume.work.map(renderWork)))}

          ${section('Education', lines(resume.education.map(renderEducation)))}

          ${section('Skills', list(resume.skills))}

          ${section('Languages', list(resume.languages))}

          ${section('Interests', list(resume.interests))}

          ${section('References', lines(resume.references.map(renderReference)))}
        </main>
      </body>
    </html>
  `;
}
