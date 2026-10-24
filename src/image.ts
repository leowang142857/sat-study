const MAX_WIDTH = 1600

/** Downscale and re-encode so pasted screenshots don't bloat IndexedDB. */
export async function fileToCompressedDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/webp', 0.85)
}

export function imagesFromClipboard(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? [])
  return items
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f)
}
