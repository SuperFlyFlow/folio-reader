import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

export type OpenPdf = PDFDocumentProxy & { close(): Promise<void> }

/** Opens a PDF; call `close()` to free the worker-side document. */
export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  return Object.assign(doc, { close: () => task.destroy() })
}
