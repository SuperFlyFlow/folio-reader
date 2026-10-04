import type { ArticleMeta } from './db'

/**
 * Recommended open-access papers (all CC BY, so they may be redistributed with attribution),
 * hosted alongside the app and added to Articles with one tap.
 */
export interface Paper {
  file: string
  title: string
  authors: string[]
  journal: string
  year: number
  doi: string
  topic: string
  why: string
  minutes: number
}

export const PAPERS: Paper[] = [
  {
    file: 'habit-formation',
    title: 'Time to Form a Habit: A Systematic Review and Meta-Analysis of Health Behaviour Habit Formation',
    authors: ['Ben Singh', 'Andrew Murphy', 'Carol Maher', 'Ashleigh E. Smith'],
    journal: 'Healthcare',
    year: 2024,
    doi: '10.3390/healthcare12232488',
    topic: 'Habits',
    why: 'The research behind Atomic Habits-style claims: pooling 20 studies and 2,601 people, habits took a median of about two months to form (59–66 days, with a range of 4 to 335), and it shows what helps them stick.',
    minutes: 35,
  },
  {
    file: 'deliberate-practice',
    title: 'Deliberate Practice and Proposed Limits on the Effects of Practice on the Acquisition of Expert Performance',
    authors: ['K. Anders Ericsson', 'Kyle W. Harwell'],
    journal: 'Frontiers in Psychology',
    year: 2019,
    doi: '10.3389/fpsyg.2019.02396',
    topic: 'Mastery',
    why: 'By the researcher behind the “10,000 hours” idea: what deliberate practice really is, why most practice isn’t, and how experts are actually made.',
    minutes: 60,
  },
  {
    file: 'testing-effect',
    title: 'Enhancing learning and retrieval of new information: a review of the forward testing effect',
    authors: ['Chunliang Yang', 'Rosalind Potts', 'David R. Shanks'],
    journal: 'npj Science of Learning',
    year: 2018,
    doi: '10.1038/s41539-018-0024-y',
    topic: 'Learning',
    why: 'Testing yourself doesn’t just check what you know, it makes you learn the next thing better. A practical case for quizzing yourself as you read.',
    minutes: 30,
  },
  {
    file: 'growth-mindset',
    title: 'A national experiment reveals where a growth mindset improves achievement',
    // 25 authors in total (Crossref); the first five are listed here.
    authors: ['David S. Yeager', 'Paul Hanselman', 'Gregory M. Walton', 'Jared S. Murray', 'Robert Crosnoe'],
    journal: 'Nature',
    year: 2019,
    doi: '10.1038/s41586-019-1466-y',
    topic: 'Mindset',
    why: 'A landmark randomised experiment across US high schools: a growth-mindset lesson of under an hour improved grades for lower-achieving students, and the paper shows where and for whom it works.',
    minutes: 45,
  },
  {
    file: 'ego-depletion',
    title: 'Publication bias and the limited strength model of self-control: has the evidence for ego depletion been overestimated?',
    authors: ['Evan C. Carter', 'Michael E. McCullough'],
    journal: 'Frontiers in Psychology',
    year: 2014,
    doi: '10.3389/fpsyg.2014.00823',
    topic: 'Willpower',
    why: 'Is willpower really a battery that runs out? A sharp look at the evidence, and a lesson in thinking critically about popular psychology.',
    minutes: 30,
  },
  {
    file: 'fiction-empathy',
    title: 'How Does Fiction Reading Influence Empathy? An Experimental Investigation on the Role of Emotional Transportation',
    authors: ['P. Matthijs Bal', 'Martijn Veltkamp'],
    journal: 'PLoS ONE',
    year: 2013,
    doi: '10.1371/journal.pone.0055341',
    topic: 'Reading',
    why: 'Does reading make you more empathetic? An experiment showing it does, but only when you’re emotionally absorbed in the story.',
    minutes: 25,
  },
]

export const paperUrl = (p: Paper) => `${import.meta.env.BASE_URL}papers/${p.file}.pdf`

export const paperMeta = (p: Paper): ArticleMeta => ({
  doi: p.doi,
  journal: p.journal,
  year: p.year,
  authors: p.authors,
  url: `https://doi.org/${p.doi}`,
})
