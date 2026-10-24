import type { Section } from './types'

export const QUESTION_TYPES: Record<Section, { id: string; label: string }[]> = {
  RW: [
    { id: 'words-in-context', label: '词汇题 Words in Context' },
    { id: 'text-structure', label: '结构/句子功能 Text Structure & Purpose' },
    { id: 'cross-text', label: '双篇 Cross-Text Connections' },
    { id: 'central-ideas', label: '主旨细节 Central Ideas & Details' },
    { id: 'evidence-textual', label: '文字证据 Command of Evidence (Textual)' },
    { id: 'evidence-quant', label: '图表证据 Command of Evidence (Quantitative)' },
    { id: 'inferences', label: '推断/补全 Inferences' },
    { id: 'boundaries', label: '标点 Boundaries' },
    { id: 'form-structure', label: '语法形式 Form, Structure & Sense' },
    { id: 'transitions', label: '逻辑连接 Transitions' },
    { id: 'rhetorical-synthesis', label: '笔记题 Rhetorical Synthesis' },
  ],
  Math: [
    { id: 'algebra', label: '代数 Algebra' },
    { id: 'advanced-math', label: '高级数学 Advanced Math' },
    { id: 'psda', label: '数据分析 Problem-Solving & Data Analysis' },
    { id: 'geometry', label: '几何三角 Geometry & Trigonometry' },
  ],
}

export function typeLabel(section: Section, id: string): string {
  return QUESTION_TYPES[section].find((t) => t.id === id)?.label ?? id ?? '未分类'
}

export const SECTION_LABEL: Record<Section, string> = {
  RW: 'Reading and Writing',
  Math: 'Math',
}
