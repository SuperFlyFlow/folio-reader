// SF Symbols–style line icons, drawn on a 24px grid with 1.8px strokes.
const PATHS: Record<string, string> = {
  books:
    'M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5zM15.2 5.6l3.3-1 3.3 14.4-3.3 1z',
  chart: 'M5 20V12M10 20V6M15 20v-9M20 20V9M3 20.5h18',
  quote:
    'M5 17.5c2.4-1 3.5-2.8 3.5-5.5H5V6.5h5.5V12c0 4-1.8 6.5-5.5 7.5zM13.5 17.5c2.4-1 3.5-2.8 3.5-5.5h-3.5V6.5H19V12c0 4-1.8 6.5-5.5 7.5z',
  gear:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.3 7.3 0 0 1-2 1.2l-.3 2h-3.6l-.3-2a7.3 7.3 0 0 1-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7.4 7.4 0 0 1 0-2.4L3.4 9.9l1.8-3.1 1.9.7a7.3 7.3 0 0 1 2-1.2l.3-2h3.6l.3 2a7.3 7.3 0 0 1 2 1.2l1.9-.7 1.8 3.1-1.6 1.2a7.4 7.4 0 0 1 0 2.4z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.3 15.3 20 20',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9.5 6l6 6-6 6',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  textformat: 'M2.5 18l4-11 4 11M4 14h5M13 18l3.5-9 3.5 9M14.2 15h4.6',
  bookmark: 'M6.5 3.5h11v17L12 16.5l-5.5 4z',
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
  doc: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  crop: 'M6.5 2.5v15h15M2.5 6.5h15v15',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  flame: 'M12 21c3.6 0 6-2.4 6-5.8 0-3.8-3-5.7-4-9.7-2.3 1.6-3.2 3.8-3 6.2-1.2-.6-1.9-1.7-2.1-3C7.2 10.4 6 12.6 6 15.2 6 18.6 8.4 21 12 21z',
  envelope: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7',
  lock: 'M6.5 10.5h11v9h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  tag: 'M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7zM7.5 8.5h.01',
}

const FILLED = new Set(['bookmarkFill'])

export default function Icon({
  name,
  size = 22,
  stroke = 1.8,
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
