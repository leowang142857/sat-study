import type { Mistake } from './types'

export function isCorrect(m: Mistake, answer: string): boolean {
  if (!answer) return false
  if (m.format === 'mc') return answer.toUpperCase() === m.correct.toUpperCase()
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase()
  const num = (s: string) => {
    const t = norm(s)
    if (/^-?\d+\/\d+$/.test(t)) {
      const [a, b] = t.split('/').map(Number)
      return b ? a / b : NaN
    }
    return Number(t)
  }
  return m.correct
    .split(/[,，;；]|\bor\b/)
    .map((c) => c.trim())
    .filter(Boolean)
    .some((c) => norm(c) === norm(answer) || (!isNaN(num(c)) && Math.abs(num(c) - num(answer)) < 1e-3))
}
