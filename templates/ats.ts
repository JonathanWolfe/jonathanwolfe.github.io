import {
  type Entry,
  escapeXml,
  formatDatesLong,
  graduated,
  inline,
  type Resume,
  splitEducation,
  splitHeading,
} from '../src/resume';

export const ats = true;

export const screenshot = { width: 900, scale: 2 };

const lines = (items: string[]) => items.join('\n');

const paragraph = (text: string) => `<p>${inline(text)}</p>`;

const listItem = (item: string) => `<li>${inline(item)}</li>`;

const list = (items: string[]) => `
  <ul>
    ${lines(items.map(listItem))}
  </ul>
`;

const joined = (items: string[]) => items.map(inline).join(' | ');

const section = (title: string, content: string) => `
  <section>
    <h2>${title}</h2>
    ${content}
  </section>
`;

const head = (title: string, organization: string, dates: string) => `
  <div class="head">
    <h3><span class="title">${title}</span> | ${organization}</h3>
    <span class="dates">${dates}</span>
  </div>
`;

function renderWork(entry: Entry) {
  const { role, company } = splitHeading(entry.heading);

  return `
    <article>
      ${head(role, inline(company), formatDatesLong(entry.dates))}
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
  <blockquote>
    <p>${reference.quote}</p>
    <footer>— ${reference.author}</footer>
  </blockquote>
`;

const renderHeader = (resume: Resume) => `
  <header>
    <h1>${resume.name}</h1>
    <p class="label">${resume.label}</p>
    <address>
      <p>${joined(resume.atsContact)}</p>
      <p>${joined(resume.atsProfiles)}</p>
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
        <title>${escapeXml(resume.name)}</title>
        <style>${css}</style>
      </head>
      <body>
        <main class="page">
          ${renderHeader(resume)}

          ${section('Professional Summary', lines(resume.summary.map(paragraph)))}

          ${section('Work Experience', lines(resume.work.map(renderWork)))}

          ${section('Education', lines(resume.education.map(renderEducation)))}

          ${section('Skills', list(resume.skillBullets))}

          ${section('Languages', list(resume.languageBullets))}

          ${section('Interests', list(resume.interestBullets))}

          ${section('References', lines(resume.references.map(renderReference)))}
        </main>
      </body>
    </html>
  `;
}
