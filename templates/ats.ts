import { escapeXml, formatDatesLong, graduated, inline, splitEducation, splitHeading, type Entry, type Resume } from "../src/resume";

export const ats = true;
export const screenshot = { width: 900, scale: 2 };

const list = (items: string[]) => `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
const joined = (items: string[]) => items.map(inline).join(" | ");

function renderWork(entry: Entry) {
  const { role, company } = splitHeading(entry.heading);

  return `<article>
<div class="head"><h3><span class="title">${role}</span> | ${inline(company)}</h3><span class="dates">${formatDatesLong(entry.dates)}</span></div>
<p>${inline(entry.text)}</p>
${list(entry.bullets)}
</article>`;
}

function renderEducation(entry: Entry) {
  const { school, degree } = splitEducation(entry.heading);

  return `<article>
<div class="head"><h3><span class="title">${degree}</span> | ${school}</h3><span class="dates">${graduated(entry.dates)}</span></div>
</article>`;
}

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
<header>
<h1>${resume.name}</h1>
<p class="label">${resume.label}</p>
<address><p>${joined(resume.atsContact)}</p><p>${joined(resume.atsProfiles)}</p></address>
</header>
<section><h2>Professional Summary</h2>${resume.summary.map((p) => `<p>${inline(p)}</p>`).join("")}</section>
<section><h2>Work Experience</h2>${resume.work.map(renderWork).join("\n")}</section>
<section><h2>Education</h2>${resume.education.map(renderEducation).join("\n")}</section>
<section><h2>Skills</h2>${list(resume.skillBullets)}</section>
<section><h2>Languages</h2>${list(resume.languageBullets)}</section>
<section><h2>Interests</h2>${list(resume.interestBullets)}</section>
<section><h2>References</h2>${resume.references
    .map((r) => `<blockquote><p>${r.quote}</p><footer>— ${r.author}</footer></blockquote>`)
    .join("\n")}</section>
</main>
</body>
</html>
`;
}
