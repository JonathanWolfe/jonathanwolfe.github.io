const root = import.meta.dir;

await new Bun.Image(`${root}/square-headshot.png`).jpeg({ quality: 85, progressive: true }).write(`${root}/square-headshot.jpg`);
