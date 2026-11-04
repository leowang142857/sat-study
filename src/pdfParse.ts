import type { Letter, Section } from './types'

/*
 * Turns text lines pulled from a PDF into practice-set questions.
 *
 * What it understands:
 * - Questions numbered "1.", "1)", "Question 1", "Q1", or a bare "1" on its own line, counting up
 *   (a restart at 1 after a header or a finished question starts a new module).
 * - Choices "A)", "A.", "(A)", "A:", or a lone "A" line, one per line or all on one line, in A→D order.
 * - Answers as "Answer: B" / "Correct answer: 3/4" / "答案：B" inside a question, or an answer-key
 *   section ("Answer Key", "Answers", "答案") with "1. B 2. C …" pairs or College Board
 *   "Question 1 … Choice B is the best answer" explanations. Questions without an answer are skipped
 *   by the importer.
 * - Headers like "Reading and Writing", "Math", "Module 2" set the section and source label.
 *
 * Known limits: two-column pages come out interleaved line by line; underlines, tables, charts and
 * math typeset as images are lost; the passage/question split is a guess (last paragraph, or last
 * sentence ending in "?").
 *
 * Kept free of runtime imports so it can be exercised directly with Node.
 */

const LETTERS: Letter[] = ['A', 'B', 'C', 'D']

export interface PdfQuestion {
  number: number
  section: Section
  source: string
  passage: string
  question: string
  choices: Record<Letter, string> | null
  correct: string
  explanation: string
}

export interface ParsedPdf {
  /** Best-guess set title from text before the first question; '' when nothing looks like one. */
  title: string
  questions: PdfQuestion[]
}

const ANSWER = String.raw`([A-D]|-?\d+(?:[./]\d+)?)`
const NOISE = /^(?:mark\s*for\s*review|continue|stop|go on to the next page\.?|unauthorized copying.*|no test material on this page\.?|page\s*\d+(?:\s*of\s*\d+)?)$/i
const KEY_HEADING = /^(?:answer\s*key|answers|answer\s*explanations?|answer\s*sheet|答案|参考答案|答案解析)\s*[:：]?\s*(.*)$/i
const Q_LABELED = /^(?:question|q)\s*(\d{1,3})\b\s*[.):：]?\s*(.*)$/i
const Q_NUMBERED = /^(\d{1,3})\s*[.)]\s+(.*)$/
const Q_BARE = /^(\d{1,3})\.?$/
const CHOICE_STRICT = /^\(?([A-D])(?:\s*[.):：]\s*(.*)|\s*$)/
const CHOICE_BARE = /^([A-D])\s+(.+)$/
const ANSWER_LINE = new RegExp(String.raw`^(?:correct\s*answer|answer|ans\.?|key|答案|正确答案)\s*[:：.\-]?\s*(?:choice\s*)?\(?${ANSWER}\)?(?=$|[\s.;,])(.*)$`, 'i')
const ANSWER_TAIL = new RegExp(String.raw`\s(?:correct\s*answer|answer|答案)\s*[:：]\s*\(?${ANSWER}\)?\s*$`, 'i')
const EXPLANATION = /^(?:explanation|rationale|solution|解析)\s*[:：]?\s*(.*)$/i
const KEY_PAIR = new RegExp(String.raw`(?:^|[\s,;])(\d{1,3})\s*[.):\-–]?\s*\(?${ANSWER}\)?(?=$|[\s,;])`, 'g')
const KEY_QUESTION = /^question\s*(\d{1,3})\b/i
const KEY_CHOICE = /choice\s*\(?([A-D])\)?\s*is\s*(?:the\s*)?(?:best|correct)/i
const KEY_CORRECT = new RegExp(String.raw`correct\s*answer\s*is\s*\(?(?:choice\s*)?${ANSWER}\)?`, 'i')
const BULLET = /^[•●▪◦‣]\s*/
const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e|U\.S|No|Fig)\.$/

interface Header {
  section?: Section
  module?: string
}

