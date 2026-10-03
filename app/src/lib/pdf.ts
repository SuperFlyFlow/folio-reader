// The legacy build polyfills very new JavaScript APIs (e.g. Map.prototype.getOrInsertComputed)
// that iOS Safari doesn't ship yet; the modern build fails to open PDFs on iPhone.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

export type OpenPdf = PDFDocumentProxy & { close(): Promise<void> }

/** Opens a PDF; call `close()` to free the worker-side document. */
export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  const task = pdfjs.getDocument({ data })
  const doc = (await task.promise) as PDFDocumentProxy
  return Object.assign(doc, { close: () => task.destroy() })
}
