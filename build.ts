import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { path, resume } from './src/resume';
import type { Template } from './src/template';

const templates = {
  'skills-first': () => import('./templates/ats'),
  'skills-last': () => import('./templates/skills-last'),
} satisfies Record<string, () => Promise<Template>>;

type TemplateName = keyof typeof templates;

const isTemplateName = (name?: string): name is TemplateName =>
  name !== undefined && name in templates;

const { values } = parseArgs({
  options: { template: { type: 'string', default: 'skills-last' } },
});

if (!isTemplateName(values.template)) {
  throw new Error(
    `Unknown template "${values.template}". Use one of: ${Object.keys(templates).join(', ')}`,
  );
}

const template = await templates[values.template]();

async function renderPdf() {
  await using view = new Bun.WebView({
    width: 816,
    height: 1000,
    backend: 'chrome',
  });

  await view.navigate(pathToFileURL(path('resume.html')).href);

  await view.evaluate('document.fonts.ready.then(() => true)');

  await view.evaluate(
    "document.querySelectorAll('details').forEach((d) => { d.open = true; })",
  );

  const pdf = await view.cdp<{ data: string }>('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  });

  await Bun.write(path('resume.pdf'), Buffer.from(pdf.data, 'base64'));
}

await Bun.write(path('resume.html'), await template.render(resume));

await Bun.$`${process.execPath} fmt ${path('resume.html')}`.quiet();

await renderPdf();