/** A short line that is only a section/module title, e.g. "Section 1: Reading and Writing — Module 2". */
function parseHeader(line: string): Header | null {
  if (line.length > 60) return null
  let rest = line
  let section: Section | undefined
  const rw = /\b(?:reading\s*(?:and|&)\s*writing|writing\s*and\s*language)\b/i
  const math = /\bmath(?:ematics)?\b/i
  if (rw.test(rest)) {
    section = 'RW'
    rest = rest.replace(rw, ' ')
  } else if (math.test(rest)) {
    section = 'Math'
    rest = rest.replace(math, ' ')
  }
  const mod = rest.match(/\bmodule\s*(\d)\b/i)
  if (mod) rest = rest.replace(mod[0], ' ')
  if (!section && !mod) return null
  rest = rest
    .replace(/\b(?:section|part|test|no calculator|calculator|\d+\s*(?:questions?|minutes?|min))\b/gi, ' ')
    .replace(/[\d\s:\-–—,|·()/.]+/g, ' ')
    .trim()
  if (rest) return null
  return { section, module: mod ? `Module ${mod[1]}` : undefined }
}

function questionStart(line: string): { n: number; text: string; bare: boolean } | null {
  const m = line.match(Q_LABELED) ?? line.match(Q_NUMBERED)
  if (m) return { n: Number(m[1]), text: m[2].trim(), bare: !m[2].trim() }
  const b = line.match(Q_BARE)
  return b ? { n: Number(b[1]), text: '', bare: true } : null
}

/** Drop running headers/footers and page numbers so they don't land inside questions. */
function cleanPages(pages: string[][]): string[][] {
  const trimmed = pages.map((p) => p.map((l) => l.replace(/\s+/g, ' ').trim()))
  const repeated = new Set<string>()
  if (trimmed.length >= 3) {
    const counts = new Map<string, number>()
    for (const p of trimmed) for (const l of new Set(p)) if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
    const min = Math.max(3, Math.ceil(trimmed.length * 0.5))
    for (const [l, c] of counts) if (c >= min && !parseHeader(l) && !questionStart(l)) repeated.add(l)
  }
  return trimmed.map((p) => {
    const out = p.filter((l) => !l || (!NOISE.test(l) && !repeated.has(l)))
    let last = out.length - 1
    while (last >= 0 && !out[last]) last--
    if (last >= 0 && /^\d{1,3}$/.test(out[last])) out.splice(last, 1)
    return out
  })
}

function normalize(s: string): string {
  return s
    .replace(/_{3,}/g, '______')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

/** Lines → paragraphs. Blank lines split paragraphs; bullet lines stay on their own line as "• …". */
function paragraphs(lines: string[]): string[] {
  const out: string[] = []
  let cur = ''
  const flush = () => {
    if (cur.trim()) out.push(normalize(cur))
    cur = ''
  }
  for (const line of lines) {
    if (!line) {
      flush()
      continue
    }
    if (BULLET.test(line)) {
      cur = cur.trimEnd() + (cur ? '\n' : '') + '• ' + line.replace(BULLET, '')
      continue
    }
    const glue = !cur || /[-/]$/.test(cur) || cur.endsWith('\n') ? '' : ' '
    cur += glue + line
  }
  flush()
  return out
}

function lastSentenceStart(text: string): number {
  let cut = -1
  for (const m of text.matchAll(/[.!?]["”’)]?\s+(?=["“(]?[A-Z])/g)) {
    const end = m.index + m[0].length
    if (end >= text.length - 1) continue
    if (m[0].startsWith('.') && ABBREV.test(text.slice(Math.max(0, m.index - 6), m.index + 1))) continue
    cut = end
  }
  return cut
}

function splitPrompt(lines: string[]): { passage: string; question: string } {
  const ps = paragraphs(lines)
  if (!ps.length) return { passage: '', question: '' }
  const last = ps[ps.length - 1]
  const head = ps.slice(0, -1)
  if (head.length && last.length <= 300) return { passage: head.join('\n\n'), question: last }
  if (/\?["”)]?$/.test(last)) {
    const cut = lastSentenceStart(last)
    if (cut > 0) return { passage: [...head, last.slice(0, cut).trim()].join('\n\n'), question: last.slice(cut).trim() }
  }
  if (head.length) return { passage: head.join('\n\n'), question: last }
  return { passage: '', question: last }
}

function tryChoices(lines: string[], from: number, re: RegExp): Record<Letter, string> | null {
  const choices: Record<Letter, string> = { A: '', B: '', C: '', D: '' }
  let expect = 0
  let cur = -1
  for (let i = from; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const m = line.match(re)
    if (expect < 4 && m && m[1] === LETTERS[expect]) {
      cur = expect++
      let text = (m[2] ?? '').trim()
      while (expect < 4) {
        const inline = text.match(new RegExp(String.raw`^(.*?)\s+\(?${LETTERS[expect]}\s*[.)]\s+(.*)$`))
        if (!inline) break
        choices[LETTERS[cur]] = inline[1].trim()
        text = inline[2].trim()
        cur = expect++
      }
      choices[LETTERS[cur]] = text
      continue
    }
    if (cur < 0) return null
    choices[LETTERS[cur]] = (choices[LETTERS[cur]] + ' ' + line).trim()
  }
  if (expect < 4) return null
  for (const l of LETTERS) choices[l] = normalize(choices[l])
  return choices
}

/** Choices sit at the end of a question; take the last "A" marker that is followed by B, C, D in order. */
function splitChoices(lines: string[]): { prompt: string[]; choices: Record<Letter, string> | null } {
  for (const re of [CHOICE_STRICT, CHOICE_BARE]) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].match(re)?.[1] !== 'A') continue
      const choices = tryChoices(lines, i, re)
      if (choices) return { prompt: lines.slice(0, i), choices }
    }
  }
  return { prompt: lines, choices: null }
}

