/**
 * Minimal YAML frontmatter parser for engagement `status.md` files.
 *
 * Supports the subset of YAML actually used in the engagement template:
 * - key: value           → string
 * - key:                 → null (empty value)
 * - key:                 → string[] (when followed by indented `- item` lines)
 *     - item
 *     - item
 *
 * Does NOT support: nested objects, multi-line strings, anchors, flow sequences,
 * boolean/number coercion (everything is text). That's fine — the engagement
 * schema is flat strings + a single string[] array (`proposals`).
 *
 * Returns { frontmatter, body }. If the file has no `---` fences, frontmatter
 * is `{}` and body is the entire content.
 */

export type FrontmatterValue = string | null | string[]
export type Frontmatter = Record<string, FrontmatterValue>

export type ParsedStatus = {
  frontmatter: Frontmatter
  body: string
}

export function parseStatusMarkdown(source: string): ParsedStatus {
  const normalised = source.replace(/\r\n/g, '\n')
  const fenceRe = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
  const match = normalised.match(fenceRe)

  if (!match) {
    return { frontmatter: {}, body: normalised.trim() }
  }

  const [, yamlBlock, bodyRaw] = match
  const frontmatter = parseYamlBlock(yamlBlock)
  return { frontmatter, body: bodyRaw.trim() }
}

function parseYamlBlock(yaml: string): Frontmatter {
  const lines = yaml.split('\n')
  const out: Frontmatter = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    // Skip blank and comment-only lines
    if (!line.trim() || line.trim().startsWith('#')) {
      i++
      continue
    }

    // Match `key: value` or `key:`
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) {
      i++
      continue
    }

    const key = m[1]
    const rawValue = m[2].trim()

    // Strip inline comments (only when the # is preceded by a space, to avoid
    // chopping off URLs / hex colours / quoted content)
    const commentStripped = stripInlineComment(rawValue)

    if (commentStripped === '') {
      // Empty value — could be null OR the start of an array
      const arrayItems: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j]
        if (!next.trim()) {
          j++
          continue
        }
        const arrMatch = next.match(/^\s+-\s+(.*)$/)
        if (!arrMatch) break
        arrayItems.push(unquote(stripInlineComment(arrMatch[1].trim())))
        j++
      }
      if (arrayItems.length > 0) {
        out[key] = arrayItems
        i = j
        continue
      }
      out[key] = null
      i++
      continue
    }

    out[key] = unquote(commentStripped)
    i++
  }

  return out
}

function stripInlineComment(value: string): string {
  // Only strip ` #...` (space then hash) — leaves URLs, hex colours, etc. intact
  const idx = value.search(/\s#/)
  if (idx === -1) return value.trim()
  return value.slice(0, idx).trim()
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

// ---------- Helpers for typed access ----------

export function fmString(fm: Frontmatter, key: string): string | null {
  const v = fm[key]
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

export function fmStringArray(fm: Frontmatter, key: string): string[] | null {
  const v = fm[key]
  if (Array.isArray(v) && v.length > 0) return v
  return null
}

export function fmInt(fm: Frontmatter, key: string): number | null {
  const v = fm[key]
  if (typeof v !== 'string' || !v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export function fmDate(fm: Frontmatter, key: string): string | null {
  // Returns the raw string if it parses as a date; otherwise null.
  const v = fm[key]
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  return v
}
