import { uid } from './db'
import type { Mistake } from './types'

/** Older records omit `kind` and are misses. Only an explicit practice tag leaves the 错题本. */
export function isPracticeItem(m: { kind?: Mistake['kind'] }): boolean {
  return m.kind === 'practice'
}

export function sourceRoot(s: string): string {
  return s.replace(/\s*·\s*Q\d+$/, '').trim()
}

/** Grouping label for one practice-set item. */
export function practiceSetName(m: Pick<Mistake, 'setName' | 'source'>): string {
  const name = m.setName?.trim()
  if (name) return name
  return sourceRoot(m.source) || '未命名题集'
}

export function sameQuestion(
  a: Pick<Mistake, 'section' | 'passage' | 'question' | 'correct'>,
  b: Pick<Mistake, 'section' | 'passage' | 'question' | 'correct'>,
): boolean {
  return a.section === b.section && a.passage.trim() === b.passage.trim() && a.question.trim() === b.question.trim() && a.correct.trim() === b.correct.trim()
}

/** A 错题 copy of a practice item. The practice item itself is left unchanged. */
export function asWrongCopy(m: Mistake, answer: string): Mistake {
  const now = Date.now()
  const set = m.setName?.trim() ?? ''
  const src = m.source.trim()
  const source = set && src && !src.startsWith(set) ? `${set} · ${src}` : src || set
  return {
    ...m,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    kind: 'wrong',
    setName: undefined,
    source,
    myAnswer: answer,
    mastered: false,
    reviews: [],
  }
}
