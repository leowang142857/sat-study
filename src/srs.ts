import type { Rating, SrsState } from './types'

const DAY = 24 * 60 * 60 * 1000

export function newSrs(now = Date.now()): SrsState {
  return { interval: 0, ease: 2.5, reps: 0, due: now }
}

/** Simplified SM-2. "again" brings the card back in 10 minutes. */
export function review(s: SrsState, rating: Rating, now = Date.now()): SrsState {
  let { interval, ease, reps } = s
  if (rating === 'again') {
    return { interval: 0, ease: Math.max(1.3, ease - 0.2), reps: 0, due: now + 10 * 60 * 1000 }
  }
  if (rating === 'hard') ease = Math.max(1.3, ease - 0.15)
  if (rating === 'easy') ease += 0.15

  if (reps === 0) interval = rating === 'hard' ? 1 : rating === 'easy' ? 4 : 2
  else if (reps === 1) interval = rating === 'hard' ? 2 : rating === 'easy' ? 7 : 4
  else interval = Math.round(interval * (rating === 'hard' ? 1.2 : rating === 'easy' ? ease * 1.3 : ease))

  return { interval, ease, reps: reps + 1, due: startOfDay(now) + interval * DAY }
}

/** How soon this rating would bring the card back. The UI localizes the unit. */
export function previewInterval(s: SrsState, rating: Rating): { n: number; unit: 'min' | 'day' } {
  if (rating === 'again') return { n: 10, unit: 'min' }
  const next = review(s, rating)
  return { n: next.interval, unit: 'day' }
}

export function isDue(s: SrsState, now = Date.now()) {
  return s.due <= now
}

function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(4, 0, 0, 0)
  return d.getTime()
}
