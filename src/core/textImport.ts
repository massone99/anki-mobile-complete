import type { NoteKind } from './types';

export type TextRow = { guid?: string; front: string; back: string; tags: string[]; deck?: string; type: NoteKind };

const SEPARATORS: Record<string, string> = { tab: '\t', semicolon: ';', comma: ',', space: ' ', pipe: '|', colon: ':' };

/** RFC-4180-style splitter; quoted fields may contain separators and newlines. */
export function parseDelimited(input: string, separator: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const endRow = () => { row.push(field.replace(/\r$/, '')); if (row.some(v => v.trim())) out.push(row); row = []; field = ''; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"' && input[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"' && field === '') quoted = true;
    else if (c === separator) { row.push(field); field = ''; }
    else if (c === '\n') endRow();
    else field += c;
  }
  if (field || row.length) endRow();
  return out;
}

export function noteKindFromName(name: string): NoteKind {
  const n = name.trim().toLowerCase();
  if (n.includes('cloze')) return 'cloze';
  if (n.includes('revers') || n.includes('both directions')) return 'reversed';
  return 'basic';
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');

/**
 * Parse Anki "Notes in Plain Text" exports (and plain CSV/TSV/TXT).
 * Honours the header directives Anki writes: #separator, #html, #guid column, #notetype column,
 * #deck column, #tags column and #columns (1-based column numbers).
 */
export function parseAnkiText(raw: string, filename = ''): TextRow[] {
  const text = raw.replace(/^﻿/, '');
  const lines = text.split('\n');
  const directives: Record<string, string> = {};
  let bodyStart = 0;
  while (bodyStart < lines.length && lines[bodyStart].startsWith('#')) {
    const m = /^#([^:]+):(.*)$/.exec(lines[bodyStart].replace(/\r$/, ''));
    if (m) directives[m[1].trim().toLowerCase()] = m[2].trim();
    bodyStart++;
  }
  const sepName = (directives['separator'] || '').toLowerCase();
  const separator = SEPARATORS[sepName] ?? (sepName.length === 1 ? sepName : filename.toLowerCase().endsWith('.csv') ? ',' : '\t');
  const html = (directives['html'] || 'true').toLowerCase() !== 'false';
  const col = (key: string) => { const n = parseInt(directives[key], 10); return n > 0 ? n - 1 : -1; };
  const guidCol = col('guid column'), typeCol = col('notetype column'), deckCol = col('deck column'), tagsCol = col('tags column');

  const rows = parseDelimited(lines.slice(bodyStart).join('\n'), separator);
  if (rows.length > 25000) throw new Error('Text import is limited to 25,000 rows per batch.');

  // Legacy Recall/CSV layout: a Front/Back header row names the columns.
  const first = rows[0]?.map(x => x.toLowerCase().trim());
  const named = !!first && first.includes('front') && first.includes('back') && guidCol < 0 && typeCol < 0 && deckCol < 0 && tagsCol < 0;
  const idx = (n: string, fallback: number) => (named ? first!.indexOf(n) : fallback);
  const fix = (s: string) => (html ? s : escapeHtml(s));

  const special = new Set([guidCol, typeCol, deckCol, tagsCol].filter(i => i >= 0));
  const out: TextRow[] = [];
  for (const row of rows.slice(named ? 1 : 0)) {
    let front: string, back: string, tags = '', deck = '', type = '', guid = '';
    if (named) {
      const g = (n: string, f: number) => { const i = idx(n, f); return i >= 0 ? row[i] || '' : ''; };
      front = g('front', 0); back = g('back', 1); tags = g('tags', 2); deck = g('deck', 3); type = g('type', 4); guid = g('guid', -1);
    } else if (special.size) {
      const fields = row.filter((_, i) => !special.has(i));
      front = fields[0] || ''; back = fields.slice(1).join('<br>');
      guid = guidCol >= 0 ? row[guidCol] || '' : ''; type = typeCol >= 0 ? row[typeCol] || '' : '';
      deck = deckCol >= 0 ? row[deckCol] || '' : ''; tags = tagsCol >= 0 ? row[tagsCol] || '' : '';
    } else {
      front = row[0] || ''; back = row.slice(1, 2).join(''); tags = row[2] || ''; deck = row[3] || ''; type = row[4] || '';
      if (row.length > 5) back = [back, ...row.slice(5)].join('<br>');
    }
    out.push({
      guid: guid.trim() || undefined,
      front: fix(front), back: fix(back),
      tags: tags.split(/[,\s]+/).filter(Boolean),
      deck: deck.trim() || undefined,
      type: noteKindFromName(type || (/\{\{c\d+::/.test(front) ? 'cloze' : 'basic')),
    });
  }
  return out;
}
