import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'tsdown'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const cssModulePlugin = (): Plugin => ({
  name: 'inline-css-module',
  resolveId(source, importer) {
    if (source.endsWith('.module.css') && importer) {
      const realPath = new URL(source, `file://${importer}`).pathname
      return `${CSS_VIRTUAL_PREFIX}${realPath}${CSS_VIRTUAL_SUFFIX}`
    }
  },
  load(id) {
    if (id.startsWith(CSS_VIRTUAL_PREFIX) && id.endsWith(CSS_VIRTUAL_SUFFIX)) {
      const realPath = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const content = readFileSync(realPath, 'utf8')
      const classMap: Record<string, string> = {}
      // Only scope class selectors preceded by `.` at rule or selector boundaries,
      // not dots inside strings / urls / decimal values.
      const transformedCss = content.replace(/(^|[,{\s])\.([a-zA-Z_][a-zA-Z0-9_-]*)/gm, (_match, prefix, className) => {
        const scopedName = `cmd-${className}`
        classMap[className] = scopedName
        return `${prefix}.${scopedName}`
      })

      return `
const css = ${JSON.stringify(transformedCss)};
if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="commandcode-card"]')) {
  const tag = document.createElement('style');
  tag.dataset.plugin = "dsh-commandcode-goat-provider";
  tag.dataset.pluginCss = "commandcode-card";
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default ${JSON.stringify(classMap)};
`
    }
  },
})

export default defineConfig([
  // 1. Host side (Node.js ESM)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    outDir: 'lib',
    fixedExtension: false,
    dts: true,
    clean: true,
    sourcemap: true,
    deps: {
      neverBundle: [
        /^@deepseek-ai\//,
        /^@earendil-works\//,
        'eventsource-parser',
      ],
    },
  },
  // 2. Browser client side (DSH module loader CJS closure-factory format)
  {
    entry: { client: 'src/client/index.ts' },
    format: ['cjs'],
    target: 'es2022',
    outDir: 'lib',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    plugins: [cssModulePlugin()],
    deps: {
      neverBundle: [
        /^@deepseek-ai\//,
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-commandcode-goat-provider", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
