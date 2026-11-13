import { deflateRawSync } from 'node:zlib';

import {
  escapeXml,
  formatDates,
  formatDatesLong,
  graduated,
  type Resume,
  splitEducation,
  splitHeading,
} from './resume';

type PackedFile = {
  nameBytes: Uint8Array;
  packed: Uint8Array;
  size: number;
  crc: number;
};

const ZIP_UTF8_FLAG = 0x0800;

const ZIP_DEFLATE = 8;

const ZIP_FIXED_DATE = 33;

function localHeader({ nameBytes, packed, size, crc }: PackedFile) {
  const header = new DataView(new ArrayBuffer(30));

  header.setUint32(0, 0x04034b50, true);
  header.setUint16(4, 20, true);
  header.setUint16(6, ZIP_UTF8_FLAG, true);
  header.setUint16(8, ZIP_DEFLATE, true);
  header.setUint16(12, ZIP_FIXED_DATE, true);

  header.setUint32(14, crc, true);
  header.setUint32(18, packed.length, true);
  header.setUint32(22, size, true);
  header.setUint16(26, nameBytes.length, true);

  return new Uint8Array(header.buffer);
}

function centralHeader(file: PackedFile, offset: number) {
  const { nameBytes, packed, size, crc } = file;

  const header = new DataView(new ArrayBuffer(46));

  header.setUint32(0, 0x02014b50, true);
  header.setUint16(4, 20, true);
  header.setUint16(6, 20, true);
  header.setUint16(8, ZIP_UTF8_FLAG, true);
  header.setUint16(10, ZIP_DEFLATE, true);
  header.setUint16(14, ZIP_FIXED_DATE, true);

  header.setUint32(16, crc, true);
  header.setUint32(20, packed.length, true);
  header.setUint32(24, size, true);
  header.setUint16(28, nameBytes.length, true);
  header.setUint32(42, offset, true);

  return new Uint8Array(header.buffer);
}

function endOfCentralDirectory(count: number, size: number, offset: number) {
  const end = new DataView(new ArrayBuffer(22));

  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);

  return new Uint8Array(end.buffer);
}

