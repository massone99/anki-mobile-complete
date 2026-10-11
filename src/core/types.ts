export type NoteKind = 'basic' | 'reversed' | 'cloze';
export type Queue = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 1 | 2 | 3 | 4;
export type Settings = {
  newPerDay: number;
  reviewsPerDay: number;
  desiredRetention: number;
  dayStartHour: number;
  learnAheadMinutes: number;
  showAnswerOnTap: boolean;
  dailyGoal: number;
  autoPlayAudio: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20, reviewsPerDay: 200, desiredRetention: 0.9,
  dayStartHour: 4, learnAheadMinutes: 20, showAnswerOnTap: false, dailyGoal: 30,
  autoPlayAudio: false,
};
export interface Deck {
  id: string; name: string; description: string; parentId: string | null;
  newLimit: number | null; reviewLimit: number | null; createdAt: number; updatedAt: number;
}
export interface Note {
  id: string; guid: string; deckId: string; type: NoteKind; front: string; back: string;
  tags: string[]; createdAt: number; updatedAt: number; sourceId?: string | null;
}
export interface FlashCard {
  id: string; noteId: string; deckId: string; ordinal: number; state: Queue;
  due: number; interval: number; ease: number; reps: number; lapses: number;
  suspended: boolean; buriedUntil: number | null; fsrs: string | null;
  updatedAt: number; sourceId?: string | null;
}
export interface ReviewLog {
  id: string; cardId: string; deckId: string; timestamp: number; rating: Rating;
  elapsedMs: number; prevState: Queue; nextState: Queue; scheduledDays: number;
}
export type StudyCard = FlashCard & { front: string; back: string; noteType: NoteKind; tags: string[]; deckName: string };
export type DeckSummary = Deck & { total: number; newCount: number; learningCount: number; reviewCount: number; suspendedCount: number };
export type Overview = {
  decks: DeckSummary[]; todayReviewed: number; todayTimeMs: number; totalNotes: number;
  totalCards: number; dueNow: number; studiedDays: number; daysStreak: number;
};
export const epochDay = (ms: number, dayStartHour = 4) => Math.floor((ms - dayStartHour * 3600000) / 86400000);
export const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
export const plainText = (str: string) => str.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
