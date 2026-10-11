import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { Deck, DeckSummary, FlashCard, Note, NoteKind, Overview, Rating, ReviewLog, Settings, StudyCard } from '../core/types';
import { DEFAULT_SETTINGS, epochDay, uid } from '../core/types';
import { cardOrdinals } from '../core/cards';
import { schedule } from '../core/scheduler';
import type { SpeedFilter, SpeedSession } from '../core/speed';
let database: SQLite.SQLiteDatabase | null = null;
// expo-sqlite web has no exclusive transactions; its single connection is serialized anyway, so a plain transaction on it is equivalent.
const inTx = (conn: SQLite.SQLiteDatabase, task: (tx: SQLite.SQLiteDatabase) => Promise<void>) =>
  Platform.OS === 'web' ? conn.withTransactionAsync(() => task(conn)) : conn.withExclusiveTransactionAsync(task as any);
// On web the database file is locked by one tab at a time (OPFS), and a failed open leaves the sqlite worker unusable.
// Take a lifetime Web Lock first: a second tab waits here and opens the DB as soon as the first tab closes.
async function waitForTabLock() {
  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
  if (!locks?.request) return;
  await new Promise<void>(resolve => { locks.request('recall-db', () => { resolve(); return new Promise(() => {}); }); });
}
export async function db() {
  if (database) return database;
  // expo-sqlite on web needs OPFS, which browsers only expose on https:// or localhost; otherwise opening hangs forever.
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.isSecureContext === false) {
    throw new Error('The browser blocks the database on this address (' + window.location.origin + '). Open the app at http://localhost:8081 or over https, or use Expo Go on a phone.');
  }
  await waitForTabLock();
  const conn = await SQLite.openDatabaseAsync('recall-v1.db');
  await conn.execAsync(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
      parent_id TEXT, new_limit INTEGER, review_limit INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, guid TEXT NOT NULL UNIQUE, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      type TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, source_id TEXT
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'new', due INTEGER NOT NULL, interval REAL NOT NULL DEFAULT 0,
      ease REAL NOT NULL DEFAULT 2.5, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
      suspended INTEGER NOT NULL DEFAULT 0, buried_until INTEGER, fsrs TEXT, updated_at INTEGER NOT NULL,
      source_id TEXT, UNIQUE(note_id,ordinal)
    );
    CREATE TABLE IF NOT EXISTS review_logs (
      id TEXT PRIMARY KEY, card_id TEXT NOT NULL, deck_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
      rating INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, prev_state TEXT NOT NULL,
      next_state TEXT NOT NULL, scheduled_days REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS speed_sessions (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS cards_due_idx ON cards(deck_id, suspended, state, due);
    CREATE INDEX IF NOT EXISTS notes_deck_idx ON notes(deck_id);
    CREATE INDEX IF NOT EXISTS logs_time_idx ON review_logs(timestamp);
  `);
  const existing = await conn.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM decks');
  if (existing?.n === 0) {
    const now = Date.now();
    await conn.runAsync('INSERT INTO decks(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)', uid(), 'Default', 'Your first flashcard deck', now, now);
  }
  database = conn;
  return conn;
}
const decodeDeck = (r: any): Deck => ({ id: r.id, name: r.name, description: r.description, parentId: r.parent_id, newLimit: r.new_limit, reviewLimit: r.review_limit, createdAt: r.created_at, updatedAt: r.updated_at });
const decodeNote = (r: any): Note => ({ id: r.id, guid: r.guid, deckId: r.deck_id, type: r.type, front: r.front, back: r.back, tags: JSON.parse(r.tags || '[]'), createdAt: r.created_at, updatedAt: r.updated_at, sourceId: r.source_id });
const decodeCard = (r: any): FlashCard => ({ id: r.id, noteId: r.note_id, deckId: r.deck_id, ordinal: r.ordinal, state: r.state, due: r.due, interval: r.interval, ease: r.ease, reps: r.reps, lapses: r.lapses, suspended: !!r.suspended, buriedUntil: r.buried_until, fsrs: r.fsrs, updatedAt: r.updated_at, sourceId: r.source_id });
export async function getSettings(): Promise<Settings> {
  const r = await (await db()).getFirstAsync<{value: string}>("SELECT value FROM preferences WHERE key='settings'");
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(r?.value || '{}') }; } catch { return DEFAULT_SETTINGS; }
}
export async function saveSettings(settings: Settings) { await (await db()).runAsync("INSERT INTO preferences(key,value) VALUES('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(settings)); }
export async function allDecks(): Promise<Deck[]> { return (await (await db()).getAllAsync<any>('SELECT * FROM decks ORDER BY name COLLATE NOCASE')).map(decodeDeck); }
export async function createDeck(name: string, description = ''): Promise<Deck> {
  const trimmed = name.trim().replace(/^:+|:+$/g, '');
  if (!trimmed) throw new Error('Enter a deck name.');
  const parentName = trimmed.includes('::') ? trimmed.split('::').slice(0, -1).join('::') : null;
  const existing = (await allDecks()).find(x => x.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  let parentId: string | null = null;
  if (parentName) parentId = (await createDeck(parentName)).id;
  const now = Date.now(), d: Deck = { id: uid(), name: trimmed, description, parentId, newLimit: null, reviewLimit: null, createdAt: now, updatedAt: now };
  await (await db()).runAsync('INSERT INTO decks(id,name,description,parent_id,new_limit,review_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', d.id,d.name,d.description,d.parentId,d.newLimit,d.reviewLimit,d.createdAt,d.updatedAt);
  return d;
}
export async function updateDeck(id: string, patch: Partial<Pick<Deck,'description'|'newLimit'|'reviewLimit'>>) {
  const conn = await db();
  const d = await conn.getFirstAsync<any>('SELECT * FROM decks WHERE id=?',id);
  if (!d) throw new Error('Deck not found');
  await conn.runAsync('UPDATE decks SET description=?,new_limit=?,review_limit=?,updated_at=? WHERE id=?', patch.description ?? d.description, patch.newLimit === undefined ? d.new_limit : patch.newLimit, patch.reviewLimit === undefined ? d.review_limit : patch.reviewLimit, Date.now(), id);
}
export async function deleteDeck(id: string) {
  const deck = (await allDecks()).find(d => d.id === id);
  if (!deck) return;
  const ids = (await allDecks()).filter(d => d.id === id || d.name.startsWith(deck.name + '::')).map(d=>d.id);
  await inTx((await db()),async tx => { for (const d of ids) await tx.runAsync('DELETE FROM decks WHERE id=?',d); });
}
export async function addNote(deckId: string, type: NoteKind, front: string, back: string, tags: string[] = [], sourceId?: string, sourceGuid?: string) {
  const ordinals = cardOrdinals(type, front);
  if (!ordinals.length) throw new Error('Cloze notes require at least one {{c1::answer}} deletion.');
  if (!front.trim()) throw new Error('Front field cannot be blank.');
  if (!(await (await db()).getFirstAsync('SELECT 1 FROM decks WHERE id=?',deckId))) throw new Error('Deck not found');
  const now = Date.now();
  const note: Note = {id: uid(), guid: sourceGuid || uid().replace('-',''),deckId,type,front,back,tags,createdAt:now,updatedAt:now,sourceId};
  await inTx((await db()),async tx => {
    await tx.runAsync('INSERT INTO notes(id,guid,deck_id,type,front,back,tags,created_at,updated_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,?)',note.id,note.guid,deckId,type,front,back,JSON.stringify(tags),now,now,sourceId || null);
    for (const ordinal of ordinals) await tx.runAsync('INSERT INTO cards(id,note_id,deck_id,ordinal,state,due,updated_at) VALUES(?,?,?,?,?,?,?)',uid(),note.id,deckId,ordinal,'new',now,now);
  });
  return note;
}
export async function updateNote(noteId: string, patch: Pick<Note,'front'|'back'|'tags'|'type'|'deckId'>) {
  const conn = await db();
  const existing = await conn.getFirstAsync<any>('SELECT * FROM notes WHERE id=?',noteId);
  if (!existing) throw new Error('Note not found');
  const ordinals = cardOrdinals(patch.type,patch.front);
  if (!ordinals.length) throw new Error('Cloze needs {{c1::...}}');
  await inTx(conn,async tx => {
    await tx.runAsync('UPDATE notes SET front=?,back=?,tags=?,type=?,deck_id=?,updated_at=? WHERE id=?',patch.front,patch.back,JSON.stringify(patch.tags),patch.type,patch.deckId,Date.now(),noteId);
    const cards = await tx.getAllAsync<any>('SELECT * FROM cards WHERE note_id=?',noteId);
    for (const c of cards) {
      if (!ordinals.includes(c.ordinal)) await tx.runAsync('DELETE FROM cards WHERE id=?',c.id);
      else if (c.deck_id !== patch.deckId) await tx.runAsync('UPDATE cards SET deck_id=? WHERE id=?',patch.deckId,c.id);
    }
    for (const ordinal of ordinals) if (!cards.some(c=>c.ordinal===ordinal)) await tx.runAsync('INSERT INTO cards(id,note_id,deck_id,ordinal,state,due,updated_at) VALUES(?,?,?,?,?,?,?)',uid(),noteId,patch.deckId,ordinal,'new',Date.now(),Date.now());
  });
}
export async function removeNote(id: string) { await (await db()).runAsync('DELETE FROM notes WHERE id=?',id); }
export async function listNotes(filter = '', deckId?: string, limit = 500): Promise<(Note & { cards: number; suspended: number })[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<any>(`SELECT n.*,COUNT(c.id) cards, SUM(c.suspended) suspended FROM notes n LEFT JOIN cards c ON c.note_id=n.id
     WHERE (? = '' OR n.front LIKE ? OR n.back LIKE ? OR n.tags LIKE ?) AND (? IS NULL OR n.deck_id=?)
     GROUP BY n.id ORDER BY n.updated_at DESC LIMIT ?`,filter,`%${filter}%`,`%${filter}%`,`%${filter}%`,deckId||null,deckId||null,limit);
  return rows.map(r=>({...decodeNote(r),cards:r.cards,suspended:r.suspended||0}));
}
export async function setNoteSuspended(id:string, suspended:boolean) { await (await db()).runAsync('UPDATE cards SET suspended=? WHERE note_id=?', suspended?1:0,id); }
export async function suspendCard(id:string, suspended:boolean) { await (await db()).runAsync('UPDATE cards SET suspended=? WHERE id=?',suspended?1:0,id); }
export async function buryCard(id:string, settings: Settings) {
  const tomorrow = (epochDay(Date.now(),settings.dayStartHour)+1)*86400000+settings.dayStartHour*3600000;
  await (await db()).runAsync('UPDATE cards SET buried_until=? WHERE id=?',tomorrow,id);
}
export async function overview(settings:Settings): Promise<Overview> {
  const conn = await db(), now = Date.now();
  const start = epochDay(now,settings.dayStartHour)*86400000+settings.dayStartHour*3600000;
  const decks = await allDecks();
  const rows = await conn.getAllAsync<any>(`SELECT d.id,
    COUNT(c.id) total,
    SUM(CASE WHEN c.state='new' AND c.suspended=0 THEN 1 ELSE 0 END) new_count,
    SUM(CASE WHEN c.state IN ('learning','relearning') AND c.due<=? AND c.suspended=0 AND (c.buried_until IS NULL OR c.buried_until<=?) THEN 1 ELSE 0 END) learning_count,
    SUM(CASE WHEN c.state='review' AND c.due<=? AND c.suspended=0 AND (c.buried_until IS NULL OR c.buried_until<=?) THEN 1 ELSE 0 END) review_count,
    SUM(CASE WHEN c.suspended=1 THEN 1 ELSE 0 END) suspended_count
    FROM decks d LEFT JOIN cards c ON c.deck_id=d.id GROUP BY d.id`,now,now,now,now);
  const map = new Map(rows.map(r=>[r.id,r]));
  const summarized:DeckSummary[] = decks.map(d=> { const r:any = map.get(d.id)||{}; return {...d,total:r.total||0,newCount:r.new_count||0,learningCount:r.learning_count||0,reviewCount:r.review_count||0,suspendedCount:r.suspended_count||0}; });
  const day = await conn.getFirstAsync<any>('SELECT COUNT(*) count,COALESCE(SUM(elapsed_ms),0) ms FROM review_logs WHERE timestamp >= ?',start);
  const count = await conn.getFirstAsync<any>('SELECT COUNT(*) cards,COUNT(DISTINCT note_id) notes FROM cards');
  const days = await conn.getAllAsync<any>(`SELECT DISTINCT CAST((timestamp - ?)/86400000 AS INTEGER) day FROM review_logs ORDER BY day DESC`, settings.dayStartHour * 3600000);
  const today = epochDay(now,settings.dayStartHour); let streak = 0;
  const set = new Set(days.map(x=>x.day));
  for(let d=today;d>=today-10000;d--) { if(set.has(d)) streak++; else if(d!==today) break; }
  return {decks:summarized, todayReviewed:day?.count||0,todayTimeMs:day?.ms||0,totalNotes:count?.notes||0,totalCards:count?.cards||0,dueNow:summarized.reduce((a,d)=>a+d.learningCount+d.reviewCount+Math.min(d.newCount,d.newLimit??settings.newPerDay),0),studiedDays:days.length,daysStreak:streak};
}
export async function dueCards(deckId: string|null, settings:Settings, limit=500):Promise<StudyCard[]> {
  const conn=await db(), now=Date.now(), decks=await allDecks();
  const selected = deckId ? decks.find(d=>d.id===deckId) : null;
  const ids = selected ? decks.filter(d=>d.id===selected.id||d.name.startsWith(selected.name+'::')).map(d=>d.id):decks.map(d=>d.id);
  if(!ids.length)return [];
  const qs=ids.map(()=>'?').join(',');
  const rows = await conn.getAllAsync<any>(`SELECT c.*, n.front,n.back,n.type,n.tags,d.name deck_name
    FROM cards c JOIN notes n ON n.id=c.note_id JOIN decks d ON d.id=c.deck_id
    WHERE c.deck_id IN (${qs}) AND c.suspended=0 AND (c.buried_until IS NULL OR c.buried_until<=?)
    AND (c.state='new' OR (c.state IN ('learning','relearning') AND c.due<=?) OR (c.state='review' AND c.due<=?))
    ORDER BY CASE c.state WHEN 'relearning' THEN 0 WHEN 'learning' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,c.due
    LIMIT ?`,...ids,now,now+settings.learnAheadMinutes*60000,now,Math.max(limit,200));
  const dayStart = epochDay(now,settings.dayStartHour)*86400000+settings.dayStartHour*3600000;
  const rated = await conn.getAllAsync<any>('SELECT c.deck_id, r.prev_state, COUNT(*) n FROM review_logs r JOIN cards c ON c.id=r.card_id WHERE r.timestamp>=? GROUP BY c.deck_id, r.prev_state',dayStart);
  const used = new Map<string,{new:number; review:number}>();
  for(const r of rated){ const x=used.get(r.deck_id)||{new:0,review:0}; if(r.prev_state==='new')x.new+=r.n;else x.review+=r.n;used.set(r.deck_id,x); }
  const budgets = new Map(decks.map(d=>[d.id,{new:Math.max(0,(d.newLimit??settings.newPerDay)-(used.get(d.id)?.new||0)),review:Math.max(0,(d.reviewLimit??settings.reviewsPerDay)-(used.get(d.id)?.review||0))}]));
  const seen=new Set<string>(), out:StudyCard[]=[];
  for(const r of rows){
    const budget=budgets.get(r.deck_id)!;
    if(r.state==='new'){if(budget.new<1)continue;budget.new--;}
    else if(r.state==='review'){if(budget.review<1)continue;budget.review--;}
    if(seen.has(r.id))continue;seen.add(r.id);
    out.push({...decodeCard(r),front:r.front,back:r.back,noteType:r.type,tags:JSON.parse(r.tags||'[]'),deckName:r.deck_name});
    if(out.length>=limit)break;
  }
  return out;
}
export async function getCard(id:string):Promise<StudyCard|null>{
  const r=await (await db()).getFirstAsync<any>(`SELECT c.*,n.front,n.back,n.type,n.tags,d.name deck_name FROM cards c JOIN notes n ON n.id=c.note_id JOIN decks d ON d.id=c.deck_id WHERE c.id=?`,id);
  return r?{...decodeCard(r),front:r.front,back:r.back,noteType:r.type,tags:JSON.parse(r.tags||'[]'),deckName:r.deck_name}:null;
}
export async function answerCard(card:FlashCard,rating:Rating,elapsedMs:number,settings:Settings) {
  const next=schedule(card,rating,Date.now(),settings),conn=await db();
  const log:ReviewLog={id:uid(),cardId:card.id,deckId:card.deckId,timestamp:Date.now(),rating,elapsedMs,prevState:card.state,nextState:next.state,scheduledDays:next.interval};
  await inTx(conn,async tx=>{
    await tx.runAsync(`UPDATE cards SET state=?,due=?,interval=?,ease=?,reps=?,lapses=?,fsrs=?,updated_at=? WHERE id=?`,next.state,next.due,next.interval,next.ease,next.reps,next.lapses,next.fsrs,next.updatedAt,next.id);
    await tx.runAsync('INSERT INTO review_logs(id,card_id,deck_id,timestamp,rating,elapsed_ms,prev_state,next_state,scheduled_days) VALUES(?,?,?,?,?,?,?,?,?)',log.id,log.cardId,log.deckId,log.timestamp,log.rating,log.elapsedMs,log.prevState,log.nextState,log.scheduledDays);
  });
  return {before:card,after:next,logId:log.id};
}
export async function undoAnswer(before:FlashCard,logId:string) {
  const conn=await db();
  await inTx(conn,async tx=>{
    await tx.runAsync(`UPDATE cards SET state=?,due=?,interval=?,ease=?,reps=?,lapses=?,fsrs=?,updated_at=? WHERE id=?`,before.state,before.due,before.interval,before.ease,before.reps,before.lapses,before.fsrs,before.updatedAt,before.id);
    await tx.runAsync('DELETE FROM review_logs WHERE id=?',logId);
  });
}
export async function reviewHistory(days=30) {
  const c=await db();
  return c.getAllAsync<{day:number;reviews:number;again:number;totalMs:number}>(`SELECT CAST((timestamp-?)/86400000 AS INTEGER) day,
    COUNT(*) reviews,SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) again,SUM(elapsed_ms) totalMs
    FROM review_logs WHERE timestamp>=? GROUP BY day ORDER BY day`,(await getSettings()).dayStartHour*3600000,Date.now()-days*86400000);
}
/** Search *cards*, not notes: Reversed and multi-cloze notes produce independently selectable questions.
 * This bypasses due limits deliberately but never schedules/reviews the selected cards. */
export async function speedCandidates(filter: {deckId: string|null; search: string; tags: string[]; state: SpeedFilter; includeSuspended: boolean}, limit=500): Promise<{cards:StudyCard[];truncated:boolean}> {
  const conn = await db(), now = Date.now();
  const decks = await allDecks();
  const parent = decks.find(x=>x.id===filter.deckId);
  const ids = parent ? decks.filter(x=>x.id===parent.id||x.name.startsWith(parent.name+'::')).map(x=>x.id) : decks.map(x=>x.id);
  if (!ids.length) return {cards:[],truncated:false};
  const where:string[] = [`c.deck_id IN (${ids.map(()=>'?').join(',')})`];
  const args: (string|number)[] = [...ids];
  if (!filter.includeSuspended) where.push('c.suspended=0');
  if (filter.search.trim()) {where.push('(n.front LIKE ? OR n.back LIKE ? OR n.tags LIKE ?)');const q=`%${filter.search.trim()}%`; args.push(q,q,q);}
  for (const tag of filter.tags.map(t=>t.trim().toLowerCase()).filter(Boolean)) {
    where.push('EXISTS (SELECT 1 FROM json_each(n.tags) AS jt WHERE LOWER(jt.value)=?)');args.push(tag);
  }
  if (filter.state==='new') where.push("c.state='new'");
  else if(filter.state==='missed') where.push('c.lapses>0');
  else if(filter.state==='due') {where.push("c.state IN ('review','learning','relearning') AND c.due<=? AND (c.buried_until IS NULL OR c.buried_until<=?)");args.push(now,now);}
  const rows=await conn.getAllAsync<any>(`SELECT c.*,n.front,n.back,n.type,n.tags,d.name deck_name
    FROM cards c JOIN notes n ON n.id=c.note_id JOIN decks d ON d.id=c.deck_id
    WHERE ${where.join(' AND ')} ORDER BY n.updated_at DESC, c.ordinal ASC LIMIT ?`,...args,limit+1);
  return {cards:rows.slice(0,limit).map(r=>({...decodeCard(r),front:r.front,back:r.back,noteType:r.type,tags:JSON.parse(r.tags||'[]'),deckName:r.deck_name})),truncated:rows.length>limit};
}
export async function getSpeedCards(ids:string[]):Promise<StudyCard[]> {
  if(!ids.length)return [];
  const conn=await db();const results:StudyCard[]=[];
  // Avoid SQLite's variable limit and keep the requested order.
  for(let i=0;i<ids.length;i+=200){
    const part=ids.slice(i,i+200);
    const rows=await conn.getAllAsync<any>(`SELECT c.*,n.front,n.back,n.type,n.tags,d.name deck_name FROM cards c JOIN notes n ON n.id=c.note_id JOIN decks d ON d.id=c.deck_id WHERE c.id IN (${part.map(()=>'?').join(',')})`,...part);
    results.push(...rows.map(r=>({...decodeCard(r),front:r.front,back:r.back,noteType:r.type,tags:JSON.parse(r.tags||'[]'),deckName:r.deck_name})));
  }
  const order=new Map(ids.map((id,i)=>[id,i]));
  return results.sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0));
}
export async function loadSpeedSession(): Promise<SpeedSession|null> {
  const r=await (await db()).getFirstAsync<{payload:string}>('SELECT payload FROM speed_sessions WHERE active=1 ORDER BY updated_at DESC LIMIT 1');
  if(!r)return null;
  try {const data=JSON.parse(r.payload) as SpeedSession;return Array.isArray(data.queue)&&Array.isArray(data.selectedIds)?data:null;}catch{return null;}
}
export async function saveSpeedSession(session:SpeedSession) {
  const conn=await db();
  await inTx(conn,async tx=>{
    await tx.runAsync('UPDATE speed_sessions SET active=0 WHERE active=1 AND id!=?',session.id);
    await tx.runAsync('INSERT INTO speed_sessions(id,active,updated_at,payload) VALUES(?,1,?,?) ON CONFLICT(id) DO UPDATE SET active=1,updated_at=excluded.updated_at,payload=excluded.payload',session.id,session.updatedAt,JSON.stringify(session));
  });
}
export async function archiveSpeedSession(id:string) {await (await db()).runAsync('UPDATE speed_sessions SET active=0 WHERE id=?',id);}
export type SavedSpeedSession = {id:string;active:number;updatedAt:number;payload:string};
export async function allSpeedSessions():Promise<SavedSpeedSession[]> {
  const rows=await (await db()).getAllAsync<any>('SELECT id,active,updated_at,payload FROM speed_sessions ORDER BY updated_at DESC LIMIT 100');
  return rows.map(r=>({id:r.id,active:r.active,updatedAt:r.updated_at,payload:r.payload}));
}
export async function allNotes(): Promise<Note[]> { return (await (await db()).getAllAsync<any>('SELECT * FROM notes')).map(decodeNote); }
export async function allCards(): Promise<FlashCard[]> { return (await (await db()).getAllAsync<any>('SELECT * FROM cards')).map(decodeCard); }
export async function allLogs(): Promise<ReviewLog[]> { return (await (await db()).getAllAsync<any>('SELECT * FROM review_logs')).map(r=>({id:r.id,cardId:r.card_id,deckId:r.deck_id,timestamp:r.timestamp,rating:r.rating,elapsedMs:r.elapsed_ms,prevState:r.prev_state,nextState:r.next_state,scheduledDays:r.scheduled_days})); }
export type Backup = {format:'recall-backup';version:1;exportedAt:number;decks:Deck[];notes:Note[];cards:FlashCard[];logs:ReviewLog[];settings:Settings;speedSessions?:SavedSpeedSession[]};
export async function backup(): Promise<Backup> { return {format:'recall-backup',version:1,exportedAt:Date.now(),decks:await allDecks(),notes:await allNotes(),cards:await allCards(),logs:await allLogs(),settings:await getSettings(),speedSessions:await allSpeedSessions()}; }
export async function restore(data:Backup,replace=false){
  if(data.format!=='recall-backup'||data.version!==1||!Array.isArray(data.notes)||!Array.isArray(data.cards))throw new Error('Unsupported backup version');
  const conn=await db();
  await inTx(conn,async tx=>{
    if(replace){await tx.execAsync('DELETE FROM review_logs;DELETE FROM speed_sessions;DELETE FROM decks;');}
    for(const d of data.decks)await tx.runAsync('INSERT INTO decks(id,name,description,parent_id,new_limit,review_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,parent_id=excluded.parent_id,new_limit=excluded.new_limit,review_limit=excluded.review_limit,updated_at=excluded.updated_at',d.id,d.name,d.description,d.parentId,d.newLimit,d.reviewLimit,d.createdAt,d.updatedAt);
    for(const n of data.notes)await tx.runAsync('INSERT INTO notes(id,guid,deck_id,type,front,back,tags,created_at,updated_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET guid=excluded.guid,deck_id=excluded.deck_id,type=excluded.type,front=excluded.front,back=excluded.back,tags=excluded.tags,updated_at=excluded.updated_at,source_id=excluded.source_id',n.id,n.guid,n.deckId,n.type,n.front,n.back,JSON.stringify(n.tags),n.createdAt,n.updatedAt,n.sourceId||null);
    for(const c of data.cards)await tx.runAsync('INSERT INTO cards(id,note_id,deck_id,ordinal,state,due,interval,ease,reps,lapses,suspended,buried_until,fsrs,updated_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET note_id=excluded.note_id,deck_id=excluded.deck_id,ordinal=excluded.ordinal,state=excluded.state,due=excluded.due,interval=excluded.interval,ease=excluded.ease,reps=excluded.reps,lapses=excluded.lapses,suspended=excluded.suspended,buried_until=excluded.buried_until,fsrs=excluded.fsrs,updated_at=excluded.updated_at,source_id=excluded.source_id',c.id,c.noteId,c.deckId,c.ordinal,c.state,c.due,c.interval,c.ease,c.reps,c.lapses,c.suspended?1:0,c.buriedUntil,c.fsrs,c.updatedAt,c.sourceId||null);
    for(const l of data.logs)await tx.runAsync('INSERT OR REPLACE INTO review_logs(id,card_id,deck_id,timestamp,rating,elapsed_ms,prev_state,next_state,scheduled_days) VALUES(?,?,?,?,?,?,?,?,?)',l.id,l.cardId,l.deckId,l.timestamp,l.rating,l.elapsedMs,l.prevState,l.nextState,l.scheduledDays);
    for(const session of data.speedSessions||[]) await tx.runAsync('INSERT OR REPLACE INTO speed_sessions(id,active,updated_at,payload) VALUES(?,?,?,?)',session.id,session.active,session.updatedAt,session.payload);
  });
  if(replace) await saveSettings(data.settings);
}
