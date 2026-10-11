const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
function load(name){
  const filename=path.join(__dirname,'../src/core',name+'.ts');
  const {outputText,diagnostics}=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.equal(diagnostics?.length||0,0);
  const exports={};vm.runInNewContext(outputText,{exports,module:{exports},TextEncoder,Uint8Array,Int32Array,DataView,Math,Date,JSON,console},{filename});
  return exports;
}
const cards=load('cards'),checksum=load('checksum');
test('basic, reversed, cloze card ordinals',()=>{
  assert.deepEqual(Array.from(cards.cardOrdinals('basic','A')),[0]);
  assert.deepEqual(Array.from(cards.cardOrdinals('reversed','A')),[0,1]);
  assert.deepEqual(Array.from(cards.cardOrdinals('cloze','{{c2::Berlin}} and {{c1::Paris}} and {{c2::Rome}}')),[0,1]);
});
test('cloze masks only selected ordinal; hint works',()=>{
  const text='{{c1::Paris::city}} is in {{c2::France}}';
  assert.equal(cards.renderCloze(text,0,false),'[city] is in France');
  assert.equal(cards.renderCloze(text,1,false),'Paris is in […]');
  assert.equal(cards.renderCloze(text,0,true),'Paris is in France');
});
test('reversed cards swap sides',()=>{
  const n={front:'Hallo',back:'Hello',type:'reversed'};
  assert.equal(cards.renderCard(n,1,false).text,'Hello');
  assert.equal(cards.renderCard(n,1,true).text,'Hallo');
});
test('Anki checksum matches first 32 bits of SHA-1',()=>{
  for(const text of ['hello','Café','こんにちは','{{c1::Paris}}','']){
    const expected=parseInt(crypto.createHash('sha1').update(text).digest('hex').slice(0,8),16);
    assert.equal(checksum.ankiChecksum(text),expected);
  }
});
const speed=load('speed');
test('speed subset deduplicates and remains independent of FSRS',()=>{
  const original=speed.newSpeedSession(['a','a','b'],{passesRequired:2,retryGap:2,shuffle:false,input:'flip'},'1',1000);
  assert.deepEqual(Array.from(original.selectedIds),['a','b']);
  assert.deepEqual(Array.from(original.queue),['a','b']);
  const first=speed.speedAnswer(original,false,2000);
  assert.deepEqual(Array.from(first.queue),['b','a']);
  assert.equal(first.scores.a.wrong,1);
  assert.equal(original.scores.a.wrong,0); // immutable, one-step undo possible
  const second=speed.speedAnswer(first,true,3000);
  assert.deepEqual(Array.from(second.queue),['a','b']);
  const third=speed.speedAnswer(second,true,4000);
  assert.deepEqual(Array.from(third.queue),['b','a']);
  assert.equal(third.scores.a.streak,1); // a wrong answer resets mastery streak
  const fourth=speed.speedAnswer(third,true,5000);
  const fifth=speed.speedAnswer(fourth,true,6000);
  assert.equal(fifth.scores.a.mastered,true);
  assert.equal(fifth.queue.length,0);
  assert.equal(speed.speedStats(fifth).difficult,1);
  assert.equal(speed.speedStats(fifth).mastered,2);
});
test('speed mode requeues immediately when configured; skip does not increment attempts',()=>{
  const s=speed.newSpeedSession(['a','b','c'],{passesRequired:1,retryGap:0,shuffle:false,input:'type'},'x',100);
  const wrong=speed.speedAnswer(s,false,200);
  assert.deepEqual(Array.from(wrong.queue),['a','b','c']);
  assert.equal(wrong.attempts,1);
  const skip=speed.speedSkip(wrong,300);
  assert.deepEqual(Array.from(skip.queue),['b','c','a']);
  assert.equal(skip.attempts,1);
});
test('missed-only restart picks exactly cards that failed before; old history intact',()=>{
  const s=speed.newSpeedSession(['a','b','c'],{passesRequired:1,retryGap:1,shuffle:false,input:'flip'},'base',10);
  const a=speed.speedAnswer(s,true,11);
  const b=speed.speedAnswer(a,false,12);
  const c=speed.speedAnswer(b,true,13);
  const d=speed.speedAnswer(c,true,14);
  const retry=speed.restartSpeedSession(d,'mistakes','next',20);
  assert.ok(retry);
  assert.deepEqual(Array.from(retry.selectedIds),['b']);
  assert.equal(retry.attempts,0);
  assert.equal(d.attempts,4);
  const none=speed.restartSpeedSession(speed.newSpeedSession(['q'],{passesRequired:1,retryGap:1,shuffle:false,input:'flip'},'zero',21),'mistakes','next',22);
  assert.equal(none,null);
});
test('speed session prunes deleted flashcards on resume',()=>{
  const s=speed.newSpeedSession(['a','b','c'],{passesRequired:1,retryGap:1,shuffle:false,input:'flip'},'base',10);
  const restored=speed.pruneSpeedSession(s,['a','c']);
  assert.deepEqual(Array.from(restored.selectedIds),['a','c']);
  assert.deepEqual(Array.from(restored.queue),['a','c']);
  assert.ok(!restored.scores.b);
});
test('perfect rounds: only consecutive 100% FULL-subset rounds complete the session',()=>{
  const options={passesRequired:2,retryGap:0,shuffle:false,input:'flip',perfectRoundsRequired:2};
  let s=speed.newSpeedSession(['a','b'],options,'perfect',100);
  assert.equal(speed.speedStats(s).perfectRoundsRequired,2);
  s=speed.speedAnswer(s,true,101);
  assert.deepEqual(Array.from(s.queue),['b']);
  assert.equal(s.roundAnswered,1);
  s=speed.speedAnswer(s,true,102);
  assert.deepEqual(Array.from(s.queue),['a','b']);
  assert.equal(s.perfectStreak,1);
  assert.equal(s.completedRounds,1);
  assert.equal(s.roundNumber,2);
  // Even if per-card streak grows, the next round cannot complete after just one card.
  s=speed.speedAnswer(s,true,103);
  assert.deepEqual(Array.from(s.queue),['b']);
  assert.equal(s.perfectStreak,1);
  s=speed.speedAnswer(s,true,104);
  assert.equal(s.perfectStreak,2);
  assert.equal(s.completedRounds,2);
  assert.equal(s.queue.length,0);
  assert.equal(speed.speedStats(s).lastRound.perfect,true);
  assert.equal(s.attempts,4);
});
test('perfect rounds: mistake invalidates whole round, resets streak, and next round replays every card',()=>{
  const options={passesRequired:1,retryGap:0,shuffle:false,input:'type',perfectRoundsRequired:2};
  let s=speed.newSpeedSession(['a','b','c'],options,'perfect',100);
  for(const t of [101,102,103])s=speed.speedAnswer(s,true,t);
  assert.equal(s.perfectStreak,1);
  s=speed.speedAnswer(s,false,104);
  assert.equal(s.perfectStreak,0); // reset IMMEDIATELY, not only at round boundary
  assert.deepEqual(Array.from(s.queue),['b','c']); // no same-round retry
  s=speed.speedAnswer(s,true,105);
  s=speed.speedAnswer(s,true,106);
  assert.equal(s.completedRounds,2);
  assert.equal(s.roundHistory[1].correct,2);
  assert.equal(s.roundHistory[1].perfect,false);
  assert.deepEqual(Array.from(s.queue),['a','b','c']);
  assert.equal(s.perfectStreak,0);
  for(const t of [107,108,109])s=speed.speedAnswer(s,true,t);
  assert.equal(s.perfectStreak,1);
  assert.equal(s.queue.length,3);
  for(const t of [110,111,112])s=speed.speedAnswer(s,true,t);
  assert.equal(s.queue.length,0);
  assert.equal(s.perfectStreak,2);
  assert.equal(s.completedRounds,4);
  assert.equal(s.roundHistory.length,4);
  assert.equal(s.scores.a.wrong,1);
  assert.equal(s.attempts,12);
});
test('perfect rounds: skipping does not count as an attempt and returns card to end of SAME round',()=>{
  const options={passesRequired:1,retryGap:4,shuffle:false,input:'flip',perfectRoundsRequired:1};
  let s=speed.newSpeedSession(['a','b','c'],options,'perfect',100);
  s=speed.speedSkip(s,101);
  assert.deepEqual(Array.from(s.queue),['b','c','a']);
  assert.equal(s.roundAnswered,0);
  assert.equal(s.attempts,0);
  for(const t of [102,103,104])s=speed.speedAnswer(s,true,t);
  assert.equal(s.queue.length,0);
  assert.equal(s.perfectStreak,1);
});
test('perfect rounds: serialized active session resumes without losing the clean round streak',()=>{
  const options={passesRequired:1,retryGap:2,shuffle:false,input:'flip',perfectRoundsRequired:3};
  let s=speed.newSpeedSession(['a','b'],options,'perfect',100);
  s=speed.speedAnswer(s,true,101);
  s=speed.speedAnswer(s,true,102);
  s=JSON.parse(JSON.stringify(s));
  assert.equal(s.perfectStreak,1);
  s=speed.speedAnswer(s,true,103);
  assert.equal(s.roundAnswered,1);
  s=speed.speedAnswer(s,true,104);
  assert.equal(s.perfectStreak,2);
  s=speed.speedAnswer(s,true,105);
  s=speed.speedAnswer(s,true,106);
  assert.equal(s.perfectStreak,3);
  assert.equal(s.queue.length,0);
  const retry=speed.restartSpeedSession(s,'all','redo',107,()=>0.1);
  assert.equal(retry.perfectStreak,0);
  assert.equal(retry.options.perfectRoundsRequired,3);
  assert.equal(retry.completedRounds,0);
});
test('perfect round validation and deletion reset prevent false completion',()=>{
  const options={passesRequired:1,retryGap:2,shuffle:false,input:'flip',perfectRoundsRequired:4};
  assert.throws(()=>speed.newSpeedSession(['a'],{...options,perfectRoundsRequired:21},'x',100),/perfect rounds/);
  let s=speed.newSpeedSession(['a','b','c'],options,'x',100);
  for(const t of [101,102,103])s=speed.speedAnswer(s,true,t);
  assert.equal(s.perfectStreak,1);
  s=speed.speedAnswer(s,true,104);
  const pruned=speed.pruneSpeedSession(s,['a','c']);
  assert.deepEqual(Array.from(pruned.selectedIds),['a','c']);
  assert.deepEqual(Array.from(pruned.queue),['a','c']);
  assert.equal(pruned.perfectStreak,0);
  assert.equal(pruned.roundAnswered,0);
  assert.equal(pruned.completedRounds,0);
  assert.equal(pruned.attempts,4);
});
const textImport=load('textImport');
test('Anki plain-text export: directives, guid/notetype/deck/tags columns, quoted multiline field',()=>{
  const raw=['#separator:tab','#html:true','#guid column:1','#notetype column:2','#deck column:3','#tags column:6',
    'g1\tBasic\tLang::German\tHund\tdog\tanimals nouns',
    'g2\tCloze\tLang\t"{{c1::Paris}} is\nin France"\t\t',
    'g3\tBasic (and reversed card)\tLang\tKatze\tcat\t'].join('\n');
  const r=textImport.parseAnkiText(raw,'deck.txt');
  assert.equal(r.length,3);
  assert.deepEqual(JSON.parse(JSON.stringify(r[0])),{guid:'g1',front:'Hund',back:'dog',tags:['animals','nouns'],deck:'Lang::German',type:'basic'});
  assert.equal(r[1].type,'cloze');assert.equal(r[1].front,'{{c1::Paris}} is\nin France');
  assert.equal(r[2].type,'reversed');assert.deepEqual(Array.from(r[2].tags),[]);
});
test('Anki plain .tsv without directives: front, back, extra fields joined',()=>{
  const r=textImport.parseAnkiText('Hallo\tHello\nDanke\tThanks\n','x.tsv');
  assert.equal(r.length,2);assert.equal(r[1].front,'Danke');assert.equal(r[1].back,'Thanks');
});
test('#html:false escapes markup; other separators honoured; Front/Back header row; BOM; CRLF',()=>{
  const r=textImport.parseAnkiText('﻿#separator:semicolon\r\n#html:false\r\na<b>;x & y\r\n','a.txt');
  assert.equal(r[0].front,'a&lt;b&gt;');assert.equal(r[0].back,'x &amp; y');
  const h=textImport.parseAnkiText('Front,Back,Tags\nq,a,t1 t2\n','a.csv');
  assert.equal(h.length,1);assert.deepEqual(Array.from(h[0].tags),['t1','t2']);
});
test('Anki columns may leave tags empty and fields with literal quotes survive',()=>{
  const r=textImport.parseAnkiText('#tags column:3\nsay "hi"\tgreeting\t\n','a.txt');
  assert.equal(r[0].front,'say "hi"');assert.equal(r[0].back,'greeting');assert.deepEqual(Array.from(r[0].tags),[]);
});
