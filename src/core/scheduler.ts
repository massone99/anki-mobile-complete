import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating } from 'ts-fsrs';
import type { FlashCard, Rating, Settings, Queue } from './types';

const toState = (state: number): Queue => state === 0 ? 'new' : state === 1 ? 'learning' : state === 2 ? 'review' : 'relearning';
export function schedule(card: FlashCard, rating: Rating, when: number, settings: Settings): FlashCard {
  const params = generatorParameters({ request_retention: settings.desiredRetention, enable_fuzz: true });
  const scheduler = fsrs(params);
  const source = card.fsrs ? JSON.parse(card.fsrs) : createEmptyCard(new Date(when));
  const current = {
    ...source,
    due: new Date(source.due),
    last_review: source.last_review ? new Date(source.last_review) : undefined,
  };
  const next = scheduler.next(current, new Date(when), rating as FsrsRating).card;
  return {
    ...card, fsrs: JSON.stringify(next),
    state: toState(next.state), due: +new Date(next.due), interval: next.scheduled_days,
    reps: next.reps, lapses: next.lapses, updatedAt: when,
  };
}
export function ratingEstimates(card: FlashCard, settings: Settings, now = Date.now()): string[] {
  return ([1, 2, 3, 4] as Rating[]).map(r => {
    const next = schedule(card, r, now, settings);
    const minutes = Math.max(0, Math.round((next.due - now) / 60000));
    return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  });
}
