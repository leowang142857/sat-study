import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { messages, readLang, writeLang, type Lang, type Messages } from './messages'

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Messages
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = (next: Lang) => {
    writeLang(next)
    setLangState(next)
  }

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = messages[lang].docTitle
  }, [lang])

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: messages[lang] }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

/** Header control. Labels stay in each language so the other one is always recognizable. */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="seg lang-toggle" role="group" aria-label={t.language}>
      <button type="button" className={lang === 'zh' ? 'on' : ''} aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>
        中文
      </button>
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        English
      </button>
    </div>
  )
}
