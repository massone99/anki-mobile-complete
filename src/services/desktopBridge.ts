/**
 * Optional notes-only bridge to Anki Desktop via AnkiConnect.
 * NOT a substitute for AnkiWeb collection + revlog + media sync.
 * This only adds missing notes on desktop and can ask desktop to sync its own collection.
 */
import { allDecks, allNotes, createDeck, addNote } from '../data/database';
import type { NoteKind } from '../core/types';

async function request<T>(base:string, action:string, params:Record<string,unknown>={}):Promise<T>{
  if(!/^https?:\/\//.test(base))throw new Error('Use an http(s) AnkiConnect URL');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(base.replace(/\/$/,''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:6,params}),signal:controller.signal});
    if(!response.ok)throw new Error(`AnkiConnect HTTP ${response.status}`);
    const body=await response.json();if(body.error)throw new Error(String(body.error));return body.result as T;
  }finally{clearTimeout(timeout);}
}
export async function testBridge(base:string){return request<number>(base,'version');}
export async function pushNotesToDesktop(base:string){
  const decks=await allDecks(), notes=await allNotes();
  const names=new Map(decks.map(d=>[d.id,d.name]));let created=0, skipped=0, failed=0;
  for(const name of new Set(decks.map(d=>d.name)))await request(base,'createDeck',{deck:name});
  const batch=40;
  for(let i=0;i<notes.length;i+=batch){
    const part=notes.slice(i,i+batch);
    const requests=part.map(n=>({deckName:names.get(n.deckId)||'Default',modelName:n.type==='cloze'?'Cloze':n.type==='reversed'?'Basic (and reversed card)':'Basic',fields:n.type==='cloze'?{Text:n.front,Extra:n.back}:{Front:n.front,Back:n.back},tags:n.tags,options:{allowDuplicate:false,duplicateScope:'deck'}}));
    try{
      const result=await request<Array<number|null>>(base,'addNotes',{notes:requests});
      result.forEach(id=>id?created++:skipped++);
    }catch {failed+=part.length;}
  }
  return {created,skipped,failed};
}
export async function pullNotesFromDesktop(base:string){
  const ids=await request<number[]>(base,'findNotes',{query:''});
  if(ids.length>50000)throw new Error('Bridge pull capped at 50,000 notes.');
  const existing=await allNotes(), keys=new Set(existing.map(n=>`${n.deckId}|${n.front.trim().toLowerCase()}`));
  let created=0,skipped=0;
  for(let i=0;i<ids.length;i+=80){
    const chunk=await request<any[]>(base,'notesInfo',{notes:ids.slice(i,i+80)});
    const firstCardIds=chunk.map((n:any)=>n.cards?.[0]).filter((id:any)=>typeof id==='number');
    const cardInfo=firstCardIds.length?await request<any[]>(base,'cardsInfo',{cards:firstCardIds}):[];
    const byCard=new Map(cardInfo.map((c:any)=>[c.cardId,c.deckName]));
    for(const n of chunk){
      const name=String(n.modelName||'Basic');
      const type:NoteKind=name.toLowerCase().includes('cloze')?'cloze':name.toLowerCase().includes('reversed')?'reversed':'basic';
      const d=await createDeck(String(byCard.get(n.cards?.[0])||n.deckName||'Imported from desktop'));
      const f=n.fields||{};const front=String(type==='cloze'?(f.Text?.value||''):(f.Front?.value||''));
      const back=String(type==='cloze'?(f.Extra?.value||''):(f.Back?.value||''));
      if(!front||keys.has(`${d.id}|${front.trim().toLowerCase()}`)){skipped++;continue;}
      try{await addNote(d.id,type,front,back,Array.isArray(n.tags)?n.tags:[],String(n.noteId));keys.add(`${d.id}|${front.trim().toLowerCase()}`);created++;}catch{skipped++;}
    }
  }
  return {created,skipped};
}
export async function syncDesktopToAnkiWeb(base:string){await request(base,'sync');}
