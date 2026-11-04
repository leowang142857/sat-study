import type { Section } from './types'

export const QUESTION_TYPES = {
  RW: [
    'words-in-context',
    'text-structure',
    'cross-text',
    'central-ideas',
    'evidence-textual',
    'evidence-quant',
    'inferences',
    'boundaries',
    'form-structure',
    'transitions',
    'rhetorical-synthesis',
  ],
  Math: ['algebra', 'advanced-math', 'psda', 'geometry'],
} as const satisfies Record<Section, readonly string[]>

export type QuestionTypeId = (typeof QUESTION_TYPES)[Section][number]

export const SECTION_LABEL: Record<Section, string> = {
  RW: 'Reading and Writing',
  Math: 'Math',
}
