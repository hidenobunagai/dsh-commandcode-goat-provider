import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findClassSelectors, scopeCssClasses } from '../src/build/css-scope.ts'

// A scoper that misses a selector is invisible: the CSS stays valid, the build
// stays green, and only the element goes unstyled. The badge's bar fills were
// lost that way -- `.rowFill.toneUsed` scoped only its first class, so the rule
// could not match `cmd-rowFill cmd-toneUsed` and every bar painted as an empty
// track. These cases pin the shapes that broke.
describe('scopeCssClasses', () => {
  it('scopes the second class of a compound selector', () => {
    const { css, classMap } = scopeCssClasses('.rowFill.toneUsed { background: red; }', 'cmd')
    expect(css).toBe('.cmd-rowFill.cmd-toneUsed { background: red; }')
    expect(classMap).toEqual({ rowFill: 'cmd-rowFill', toneUsed: 'cmd-toneUsed' })
  })

  it('scopes classes after a combinator and inside a functional pseudo-class', () => {
    const { css } = scopeCssClasses('.a>.b{color:red}.c:not(.d){color:blue}', 'cmd')
    expect(css).toBe('.cmd-a>.cmd-b{color:red}.cmd-c:not(.cmd-d){color:blue}')
  })

  it('scopes every class in a selector list', () => {
    const { css } = scopeCssClasses('.a,\n.b { color: red }', 'cmd')
    expect(css).toBe('.cmd-a,\n.cmd-b { color: red }')
  })

  it('scopes a class inside a nested at-rule', () => {
    const { css } = scopeCssClasses('@media (max-width: 900px) {\n  .rowReset { display: none; }\n}', 'cmd')
    expect(css).toBe('@media (max-width: 900px) {\n  .cmd-rowReset { display: none; }\n}')
  })

  it('leaves decimal values, percentages and custom properties alone', () => {
    const source = '.a { transition: background 0.16s; flex: 1.5; width: 0.5em; --x: .25; opacity: .1; }'
    const { css } = scopeCssClasses(source, 'cmd')
    expect(css).toBe('.cmd-a { transition: background 0.16s; flex: 1.5; width: 0.5em; --x: .25; opacity: .1; }')
  })

  it('does not scope a dot inside a string, comment or url()', () => {
    const source = [
      '.a { --icon: url(icons/row.png); }',
      ".b::after { content: 'row.fill'; }",
      '/* .legacy.fill { color: red } */',
      '.c { color: red; }',
    ].join('\n')
    const { css, classMap } = scopeCssClasses(source, 'cmd')
    expect(css).toContain('url(icons/row.png)')
    expect(css).toContain("content: 'row.fill'")
    expect(css).toContain('/* .legacy.fill { color: red } */')
    expect(css).toContain('.cmd-c {')
    expect(Object.keys(classMap).sort()).toEqual(['a', 'b', 'c'])
  })

  it('does not treat an escaped dot as a class boundary', () => {
    // `.hover\.bg` is a single class named `hover.bg`; only the leading dot
    // starts a selector, so the escaped one must survive untouched.
    const { css, classMap } = scopeCssClasses('.hover\\.bg { color: red }', 'cmd')
    expect(css).toBe('.cmd-hover\\.bg { color: red }')
    expect(classMap).toEqual({ hover: 'cmd-hover' })
  })

  it('reports every selector it found', () => {
    const found = findClassSelectors('.a.b > .c { color: red }')
    expect(found.map((s) => s.name)).toEqual(['a', 'b', 'c'])
  })

  it('leaves no unscoped class behind in the plugin stylesheets', () => {
    // Guards the real sheets rather than a fixture: a future compound or
    // combinator selector must come out fully scoped, or its rule silently
    // stops matching by class name at runtime. `findClassSelectors` is
    // comment/string/url-aware, so a name merely mentioned in a comment (the
    // card sheet documents "inside .body, ...") is not mistaken for a selector.
    const dir = new URL('../src/client/', import.meta.url)
    const sheets = readdirSync(dir).filter((name) => name.endsWith('.module.css'))
    expect(sheets.length).toBeGreaterThan(0)

    for (const name of sheets) {
      const source = readFileSync(new URL(name, dir), 'utf8')
      const { css, classMap } = scopeCssClasses(source, 'cmd')
      const remaining = findClassSelectors(css).filter((s) => !s.name.startsWith('cmd-'))
      expect(remaining, `${name} has unscoped class selectors`).toEqual([])
      // The map is what the components import, so every scoped class the sheet
      // defines must be reachable from it.
      expect(Object.keys(classMap).length).toBeGreaterThan(0)
      expect(Object.values(classMap).every((v) => v.startsWith('cmd-'))).toBe(true)
    }
  })
})
