import {
  type Entry,
  escapeHtml,
  graduated,
  inline,
  monthYear,
  parseDates,
  printBullets,
  type Resume,
  splitEducation,
  splitHeading,
} from '../src/resume';

const OPEN_ENTRIES = 4 as const;

const SEPARATOR = '<span aria-hidden="true"> | </span>' as const;

const lines = (items: string[]) => items.join('\n');

const slug = (title: string) => title.toLowerCase().replace(/\W+/g, '-');

const paragraph = (text: string) => `<p>${inline(text)}</p>`;

const listItem = (item: string) => `<li>${inline(item)}</li>`;

const list = (items: string[]) =>
  items.length
    ? `
  <ul>
    ${lines(items.map(listItem))}
  </ul>
`
    : '';

const CONTACT_SEPARATOR =
  '<span class="sep" aria-hidden="true"> | </span>' as const;

const contactItem = (markdown: string) =>
  `<span class="item">${inline(markdown)}</span>`;

const joined = (items: string[]) =>
  items.map(contactItem).join(CONTACT_SEPARATOR);

const section = (title: string, content: string) =>
  content.trim()
    ? `
  <section aria-labelledby="${slug(title)}">
    <h2 id="${slug(title)}">${title}</h2>
    ${content}
  </section>
`
    : '';

const time = (iso: string) =>
  `<time datetime="${iso}">${monthYear(iso)}</time>`;

function renderDates(range: string) {
  const { start, end } = parseDates(range);

  return `${time(start)} - ${end ? time(end) : 'Present'}`;
}

const head = (
  title: string,
  organization: string,
  dates: string,
  tag: 'div' | 'summary' = 'div',
) => `
  <${tag} class="head">
    <h3><span class="title">${title}</span>${SEPARATOR}${organization}</h3>
    <span class="dates">${dates}</span>
  </${tag}>
`;

const workBullets = (bullets: string[], limit: number) =>
  bullets.length
    ? `
  <ul${limit === 0 ? ' class="web-only"' : ''}>
    ${lines(
      bullets.map(
        (bullet, index) =>
          `<li${index >= limit ? ' class="web-only"' : ''}>${inline(bullet)}</li>`,
      ),
    )}
  </ul>
`
    : '';

function renderWork(entry: Entry, index: number) {
  const { role, company } = splitHeading(entry.heading);

  return `
    <article${printBullets(index) === 0 ? ' class="brief"' : ''}>
      <details${index < OPEN_ENTRIES ? ' open' : ''}>
        ${head(role, inline(company), renderDates(entry.dates), 'summary')}
        ${entry.text ? paragraph(entry.text) : ''}
        ${workBullets(entry.bullets, printBullets(index))}
      </details>
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

const renderKeywords = (resume: Resume) => `
  <div class="keywords">
    ${section('Skills', lines(resume.skills.map(paragraph)))}

    ${section('Education', lines(resume.education.map(renderEducation)))}
  </div>
`;

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
    <div class="name">
      <h1>${resume.name}</h1>
      <span class="name-sep" aria-hidden="true"> | </span>
      <p class="label">${resume.label}</p>
    </div>
    <address>
      <p>${joined(resume.contact)}</p>
      <p>${joined(resume.profiles)}</p>
    </address>
    <a class="pdf-link" href="resume.pdf" aria-label="Download PDF version" title="Download PDF version">PDF</a>
  </header>
`;

export async function renderPage(resume: Resume, keywordsOnTop: boolean) {
  const css = await Bun.file(`${import.meta.dir}/ats.css`).text();

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <title>${escapeHtml(resume.name)} - Resume</title>
        <link rel="alternate" type="application/pdf" href="resume.pdf" title="${escapeHtml(resume.name)} - Resume (PDF)">
        <style>${css}</style>
      </head>
      <body>
        ${renderHeader(resume)}

        <main>
          ${section('Professional Summary', lines(resume.summary.map(paragraph)))}

          ${keywordsOnTop ? renderKeywords(resume) : ''}

          ${section('Work Experience', lines(resume.work.map(renderWork)))}

          ${keywordsOnTop ? '' : renderKeywords(resume)}

          ${section('Interests', list(resume.interests))}

          ${section('References', lines(resume.references.map(renderReference)))}
        </main>
      </body>
    </html>
  `;
}

export const render = (resume: Resume) => renderPage(resume, true);
