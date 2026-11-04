import { useState } from 'react'
import type { Section } from '../types'
import { QUESTION_TYPES } from '../constants'
import { qtypeLabel } from '../messages'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { isDue } from '../srs'

const DAY = 86400000

export function StatsPage() {
  const { mistakes, words } = useStore()
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('RW')

  const inSection = mistakes.filter((m) => m.section === section)
  const allReviews = inSection.flatMap((m) => m.reviews)
  const redoRate = allReviews.length ? Math.round((allReviews.filter((r) => r.correct).length / allReviews.length) * 100) : null

  const byType = [...QUESTION_TYPES[section], '']
    .map((id) => {
      const ms = inSection.filter((m) => m.questionType === id)
      const rv = ms.flatMap((m) => m.reviews)
      return {
        id,
        label: qtypeLabel(t, id),
        total: ms.length,
        open: ms.filter((m) => !m.mastered).length,
        rate: rv.length ? Math.round((rv.filter((r) => r.correct).length / rv.length) * 100) : null,
      }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.open - a.open || (a.rate ?? -1) - (b.rate ?? -1) || b.total - a.total)
  const maxType = Math.max(1, ...byType.map((row) => row.total))

  const bySource = Object.entries(
    inSection.reduce<Record<string, number>>((acc, m) => {
      const s = m.source.replace(/\s*·\s*Q\d+$/, '') || t.common.noSource
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  const tags = Object.entries(
    inSection.flatMap((m) => m.tags).reduce<Record<string, number>>((acc, tag) => ((acc[tag] = (acc[tag] ?? 0) + 1), acc), {}),
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
  const weakest = byType.find((row) => row.open > 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.stats.title}</h1>
          <p className="sub">{weakest ? t.stats.weakest(weakest.label, weakest.open) : t.stats.noneOpen}</p>
        </div>
        <div className="seg">
          {(['RW', 'Math'] as Section[]).map((s) => (
            <button key={s} className={section === s ? 'on' : ''} onClick={() => setSection(s)}>
              {s === 'RW' ? t.stats.sectionRW : t.stats.sectionMath}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-cards">
        <Stat label={t.stats.total} value={inSection.length} />
        <Stat label={t.stats.open} value={inSection.filter((m) => !m.mastered).length} tone="bad" />
        <Stat label={t.stats.mastered} value={inSection.filter((m) => m.mastered).length} tone="ok" />
        <Stat label={t.stats.redoRate} value={redoRate === null ? '—' : `${redoRate}%`} sub={t.stats.redoTimes(allReviews.length)} />
      </div>

      <div className="stats-grid">
        <div className="card">
          <h3>{t.stats.byType}</h3>
          {byType.length === 0 && <div className="empty small">{t.stats.noData}</div>}
          {byType.map((row) => (
            <div key={row.id || 'none'} className="bar-row">
              <span className="bar-label">{row.label}</span>
              <div className="bar-track">
                <div className="bar mastered" style={{ width: `${((row.total - row.open) / maxType) * 100}%` }} />
                <div className="bar open" style={{ width: `${(row.open / maxType) * 100}%` }} />
              </div>
              <span className="bar-num">
                {row.open}/{row.total}
                {row.rate !== null && <span className="muted">{t.stats.redoPct(row.rate)}</span>}
              </span>
            </div>
          ))}
          <div className="legend-row">
            <span className="dot open" /> {t.stats.legendOpen} <span className="dot mastered" /> {t.stats.legendMastered}
          </div>
        </div>

        <div className="card">
          <h3>{t.stats.last14}</h3>
          <div className="day-chart">
            {days.map((d) => (
              <div key={d.label} className="day-col" title={t.stats.dayTitle(d.label, d.added, d.redone)}>
                <div className="day-bars">
                  <div className="bar redone" style={{ height: `${(d.redone / maxDay) * 100}%` }} />
                  <div className="bar added" style={{ height: `${(d.added / maxDay) * 100}%` }} />
                </div>
                <span className="day-label">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="legend-row">
            <span className="dot added" /> {t.stats.added} <span className="dot redone" /> {t.stats.redone}
          </div>
        </div>

        <div className="card">
          <h3>{t.stats.bySource}</h3>
          {bySource.map(([s, n]) => (
            <div key={s} className="kv">
              <span>{s}</span>
              <b>{n}</b>
            </div>
          ))}
          {tags.length > 0 && (
            <>
              <h3 className="mt">{t.stats.tags}</h3>
              <div className="chips-select">
                {tags.map(([tag, n]) => (
                  <span key={tag} className="chip tag">
                    {tag} × {n}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>{t.stats.words}</h3>
          <div className="kv">
            <span>{t.stats.wordTotal}</span>
            <b>{words.length}</b>
          </div>
          <div className="kv">
            <span>{t.stats.learned}</span>
            <b>{learned.length}</b>
          </div>
          <div className="kv">
            <span>{t.stats.mature}</span>
            <b>{mature.length}</b>
          </div>
          <div className="kv">
            <span>{t.stats.dueToday}</span>
            <b>{dueToday}</b>
          </div>
          {hardest.length > 0 && (
            <>
              <h3 className="mt">{t.stats.hardest}</h3>
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
