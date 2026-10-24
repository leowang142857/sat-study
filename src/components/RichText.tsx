import { Fragment } from 'react'

/** Renders passage text: {{…}} becomes underlined, blank lines split paragraphs, "• " lines become a list. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/)
  return (
    <div className={className}>
      {paragraphs.map((p, i) => {
        const lines = p.split('\n')
        if (lines.some((l) => l.startsWith('• '))) {
          const intro = lines.filter((l) => !l.startsWith('• '))
          const items = lines.filter((l) => l.startsWith('• '))
          return (
            <Fragment key={i}>
              {intro.length > 0 && <p>{inline(intro.join(' '))}</p>}
              <ul>
                {items.map((l, j) => (
                  <li key={j}>{inline(l.slice(2))}</li>
                ))}
              </ul>
            </Fragment>
          )
        }
        return <p key={i}>{inline(lines.join(' '))}</p>
      })}
    </div>
  )
}

function inline(s: string) {
  return s.split(/(\{\{[\s\S]*?\}\})/g).map((part, i) =>
    part.startsWith('{{') && part.endsWith('}}') ? <u key={i}>{part.slice(2, -2)}</u> : <Fragment key={i}>{part}</Fragment>,
  )
}
