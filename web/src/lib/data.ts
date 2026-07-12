// Luna AI — shared static data. Loved-ones, scenes.
// In P2 these become DB-backed; for P1 they stay inline.

export type Persona = {
  id: string;
  name: string;
  relation: string;
  relationHi: string;
  location: string;
  warmth: string;
  hue: string;
  hue2: string;
  isDefault?: boolean;
};

export type Scene = {
  id: string;
  title: string;
  titleHi: string;
  sub: string;
  prompt: string;
  mood: string;
  listens: string;
  hours: string;
  hue: string;
  custom?: boolean;
};

export const PERSONAS: Persona[] = [
  {
    id: 'assistant',
    name: 'Luna',
    relation: 'Companion',
    relationHi: 'साथी',
    location: 'Here with you',
    warmth: 'The one on the line before you pick who.',
    hue: '#B39BE8',
    hue2: '#7A6FD6',
    isDefault: true,
  },
  {
    id: 'ananya',
    name: 'Ananya',
    relation: 'Partner',
    relationHi: 'साथी',
    location: 'Mumbai · 3 years',
    warmth: 'Plays you old songs when you can\u2019t sleep.',
    hue: '#F0C2A8',
    hue2: '#D89CB3',
  },
  {
    id: 'amma',
    name: 'Amma',
    relation: 'Mother',
    relationHi: 'माँ',
    location: 'Pune · forever',
    warmth: 'Knows when you\u2019re lying about eating on time.',
    hue: '#E8B5C5',
    hue2: '#B08CC2',
  },
  {
    id: 'rohan',
    name: 'Rohan',
    relation: 'Brother',
    relationHi: 'भाई',
    location: 'Bengaluru · always',
    warmth: 'Will argue about anything. Means well.',
    hue: '#9DCFE8',
    hue2: '#7A6FD6',
  },
  {
    id: 'dida',
    name: 'Dida',
    relation: 'Grandmother',
    relationHi: 'दीदा',
    location: 'Kolkata · since you were small',
    warmth: 'Still calls you by the name only she uses.',
    hue: '#F4D3A8',
    hue2: '#C89B7A',
  },
];

export const DEFAULT_PERSONA: Persona =
  PERSONAS.find((p) => p.isDefault) ?? PERSONAS[0];

export const SCENES: Scene[] = [
  {
    id: 'lonely-late-night',
    title: 'Lonely late night',
    titleHi: 'अकेली रात',
    sub: 'For when you do not want to be alone with it.',
    prompt: 'The city is asleep. You\u2019re not. Tell me what\u2019s keeping you up.',
    mood: 'quiet',
    listens: '12.4k',
    hours: 'late night',
    hue: '#7A6FD6',
  },
  {
    id: 'first-gen-guilt',
    title: 'First-gen guilt',
    titleHi: 'पहली पीढ़ी',
    sub: 'Dreams on one side. Family on the other.',
    prompt: 'Whose life are you living tonight \u2014 theirs, or yours?',
    mood: 'deep',
    listens: '8.1k',
    hours: 'anytime',
    hue: '#D89CB3',
  },
  {
    id: 'missing-someone',
    title: 'Missing someone',
    titleHi: 'याद आ रही है',
    sub: 'For when they feel far away.',
    prompt: 'Who are you missing tonight? Tell me their name first.',
    mood: 'warm',
    listens: '15.7k',
    hours: 'evening',
    hue: '#F0C2A8',
  },
  {
    id: 'custom',
    title: 'Your own',
    titleHi: 'तुम्हारा अपना',
    sub: 'Tell me what\u2019s on your mind. I\u2019ll meet you there.',
    prompt: '',
    mood: 'open',
    listens: '\u2014',
    hours: 'whenever',
    hue: '#9DCFE8',
    custom: true,
  },
];

export const SEED_CHIPS: string[] = [
  'Just want to talk',
  'Lonely late night',
  'Missing someone',
  'First-gen guilt',
];