const RW_CUES = /\b(?:which choice|the text|the passage|the author|the student|the notes|standard english|most logical|text\s*[12])\b/i
const MATH_CUES = /\b(?:value of|equation|function|graph|solution|slope|triangle|circle|radius|perimeter|area|probability|percent|mean|median|xy-plane)\b|[=<>≤≥√π^]|\b\d+\s*[x-z]\b/i

function guessSection(q: { passage: string; question: string; choices: Record<Letter, string> | null }): Section {
  const text = `${q.passage}\n${q.question}`
  if (RW_CUES.test(text)) return 'RW'
  if (!q.choices) return 'Math'
  if (MATH_CUES.test(text)) return 'Math'
  const numeric = LETTERS.filter((l) => /^[-−$\d.,/%\s()πx-z^√+*]+$/i.test(q.choices![l])).length
  return numeric >= 3 ? 'Math' : 'RW'
}

interface Block {
  n: number
  lines: string[]
  section?: Section
  module?: string
  choiceStep: number
  done: boolean
}

function finalize(b: Block, headerSections: boolean): PdfQuestion | null {
  let lines = [...b.lines]
  while (lines.length && !lines[0]) lines.shift()
  let explanation = ''
  const ei = lines.findIndex((l) => EXPLANATION.test(l))
  if (ei >= 0) {
    explanation = paragraphs([lines[ei].replace(EXPLANATION, '$1'), ...lines.slice(ei + 1)]).join('\n\n')
    lines = lines.slice(0, ei)
  }
  let correct = ''
  lines = lines.flatMap((l) => {
    const m = l.match(ANSWER_LINE)
    if (m && (l.length <= 40 || /[:：]/.test(l))) {
      correct ||= m[1]
      if (!explanation && m[2].trim()) explanation = m[2].replace(/^[\s.;,]+/, '').trim()
      return []
    }
    const tail = l.match(ANSWER_TAIL)
    if (tail) {
      correct ||= tail[1]
      const rest = l.slice(0, tail.index).trimEnd()
      return rest ? [rest] : []
    }
    return [l]
  })
  const { prompt, choices } = splitChoices(lines)
  const { passage, question } = splitPrompt(prompt)
  if (!passage && !question) return null
  const section = b.section ?? guessSection({ passage, question, choices })
  const sectionLabel = headerSections && b.section ? (b.section === 'RW' ? 'RW' : 'Math') : ''
  const source = [sectionLabel, b.module, `Q${b.n}`].filter(Boolean).join(' · ')
  return { number: b.n, section, source, passage, question, choices, correct: /^[a-d]$/i.test(correct) ? correct.toUpperCase() : correct, explanation }
}

function guessTitle(lines: string[]): string {
  for (const l of lines) {
    if (!l || parseHeader(l) || l.length > 80 || !/[A-Za-z\u4e00-\u9fff]/.test(l)) continue
    if (/^(?:directions|name|date|time|instructions?)\b/i.test(l) || /[.:：]$/.test(l)) continue
    return l
  }
  return ''
}

