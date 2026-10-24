import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fileToCompressedDataUrl, imagesFromClipboard } from '../image'

interface Props {
  images: string[]
  onChange: (images: string[]) => void
  onAdded?: (added: string[]) => void
  renderActions?: (src: string, index: number) => ReactNode
}

/** Listens for paste on the whole window while mounted, so ⌘V works without focusing the zone. */
export function ImageDropZone({ images, onChange, onAdded, renderActions }: Props) {
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ images, onChange, onAdded })
  latest.current = { images, onChange, onAdded }

  async function addFiles(files: File[]) {
    if (!files.length) return
    const urls = await Promise.all(files.map(fileToCompressedDataUrl))
    latest.current.onChange([...latest.current.images, ...urls])
    latest.current.onAdded?.(urls)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFromClipboard(e)
      if (files.length) {
        e.preventDefault()
        addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')))
        }}
      >
        <strong>⌘V 粘贴截图</strong>，或拖拽图片到这里 / 点击选择文件
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      {images.length > 0 && (
        <div className="thumbs">
          {images.map((src, i) => (
            <div key={i} className="thumb-wrap">
              <div className="thumb">
                <img src={src} alt={`截图 ${i + 1}`} />
                <button type="button" className="thumb-remove" onClick={() => onChange(images.filter((_, j) => j !== i))} title="删除">
                  ×
                </button>
              </div>
              {renderActions && <div className="thumb-actions">{renderActions(src, i)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
