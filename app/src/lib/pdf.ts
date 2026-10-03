// Polyfill must evaluate before pdf.js (see streamPolyfill.ts).
import './streamPolyfill'
// The legacy build polyfills very new JavaScript APIs (e.g. Map.prototype.getOrInsertComputed)
// that iOS Safari doesn't ship yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// Our own worker entry, so the worker gets the same polyfill.
pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfWorker.ts', import.meta.url), { type: 'module' })

export { pdfjs }

export type OpenPdf = PDFDocumentProxy & { close(): Promise<void> }

/** Opens a PDF; call `close()` to free the worker-side document. */
export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  const task = pdfjs.getDocument({ data })
  const doc = (await task.promise) as PDFDocumentProxy
  return Object.assign(doc, { close: () => task.destroy() })
}
