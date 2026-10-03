import type { Annotation, HighlightColor } from '../lib/db'

export interface TocItem {
  label: string
  href: string
  depth: number
}

export interface Relocation {
  location: string
  percent: number
  chapter?: string
  /** e.g. "Page 84" or "47 / 312" */
  pageLabel: string
  /** pages left in the current chapter (EPUB) or book (PDF) */
  pagesLeft?: number
}

export interface Selection {
  location: string
  text: string
  /** viewport rect of the selection, for positioning the menu */
  rect: { top: number; bottom: number; left: number; right: number }
}

export interface SearchHit {
  location: string
  excerpt: string
  chapter?: string
  href?: string
}

export interface EngineHandle {
  next(): void
  prev(): void
  goTo(location: string): void
  goToPercent(p: number): void
  search(q: string): Promise<SearchHit[]>
  clearSelection(): void
}

export interface EngineProps {
  data: Blob
  initialLocation?: string
  annotations: Annotation[]
  onReady(toc: TocItem[]): void
  onRelocate(r: Relocation): void
  onSelect(s: Selection | null): void
  onTapCenter(): void
  onHighlightTap(id: string): void
  onError(error: unknown): void
}

export const HL_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']
export const HL_RGB: Record<HighlightColor, string> = {
  yellow: 'rgb(255, 204, 0)',
  green: 'rgb(52, 199, 89)',
  blue: 'rgb(10, 132, 255)',
  pink: 'rgb(255, 55, 95)',
}
