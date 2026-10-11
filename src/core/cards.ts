import type { Note, NoteKind } from './types';
export function clozeOrdinals(text: string): number[] {
  const matches = [...text.matchAll(/\{\{c(\d+)::[\s\S]*?\}\}/g)].map(x => Number(x[1]));
  return [...new Set(matches)].filter(x => x > 0).sort((a, b) => a - b);
}
export function cardOrdinals(type: NoteKind, front: string): number[] {
  return type === 'cloze' ? clozeOrdinals(front).map(x => x - 1) : type === 'reversed' ? [0, 1] : [0];
}
export function renderCloze(text: string, ordinal: number, reveal: boolean): string {
  return text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/g, (_m, n, answer, hint) => {
    const active = Number(n) === ordinal + 1;
    return !active || reveal ? answer : `[${hint || '…'}]`;
  });
}
export function renderCard(note: Pick<Note, 'front'|'back'|'type'>, ordinal: number, back: boolean) {
  if (note.type === 'cloze') return {
    text: `${renderCloze(note.front, ordinal, back)}${back && note.back ? '\n\n' + note.back : ''}`,
    prompt: renderCloze(note.front, ordinal, false)
  };
  if (ordinal === 1 && note.type === 'reversed') return { text: back ? note.front : note.back, prompt: note.back };
  return { text: back ? note.back : note.front, prompt: note.front };
}
