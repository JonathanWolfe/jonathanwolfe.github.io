import { escapeXml, formatDates, inline, splitEducation, splitHeading, type Entry, type Resume } from "../src/resume";

export const ats = false;
export const screenshot = { width: 2560, scale: 1 };

const list = (items: string[]) => `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
const plain = (items: string[]) => `<ul class="plain">${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;

function renderWork(entry: Entry) {
  const { role, company } = splitHeading(entry.heading);

  return `<div class="entry">
<div class="entry-head"><h3>${inline(company)}</h3><span class="dates">${formatDates(entry.dates)}</span></div>
<div class="role">${role}</div>
<p>${inline(entry.text)}</p>
${list(entry.bullets)}
</div>`;
}

function renderEducation(entry: Entry) {
  const { school, degree } = splitEducation(entry.heading);

  return `<div class="entry">
<div class="entry-head"><h3>${school}</h3><span class="dates">${formatDates(entry.dates)}</span></div>
<div class="role">${degree}</div>
</div>`;
}

export async function render(resume: Resume) {
  const { name, label, image } = resume;
  const css = await Bun.file(`${import.meta.dir}/sidebar.css`).text();
  const photo = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;700&family=Lato:ital,wght@0,300;0,400;0,700;1,400&display=swap">
<style>${css}</style>
</head>
<body>
<main class="page">
<header class="header">
<div><h1>${name}</h1><p>${label}</p></div>
<img src="${photo}" alt="${escapeXml(name)}">
</header>
<div class="content">
<aside class="sidebar">
<section class="about"><h2>About</h2>${plain([...resume.about, ...resume.profiles])}</section>
${resume.skills
  .filter((skill) => skill.items.length)
  .map((skill) => `<section><h2>${skill.title}</h2><h3>${skill.level}</h3>${plain(skill.items)}</section>`)
  .join("\n")}
<section><h2>Languages</h2><ul class="plain">${resume.languages
    .map((l) => `<li>${l.language}${l.level ? ` <span class="level">(${l.level})</span>` : ""}</li>`)
    .join("")}</ul></section>
<section><h2>Interests</h2>${resume.interests
    .map((i) => `<div class="interest"><h3>${i.title}</h3>${plain(i.items)}</div>`)
    .join("")}</section>
</aside>
<div class="main">
<section class="summary"><h2>Summary</h2>${resume.summary.map((p) => `<p>${inline(p)}</p>`).join("")}</section>
<section><h2>Experience</h2>${resume.work.map(renderWork).join("\n")}</section>
<section><h2>Education</h2>${resume.education.map(renderEducation).join("\n")}</section>
<section><h2>References</h2>${resume.references
    .map((r) => `<div class="entry"><blockquote>${r.quote}<cite>— ${r.author}</cite></blockquote></div>`)
    .join("\n")}</section>
</div>
</div>
</main>
</body>
</html>
`;
}
