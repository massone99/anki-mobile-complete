import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import JSZip from 'jszip';
import { db, addNote, allCards, allDecks, allNotes, allLogs, backup, createDeck, restore } from '../data/database';
import type { Backup } from '../data/database';
import { plainText, type NoteKind } from '../core/types';
import { ankiChecksum } from '../core/checksum';
import { parseAnkiText } from '../core/textImport';

const safeName = (s:string) => s.replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);
const mime = (path:string)=>path.endsWith('.apkg')?'application/zip':path.endsWith('.json')?'application/json':'text/plain';
async function shareData(name:string, data:string|Uint8Array){
  const file = new File(Paths.cache, name);
  if(file.exists) file.delete();
  file.create(); await file.write(data);
  await Sharing.shareAsync(file.uri,{mimeType:mime(name),dialogTitle:'Export flashcards'});
  return file.uri;
}
export async function exportBackup() { return shareData(`recall-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(await backup(),null,2)); }
function csvCell(value:string) { return /[\t\n\r"]/g.test(value) ? `"${value.replace(/"/g,'""')}"` : value; }
export async function exportTSV(deckId?:string) {
  const decks=await allDecks();let notes=await allNotes();
  if(deckId){const target=decks.find(d=>d.id===deckId);notes=notes.filter(n=>decks.some(d=>d.id===n.deckId && (d.id===deckId||d.name.startsWith((target?.name||'')+'::'))));}
  const lines=['#separator:tab','#html:true','#columns:Front\tBack\tTags\tDeck\tType'];
  for(const n of notes)lines.push([n.front,n.back,n.tags.join(' '),decks.find(d=>d.id===n.deckId)?.name||'Default',n.type].map(csvCell).join('\t'));
  return shareData(`recall-export-${Date.now()}.txt`,lines.join('\n'));
}
export async function importText(raw:string,filename:string,defaultDeckId:string) {
  const rows=parseAnkiText(raw,filename);
  let imported=0,skipped=0,firstError:string|undefined;
  for(const row of rows){
    try{
      if(!row.front.trim()){skipped++;continue;}
      if(row.guid&&await (await db()).getFirstAsync('SELECT 1 FROM notes WHERE guid=?',row.guid)){skipped++;continue;}
      const d=row.deck?await createDeck(row.deck):{id:defaultDeckId};
      await addNote(d.id,row.type,row.front,row.back,row.tags,undefined,row.guid);imported++;
    }catch(e){skipped++;firstError??=e instanceof Error?e.message:String(e);}
  }
  return {imported,skipped,firstError};
}
const second = (value:any)=>Number(value||0)*1000;
const toSqliteId=(v:string)=> {const n=Number(v.replace(/\D/g,'').slice(0,15));return Number.isSafeInteger(n)&&n>0?n:Date.now()*100+Math.floor(Math.random()*100);};
const fields = (names:string[])=>names.map((name,ord)=>({name,ord,sticky:false,rtl:false,font:'Arial',size:20,media:[]}));
const tmpl = (name:string,ord:number,qfmt:string,afmt:string)=>({name,ord,qfmt,afmt,bqfmt:'',bafmt:'',did:null,bfont:'Arial',bsize:12});
const model = (id:number,name:string,type:number,fieldsList:string[],templates:any[])=>({id,name,type,mod:Math.floor(Date.now()/1000),usn:-1,sortf:0,css:'.card{font-family:Arial;font-size:20px;text-align:center;color:black;background-color:white}',latexPre:'',latexPost:'',req:[[0,'any',[0]]],flds:fields(fieldsList),tmpls:templates,vers:[],tags:[]});
const createModelMap=(base:number)=>({
  basic: model(base+3000000,'Recall Basic',0,['Front','Back'],[tmpl('Card 1',0,'{{Front}}','{{FrontSide}}<hr id=answer>{{Back}}')]),
  reversed: model(base+3000001,'Recall Basic (and reversed)',0,['Front','Back'],[tmpl('Card 1',0,'{{Front}}','{{FrontSide}}<hr id=answer>{{Back}}'),tmpl('Card 2',1,'{{Back}}','{{FrontSide}}<hr id=answer>{{Front}}')]),
  cloze: model(base+3000002,'Recall Cloze',1,['Text','Extra'],[tmpl('Cloze',0,'{{cloze:Text}}','{{cloze:Text}}<br>{{Extra}}')]),
});
/** Export an Anki legacy 2.1-compatible deck package, without lossless FSRS parameter/history semantics. */
export async function exportAPKG(deckId?:string){
  const decks=await allDecks(), notesAll=await allNotes(), cardsAll=await allCards(), logsAll=await allLogs();
  const root=decks.find(d=>d.id===deckId);
  const selected=deckId?decks.filter(d=>d.id===deckId||d.name.startsWith((root?.name||'')+'::')):decks;
  const set=new Set(selected.map(d=>d.id));
  const notes=notesAll.filter(n=>set.has(n.deckId));
  if(!notes.length)throw new Error('No cards to export.');
  const noteSet=new Set(notes.map(n=>n.id)), cards=cardsAll.filter(c=>noteSet.has(c.noteId));
  const dbName=`export-${Date.now()}.db`;const sql=await SQLite.openDatabaseAsync(dbName);
  const now=Math.floor(Date.now()/1000); const crt=Math.floor(now/86400)*86400;
  const base=Date.now();const modelMap=createModelMap(base);
  await sql.execAsync(`PRAGMA journal_mode=DELETE;
    CREATE TABLE col(id INTEGER PRIMARY KEY,crt INTEGER NOT NULL,mod INTEGER NOT NULL,scm INTEGER NOT NULL,ver INTEGER NOT NULL,dty INTEGER NOT NULL,usn INTEGER NOT NULL,ls INTEGER NOT NULL,conf TEXT NOT NULL,models TEXT NOT NULL,decks TEXT NOT NULL,dconf TEXT NOT NULL,tags TEXT NOT NULL);
    CREATE TABLE notes(id INTEGER PRIMARY KEY,guid TEXT NOT NULL,mid INTEGER NOT NULL,mod INTEGER NOT NULL,usn INTEGER NOT NULL,tags TEXT NOT NULL,flds TEXT NOT NULL,sfld TEXT NOT NULL,csum INTEGER NOT NULL,flags INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE TABLE cards(id INTEGER PRIMARY KEY,nid INTEGER NOT NULL,did INTEGER NOT NULL,ord INTEGER NOT NULL,mod INTEGER NOT NULL,usn INTEGER NOT NULL,type INTEGER NOT NULL,queue INTEGER NOT NULL,due INTEGER NOT NULL,ivl INTEGER NOT NULL,factor INTEGER NOT NULL,reps INTEGER NOT NULL,lapses INTEGER NOT NULL,left INTEGER NOT NULL,odue INTEGER NOT NULL,odid INTEGER NOT NULL,flags INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE TABLE revlog(id INTEGER PRIMARY KEY,cid INTEGER NOT NULL,usn INTEGER NOT NULL,ease INTEGER NOT NULL,ivl INTEGER NOT NULL,lastIvl INTEGER NOT NULL,factor INTEGER NOT NULL,time INTEGER NOT NULL,type INTEGER NOT NULL);
    CREATE TABLE graves(usn INTEGER NOT NULL,oid INTEGER NOT NULL,type INTEGER NOT NULL);
    CREATE INDEX ix_notes_usn ON notes(usn);CREATE INDEX ix_cards_usn ON cards(usn);
  `);
  const deckIds=new Map(selected.map((d,i)=>[d.id,base+100+i]));
  const ndids=Object.fromEntries(selected.map(d=>{
    const id=deckIds.get(d.id)!;
    return [String(id),{id,name:d.name,mod:now,usn:-1,desc:d.description,dyn:0,conf:1,extendNew:0,extendRev:0,collapsed:false,browserCollapsed:false,newToday:[0,0],revToday:[0,0],lrnToday:[0,0],timeToday:[0,0]}];
  }));
  const dconf={'1':{id:1,name:'Default',mod:now,usn:0,maxTaken:60,autoplay:true,timer:0,replayq:true,new:{perDay:20,delays:[1,10],ints:[1,4],initialFactor:2500,order:1,bury:true},rev:{perDay:200,ease4:1.3,ivlFct:1,maxIvl:36500,bury:true},lapse:{delays:[10],mult:0,minInt:1,leechFails:8,leechAction:0}}};
  const models=Object.fromEntries(Object.values(modelMap).map(m=>[String(m.id),m]));
  await sql.runAsync('INSERT INTO col VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',1,crt,Date.now(),Date.now(),11,0,0,0,JSON.stringify({nextPos:1,newSpread:0}),JSON.stringify(models),JSON.stringify(ndids),JSON.stringify(dconf),'{}');
  const noteIds=new Map<string,number>();
  for(const [i,n] of notes.entries()) {
    const id=base+i+1000000; noteIds.set(n.id,id);
    const fid=n.type==='cloze'?`${n.front}\x1f${n.back}`:`${n.front}\x1f${n.back}`;
    await sql.runAsync('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,n.guid,modelMap[n.type].id,Math.floor(n.updatedAt/1000),-1,` ${n.tags.join(' ')} `,fid,plainText(n.front),ankiChecksum(plainText(n.front)),0,'');
  }
  const cardIds=new Map<string,number>();
  for(const [i,c] of cards.entries()) {
    const cid=base+i+2000000;cardIds.set(c.id,cid);
    const queue=c.suspended?-1:c.state==='new'?0:c.state==='review'?2:1;
    const typ=c.state==='new'?0:c.state==='review'?2:1;
    const due=c.state==='new'?i:queue===2?Math.max(0,Math.floor((c.due-crt*1000)/86400000)):Math.floor(c.due/1000);
    await sql.runAsync('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',cid,noteIds.get(c.noteId),deckIds.get(c.deckId),c.ordinal,now,-1,typ,queue,due,Math.max(0,Math.round(c.interval)),2500,c.reps,c.lapses,0,0,0,0,'');
  }
  const exportedLogs=logsAll.filter(l=>cardIds.has(l.cardId)).sort((a,b)=>a.timestamp-b.timestamp);
  const logTimestamps=new Set<number>();
  for(const log of exportedLogs){
    let stamp=log.timestamp;while(logTimestamps.has(stamp))stamp++;logTimestamps.add(stamp);
    const kind=log.prevState==='new'?0:log.prevState==='relearning'?2:1;
    await sql.runAsync('INSERT INTO revlog VALUES(?,?,?,?,?,?,?,?,?)',stamp,cardIds.get(log.cardId),-1,log.rating,Math.round(log.scheduledDays),0,2500,Math.min(log.elapsedMs,60000),kind);
  }
  const bytes=await sql.serializeAsync(); await sql.closeAsync(); await SQLite.deleteDatabaseAsync(dbName);
  const zip=new JSZip();zip.file('collection.anki21',bytes);zip.file('meta',new Uint8Array([8,2]));
  const mediaNames=new Set<string>();for(const n of notes){for(const part of [n.front,n.back]){
    for(const m of part.matchAll(/<img[^>]+src=[\"']([^\"']+)[\"']/gi))mediaNames.add(m[1]);
    for(const m of part.matchAll(/\[sound:([^\]]+)\]/g))mediaNames.add(m[1]);
  }}
  const mediaMap:Record<string,string>={};let mediaIndex=0;
  for(const name of mediaNames){if(name.includes('..')||/[\\/]/.test(name))continue;
    const f=new File(Paths.document,'media',safeName(name));if(!f.exists)continue;
    const contents=await f.bytes();if(contents.length>10*1024*1024)continue;
    const key=String(mediaIndex++);zip.file(key,contents);mediaMap[key]=name;
  }
  zip.file('media',JSON.stringify(mediaMap));
  const fileData=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:4}});
  return shareData(`recall-${root?safeName(root.name):'all'}-${Date.now()}.apkg`,fileData);
}
/** Import the legacy SQLite collection. Modern .anki21b requires native Anki protobuf+zstd parser. */
export async function importAPKG(bytes:Uint8Array){
  if(bytes.byteLength>150*1024*1024)throw new Error('Package exceeds 150MB safety limit.');
  const zip=await JSZip.loadAsync(bytes);
  const archive=zip.file('collection.anki21')||zip.file('collection.anki2');
  if(zip.file('collection.anki21b'))throw new Error('Modern .anki21b packages are not yet supported. In Anki Desktop export again with “Support older Anki versions” enabled.');
  if(!archive)throw new Error('No supported SQLite collection found in this package.');
  const sqlBytes=await archive.async('uint8array');
  if(sqlBytes.byteLength>250*1024*1024)throw new Error('Uncompressed collection too large.');
  const sql=await SQLite.deserializeDatabaseAsync(sqlBytes);
  try {
    const col=await sql.getFirstAsync<any>('SELECT models,decks FROM col LIMIT 1');
    if(!col)throw new Error('Invalid or placeholder collection.');
    const models=JSON.parse(col.models||'{}'), deckDefs=JSON.parse(col.decks||'{}');
    const deckIds=new Map<string,string>();
    for(const [id,def] of Object.entries(deckDefs)) {
      const d=def as any;if(!d.name||d.dyn)continue;
      deckIds.set(id,(await createDeck(d.name,d.desc||'')).id);
    }
    let imported=0,skipped=0;
    const originals=await sql.getAllAsync<any>('SELECT id,guid,mid,flds,tags,mod FROM notes LIMIT 100001');
    if(originals.length>100000)throw new Error('Package exceeds 100,000 notes. Import smaller decks separately.');
    const cards=await sql.getAllAsync<any>('SELECT nid,did,ord FROM cards');
    const noteDeck=new Map(cards.map(c=>[String(c.nid),String(c.did)]));
    const known=new Set((await allNotes()).map(n=>n.guid));
    for(const n of originals){
      const mdl=models[String(n.mid)]; if(!mdl){skipped++;continue;}
      const values=String(n.flds).split('\x1f');const names=(mdl.flds||[]).map((f:any)=>String(f.name).toLowerCase());
      const f=(s:string, fallback:number)=>values[names.indexOf(s)>=0?names.indexOf(s):fallback]||'';
      const type:NoteKind=mdl.type===1?'cloze':(mdl.tmpls||[]).length>1?'reversed':'basic';
      const front=type==='cloze'?f('text',0):f('front',0),back=type==='cloze'?f('extra',1):f('back',1);
      const deckId=deckIds.get(noteDeck.get(String(n.id))||'')||deckIds.values().next().value;
      if(!deckId||!front.trim()||known.has(String(n.guid))){skipped++;continue;}
      try {await addNote(deckId,type,front,back,String(n.tags||'').trim().split(/\s+/).filter(Boolean),String(n.id),String(n.guid));known.add(String(n.guid));imported++;}catch{skipped++;}
    }
    const media=zip.file('media');let mediaCount=0;
    if(media){
      try{
        const map=JSON.parse(await media.async('string')) as Record<string,string>;
        const directory=new Directory(Paths.document,'media');directory.create({idempotent:true,intermediates:true});
        for(const [key,name] of Object.entries(map)) {
          const source=zip.file(key);if(!source||!name||name.includes('..')||/[\\/]/.test(name))continue;
          const contents=await source.async('uint8array');if(contents.length>10*1024*1024)continue;
          const target=new File(directory,safeName(name));if(target.exists)target.delete();target.create();await target.write(contents);mediaCount++;
        }
      }catch{/* A package may use a modern protobuf media manifest; the legacy collection remains importable. */}
    }
    return {imported,skipped,media:mediaCount};
  } finally { await sql.closeAsync(); }
}
export async function pickAndImport(defaultDeckId:string) {
  const result=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
  if(result.canceled)return null;
  const asset=result.assets[0],name=asset.name.toLowerCase();
  // expo-file-system has no web implementation; the picker hands back the browser File there.
  const file:{text():Promise<string>;bytes():Promise<Uint8Array>}=asset.file
    ?{text:()=>asset.file!.text(),bytes:async()=>new Uint8Array(await asset.file!.arrayBuffer())}
    :new File(asset.uri);
  if(name.endsWith('.json')){
    const data=JSON.parse(await file.text());
    await restore(data as Backup,false);
    return {imported:Array.isArray(data.notes)?data.notes.length:0,skipped:0};
  }
  if(name.endsWith('.apkg'))return importAPKG(await file.bytes());
  if(name.endsWith('.csv')||name.endsWith('.tsv')||name.endsWith('.txt'))return importText(await file.text(),name,defaultDeckId);
  throw new Error('Supported imports: .apkg (legacy), .csv, .tsv, .txt, and Recall .json backups.');
}
export function mediaURI(filename:string){
  const name=filename.replace(/[\\/]/g,'');const f=new File(Paths.document,'media',name);
  return f.exists?f.uri:null;
}
