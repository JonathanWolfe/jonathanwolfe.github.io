import { deflateRawSync } from 'node:zlib';

import {
  escapeXml,
  formatDates,
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

const ZIP_UTF8_FLAG = 0x0800 as const;

const ZIP_DEFLATE = 8 as const;

const ZIP_FIXED_DATE = 33 as const;

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

const W =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main' as const;

const R =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships' as const;

const PACKAGE_RELS =
  'http://schemas.openxmlformats.org/package/2006/relationships' as const;

const XML_HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' as const;

const MARGIN = 1080 as const;

const TEXT_WIDTH = 12240 - MARGIN * 2;

const UNIT = 336 as const;

const HALF_UNIT = UNIT / 2;

const QUARTER_UNIT = UNIT / 4;

const MUTED = `<w:i/><w:color w:val="404040"/>` as const;

const SEPARATOR_COLOR = `<w:color w:val="404040"/>` as const;

const TABS =
  `<w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs>` as const;

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

const numbering = `${XML_HEADER}
  <w:numbering xmlns:w="${W}">
    <w:abstractNum w:abstractNumId="0">
      <w:multiLevelType w:val="singleLevel"/>
      <w:lvl w:ilvl="0">
        <w:start w:val="1"/>
        <w:numFmt w:val="bullet"/>
        <w:lvlText w:val="-"/>
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
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  </Types>
`;

const packageRels = `${XML_HEADER}
  <Relationships xmlns="${PACKAGE_RELS}">
    <Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
    <Relationship Id="rId2" Type="${PACKAGE_RELS}/metadata/core-properties" Target="docProps/core.xml"/>
  </Relationships>
`;

const renderCoreProperties = (name: string) => `${XML_HEADER}
  <cp:coreProperties
    xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(name)} - Resume</dc:title>
    <dc:creator>${escapeXml(name)}</dc:creator>
    <dc:language>en-US</dc:language>
  </cp:coreProperties>
`;

const pageProperties = `
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar
      w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}"
      w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>
`;

const styles = `${XML_HEADER}
  <w:styles xmlns:w="${W}">
    <w:docDefaults>
      <w:rPrDefault>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
          <w:sz w:val="24"/>
          <w:lang w:val="en-US"/>
        </w:rPr>
      </w:rPrDefault>
      <w:pPrDefault>
        <w:pPr><w:spacing w:after="0" w:line="${UNIT}" w:lineRule="auto"/></w:pPr>
      </w:pPrDefault>
    </w:docDefaults>

    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal"/>
    </w:style>

    <w:style w:type="paragraph" w:styleId="Title">
      <w:name w:val="Title"/>
      <w:basedOn w:val="Normal"/>
      <w:rPr>
        <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
        <w:sz w:val="48"/>
      </w:rPr>
    </w:style>

    <w:style w:type="paragraph" w:styleId="Subtitle">
      <w:name w:val="Subtitle"/>
      <w:basedOn w:val="Normal"/>
      <w:rPr>
        <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
        <w:i/>
        <w:color w:val="404040"/>
        <w:sz w:val="28"/>
      </w:rPr>
    </w:style>

    <w:style w:type="paragraph" w:styleId="Heading1">
      <w:name w:val="heading 1"/>
      <w:basedOn w:val="Normal"/>
      <w:next w:val="Normal"/>
      <w:pPr>
        <w:keepNext/>
        <w:spacing w:before="${UNIT * 2}" w:after="${HALF_UNIT}"/>
        <w:outlineLvl w:val="0"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
        <w:b/>
        <w:caps/>
        <w:spacing w:val="20"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:style>

    <w:style w:type="paragraph" w:styleId="ListBullet">
      <w:name w:val="List Bullet"/>
      <w:basedOn w:val="Normal"/>
      <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
    </w:style>

    <w:style w:type="character" w:styleId="Hyperlink">
      <w:name w:val="Hyperlink"/>
      <w:rPr><w:u w:val="single"/></w:rPr>
    </w:style>
  </w:styles>
`;

export function renderDocx(resume: Resume) {
  const { name, label } = resume;

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

  const sectionTitles: Record<string, string> = {
    Summary: 'Professional Summary',
    Experience: 'Work Experience',
  };

  const heading = (text: string) =>
    para(run(sectionTitles[text] ?? text), `<w:pStyle w:val="Heading1"/>`);

  const bullet = (text: string) =>
    para(runs(text), `<w:pStyle w:val="ListBullet"/>`);

  const separator = run(' | ', SEPARATOR_COLOR);

  const joinRuns = (items: string[]) =>
    items.map((item) => runs(item)).join(separator);

  const entryHead = (title: string, organization: string, dates: string) =>
    para(
      run(title, '<w:b/>')
        + separator
        + runs(organization)
        + `<w:r><w:tab/></w:r>`
        + run(dates, MUTED),
      `<w:keepNext/>${TABS}<w:spacing w:before="${UNIT}" w:after="0"/>`,
    );

  const rule = (side: string) =>
    `<w:${side} w:val="single" w:sz="6" w:space="6" w:color="404040"/>`;

  const body: string[] = [
    para(run(name), `<w:pStyle w:val="Title"/><w:jc w:val="center"/>`),

    para(run(label), `<w:pStyle w:val="Subtitle"/><w:jc w:val="center"/>`),

    para(
      joinRuns(resume.contact)
        + `<w:r><w:br/></w:r>`
        + joinRuns(resume.profiles),
      `<w:pBdr>${rule('top')}${rule('bottom')}</w:pBdr><w:spacing w:before="${UNIT}" w:after="0"/><w:jc w:val="center"/>`,
    ),

    heading('Summary'),

    ...resume.summary.map((text, index) =>
      para(
        runs(text),
        index ? `<w:spacing w:before="${HALF_UNIT}" w:after="0"/>` : '',
      ),
    ),

    heading('Experience'),
  ];

  for (const entry of resume.work) {
    const { role, company } = splitHeading(entry.heading);

    body.push(
      entryHead(role, company, formatDates(entry.dates)),

      para(
        runs(entry.text),
        `<w:spacing w:before="${QUARTER_UNIT}" w:after="${QUARTER_UNIT}"/>`,
      ),

      ...entry.bullets.map(bullet),
    );
  }

  body.push(heading('Education'));

  for (const entry of resume.education) {
    const { school, degree } = splitEducation(entry.heading);

    body.push(entryHead(degree, school, graduated(entry.dates)));
  }

  body.push(heading('Skills'), ...resume.skills.map(bullet));

  body.push(heading('Languages'), ...resume.languages.map(bullet));

  body.push(heading('Interests'), ...resume.interests.map(bullet));

  body.push(heading('References'));

  for (const reference of resume.references) {
    body.push(
      para(
        run(reference.quote, '<w:i/>'),
        `<w:keepNext/><w:spacing w:before="${UNIT}" w:after="0"/>`,
      ),

      para(run(reference.author, MUTED), `<w:jc w:val="right"/>`),
    );
  }

  const document = `${XML_HEADER}
    <w:document xmlns:w="${W}" xmlns:r="${R}">
      <w:body>
        ${body.join('\n')}
        ${pageProperties}
      </w:body>
    </w:document>
  `;

  const documentRels = `${XML_HEADER}
    <Relationships xmlns="${PACKAGE_RELS}">
      ${relationship('rIdStyles', 'styles', 'styles.xml')}
      ${relationship('rIdNumbering', 'numbering', 'numbering.xml')}
      ${links.map((url, i) => relationship(`rIdLink${i + 1}`, 'hyperlink', url, true)).join('\n')}
    </Relationships>
  `;

  return zip([
    ['[Content_Types].xml', encode(contentTypes)],
    ['_rels/.rels', encode(packageRels)],
    ['docProps/core.xml', encode(renderCoreProperties(name))],
    ['word/document.xml', encode(document)],
    ['word/styles.xml', encode(styles)],
    ['word/numbering.xml', encode(numbering)],
    ['word/_rels/document.xml.rels', encode(documentRels)],
  ]);
}
