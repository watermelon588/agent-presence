import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// <!-- include:nav --> pulls in partials/nav.html, so every page shares one nav and footer.
// {{home}} is "" on the homepage (same-page anchors) and "./" elsewhere.
const partials = {
  name: 'html-partials',
  transformIndexHtml: {
    order: 'pre',
    handler: (html, ctx) => html
      .replace(/<!-- include:(\w+) -->/g, (_, name) => readFileSync(here(`./partials/${name}.html`), 'utf8'))
      .replaceAll('{{home}}', /(^|[\\/])index\.html$/.test(ctx.filename) ? '' : './'),
  },
  handleHotUpdate({ file, server }) {
    if (/[\\/]partials[\\/]/.test(file)) server.ws.send({ type: 'full-reload' });
  },
};

export default defineConfig({
  plugins: [partials, tailwindcss()],
  build: {
    assetsInlineLimit: 0, // keep every sticker a real file so "Download" saves it under its own name
    rollupOptions: { input: { main: here('./index.html'), stickers: here('./stickers.html'), docs: here('./docs.html') } },
  },
});
