export type Section = 'RW' | 'Math'
export type Letter = 'A' | 'B' | 'C' | 'D'
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D']

export interface ReviewRecord {
  at: number
  correct: boolean
  answer: string
}

export interface Mistake {
  id: string
  createdAt: number
  updatedAt: number
  section: Section
  source: string
  questionType: string
  /** 'mc' = four choices, 'spr' = student-produced response (math fill-in) */
  format: 'mc' | 'spr'
  passage: string
  question: string
  choices: Record<Letter, string>
  correct: string
  myAnswer: string
  explanation: string
  /** Original screenshots: reference only, never shown during practice (they reveal the chosen answer). */
  images: string[]
  /** Charts/tables cropped out of a screenshot; shown with the passage during practice. */
  figures: string[]
  tags: string[]
  mastered: boolean
  reviews: ReviewRecord[]
}

export interface SrsState {
  /** days until next review */
  interval: number
  ease: number
  reps: number
  due: number
}

export interface Word {
  id: string
  createdAt: number
  word: string
  partOfSpeech: string
  definition: string
  chinese: string
  example: string
  notes: string
  source: string
  srs: SrsState
  lapses: number
}

export type Rating = 'again' | 'hard' | 'good' | 'easy'
