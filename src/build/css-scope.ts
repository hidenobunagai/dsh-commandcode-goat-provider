/**
 * Class-name scoping for the inlined CSS modules.
 *
 * The `inline-css-module` tsdown plugin rewrites every class selector in a
 * stylesheet to a per-plugin name, because all sheets are inlined into one
 * `<style>` tag. The rewrite lives in its own module for one reason: a scoper
 * that quietly misses a selector fails in the worst possible way. The CSS stays
 * valid, the build stays green, and only the styled element goes unstyled -- so
 * the bug surfaces as a rendering defect somewhere far away, with nothing in
 * the toolchain pointing at the build.
 *
 * That is exactly what happened with the badge's bar fills. The old pattern
 * only rewrote a class when the character before its dot was start-of-input,
 * `,`, `{` or whitespace, so the *second* class of a compound selector was left
 * behind: `.rowFill.toneUsed` compiled to `.cmd-rowFill.toneUsed`, which cannot
 * match an element whose class list is `cmd-rowFill cmd-toneUsed`. Every bar
 * lost its fill and rendered as a bare track. Descendant selectors written
 * without spaces (`.a>.b`) and functional pseudo-classes (`.a:not(.b)`) were
 * missed for the same reason.
 *
 * A class is now rewritten wherever a `.` is followed by an identifier, except
 * when the dot is escaped or falls inside a comment, a string, or a `url()`.
 * Numeric fragments need no special case: an identifier cannot start with a
 * digit, so `1.5fr`, `rgba(0, 0, 0, .1)` and `0.16s` are never touched. The
 * ignored regions are tracked as offsets rather than by rewriting the text
 * first, so masking can never corrupt the stylesheet it is scanning.
 */

/** A single class selector found in a stylesheet. */
export interface ClassSelector {
  /** Offset of the leading `.`. */
  start: number
  /** Offset one past the class name. */
  end: number
  /** The class name without its leading `.`. */
  name: string
}

/** Matches `.name`; an identifier never starts with a digit, which keeps
 *  decimals (`1.5fr`, `.25em`) out of the results. */
const CLASS_SELECTOR = /\.([a-zA-Z_][\w-]*)/g

/**
 * Mark every offset that belongs to text a selector can never appear in: CSS
 * comments, quoted strings, and `url()` bodies.
 * @param css - raw stylesheet text.
 * @returns a lookup of length `css.length`, true where the offset is ignored.
 */
const ignoredOffsets = (css: string): Uint8Array => {
  const ignored = new Uint8Array(css.length)
  const mark = (from: number, to: number): void => {
    for (let i = Math.max(0, from); i < Math.min(to, css.length); i += 1) ignored[i] = 1
  }
  /** Offset just past the quoted string starting at `from`. */
  const stringEnd = (from: number): number => {
    const quote = css[from]
    let i = from + 1
    while (i < css.length) {
      if (css[i] === '\\') {
        i += 2
        continue
      }
      if (css[i] === quote) return i + 1
      i += 1
    }
    return css.length
  }

  let i = 0
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const close = css.indexOf('*/', i + 2)
      const end = close === -1 ? css.length : close + 2
      mark(i, end)
      i = end
      continue
    }
    const char = css[i]
    if (char === '"' || char === "'") {
      const end = stringEnd(i)
      mark(i, end)
      i = end
      continue
    }
    if (/^url\(/i.test(css.slice(i, i + 4))) {
      let j = i + 4
      let depth = 0
      while (j < css.length) {
        const inner = css[j]
        if (inner === '"' || inner === "'") {
          j = stringEnd(j)
          continue
        }
        if (inner === '(') depth += 1
        else if (inner === ')') {
          if (depth === 0) break
          depth -= 1
        }
        j += 1
      }
      mark(i + 4, j)
      i = j
      continue
    }
    i += 1
  }
  return ignored
}

/**
 * Collect every class selector in a stylesheet, skipping comments, strings and
 * `url()` bodies so a fragment such as `icons/row.png` is never scoped.
 * @param css - raw stylesheet text.
 * @returns the selectors in source order.
 */
export const findClassSelectors = (css: string): ClassSelector[] => {
  const ignored = ignoredOffsets(css)
  const found: ClassSelector[] = []
  for (const match of css.matchAll(CLASS_SELECTOR)) {
    const start = match.index
    if (ignored[start]) continue
    if (start > 0 && css[start - 1] === '\\') continue
    found.push({ start, end: start + match[0].length, name: match[1]! })
  }
  return found
}

/**
 * Rewrite every class selector to its scoped name.
 * @param css - raw stylesheet text.
 * @param prefix - scoping prefix, e.g. `cmd` producing `cmd-row`.
 * @returns the rewritten stylesheet plus its unscoped-to-scoped name map.
 */
export const scopeCssClasses = (
  css: string,
  prefix: string,
): { css: string; classMap: Record<string, string> } => {
  const classMap: Record<string, string> = {}
  const selectors = findClassSelectors(css)
  let out = css
  // Replace from the end so earlier offsets stay valid.
  for (let i = selectors.length - 1; i >= 0; i -= 1) {
    const selector = selectors[i]!
    const scopedName = `${prefix}-${selector.name}`
    classMap[selector.name] = scopedName
    out = out.slice(0, selector.start) + `.${scopedName}` + out.slice(selector.end)
  }
  return { css: out, classMap }
}