function zip(files: [string, Uint8Array][]) {
  const chunks: Uint8Array[] = [];

  const central: Uint8Array[] = [];

  let offset = 0;

  for (const [fileName, data] of files) {
    const file = {
      nameBytes: new TextEncoder().encode(fileName),
      packed: deflateRawSync(data),
      size: data.length,
      crc: Bun.hash.crc32(data),
    };

    chunks.push(localHeader(file), file.nameBytes, file.packed);

    central.push(centralHeader(file, offset), file.nameBytes);

    offset += 30 + file.nameBytes.length + file.packed.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);

  return Buffer.concat([
    ...chunks,
    ...central,
    endOfCentralDirectory(files.length, centralSize, offset),
  ]);
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const WP =
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const PAGE_WIDTH = 10800;

const PHOTO_SIZE = 1097280;

const ACCENT = 'FF5701';

const GRAY = `<w:color w:val="999999"/>`;

const MUTED = `<w:i/><w:color w:val="666666"/>`;

const TABS = `<w:tabs><w:tab w:val="right" w:pos="${PAGE_WIDTH}"/></w:tabs>`;

const encode = (xml: string) => new TextEncoder().encode(xml);

const relationship = (
  id: string,
  type: string,
  target: string,
  external = false,
) => `
  <Relationship
    Id="${id}"
    Type="${R}/${type}"
    Target="${escapeXml(target)}"
    ${external ? 'TargetMode="External"' : ''}/>
`;

const photoDrawing = (name: string, imageName: string) => `
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${PHOTO_SIZE}" cy="${PHOTO_SIZE}"/>
        <wp:docPr id="1" name="Photo" descr="${escapeXml(name)}"/>
        <a:graphic xmlns:a="${A}">
          <a:graphicData uri="${PIC}">
            <pic:pic xmlns:pic="${PIC}">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="${escapeXml(imageName)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rIdPhoto"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${PHOTO_SIZE}" cy="${PHOTO_SIZE}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
`;

const numbering = `${XML_HEADER}
  <w:numbering xmlns:w="${W}">
    <w:abstractNum w:abstractNumId="0">
      <w:multiLevelType w:val="singleLevel"/>
      <w:lvl w:ilvl="0">
        <w:start w:val="1"/>
        <w:numFmt w:val="bullet"/>
        <w:lvlText w:val="•"/>
        <w:lvlJc w:val="left"/>
        <w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr>
      </w:lvl>
    </w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  </w:numbering>
`;

const contentTypes = `${XML_HEADER}
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Default Extension="jpg" ContentType="image/jpeg"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  </Types>
`;

const packageRels = `${XML_HEADER}
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${relationship('rId1', 'officeDocument', 'word/document.xml')}
  </Relationships>
`;

const pageProperties = `
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar
      w:top="720" w:right="720" w:bottom="720" w:left="720"
      w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>
`;

function renderStyles(ats: boolean) {
  const bodyFont = ats ? 'Arial' : 'Calibri';

  const headFont = ats
    ? `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>`
    : '';

  const headBorder = ats
    ? ''
    : `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${ACCENT}"/></w:pBdr>`;

  const linkProps = ats
    ? `<w:color w:val="000000"/>`
    : `<w:color w:val="0563C1"/><w:u w:val="single"/>`;

  return `${XML_HEADER}
    <w:styles xmlns:w="${W}">
      <w:docDefaults>
        <w:rPrDefault>
          <w:rPr>
            <w:rFonts w:ascii="${bodyFont}" w:hAnsi="${bodyFont}" w:cs="${bodyFont}"/>
            <w:sz w:val="21"/>
          </w:rPr>
        </w:rPrDefault>
        <w:pPrDefault>
          <w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr>
        </w:pPrDefault>
      </w:docDefaults>

      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
      </w:style>

      <w:style w:type="paragraph" w:styleId="Title">
        <w:name w:val="Title"/>
        <w:basedOn w:val="Normal"/>
        <w:pPr><w:spacing w:after="0"/></w:pPr>
        <w:rPr>${headFont}${ats ? '' : '<w:b/>'}<w:sz w:val="64"/></w:rPr>
      </w:style>

      <w:style w:type="paragraph" w:styleId="Subtitle">
        <w:name w:val="Subtitle"/>
        <w:basedOn w:val="Normal"/>
        <w:rPr>${headFont}<w:color w:val="666666"/><w:sz w:val="28"/></w:rPr>
      </w:style>

      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:basedOn w:val="Normal"/>
        <w:next w:val="Normal"/>
        <w:pPr>
          <w:keepNext/>${headBorder}
          <w:spacing w:before="320" w:after="100"/>
          <w:outlineLvl w:val="0"/>
        </w:pPr>
        <w:rPr>
          ${headFont}<w:b/><w:caps/><w:spacing w:val="20"/><w:sz w:val="${ats ? 24 : 26}"/>
        </w:rPr>
      </w:style>

      <w:style w:type="paragraph" w:styleId="ListBullet">
        <w:name w:val="List Bullet"/>
        <w:basedOn w:val="Normal"/>
        <w:pPr>
          <w:numPr><w:numId w:val="1"/></w:numPr>
          <w:spacing w:after="20"/>
        </w:pPr>
      </w:style>

      <w:style w:type="character" w:styleId="Hyperlink">
        <w:name w:val="Hyperlink"/>
        <w:rPr>${linkProps}</w:rPr>
      </w:style>
    </w:styles>
  `;
}

export async function renderDocx(resume: Resume, ats: boolean) {
  const { name, label, imageName } = resume;

  const links: string[] = [];

  const run = (text: string, props = '') =>
    `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

  const runs = (markdown: string, props = '') =>
    markdown
      .split(/(\[[^\]]+\]\([^)]+\))/)
      .filter(Boolean)
      .map((part) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

        if (!link) return run(part, props);

        links.push(link[2]);

        const linkRun = run(link[1], `<w:rStyle w:val="Hyperlink"/>${props}`);

        return `<w:hyperlink r:id="rIdLink${links.length}">${linkRun}</w:hyperlink>`;
      })
      .join('');

  const para = (content: string, props = '') =>
    `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`;

  const sectionTitles: Record<string, string> = ats
    ? { Summary: 'Professional Summary', Experience: 'Work Experience' }
    : {};

  const heading = (text: string) =>
    para(run(sectionTitles[text] ?? text), `<w:pStyle w:val="Heading1"/>`);

  const bullet = (text: string) =>
    para(runs(text), `<w:pStyle w:val="ListBullet"/>`);

  const separator = run('  |  ', GRAY);

  const joinRuns = (items: string[]) =>
    items.map((item) => runs(item)).join(separator);

  function entryHead(title: string, dates: string, subtitle: string) {
    return [
      para(
        runs(title, '<w:b/>')
          + `<w:r><w:tab/></w:r>`
          + run(formatDates(dates), MUTED),
        `<w:keepNext/>${TABS}<w:spacing w:before="200" w:after="0"/>`,
      ),
      para(run(subtitle), `<w:keepNext/><w:spacing w:after="40"/>`),
    ];
  }

  const atsHead = (left: string, leftRuns: string, right: string) =>
    para(
      run(left, '<w:b/><w:caps/>')
        + leftRuns
        + `<w:r><w:tab/></w:r>`
        + run(right),
      `<w:keepNext/>${TABS}<w:spacing w:before="200" w:after="40"/>`,
    );

  const atsHeader = () => {
    const rule = (side: string) =>
      `<w:${side} w:val="single" w:sz="6" w:space="6" w:color="444444"/>`;

    return [
      para(run(name), `<w:pStyle w:val="Title"/><w:jc w:val="center"/>`),

      para(
        run(label, '<w:i/>'),
        `<w:pStyle w:val="Subtitle"/><w:jc w:val="center"/>`,
      ),

      para(
        joinRuns(resume.atsContact)
          + `<w:r><w:br/></w:r>`
          + joinRuns(resume.atsProfiles),
        `<w:pBdr>${rule('top')}${rule('bottom')}</w:pBdr><w:spacing w:before="200" w:after="120"/><w:jc w:val="center"/>`,
      ),
    ];
  };

  const sidebarHeader = () => [
    `
      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/>
          <w:tblLayout w:type="fixed"/>
        </w:tblPr>
        <w:tblGrid>
          <w:gridCol w:w="9000"/>
          <w:gridCol w:w="1800"/>
        </w:tblGrid>
        <w:tr>
          <w:tc>
            <w:tcPr><w:tcW w:w="9000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
            ${para(run(name), `<w:pStyle w:val="Title"/>`)}
            ${para(run(label), `<w:pStyle w:val="Subtitle"/>`)}
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr>
            ${para(photoDrawing(name, imageName), `<w:jc w:val="right"/>`)}
          </w:tc>
        </w:tr>
      </w:tbl>
    `,

    para(joinRuns(resume.about), `<w:spacing w:before="160" w:after="40"/>`),

    para(joinRuns(resume.profiles)),
  ];

  const body: string[] = [];

  body.push(...(ats ? atsHeader() : sidebarHeader()));

  body.push(
    heading('Summary'),
    ...resume.summary.map((text) =>
      para(runs(text), `<w:spacing w:after="100"/>`),
    ),
  );

  body.push(heading('Experience'));

  for (const entry of resume.work) {
    const { role, company } = splitHeading(entry.heading);

    const head = ats
      ? [
          atsHead(
            role,
            run(' | ') + runs(company),
            formatDatesLong(entry.dates),
          ),
        ]
      : entryHead(company, entry.dates, role);

    body.push(
      ...head,
      para(runs(entry.text), `<w:spacing w:after="60"/>`),
      ...entry.bullets.map(bullet),
    );
  }

  body.push(heading('Education'));

  for (const entry of resume.education) {
    const { school, degree } = splitEducation(entry.heading);

    const head = ats
      ? [atsHead(degree, run(' | ') + runs(school), graduated(entry.dates))]
      : entryHead(school, entry.dates, degree);

    body.push(...head);
  }

  body.push(heading('Skills'), ...resume.skillBullets.map(bullet));

  body.push(heading('Languages'), ...resume.languageBullets.map(bullet));

  body.push(heading('Interests'), ...resume.interestBullets.map(bullet));

  body.push(heading('References'));

  for (const reference of resume.references) {
    body.push(
      para(
        run(reference.quote, '<w:i/>'),
        `<w:keepNext/><w:spacing w:before="120" w:after="0"/>`,
      ),

      para(run(`— ${reference.author}`, MUTED), `<w:jc w:val="right"/>`),
    );
  }

  const document = `${XML_HEADER}
    <w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}">
      <w:body>
        ${body.join('\n')}
        ${pageProperties}
      </w:body>
    </w:document>
  `;

  const documentRels = `${XML_HEADER}
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${relationship('rIdStyles', 'styles', 'styles.xml')}
      ${relationship('rIdNumbering', 'numbering', 'numbering.xml')}
      ${ats ? '' : relationship('rIdPhoto', 'image', `media/${imageName}`)}
      ${links.map((url, i) => relationship(`rIdLink${i + 1}`, 'hyperlink', url, true)).join('\n')}
    </Relationships>
  `;

  const files: [string, Uint8Array][] = [
    ['[Content_Types].xml', encode(contentTypes)],
    ['_rels/.rels', encode(packageRels)],
    ['word/document.xml', encode(document)],
    ['word/styles.xml', encode(renderStyles(ats))],
    ['word/numbering.xml', encode(numbering)],
    ['word/_rels/document.xml.rels', encode(documentRels)],
  ];

  if (!ats) {
    const photo = new Uint8Array(await resume.image.arrayBuffer());

    files.push([`word/media/${imageName}`, photo]);
  }

  return zip(files);
}
