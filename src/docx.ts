import { deflateRawSync } from "node:zlib";
import { escapeXml, formatDates, formatDatesLong, graduated, splitEducation, splitHeading, type Resume } from "./resume";

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
const GRAY = `<w:color w:val="999999"/>`;

export async function renderDocx(resume: Resume, ats: boolean) {
  const { name, label, imageName } = resume;
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
  const sectionTitles: Record<string, string> = ats ? { Summary: "Professional Summary", Experience: "Work Experience" } : {};
  const heading = (text: string) => para(run(sectionTitles[text] ?? text), `<w:pStyle w:val="Heading1"/>`);
  const bullet = (text: string) => para(runs(text), `<w:pStyle w:val="ListBullet"/>`);
  const muted = `<w:i/><w:color w:val="666666"/>`;
  const tabs = `<w:tabs><w:tab w:val="right" w:pos="${PAGE_WIDTH}"/></w:tabs>`;

  function entryHead(title: string, dates: string, subtitle: string) {
    return [
      para(
        runs(title, "<w:b/>") + `<w:r><w:tab/></w:r>` + run(formatDates(dates), muted),
        `<w:keepNext/>${tabs}<w:spacing w:before="200" w:after="0"/>`,
      ),
      para(run(subtitle), `<w:keepNext/><w:spacing w:after="40"/>`),
    ];
  }

  const atsHead = (left: string, leftRuns: string, right: string) =>
    para(
      run(left, "<w:b/><w:caps/>") + leftRuns + `<w:r><w:tab/></w:r>` + run(right),
      `<w:keepNext/>${tabs}<w:spacing w:before="200" w:after="40"/>`,
    );

  const body: string[] = [];

  const photo = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1097280" cy="1097280"/><wp:docPr id="1" name="Photo" descr="${escapeXml(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(imageName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1097280" cy="1097280"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  const separator = run("  |  ", GRAY);

  if (ats) {
    const rule = (side: string) => `<w:${side} w:val="single" w:sz="6" w:space="6" w:color="444444"/>`;

    body.push(
      para(run(name), `<w:pStyle w:val="Title"/><w:jc w:val="center"/>`),
      para(run(label, "<w:i/>"), `<w:pStyle w:val="Subtitle"/><w:jc w:val="center"/>`),
      para(
        resume.atsContact.map((item) => runs(item)).join(separator) +
          `<w:r><w:br/></w:r>` +
          resume.atsProfiles.map((item) => runs(item)).join(separator),
        `<w:pBdr>${rule("top")}${rule("bottom")}</w:pBdr><w:spacing w:before="200" w:after="120"/><w:jc w:val="center"/>`,
      ),
    );
  } else {
    body.push(`<w:tbl><w:tblPr><w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/><w:gridCol w:w="1800"/></w:tblGrid><w:tr>
<w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(run(name), `<w:pStyle w:val="Title"/>`)}${para(run(label), `<w:pStyle w:val="Subtitle"/>`)}</w:tc>
<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr>${para(photo, `<w:jc w:val="right"/>`)}</w:tc>
</w:tr></w:tbl>`);

    body.push(para(resume.about.map((item) => runs(item)).join(separator), `<w:spacing w:before="160" w:after="40"/>`));
    body.push(para(resume.profiles.map((item) => runs(item)).join(separator)));
  }

  body.push(heading("Summary"), ...resume.summary.map((p) => para(runs(p), `<w:spacing w:after="100"/>`)));

  body.push(heading("Experience"));
  for (const entry of resume.work) {
    const { role, company } = splitHeading(entry.heading);

    body.push(
      ...(ats ? [atsHead(role, run(" | ") + runs(company), formatDatesLong(entry.dates))] : entryHead(company, entry.dates, role)),
      para(runs(entry.text), `<w:spacing w:after="60"/>`),
      ...entry.bullets.map(bullet),
    );
  }

  body.push(heading("Education"));
  for (const entry of resume.education) {
    const { school, degree } = splitEducation(entry.heading);

    body.push(...(ats ? [atsHead(degree, run(" | ") + runs(school), graduated(entry.dates))] : entryHead(school, entry.dates, degree)));
  }

  body.push(heading("Skills"), ...resume.skillBullets.map(bullet));
  body.push(heading("Languages"), ...resume.languageBullets.map(bullet));
  body.push(heading("Interests"), ...resume.interestBullets.map(bullet));

  body.push(heading("References"));
  for (const r of resume.references) {
    body.push(
      para(run(r.quote, "<w:i/>"), `<w:keepNext/><w:spacing w:before="120" w:after="0"/>`),
      para(run(`— ${r.author}`, muted), `<w:jc w:val="right"/>`),
    );
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("\n")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const bodyFont = ats ? "Arial" : "Calibri";
  const headFont = ats ? `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>` : "";
  const headBorder = ats ? "" : `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${ACCENT}"/></w:pBdr>`;
  const linkProps = ats ? `<w:color w:val="000000"/>` : `<w:color w:val="0563C1"/><w:u w:val="single"/>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${bodyFont}" w:hAnsi="${bodyFont}" w:cs="${bodyFont}"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr>${headFont}${ats ? "" : "<w:b/>"}<w:sz w:val="64"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr>${headFont}<w:color w:val="666666"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/>${headBorder}<w:spacing w:before="320" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${headFont}<w:b/><w:caps/><w:spacing w:val="20"/><w:sz w:val="${ats ? 24 : 26}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr>${linkProps}</w:rPr></w:style>
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const rel = (id: string, type: string, target: string, external = false) =>
    `<Relationship Id="${id}" Type="${R}/${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ""}/>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[
    rel("rIdStyles", "styles", "styles.xml"),
    rel("rIdNumbering", "numbering", "numbering.xml"),
    ...(ats ? [] : [rel("rIdPhoto", "image", `media/${imageName}`)]),
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
    ...(ats ? [] : [[`word/media/${imageName}`, new Uint8Array(await resume.image.arrayBuffer())] as [string, Uint8Array]]),
  ]);
}
