import { uid } from './db'
import { practiceSetName, sourceRoot } from './questions'
import type { Letter, Mistake, Section } from './types'
import { LETTERS } from './types'

export interface PracticeImportSummary {
  items: Mistake[]
  added: number
  duplicate: number
  invalid: number
  name: string
  /** Words sitting in a full backup that this path deliberately does not write. */
  ignoredWords: number
}

const EMPTY_CHOICES: Record<Letter, string> = { A: '', B: '', C: '', D: '' }

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).map((s) => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  return []
}

function parseSection(v: unknown, fallback: Section): Section {
  if (typeof v !== 'string' || !v.trim()) return fallback
  const s = v.trim().toLowerCase()
  if (s === 'math' || s.includes('math') || s.includes('数学')) return 'Math'
  if (s === 'rw' || s.includes('read') || s.includes('writing') || s.includes('阅读') || s.includes('文法')) return 'RW'
  return fallback
}

function parseChoices(v: unknown): Record<Letter, string> {
  const choices = { ...EMPTY_CHOICES }
  if (Array.isArray(v)) {
    LETTERS.forEach((l, i) => {
      choices[l] = str(v[i]).trim()
    })
    return choices
  }
  const o = asRecord(v)
  if (!o) return choices
  for (const l of LETTERS) choices[l] = str(o[l] ?? o[l.toLowerCase()]).trim()
  return choices
}

function questionList(raw: unknown): { questions: unknown[]; meta: Record<string, unknown>; ignoredWords: number } {
  if (Array.isArray(raw)) return { questions: raw, meta: {}, ignoredWords: 0 }
  const o = asRecord(raw)
  if (!o) throw new Error('JSON 格式无法识别：需要题目数组，或 { name, questions }')
  const questions = Array.isArray(o.questions) ? o.questions : Array.isArray(o.items) ? o.items : Array.isArray(o.mistakes) ? o.mistakes : null
  if (!questions) throw new Error('找不到题目列表。题集 JSON 需要 questions（或 items）数组。')
  const ignoredWords = Array.isArray(o.words) ? o.words.length : 0
  return { questions, meta: o, ignoredWords }
}

function questionTypeOf(o: Record<string, unknown>): string {
  const direct = str(o.questionType).trim()
  if (direct) return direct
  const type = str(o.type).trim()
  if (!type || ['mc', 'spr', 'grid-in', 'choice', 'multiple-choice', 'student-produced'].includes(type.toLowerCase())) return ''
  return type
}

function explicitName(meta: Record<string, unknown>): string {
  return str(meta.name || meta.setName || meta.title).trim()
}

function fingerprint(m: Pick<Mistake, 'setName' | 'source' | 'passage' | 'question' | 'correct'>): string {
  return [m.setName ?? '', m.source.trim(), m.passage.trim(), m.question.trim(), m.correct.trim()].join('\u0001')
}

function toItem(raw: unknown, setName: string, fallbackSection: Section, now: number): Mistake | null {
  const o = asRecord(raw)
  if (!o) return null
  const passage = str(o.passage ?? o.stem ?? o.text).trim()
  const question = str(o.question ?? o.prompt).trim()
  let correct = str(o.correct ?? o.answer ?? o.correctAnswer ?? o.key).trim()
  if (!(passage || question) || !correct) return null

  const choices = parseChoices(o.choices ?? o.options)
  const hasChoice = LETTERS.some((l) => choices[l])
  const formatRaw = str(o.format).toLowerCase()
  const format: Mistake['format'] =
    formatRaw === 'spr' || formatRaw === 'grid-in' || formatRaw === 'student-produced'
      ? 'spr'
      : formatRaw === 'mc' || formatRaw === 'choice' || formatRaw === 'multiple-choice' || hasChoice || /^[A-D]$/i.test(correct)
        ? 'mc'
        : 'spr'
  if (format === 'mc' && /^[0-3]$/.test(correct)) correct = LETTERS[Number(correct)]
  if (format === 'mc' && /^[a-d]$/i.test(correct)) correct = correct.toUpperCase()

  const source = str(o.source ?? o.origin ?? o.label).trim()
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    section: parseSection(o.section, fallbackSection),
    source,
    questionType: questionTypeOf(o),
    format,
    passage,
    question,
    choices,
    correct,
    myAnswer: '',
    explanation: str(o.explanation ?? o.rationale ?? o.solution).trim(),
    images: [],
    figures: strList(o.figures).filter((s) => s.startsWith('data:image/') || s.startsWith('http')),
    tags: strList(o.tags),
    mastered: false,
    reviews: [],
    kind: 'practice',
    setName,
  }
}

/**
 * Turn a practice-set JSON (or a sat-study backup's question list) into new 题集 items.
 * Miss fields (my answer, reviews, mastered) are dropped so nothing lands in the 错题本.
 * Re-importing the same set skips questions that are already stored.
 */
export function buildPracticeItems(raw: unknown, existing: Mistake[]): PracticeImportSummary {
  const { questions, meta, ignoredWords } = questionList(raw)
  const fallbackSection = parseSection(meta.section, 'RW')
  const named = explicitName(meta)
  const drafts = questions.map((q) => {
    const o = asRecord(q)
    return { raw: q, source: o ? str(o.source ?? o.origin ?? o.label).trim() : '' }
  })
  const roots = [...new Set(drafts.map((d) => sourceRoot(d.source)).filter(Boolean))]
  const name = named || (roots.length === 1 ? roots[0] : '未命名题集')

  const seen = new Set(existing.filter((m) => m.kind === 'practice').map(fingerprint))
  const items: Mistake[] = []
  let duplicate = 0
  let invalid = 0
  const now = Date.now()
  for (const draft of drafts) {
    const item = toItem(draft.raw, name, fallbackSection, now)
    if (!item) {
      invalid++
      continue
    }
    const key = fingerprint(item)
    if (seen.has(key)) {
      duplicate++
      continue
    }
    seen.add(key)
    items.push(item)
  }
  return { items, added: items.length, duplicate, invalid, name: items[0] ? practiceSetName(items[0]) : name, ignoredWords }
}

export function formatPracticeImport(r: Pick<PracticeImportSummary, 'added' | 'duplicate' | 'invalid' | 'name' | 'ignoredWords'>): string {
  const parts = [`题集「${r.name}」新增 ${r.added} 题`]
  if (r.duplicate) parts.push(`跳过重复 ${r.duplicate} 题`)
  if (r.invalid) parts.push(`跳过无效 ${r.invalid} 题`)
  parts.push('这些题不会进入错题本')
  if (r.ignoredWords) parts.push(`未导入 ${r.ignoredWords} 个单词（单词请用「导入备份」）`)
  return parts.join('，')
}
