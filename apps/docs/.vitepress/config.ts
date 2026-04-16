import { defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };

// Escape angle-bracket patterns in typedoc-generated markdown that Vue's
// SFC parser would otherwise choke on (e.g. generic types like `Node<T>`
// or placeholder tokens like `<cursor>` that appear in LSP comments).
// Only escapes patterns inside prose lines, not inside fenced code blocks.
const escapeAngleBracketsInMd = {
  name: 'escape-angle-brackets-in-md',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('.md')) return null;
    const lines = code.split('\n');
    let inFence = false;
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      // Escape `<T>`, `<Foo>`, `<2tabs>`, `<cursor>` — but not `</...>`, `<!--`, or `<a href...>`.
      const replaced = line.replace(/<([A-Z][A-Za-z0-9_]*|\d[A-Za-z0-9_]*|cursor)>/g, '&lt;$1&gt;');
      if (replaced !== line) {
        lines[i] = replaced;
        changed = true;
      }
    }
    return changed ? lines.join('\n') : null;
  }
};

export default defineConfig({
  vite: {
    plugins: [escapeAngleBracketsInMd]
  },
  title: 'Rune Studio',
  description: 'Langium-based DSL toolchain for the Rune DSL — CDM & DRR in the browser',
  base: '/rune-langium/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,
  head: [
    ['meta', { property: 'og:title', content: 'Rune Studio' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Langium-based DSL toolchain for the Rune DSL — CDM & DRR in the browser'
      }
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://pradeepmouli.github.io/rune-langium/' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'Rune Studio' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: 'Langium-based DSL toolchain for the Rune DSL — CDM & DRR in the browser'
      }
    ]
  ],
  sitemap: {
    hostname: 'https://pradeepmouli.github.io/rune-langium'
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'GitHub', link: 'https://github.com/pradeepmouli/rune-langium' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Usage', link: '/guide/usage' }
          ]
        }
      ],
      '/api/': [{ text: 'Packages', items: typedocSidebar }]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/pradeepmouli/rune-langium' }],
    footer: {
      message: 'Core packages released under MIT. Studio app released under FSL-1.1-ALv2.',
      copyright: 'Copyright © 2026 Pradeep Mouli'
    },
    search: { provider: 'local' }
  }
});
