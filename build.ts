import { deflateRawSync } from "node:zlib";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const root = import.meta.dir;
const path = (name: string) => `${root}/${name}`;

type Entry = { heading: string; dates: string; bullets: string[]; text: string };

const source = await Bun.file(path("readme.md")).text();
const lines = source.split("\n").map((line) => line.trimEnd());

const nameIndex = lines.findIndex((line) => line.startsWith("# "));
const name = lines[nameIndex].slice(2);
const label = lines.slice(nameIndex + 1).find((line) => line.trim() && !line.startsWith("!"))!;
const imageUrl = source.match(/!\[[^\]]*\]\(([^)]+)\)/)![1];
const imageName = basename(imageUrl);
const image = Bun.file(path(imageName));

const sections = new Map<string, string[]>();
let current: string[] = [];

for (const line of lines) {
  if (line.startsWith("## ")) sections.set(line.slice(3), (current = []));
  else current.push(line);
}

const section = (title: string) => sections.get(title) ?? [];
const bullets = (block: string[]) => block.filter((l) => /^[*-] /.test(l)).map((l) => l.slice(2));
const paragraphs = (block: string[]) =>
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

function formatDates(range: string) {
  const [start, end] = range.split(" - ");

  return `${formatDate(start)} - ${end ? formatDate(end) : "Present"}`;
}

const contact = Object.fromEntries(
  section("Contact")
    .filter((l) => l.includes(": "))
    .map((l) => l.split(/: (.*)/s).slice(0, 2)),
);
const location = [contact.City, contact.Country, contact["Postal Code"]].join(" ");
const about = [location, contact.Email, contact.Website, contact.Phone];
const profiles = section("Profiles").filter(Boolean);

const skills = bullets(section("Skills")).map((line) => {
  const match = line.match(/^(.+?) in (.+?) \((.+)\)$/);

  return match ? { level: match[1], title: match[2], items: match[3].split(", ") } : { level: "", title: line, items: [] };
});
const languages = bullets(section("Languages")).map((line) => {
  const match = line.match(/^(.+?) in (.+)$/);

  return match ? { language: match[2], level: match[1] } : { language: line, level: "" };
});
const interests = bullets(section("Interests")).map((line) => {
  const match = line.match(/^(.+?) \((.+)\)$/);

  return match ? { title: match[1], items: match[2].split(", ") } : { title: line, items: [] };
});
const references = section("References")
  .filter((l) => l.startsWith(">"))
  .map((l) => l.replace(/^>\s*/, "").match(/^(.*?) -- <cite>(.*)<\/cite>$/)!)
  .map((match) => ({ quote: match[1], author: match[2] }));

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const inline = (markdown: string) => Bun.markdown.html(markdown).replace(/^<p>|<\/p>\n?$/g, "");

