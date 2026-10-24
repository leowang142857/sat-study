import { useRef, useState } from 'react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Drag a rectangle over a screenshot to cut out a chart/table for practice mode. */
export function FigureCropper({ src, onDone, onCancel }: { src: string; onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  const pos = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) }
  }

  function confirm() {
    const img = imgRef.current
    if (!img || !rect || rect.w < 10 || rect.h < 10) return
    const k = img.naturalWidth / img.getBoundingClientRect().width
    const c = document.createElement('canvas')
    c.width = Math.round(rect.w * k)
    c.height = Math.round(rect.h * k)
    c.getContext('2d')!.drawImage(img, rect.x * k, rect.y * k, rect.w * k, rect.h * k, 0, 0, c.width, c.height)
    onDone(c.toDataURL('image/webp', 0.9))
  }

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal wide">
        <div className="modal-head">
          <h2>框选图表</h2>
          <span className="hint">按住鼠标拖出一个框，只框图表/表格，不要框进选项</span>
        </div>
        <div
          className="cropper"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = pos(e)
            setStart(p)
            setRect({ ...p, w: 0, h: 0 })
          }}
          onPointerMove={(e) => {
            if (!start) return
            const p = pos(e)
            setRect({ x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
          }}
          onPointerUp={() => setStart(null)}
        >
          <img ref={imgRef} src={src} alt="截图" draggable={false} />
          {rect && <div className="crop-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" disabled={!rect || rect.w < 10 || rect.h < 10} onClick={confirm}>
            保存为图表
          </button>
        </div>
      </div>
    </div>
  )
}
