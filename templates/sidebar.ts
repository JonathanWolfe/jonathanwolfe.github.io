import {
  type Entry,
  escapeXml,
  formatDates,
  inline,
  type Resume,
  splitEducation,
  splitHeading,
} from '../src/resume';

export const ats = false;

export const screenshot = { width: 2560, scale: 1 };

const lines = (items: string[]) => items.join('\n');

const listItem = (item: string) => `<li>${inline(item)}</li>`;

const list = (items: string[]) => `
  <ul>
    ${lines(items.map(listItem))}
  </ul>
`;

const plain = (items: string[]) => `
  <ul class="plain">
    ${lines(items.map(listItem))}
  </ul>
`;

const section = (title: string, content: string, className = '') => `
  <section${className ? ` class="${className}"` : ''}>
    <h2>${title}</h2>
    ${content}
  </section>
`;

const entryHead = (title: string, dates: string, subtitle: string) => `
  <div class="entry-head">
    <h3>${title}</h3>
    <span class="dates">${dates}</span>
  </div>
  <div class="role">${subtitle}</div>
`;

function renderWork(entry: Entry) {
  const { role, company } = splitHeading(entry.heading);

  return `
    <div class="entry">
      ${entryHead(inline(company), formatDates(entry.dates), role)}
      <p>${inline(entry.text)}</p>
      ${list(entry.bullets)}
    </div>
  `;
}

function renderEducation(entry: Entry) {
  const { school, degree } = splitEducation(entry.heading);

  return `
    <div class="entry">
      ${entryHead(school, formatDates(entry.dates), degree)}
    </div>
  `;
}

const renderReference = (reference: Resume['references'][number]) => `
  <div class="entry">
    <blockquote>
      ${reference.quote}
      <cite>— ${reference.author}</cite>
    </blockquote>
  </div>
`;

const renderSkill = (skill: Resume['skills'][number]) => `
  <section>
    <h2>${skill.title}</h2>
    <h3>${skill.level}</h3>
    ${plain(skill.items)}
  </section>
`;

const renderLanguage = (language: Resume['languages'][number]) => {
  const level = language.level
    ? ` <span class="level">(${language.level})</span>`
    : '';

  return `<li>${language.language}${level}</li>`;
};

const renderInterest = (interest: Resume['interests'][number]) => `
  <div class="interest">
    <h3>${interest.title}</h3>
    ${plain(interest.items)}
  </div>
`;

const renderHeader = (resume: Resume, photo: string) => `
  <header class="header">
    <div>
      <h1>${resume.name}</h1>
      <p>${resume.label}</p>
    </div>
    <img src="${photo}" alt="${escapeXml(resume.name)}">
  </header>
`;

const renderSidebar = (resume: Resume) => `
  <aside class="sidebar">
    ${section('About', plain([...resume.about, ...resume.profiles]), 'about')}

    ${lines(resume.skills.filter((skill) => skill.items.length).map(renderSkill))}

    ${section('Languages', `<ul class="plain">${lines(resume.languages.map(renderLanguage))}</ul>`)}

    ${section('Interests', lines(resume.interests.map(renderInterest)))}
  </aside>
`;

const renderMain = (resume: Resume) => `
  <div class="main">
    ${section('Summary', lines(resume.summary.map((text) => `<p>${inline(text)}</p>`)), 'summary')}

    ${section('Experience', lines(resume.work.map(renderWork)))}

    ${section('Education', lines(resume.education.map(renderEducation)))}

    ${section('References', lines(resume.references.map(renderReference)))}
  </div>
`;

export async function render(resume: Resume) {
  const { image } = resume;

  const css = await Bun.file(`${import.meta.dir}/sidebar.css`).text();

  const photo = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeXml(resume.name)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;700&family=Lato:ital,wght@0,300;0,400;0,700;1,400&display=swap">
        <style>${css}</style>
      </head>
      <body>
        <main class="page">
          ${renderHeader(resume, photo)}

          <div class="content">
            ${renderSidebar(resume)}

            ${renderMain(resume)}
          </div>
        </main>
      </body>
    </html>
  `;
}
