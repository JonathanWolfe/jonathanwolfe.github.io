import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { renderDocx } from './src/docx';
import { path, resume } from './src/resume';
import type { Template } from './src/template';

const templates = {
  ats: () => import('./templates/ats'),
  sidebar: () => import('./templates/sidebar'),
} satisfies Record<string, () => Promise<Template>>;

type TemplateName = keyof typeof templates;

const isTemplateName = (name?: string): name is TemplateName =>
  name !== undefined && name in templates;

const { values } = parseArgs({
  options: { template: { type: 'string', default: 'ats' } },
});

if (!isTemplateName(values.template)) {
  throw new Error(
    `Unknown template "${values.template}". Use one of: ${Object.keys(templates).join(', ')}`,
  );
}

const template = await templates[values.template]();

async function renderBrowserOutputs() {
  const { width, scale } = template.screenshot;

  await using view = new Bun.WebView({
    width,
    height: 1000,
    backend: 'chrome',
  });

  await view.navigate(pathToFileURL(path('resume.html')).href);

  await view.evaluate('document.fonts.ready.then(() => true)');

  const height = await view.evaluate<number>(
    'document.documentElement.scrollHeight',
  );

  const shot = await view.cdp<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  });

  const pdf = await view.cdp<{ data: string }>('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
  });

  await Bun.write(path('resume.png'), Buffer.from(shot.data, 'base64'));

  await Bun.write(path('resume.pdf'), Buffer.from(pdf.data, 'base64'));
}

await Bun.write(path('resume.html'), await template.render(resume));

await Bun.$`${process.execPath} fmt ${path('resume.html')}`.quiet();

await Bun.write(path('resume.docx'), await renderDocx(resume, template.ats));

await renderBrowserOutputs();
