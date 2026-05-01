/**
 * Minimal markdown renderer for engagement status bodies.
 *
 * Supports the subset actually used in `status.md` files:
 * - # / ## / ### headings
 * - Bullet lists (`- ` or `* `)
 * - Task checkboxes (`- [ ]` and `- [x]`)
 * - **bold**, *italic*, `code`
 * - [text](url) links (auto-rendered <a target="_blank">)
 * - Bare URLs (linkified)
 *
 * Deliberately not a full markdown engine — keeps the bundle small and
 * avoids adding a dependency to the Cloudflare Workers runtime.
 */

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: Array<{ text: string; checked: boolean | null }> }

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines
    if (!line.trim()) {
      i++
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: line.slice(4).trim() })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3).trim() })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: line.slice(2).trim() })
      i++
      continue
    }

    // Bullet lists (collect contiguous bullet lines)
    if (/^[-*] /.test(line)) {
      const items: Array<{ text: string; checked: boolean | null }> = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        const raw = lines[i].replace(/^[-*] /, '')
        const taskMatch = raw.match(/^\[( |x|X)\]\s+(.*)$/)
        if (taskMatch) {
          items.push({ text: taskMatch[2], checked: taskMatch[1].toLowerCase() === 'x' })
        } else {
          items.push({ text: raw, checked: null })
        }
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // Paragraph (collect contiguous non-blank, non-bullet, non-heading lines)
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[-*] /.test(lines[i]) &&
      !lines[i].startsWith('#')
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) blocks.push({ kind: 'p', text: paraLines.join(' ') })
  }

  return blocks
}

// Inline renderer — bold / italic / code / links
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Tokenize on inline patterns. Order matters: code first (so we don't parse inside it),
  // then explicit links, then bold, then italic.
  const tokens: Array<{ type: string; value: string; href?: string }> = []
  let remaining = text
  let safety = 0

  while (remaining.length && safety < 10000) {
    safety++
    // `code`
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push({ type: 'code', value: codeMatch[1] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }
    // [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      tokens.push({ type: 'link', value: linkMatch[1], href: linkMatch[2] })
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }
    // **bold**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      tokens.push({ type: 'bold', value: boldMatch[1] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }
    // *italic* (single)
    const italicMatch = remaining.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      tokens.push({ type: 'italic', value: italicMatch[1] })
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }
    // Bare URL
    const urlMatch = remaining.match(/^(https?:\/\/[^\s)]+)/)
    if (urlMatch) {
      tokens.push({ type: 'link', value: urlMatch[1], href: urlMatch[1] })
      remaining = remaining.slice(urlMatch[0].length)
      continue
    }
    // Plain char — accumulate into the previous text token if possible
    const last = tokens[tokens.length - 1]
    if (last && last.type === 'text') {
      last.value += remaining[0]
    } else {
      tokens.push({ type: 'text', value: remaining[0] })
    }
    remaining = remaining.slice(1)
  }

  tokens.forEach((tok, idx) => {
    const key = `${keyPrefix}-${idx}`
    switch (tok.type) {
      case 'text':
        nodes.push(<span key={key}>{tok.value}</span>)
        break
      case 'bold':
        nodes.push(<strong key={key} className="font-semibold text-[var(--color-text-primary)]">{tok.value}</strong>)
        break
      case 'italic':
        nodes.push(<em key={key}>{tok.value}</em>)
        break
      case 'code':
        nodes.push(
          <code
            key={key}
            className="px-1 py-0.5 text-[0.85em] rounded bg-[rgba(232,230,227,0.06)] text-[var(--color-text-primary)] font-mono"
          >
            {tok.value}
          </code>
        )
        break
      case 'link':
        nodes.push(
          <a
            key={key}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors underline-offset-2 hover:underline"
          >
            {tok.value}
          </a>
        )
        break
    }
  })

  return nodes
}

export function MarkdownRenderer({ source }: { source: string }) {
  const blocks = parseBlocks(source)

  return (
    <div className="space-y-4 text-[var(--color-text-secondary)] leading-relaxed">
      {blocks.map((block, idx) => {
        const key = `b-${idx}`
        switch (block.kind) {
          case 'h1':
            return (
              <h1 key={key} className="text-2xl font-semibold text-[var(--color-text-primary)] pt-2">
                {renderInline(block.text, key)}
              </h1>
            )
          case 'h2':
            return (
              <h2
                key={key}
                className="text-base font-semibold text-[var(--color-text-primary)] pt-4 pb-1 border-b border-[var(--color-border-subtle)]"
              >
                {renderInline(block.text, key)}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={key} className="text-sm font-semibold text-[var(--color-text-primary)] pt-2">
                {renderInline(block.text, key)}
              </h3>
            )
          case 'p':
            return (
              <p key={key} className="text-sm">
                {renderInline(block.text, key)}
              </p>
            )
          case 'ul':
            return (
              <ul key={key} className="space-y-1.5 text-sm">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex items-start gap-2">
                    {item.checked === null ? (
                      <span className="text-[#5B9A8B] flex-shrink-0 mt-0.5">•</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 mt-0.5 text-[10px] ${
                          item.checked
                            ? 'bg-[rgba(91,154,139,0.2)] border-[#5B9A8B] text-[#5B9A8B]'
                            : 'bg-transparent border-[var(--color-border)] text-transparent'
                        }`}
                      >
                        {item.checked ? '✓' : ''}
                      </span>
                    )}
                    <span
                      className={item.checked ? 'line-through text-[var(--color-text-muted)]' : ''}
                    >
                      {renderInline(item.text, `${key}-${j}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )
        }
      })}
    </div>
  )
}
