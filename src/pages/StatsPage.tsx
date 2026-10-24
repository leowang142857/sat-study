import { useState } from 'react'
import type { Section } from '../types'
import { QUESTION_TYPES } from '../constants'
import { useStore } from '../store'
import { isDue } from '../srs'

const DAY = 86400000

export function StatsPage() {
  const { mistakes, words } = useStore()
  const [section, setSection] = useState<Section>('RW')

  const inSection = mistakes.filter((m) => m.section === section)
  const allReviews = inSection.flatMap((m) => m.reviews)
  const redoRate = allReviews.length ? Math.round((allReviews.filter((r) => r.correct).length / allReviews.length) * 100) : null

  const byType = [...QUESTION_TYPES[section], { id: '', label: '未分类' }]
    .map((t) => {
      const ms = inSection.filter((m) => m.questionType === t.id)
      const rv = ms.flatMap((m) => m.reviews)
      return {
        ...t,
        total: ms.length,
        open: ms.filter((m) => !m.mastered).length,
        rate: rv.length ? Math.round((rv.filter((r) => r.correct).length / rv.length) * 100) : null,
      }
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.open - a.open || (a.rate ?? -1) - (b.rate ?? -1) || b.total - a.total)
  const maxType = Math.max(1, ...byType.map((t) => t.total))

  const bySource = Object.entries(
    inSection.reduce<Record<string, number>>((acc, m) => {
      const s = m.source.replace(/\s*·\s*Q\d+$/, '') || '未填来源'
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  const tags = Object.entries(
    inSection.flatMap((m) => m.tags).reduce<Record<string, number>>((acc, t) => ((acc[t] = (acc[t] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today.getTime() - (13 - i) * DAY
    const end = start + DAY
    return {
      label: `${new Date(start).getMonth() + 1}/${new Date(start).getDate()}`,
      added: mistakes.filter((m) => m.createdAt >= start && m.createdAt < end).length,
      redone: mistakes.flatMap((m) => m.reviews).filter((r) => r.at >= start && r.at < end).length,
    }
  })
  const maxDay = Math.max(1, ...days.map((d) => d.added + d.redone))

  const learned = words.filter((w) => w.srs.reps > 0)
  const mature = words.filter((w) => w.srs.interval >= 21)
  const dueToday = words.filter((w) => w.srs.reps > 0 && isDue(w.srs)).length
  const hardest = [...words].filter((w) => w.lapses > 0).sort((a, b) => b.lapses - a.lapses).slice(0, 8)
  const weakest = byType.find((t) => t.open > 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>统计</h1>
          <p className="sub">{weakest ? `目前最该练的题型：${weakest.label}（${weakest.open} 道未掌握）` : '还没有未掌握的错题'}</p>
        </div>
        <div className="seg">
          {(['RW', 'Math'] as Section[]).map((s) => (
            <button key={s} className={section === s ? 'on' : ''} onClick={() => setSection(s)}>
              {s === 'RW' ? '阅读文法' : '数学'}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-cards">
        <Stat label="错题总数" value={inSection.length} />
        <Stat label="未掌握" value={inSection.filter((m) => !m.mastered).length} tone="bad" />
        <Stat label="已掌握" value={inSection.filter((m) => m.mastered).length} tone="ok" />
        <Stat label="重做正确率" value={redoRate === null ? '—' : `${redoRate}%`} sub={`共重做 ${allReviews.length} 次`} />
      </div>

      <div className="stats-grid">
        <div className="card">
          <h3>按题型</h3>
          {byType.length === 0 && <div className="empty small">暂无数据</div>}
          {byType.map((t) => (
            <div key={t.id} className="bar-row">
              <span className="bar-label">{t.label}</span>
              <div className="bar-track">
                <div className="bar mastered" style={{ width: `${((t.total - t.open) / maxType) * 100}%` }} />
                <div className="bar open" style={{ width: `${(t.open / maxType) * 100}%` }} />
              </div>
              <span className="bar-num">
                {t.open}/{t.total}
                {t.rate !== null && <span className="muted"> · 重做 {t.rate}%</span>}
              </span>
            </div>
          ))}
          <div className="legend-row">
            <span className="dot open" /> 未掌握 <span className="dot mastered" /> 已掌握
          </div>
        </div>

        <div className="card">
          <h3>最近 14 天</h3>
          <div className="day-chart">
            {days.map((d) => (
              <div key={d.label} className="day-col" title={`${d.label}：录入 ${d.added}，重做 ${d.redone}`}>
                <div className="day-bars">
                  <div className="bar redone" style={{ height: `${(d.redone / maxDay) * 100}%` }} />
                  <div className="bar added" style={{ height: `${(d.added / maxDay) * 100}%` }} />
                </div>
                <span className="day-label">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="legend-row">
            <span className="dot added" /> 录入错题 <span className="dot redone" /> 重做题数
          </div>
        </div>

        <div className="card">
          <h3>按来源</h3>
          {bySource.map(([s, n]) => (
            <div key={s} className="kv">
              <span>{s}</span>
              <b>{n}</b>
            </div>
          ))}
          {tags.length > 0 && (
            <>
              <h3 className="mt">错因标签</h3>
              <div className="chips-select">
                {tags.map(([t, n]) => (
                  <span key={t} className="chip tag">
                    {t} × {n}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>单词</h3>
          <div className="kv">
            <span>单词总数</span>
            <b>{words.length}</b>
          </div>
          <div className="kv">
            <span>学过</span>
            <b>{learned.length}</b>
          </div>
          <div className="kv">
            <span>熟练（间隔 ≥ 21 天）</span>
            <b>{mature.length}</b>
          </div>
          <div className="kv">
            <span>今天待复习</span>
            <b>{dueToday}</b>
          </div>
          {hardest.length > 0 && (
            <>
              <h3 className="mt">最容易忘的词</h3>
              <div className="chips-select">
                {hardest.map((w) => (
                  <span key={w.id} className="chip tag">
                    {w.word} × {w.lapses}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={`card stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
