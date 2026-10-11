/** Speed Learning is an independent, non-SRS practice queue. It NEVER modifies cards or review_logs. */
export type SpeedFilter = 'all' | 'new' | 'due' | 'missed';
export type SpeedInput = 'flip' | 'type';
export const SPEED_MAX_SELECTION = 250;
export const SPEED_MAX_PERFECT_ROUNDS = 20;

export interface SpeedOptions {
  passesRequired: 1 | 2 | 3;
  retryGap: number;
  shuffle: boolean;
  input: SpeedInput;
  /** 0 / omitted = existing per-card mastery; 1..20 = full-subset perfect-round challenge. */
  perfectRoundsRequired?: number;
}
export interface SpeedScore {
  right: number;
  wrong: number;
  streak: number;
  mastered: boolean;
}
export interface RoundResult {
  number: number;
  correct: number;
  total: number;
  perfect: boolean;
}
export interface SpeedSession {
  id: string;
  selectedIds: string[];
  queue: string[];
  scores: Record<string, SpeedScore>;
  options: SpeedOptions;
  attempts: number;
  startedAt: number;
  updatedAt: number;
  /** Fields are optional so old SQLite/JSON sessions remain valid. */
  roundNumber?: number;
  roundAnswered?: number;
  roundMistakes?: number;
  perfectStreak?: number;
  completedRounds?: number;
  roundHistory?: RoundResult[];
}
export const DEFAULT_SPEED_OPTIONS: SpeedOptions = {
  passesRequired: 2, retryGap: 3, shuffle: true, input: 'flip', perfectRoundsRequired: 2,
};
const requiredPerfectRounds = (options: SpeedOptions) => Math.max(0, Math.min(SPEED_MAX_PERFECT_ROUNDS, Math.floor(options.perfectRoundsRequired ?? 0)));
const emptyScore = (): SpeedScore => ({ right: 0, wrong: 0, streak: 0, mastered: false });
function shuffleQueue(ids: string[], shuffle: boolean, random: () => number) {
  const queue = [...ids];
  if (shuffle) {
    for (let i = queue.length - 1; i > 0; --i) {
      const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  return queue;
}
export function newSpeedSession(ids: string[], options: SpeedOptions, id: string, now: number, random: () => number = Math.random): SpeedSession {
  const selectedIds = Array.from(new Set(ids));
  if (!selectedIds.length || selectedIds.length > SPEED_MAX_SELECTION) throw new Error(`Choose 1–${SPEED_MAX_SELECTION} cards.`);
  const requested = options.perfectRoundsRequired ?? 0;
  if (!Number.isInteger(requested) || requested < 0 || requested > SPEED_MAX_PERFECT_ROUNDS)
    throw new Error(`Choose 1–${SPEED_MAX_PERFECT_ROUNDS} perfect rounds, or card mastery mode.`);
  const scores: Record<string, SpeedScore> = {};
  selectedIds.forEach(cardId => { scores[cardId] = emptyScore(); });
  return {
    id, selectedIds, queue: shuffleQueue(selectedIds, options.shuffle, random), scores,
    options: { ...options }, attempts: 0, startedAt: now, updatedAt: now,
    roundNumber: 1, roundAnswered: 0, roundMistakes: 0, perfectStreak: 0,
    completedRounds: 0, roundHistory: [],
  };
}
/**
 * In perfect-round mode, each card appears ONCE per round. Any mistake invalidates
 * that entire round, even when the rest of the cards are correct. Completion
 * requires N consecutive complete rounds with zero mistakes. Legacy card
 * mastery mode retains its independent per-card retry spacing.
 */
export function speedAnswer(session: SpeedSession, correct: boolean, now: number, random: () => number = Math.random): SpeedSession {
  if (!session.queue.length) return session;
  const [cardId, ...remaining] = session.queue;
  const prev = session.scores[cardId];
  if (!prev) throw new Error('Practice session has an invalid card.');
  const score: SpeedScore = {
    right: prev.right + Number(correct),
    wrong: prev.wrong + Number(!correct),
    streak: correct ? prev.streak + 1 : 0,
    mastered: correct && prev.streak + 1 >= session.options.passesRequired,
  };
  const scores = { ...session.scores, [cardId]: score };
  const required = requiredPerfectRounds(session.options);
  if (!required) {
    const queue = [...remaining];
    if (!score.mastered) {
      const gap = Math.max(0, Math.floor(session.options.retryGap));
      queue.splice(Math.min(gap, queue.length), 0, cardId);
    }
    return { ...session, scores, queue, attempts: session.attempts + 1, updatedAt: now };
  }

  const roundAnswered = (session.roundAnswered ?? 0) + 1;
  const roundMistakes = (session.roundMistakes ?? 0) + Number(!correct);
  const perfectStreak = correct ? (session.perfectStreak ?? 0) : 0;
  if (remaining.length) {
    return {
      ...session, scores, queue: remaining, attempts: session.attempts + 1, updatedAt: now,
      roundAnswered, roundMistakes, perfectStreak,
    };
  }
  // End-of-round: increment the streak only if every selected card was correct.
  const perfect = roundMistakes === 0 && roundAnswered === session.selectedIds.length;
  const newStreak = perfect ? perfectStreak + 1 : 0;
  const completedRounds = (session.completedRounds ?? 0) + 1;
  const result: RoundResult = { number: session.roundNumber ?? completedRounds, correct: roundAnswered - roundMistakes, total: session.selectedIds.length, perfect };
  const roundHistory = [...(session.roundHistory ?? []), result].slice(-50);
  const complete = newStreak >= required;
  return {
    ...session, scores,
    queue: complete ? [] : shuffleQueue(session.selectedIds, session.options.shuffle, random),
    attempts: session.attempts + 1, updatedAt: now,
    perfectStreak: newStreak, completedRounds, roundHistory,
    roundNumber: complete ? (session.roundNumber ?? completedRounds) : (session.roundNumber ?? completedRounds) + 1,
    roundAnswered: complete ? roundAnswered : 0,
    roundMistakes: complete ? roundMistakes : 0,
  };
}
export function speedSkip(session: SpeedSession, now: number): SpeedSession {
  if (session.queue.length < 2) return session;
  return { ...session, queue: [...session.queue.slice(1), session.queue[0]], updatedAt: now };
}
export function speedStats(session: SpeedSession) {
  const values = Object.values(session.scores);
  const mastered = values.filter(x => x.mastered).length;
  const difficult = values.filter(x => x.wrong > 0).length;
  const right = values.reduce((s, x) => s + x.right, 0);
  const wrong = values.reduce((s, x) => s + x.wrong, 0);
  return {
    total: session.selectedIds.length, mastered, difficult, right, wrong,
    accuracy: right + wrong ? Math.round((right / (right + wrong)) * 100) : 0,
    perfectRoundsRequired: requiredPerfectRounds(session.options),
    perfectStreak: session.perfectStreak ?? 0,
    completedRounds: session.completedRounds ?? 0,
    roundNumber: session.roundNumber ?? 1,
    roundAnswered: session.roundAnswered ?? 0,
    roundMistakes: session.roundMistakes ?? 0,
    lastRound: session.roundHistory?.[session.roundHistory.length - 1] ?? null,
  };
}
/** Restart with same completion rule; previous session remains in history. */
export function restartSpeedSession(session: SpeedSession, mode: 'all' | 'mistakes', id: string, now: number, random: () => number = Math.random): SpeedSession | null {
  const ids = mode === 'mistakes' ? session.selectedIds.filter(cid => session.scores[cid]?.wrong > 0) : session.selectedIds;
  if (!ids.length) return null;
  return newSpeedSession(ids, session.options, id, now, random);
}
/** Deleted cards cannot count as correct; reset perfect-round progress for changed subsets. */
export function pruneSpeedSession(session: SpeedSession, existingIds: string[]): SpeedSession {
  const present = new Set(existingIds);
  const selectedIds = session.selectedIds.filter(x => present.has(x));
  const scores: Record<string, SpeedScore> = {};
  selectedIds.forEach(x => { scores[x] = session.scores[x] || emptyScore(); });
  const removed = selectedIds.length !== session.selectedIds.length;
  if (removed && requiredPerfectRounds(session.options)) {
    return {
      ...session, selectedIds, scores, queue: [...selectedIds],
      roundNumber: 1, roundAnswered: 0, roundMistakes: 0, perfectStreak: 0,
      completedRounds: 0, roundHistory: [],
    };
  }
  return { ...session, selectedIds, scores, queue: session.queue.filter(x => present.has(x)) };
}
