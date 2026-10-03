// pdf.js worker entry: install the stream polyfill before pdf.js's worker code runs.
import './streamPolyfill'
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
