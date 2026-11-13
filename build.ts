import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { renderDocx } from "./src/docx";
import { path, resume } from "./src/resume";

const { values } = parseArgs({ options: { template: { type: "string", default: "ats" } } });
const template = await import(`./templates/${values.template}.ts`);

async function renderBrowserOutputs() {
  const { width, scale } = template.screenshot;

  await using view = new Bun.WebView({ width, height: 1000, backend: "chrome" });

  await view.navigate(pathToFileURL(path("resume.html")).href);
  await view.evaluate("document.fonts.ready.then(() => true)");

  const height = (await view.evaluate("document.documentElement.scrollHeight")) as number;

  const shot = (await view.cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  })) as { data: string };

  const pdf = (await view.cdp("Page.printToPDF", { printBackground: true, preferCSSPageSize: true })) as {
    data: string;
  };

  await Bun.write(path("resume.png"), Buffer.from(shot.data, "base64"));
  await Bun.write(path("resume.pdf"), Buffer.from(pdf.data, "base64"));
}

await Bun.write(path("resume.html"), await template.render(resume));
await Bun.$`${process.execPath} fmt ${path("resume.html")}`.quiet();
await Bun.write(path("resume.docx"), await renderDocx(resume, template.ats));
await renderBrowserOutputs();