function splitHeading(heading: string) {
  const match = heading.match(/^(.+), (\[.+\]\(.+\)|[^[]+)$/);

  return { role: match![1], company: match![2] };
}

const list = (items: string[]) => `<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;

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
  const [school, ...degree] = entry.heading.split(" - ");

  return `<div class="entry">
<div class="entry-head"><h3>${school}</h3><span class="dates">${formatDates(entry.dates)}</span></div>
<div class="role">${degree.join(" - ")}</div>
</div>`;
}

async function renderHtml() {
  const css = await Bun.file(path("style.css")).text();
  const photo = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  const plain = (items: string[]) => `<ul class="plain">${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;

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
<section class="about"><h2>About</h2>${plain([...about, ...profiles])}</section>
${skills
  .filter((skill) => skill.items.length)
  .map((skill) => `<section><h2>${skill.title}</h2><h3>${skill.level}</h3>${plain(skill.items)}</section>`)
  .join("\n")}
<section><h2>Languages</h2><ul class="plain">${languages
    .map((l) => `<li>${l.language}${l.level ? ` <span class="level">(${l.level})</span>` : ""}</li>`)
    .join("")}</ul></section>
<section><h2>Interests</h2>${interests
    .map((i) => `<div class="interest"><h3>${i.title}</h3>${plain(i.items)}</div>`)
    .join("")}</section>
</aside>
<div class="main">
<section class="summary"><h2>Summary</h2>${paragraphs(section("Summary")).map((p) => `<p>${inline(p)}</p>`).join("")}</section>
<section><h2>Experience</h2>${entries("Work").map(renderWork).join("\n")}</section>
<section><h2>Education</h2>${entries("Education").map(renderEducation).join("\n")}</section>
<section><h2>References</h2>${references
    .map((r) => `<div class="entry"><blockquote>${r.quote}<cite>— ${r.author}</cite></blockquote></div>`)
    .join("\n")}</section>
</div>
</div>
</main>
</body>
</html>
`;
}

function zip(files: [string, Uint8Array][]) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [fileName, data] of files) {
    const nameBytes = new TextEncoder().encode(fileName);
    const packed = deflateRawSync(data);
    const crc = Bun.hash.crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 8, true);
    local.setUint16(12, 33, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 8, true);
    entry.setUint16(14, 33, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);

    chunks.push(new Uint8Array(local.buffer), nameBytes, packed);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return Buffer.concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PAGE_WIDTH = 10800;
const ACCENT = "FF5701";

async function renderDocx() {
  const links: string[] = [];

  const run = (text: string, props = "") =>
    `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

  const runs = (markdown: string, props = "") =>
    markdown
      .split(/(\[[^\]]+\]\([^)]+\))/)
      .filter(Boolean)
      .map((part) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

        if (!link) return run(part, props);

        links.push(link[2]);

        return `<w:hyperlink r:id="rIdLink${links.length}">${run(link[1], `<w:rStyle w:val="Hyperlink"/>${props}`)}</w:hyperlink>`;
      })
      .join("");

  const para = (content: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
  const heading = (text: string) => para(run(text), `<w:pStyle w:val="Heading1"/>`);
  const bullet = (text: string) => para(runs(text), `<w:pStyle w:val="ListBullet"/>`);
  const muted = `<w:i/><w:color w:val="666666"/>`;

  function entryHead(title: string, dates: string, subtitle: string) {
    return [
      para(
        runs(title, "<w:b/>") + `<w:r><w:tab/></w:r>` + run(formatDates(dates), muted),
        `<w:keepNext/><w:tabs><w:tab w:val="right" w:pos="${PAGE_WIDTH}"/></w:tabs><w:spacing w:before="200" w:after="0"/>`,
      ),
      para(run(subtitle), `<w:keepNext/><w:spacing w:after="40"/>`),
    ];
  }

  const body: string[] = [];

  const photo = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1097280" cy="1097280"/><wp:docPr id="1" name="Photo" descr="${escapeXml(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(imageName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1097280" cy="1097280"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  body.push(`<w:tbl><w:tblPr><w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/><w:gridCol w:w="1800"/></w:tblGrid><w:tr>
<w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(run(name), `<w:pStyle w:val="Title"/>`)}${para(run(label), `<w:pStyle w:val="Subtitle"/>`)}</w:tc>
<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr>${para(photo, `<w:jc w:val="right"/>`)}</w:tc>
</w:tr></w:tbl>`);

  body.push(para(about.map((item) => runs(item)).join(run("  |  ", "<w:color w:val=\"999999\"/>")), `<w:spacing w:before="160" w:after="40"/>`));
  body.push(para(profiles.map((item) => runs(item)).join(run("  |  ", "<w:color w:val=\"999999\"/>"))));

  body.push(heading("Summary"), ...paragraphs(section("Summary")).map((p) => para(runs(p), `<w:spacing w:after="100"/>`)));

  body.push(heading("Experience"));
  for (const entry of entries("Work")) {
    const { role, company } = splitHeading(entry.heading);

    body.push(...entryHead(company, entry.dates, role), para(runs(entry.text), `<w:spacing w:after="60"/>`), ...entry.bullets.map(bullet));
  }

  body.push(heading("Education"));
  for (const entry of entries("Education")) {
    const [school, ...degree] = entry.heading.split(" - ");

    body.push(...entryHead(school, entry.dates, degree.join(" - ")));
  }

  for (const title of ["Skills", "Languages", "Interests"]) {
    body.push(heading(title), ...bullets(section(title)).map(bullet));
  }

  body.push(heading("References"));
  for (const r of references) {
    body.push(
      para(run(r.quote, "<w:i/>"), `<w:keepNext/><w:spacing w:before="120" w:after="0"/>`),
      para(run(`— ${r.author}`, muted), `<w:jc w:val="right"/>`),
    );
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("\n")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const font = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="64"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="666666"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${ACCENT}"/></w:pBdr><w:spacing w:before="320" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:spacing w:val="20"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const rel = (id: string, type: string, target: string, external = false) =>
    `<Relationship Id="${id}" Type="${R}/${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ""}/>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[
    rel("rIdStyles", "styles", "styles.xml"),
    rel("rIdNumbering", "numbering", "numbering.xml"),
    rel("rIdPhoto", "image", `media/${imageName}`),
    ...links.map((url, i) => rel(`rIdLink${i + 1}`, "hyperlink", url, true)),
  ].join("")}</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;

  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "officeDocument", "word/document.xml")}</Relationships>`;

  const text = (xml: string) => new TextEncoder().encode(xml);

  return zip([
    ["[Content_Types].xml", text(contentTypes)],
    ["_rels/.rels", text(packageRels)],
    ["word/document.xml", text(document)],
    ["word/styles.xml", text(styles)],
    ["word/numbering.xml", text(numbering)],
    ["word/_rels/document.xml.rels", text(documentRels)],
    [`word/media/${imageName}`, new Uint8Array(await image.arrayBuffer())],
  ]);
}

async function renderBrowserOutputs() {
  await using view = new Bun.WebView({ width: 2560, height: 1000, backend: "chrome" });

  await view.navigate(pathToFileURL(path("resume.html")).href);
  await view.evaluate("document.fonts.ready.then(() => true)");

  const height = (await view.evaluate("document.documentElement.scrollHeight")) as number;
  const shot = await view.cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 2560, height, scale: 1 },
  });
  const pdf = await view.cdp("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });

  await Bun.write(path("resume.png"), Buffer.from(shot.data, "base64"));
  await Bun.write(path("resume.pdf"), Buffer.from(pdf.data, "base64"));
}

await Bun.write(path("resume.html"), await renderHtml());
await Bun.$`${process.execPath} fmt ${path("resume.html")}`.quiet();
await Bun.write(path("resume.docx"), await renderDocx());
await renderBrowserOutputs();