export function parsePdfLines(pages: string[][]): ParsedPdf {
  const lines = cleanPages(pages).flatMap((p) => [...p, ''])
  const blocks: Block[] = []
  const pre: string[] = []
  let ctx: Header = {}
  let headerSinceLast = false
  let headerSections = false
  let inKey = false
  const keyPairs: { n: number; answer: string; module?: string }[] = []
  let keyModule: string | undefined
  let keyQuestion: number | null = null
  let keyExplains = false

  const cur = () => blocks[blocks.length - 1]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      if (!inKey && cur()) cur().lines.push('')
      continue
    }

    const header = parseHeader(line)
    if (inKey) {
      if (header) {
        const next = lines.slice(i + 1).find(Boolean) ?? ''
        const qs = questionStart(next)
        if (qs && qs.text.length >= 25 && !/^(?:choice|answer|correct)/i.test(qs.text)) {
          inKey = false
        } else {
          keyModule = header.module ?? keyModule
          continue
        }
      } else {
        const kq = line.match(KEY_QUESTION)
        if (kq) {
          keyQuestion = Number(kq[1])
          keyExplains = true
        }
        if (keyExplains) {
          const a = line.match(KEY_CHOICE) ?? line.match(KEY_CORRECT)
          if (a && keyQuestion !== null && !keyPairs.some((p) => p.n === keyQuestion && p.module === keyModule)) {
            keyPairs.push({ n: keyQuestion, answer: a[1], module: keyModule })
          }
          continue
        }
        const pairs = [...line.matchAll(KEY_PAIR)]
        const leftover = line.replace(KEY_PAIR, ' ').replace(/[^A-Za-z]/g, '')
        if (pairs.length && leftover.length < 5) {
          for (const p of pairs) keyPairs.push({ n: Number(p[1]), answer: p[2], module: keyModule })
        }
        continue
      }
    }

    if (header) {
      if (header.section) {
        ctx = { section: header.section, module: header.module }
        headerSections = true
      } else ctx = { ...ctx, module: header.module }
      headerSinceLast = true
      continue
    }

    const key = line.match(KEY_HEADING)
    if (key && line.length <= 40) {
      inKey = true
      keyModule = undefined
      if (key[1]) {
        for (const p of key[1].matchAll(KEY_PAIR)) keyPairs.push({ n: Number(p[1]), answer: p[2], module: keyModule })
      }
      continue
    }

    const qs = questionStart(line)
    const last = cur()
    if (qs) {
      const midChoices = last && last.choiceStep > 0 && last.choiceStep < 4
      const ok =
        !last ||
        (qs.n === last.n + 1 && !(qs.bare && midChoices)) ||
        (qs.n === 1 && (headerSinceLast || last.done || last.choiceStep === 4))
      if (ok) {
        blocks.push({ n: qs.n, lines: qs.text ? [qs.text] : [], section: ctx.section, module: ctx.module, choiceStep: 0, done: false })
        headerSinceLast = false
        continue
      }
    }

    if (!last) {
      pre.push(line)
      continue
    }
    const step = LETTERS[last.choiceStep]
    if (step && (line.match(CHOICE_STRICT)?.[1] === step || line.match(CHOICE_BARE)?.[1] === step)) {
      last.choiceStep++
      for (let s = last.choiceStep; s < 4; s++) {
        if (new RegExp(String.raw`\s\(?${LETTERS[s]}\s*[.)]\s`).test(line)) last.choiceStep = s + 1
      }
    }
    if (ANSWER_LINE.test(line) || ANSWER_TAIL.test(line)) last.done = true
    last.lines.push(line)
  }

  const questions = blocks.map((b) => finalize(b, headerSections)).filter((q): q is PdfQuestion => q !== null)
  for (const p of keyPairs) {
    const target =
      questions.find((q) => !q.correct && q.number === p.n && p.module && q.source.includes(p.module)) ??
      questions.find((q) => !q.correct && q.number === p.n)
    if (target) target.correct = p.answer.toUpperCase()
  }
  return { title: guessTitle(pre), questions }
}

/** Shape accepted by `buildPracticeItems`. */
export function pdfToPracticeJson(parsed: ParsedPdf, name: string) {
  return {
    name,
    questions: parsed.questions.map((q) => ({
      section: q.section,
      source: q.source,
      passage: q.passage,
      question: q.question,
      choices: q.choices ?? undefined,
      correct: q.correct,
      explanation: q.explanation,
    })),
  }
}
