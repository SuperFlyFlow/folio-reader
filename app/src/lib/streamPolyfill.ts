// iOS Safari 18 can't `for await` over a ReadableStream (async iteration arrived in Safari 26).
// pdf.js relies on it to read page text, so without this every PDF page fails to render on iPhone.
// Imported first by both the main thread (lib/pdf.ts) and the pdf.js worker (lib/pdfWorker.ts).

// Typed loosely: the DOM lib already declares these members, which is exactly what's missing at runtime.
const proto = (globalThis.ReadableStream?.prototype ?? null) as unknown as Record<PropertyKey, unknown> | null

if (proto && !proto[Symbol.asyncIterator]) {
  proto.values = function (this: ReadableStream, { preventCancel = false } = {}) {
    const reader = this.getReader()
    const iterator: AsyncIterableIterator<unknown> = {
      async next() {
        try {
          const result = await reader.read()
          if (result.done) reader.releaseLock()
          return result as IteratorResult<unknown>
        } catch (e) {
          reader.releaseLock()
          throw e
        }
      },
      async return(value?: unknown) {
        if (!preventCancel) {
          const cancelled = reader.cancel(value)
          reader.releaseLock()
          await cancelled
        } else reader.releaseLock()
        return { done: true, value }
      },
      [Symbol.asyncIterator]() {
        return iterator
      },
    }
    return iterator
  }
  proto[Symbol.asyncIterator] = proto.values
}

export {}
