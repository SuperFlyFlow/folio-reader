/** Public-domain classics (Project Gutenberg editions), hosted alongside the app. */
export interface Classic {
  id: string
  title: string
  author: string
  tagline: string
  why: string
  minutes: number
  /** Gutenberg's generated placeholder cover; show our typographic cover instead */
  plainCover?: boolean
}

export const CLASSICS: Classic[] = [
  {
    id: '132',
    title: 'The Art of War',
    author: 'Sun Tzu',
    tagline: 'Strategy, timing and winning without fighting',
    why: 'Thirteen short chapters on preparation, positioning and knowing yourself and your opponent. Its ideas carry straight into business, negotiation and everyday decisions.',
    minutes: 70,
    plainCover: true,
  },
  {
    id: '2680',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    tagline: 'A Roman emperor’s private notes on self-mastery',
    why: 'Written for himself, never for publication: how to stay calm, act with integrity and focus only on what you control. The cornerstone of Stoic philosophy.',
    minutes: 300,
  },
  {
    id: '20203',
    title: 'The Autobiography of Benjamin Franklin',
    author: 'Benjamin Franklin',
    tagline: 'The original habit system: 13 virtues, tracked daily',
    why: 'The closest classic to Atomic Habits. Franklin describes building his character one virtue at a time with a daily scorecard, alongside his self-education and rise from printer’s apprentice.',
    minutes: 360,
  },
  {
    id: '4507',
    title: 'As a Man Thinketh',
    author: 'James Allen',
    tagline: 'How your thoughts shape your character and results',
    why: 'A short, powerful essay you can read in one sitting: your circumstances follow your habits of thought, so master your mind first.',
    minutes: 45,
    plainCover: true,
  },
  {
    id: '45109',
    title: 'The Enchiridion',
    author: 'Epictetus',
    tagline: 'The handbook of Stoic resilience',
    why: 'A former slave’s practical rules for a free mind. Separate what is up to you from what isn’t, and stop being disturbed by the rest.',
    minutes: 50,
  },
]

export const classicCover = (c: Classic) => `${import.meta.env.BASE_URL}classics/${c.id}.jpg`
