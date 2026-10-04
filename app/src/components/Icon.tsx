// Folio's own line icons: refined, book-inspired glyphs on a 24px grid with fine, round-capped strokes.
const PATHS: Record<string, string> = {
  quill: 'M20.5 3.5C13.8 4 8.9 8.4 7.3 15.4l-.8 3.4M20.5 3.5c-1.3 6.6-5.6 10.8-12.4 11.7M11.3 11.2l2.6 2.6M14.6 7.8l1.9 1.9M3.5 20.5l3-1.7',
  hourglass: 'M6.5 3.5h11M6.5 20.5h11M8 3.5v1.4c0 2.4 1.7 3.9 4 5.6 2.3-1.7 4-3.2 4-5.6V3.5M8 20.5v-1.4c0-2.4 1.7-3.9 4-5.6 2.3 1.7 4 3.2 4 5.6v1.4M12 10.5v3M9.8 18.6c1.2-.8 3.2-.8 4.4 0',
  books: 'M4 19.5V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14M4 8h4M4 16.5h4M9.5 19.5V7.5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v12M9.5 10H13M9.5 16.5H13M15 7.9l2.8-.8 3.3 11.8-2.8.8zM15.8 10.7l2.8-.8M2.5 19.5h19',
  chart: 'M5 20V12M10 20V6M15 20v-9M20 20V9M3 20.5h18',
  quote: 'M10.2 6.8C7 7.8 5 10.4 5 13.9v3.6h4.6v-4.6H7.3c.2-2.1 1.4-3.6 3.5-4.4zM19.2 6.8c-3.2 1-5.2 3.6-5.2 7.1v3.6h4.6v-4.6h-2.3c.2-2.1 1.4-3.6 3.5-4.4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.4l1.7 1.3-1.9 3.3-2-.8a7 7 0 0 1-1.9 1.1l-.3 2.1h-3.9l-.3-2.1a7 7 0 0 1-1.9-1.1l-2 .8-1.9-3.3 1.7-1.3a7.2 7.2 0 0 1 0-2.8L2.9 9.3l1.9-3.3 2 .8a7 7 0 0 1 1.9-1.1l.3-2.1h3.9l.3 2.1a7 7 0 0 1 1.9 1.1l2-.8 1.9 3.3-1.7 1.3a7.2 7.2 0 0 1 0 2.8z',
  search: 'M10.5 16.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 15l5.5 5.5',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9.5 6l6 6-6 6',
  list: 'M8.5 6.5h12M8.5 12h12M8.5 17.5h8M4.3 6.5h.4M4.3 12h.4M4.3 17.5h.4',
  textformat: 'M2.5 19.5h3.6M8.9 19.5h3.6M4.3 19.5 8.4 5.5l4.2 14M5.5 15.2h5.9M15.2 12.1c.6-.9 1.6-1.4 2.7-1.4 1.7 0 2.7 1 2.7 2.8v6h1.1M20.6 15.1c-3.4 0-5.4.9-5.4 2.6 0 1.1.9 1.8 2.1 1.8 1.8 0 3.3-1.3 3.3-3.4',
  bookmark: 'M7 3.5h10a.5.5 0 0 1 .5.5v16.5L12 16.6l-5.5 3.9V4a.5.5 0 0 1 .5-.5z',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cloud: 'M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z',
  cloudOff: 'M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5zM4 4l16 16',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6',
  share: 'M12 3.5v11M8 7.5l4-4 4 4M7 10.5H5.5v9h13v-9H17',
  copy: 'M8.5 8.5h10v11h-10zM5.5 15.5v-11h10',
  pencil: 'M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM14 7l3 3',
  sort: 'M7 4.5v15M4 16.5l3 3 3-3M17 19.5v-15M14 7.5l3-3 3 3',
  doc: 'M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9.2 11.5h6.6M9.2 14.5h6.6M9.2 17.5h4.2',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  crop: 'M6.5 2.5v15h15M2.5 6.5h15v15',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  flame: 'M12 21c3.5 0 6-2.5 6-5.9 0-3.7-2.9-5.6-4-9.6-2.2 1.6-3.1 3.8-2.9 6.1-1.1-.6-1.8-1.6-2-2.9C7.3 10.4 6 12.6 6 15.1 6 18.5 8.5 21 12 21z',
  envelope: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7',
  lock: 'M6.5 10.5h11v9h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  tag: 'M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7zM7.5 8.5h.01',
}

const FILLED = new Set(['bookmarkFill'])

export default function Icon({
  name,
  size = 22,
  stroke = 1.6,
  fill,
  className,
}: {
  name: string
  size?: number
  stroke?: number
  fill?: boolean
  className?: string
}) {
  const key = FILLED.has(name) ? name.replace('Fill', '') : name
  const solid = fill || FILLED.has(name)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[key] ?? ''} />
    </svg>
  )
}
