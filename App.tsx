import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, FlatList, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from './src/theme/alert';
import { Feather } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C, S, Action, Count, Field, IconCircle, Label, Page, Paragraph, Top, applyAccent, PALETTES, DEFAULT_UI_PREFS, type UIPrefs, type AccentName } from './src/theme/ui';
import {loadUIPrefs,saveUIPrefs} from './src/theme/prefs';
import type { Deck, DeckSummary, Note, NoteKind, Overview, Rating, Settings, StudyCard } from './src/core/types';
import { DEFAULT_SETTINGS, epochDay, plainText } from './src/core/types';
import { renderCard } from './src/core/cards';
import { ratingEstimates } from './src/core/scheduler';
import { addNote, allDecks, answerCard, buryCard, createDeck, deleteDeck, dueCards, getCard, getSettings, listNotes, overview, removeNote, reviewHistory, saveSettings, setNoteSuspended, suspendCard, undoAnswer, updateDeck, updateNote } from './src/data/database';
import { exportAPKG, exportBackup, exportTSV, pickAndImport } from './src/services/importExport';
import { pullNotesFromDesktop, pushNotesToDesktop, syncDesktopToAnkiWeb, testBridge } from './src/services/desktopBridge';
import { db, archiveSpeedSession, loadSpeedSession, saveSpeedSession } from './src/data/database';
import { newSpeedSession } from './src/core/speed';
import type { SpeedOptions, SpeedSession } from './src/core/speed';
import { SpeedSetupScreen, SpeedPracticeScreen } from './src/screens/SpeedLearning';
import { uid } from './src/core/types';
import { CardBody } from './src/theme/CardBody';

type Tab='home'|'browse'|'stats'|'settings';
type ViewName=Tab|'study'|'deck'|'speedSetup'|'speed';
const ratingColor=[C.red,C.amber,C.green,C.accent];
const iconFor=(name:string)=>name.toLowerCase().includes('language')?'globe':name.toLowerCase().includes('science')?'zap':name.toLowerCase().includes('history')?'book':'layers';
const fmtDuration=(ms:number)=>ms>60000?`${Math.round(ms/60000)} min`:`${Math.round(ms/1000)} sec`;
const alertError=(e:unknown)=>Alert.alert('Could not complete action',e instanceof Error?e.message:String(e));
const asking=(title:string,message:string,onConfirm:()=>void)=>Alert.alert(title,message,[{text:'Cancel',style:'cancel'},{text:'Confirm',style:'destructive',onPress:onConfirm}]);
const IconButton=({icon,onPress}:{icon:string;onPress:()=>void})=><Pressable onPress={onPress} style={{padding:10,borderRadius:14,backgroundColor:C.white,borderWidth:1,borderColor:C.border}}><Feather name={icon as any} color={C.ink} size={19}/></Pressable>;
function NoteEditor({visible,onClose,deckId,decks,note,onSaved}:{visible:boolean;onClose:()=>void;deckId:string;decks:Deck[];note?:Note|null;onSaved:()=>void}){
  const [target,setTarget]=useState(deckId),[type,setType]=useState<NoteKind>('basic');
  const [front,setFront]=useState(''),[back,setBack]=useState(''),[tags,setTags]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(visible){setTarget(note?.deckId||deckId);setType(note?.type||'basic');setFront(note?.front||'');setBack(note?.back||'');setTags(note?.tags.join(' ')||'');}},[visible,note,deckId]);
  const save=async()=>{try{setBusy(true);const patch={deckId:target,type,front:front.trim(),back:back.trim(),tags:tags.split(/[\s,]+/).filter(Boolean)};
    if(note)await updateNote(note.id,patch);else await addNote(target,type,patch.front,patch.back,patch.tags);
    onSaved();onClose();}catch(e){alertError(e);}finally{setBusy(false);}};
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={[S.screen,{flex:1}]} edges={['top','bottom']}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={[S.row,{justifyContent:'space-between',padding:20}]}><IconButton icon="x" onPress={onClose}/><Text style={S.h2}>{note?'Edit note':'New note'}</Text><View style={{width:42}}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:22,paddingBottom:50}}><Label>Note type</Label>
      <View style={[S.row,{gap:8,marginTop:12,marginBottom:25}]}>{(['basic','reversed','cloze'] as NoteKind[]).map(t=><Pressable key={t} onPress={()=>setType(t)} style={{flex:1,paddingVertical:12,borderRadius:12,backgroundColor:type===t?C.accent:C.white,borderWidth:1,borderColor:type===t?C.accent:C.border,alignItems:'center'}}><Text style={{color:type===t?'white':C.muted,fontSize:12,fontWeight:'800',textTransform:'capitalize'}}>{t}</Text></Pressable>)}</View>
      <Label>Deck</Label><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:13,marginBottom:22}}>{decks.map(d=><Pressable key={d.id} onPress={()=>setTarget(d.id)} style={{backgroundColor:target===d.id?C.accentLight:C.white,borderColor:target===d.id?C.accent:C.border,borderWidth:1,borderRadius:12,paddingHorizontal:13,paddingVertical:10,marginRight:7}}><Text style={{color:target===d.id?C.accent:C.muted,fontWeight:'700'}}>{d.name}</Text></Pressable>)}</ScrollView>
      <Field label={type==='cloze'?'Text with cloze deletions':'Front / Question'} value={front} onChange={setFront} placeholder={type==='cloze'?'The capital of France is {{c1::Paris}}':'Type your question'} multiline/>
      <Field label={type==='cloze'?'Extra explanation':'Back / Answer'} value={back} onChange={setBack} placeholder="Type the answer" multiline/>
      {type==='cloze'&&<Paragraph style={{marginTop:-9,marginBottom:18}}>Use {'{{c1::answer}}'} and {'{{c2::other answer}}'} to create multiple cards.</Paragraph>}
      <Field label="Tags (space-separated)" value={tags} onChange={setTags} placeholder="biology exam chapter-1"/>
      <Action label={note?'Save changes':'Add note'} icon="check" loading={busy} onPress={save}/>
    </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}
function DeckModal({visible,onClose,onSave,decks}:{visible:boolean;onClose:()=>void;onSave:()=>void;decks:Deck[]}){
  const [name,setName]=useState(''),[desc,setDesc]=useState('');
  useEffect(()=>{if(visible){setName('');setDesc('');}},[visible]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#161C34A9',justifyContent:'center',padding:24}}><View style={[S.panel,{padding:25,gap:6}]}><Text style={[S.h2,{marginBottom:13}]}>Create a deck</Text>
    <Field label="Deck name" value={name} onChange={setName} placeholder="e.g. German::Verbs"/>
    <Field label="Description (optional)" value={desc} onChange={setDesc} placeholder="What are you studying?"/>
    <Action label="Create deck" onPress={async()=>{try{await createDeck(name,desc);onSave();onClose();}catch(e){alertError(e);}}}/>
    <Action tone="ghost" label="Cancel" onPress={onClose}/>
  </View></View></Modal>;
}
function DeckRow({item,onOpen,onStudy,compact=false}:{item:DeckSummary;onOpen:()=>void;onStudy:()=>void;compact?:boolean}){
  const available=item.newCount+item.reviewCount+item.learningCount;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name} deck`} onPress={onOpen} style={[S.panel,{marginBottom:9,padding:compact?13:16,borderRadius:18}]}>
    <View style={[S.row,{gap:12}]}><IconCircle icon={iconFor(item.name)} size={compact?40:46}/>
      <View style={{flex:1}}><Text numberOfLines={1} style={{fontWeight:'800',fontSize:15,color:C.ink}}>{item.name.split('::').slice(-1)}</Text><Text style={{color:C.muted,fontSize:12,marginTop:3}}>{item.total} cards{item.name.includes('::')?'  ·  Subdeck':''}</Text></View>
      <View style={{alignItems:'flex-end',gap:3}}><Text style={{fontWeight:'900',color:available?C.accent:C.muted,fontSize:18}}>{available}</Text><Text style={{color:C.muted,fontSize:10}}>READY</Text></View>
      {available>0?<Pressable accessibilityRole="button" accessibilityLabel={`Study ${item.name}`} onPress={onStudy} hitSlop={8} style={{backgroundColor:C.accentLight,borderRadius:13,minWidth:43,height:44,justifyContent:'center',alignItems:'center'}}><Feather name="arrow-up-right" size={20} color={C.accent}/></Pressable>:<Feather name="chevron-right" color={C.muted} size={18}/>}
    </View>
    {!compact&&<View style={{flexDirection:'row',gap:7,marginTop:13,marginLeft:59}}>{[
      {value:item.newCount,label:'new',color:C.blue},{value:item.learningCount,label:'learning',color:C.amber},{value:item.reviewCount,label:'review',color:C.green}
    ].map(x=><View key={x.label} style={[S.row,{gap:4}]}><View style={{width:6,height:6,borderRadius:4,backgroundColor:x.color}}/><Text style={{color:C.muted,fontSize:11}}>{x.value} {x.label}</Text></View>)}</View>}
  </Pressable>;
}
function Dashboard({data,settings,onStudy,onSpeed,onDeck,onAddDeck,onAddCard,onImport,refresh,ui}:{data:Overview;settings:Settings;onStudy:(d:string|null)=>void;onSpeed:()=>void;onDeck:(d:string)=>void;onAddDeck:()=>void;onAddCard:()=>void;onImport:()=>void;refresh:()=>void;ui:UIPrefs}){
  const pct=Math.min(100,Math.round(data.todayReviewed/Math.max(1,settings.dailyGoal)*100));
  const compact=ui.density==='compact';
  return <Page refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={C.accent}/> }>
    <View style={[S.row,{justifyContent:'space-between',marginTop:22,marginBottom:20}]}><View><Text style={{fontSize:12,fontWeight:'800',letterSpacing:1.8,color:C.accent}}>RECALL <Text style={{color:C.muted}}> / YOUR SPACE</Text></Text><Text style={[S.title,{fontSize:36,marginTop:5}]}>Keep your edge.</Text><Text style={{color:C.muted,fontSize:12,marginTop:5}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</Text></View>
      <Pressable onPress={onAddCard} accessibilityLabel="Add flashcard" accessibilityRole="button" style={{width:47,height:47,borderRadius:16,backgroundColor:C.ink,justifyContent:'center',alignItems:'center'}}><Feather name="plus" size={23} color={C.white}/></Pressable></View>
    <View style={{backgroundColor:'#143B38',borderRadius:25,padding:22,marginBottom:14,overflow:'hidden'}}>
      <View style={{position:'absolute',right:-34,top:-52,width:155,height:155,borderRadius:100,borderWidth:26,borderColor:'#24534D'}}/>
      <View style={{position:'absolute',right:2,bottom:-65,width:150,height:150,borderRadius:100,borderWidth:16,borderColor:'#24534D'}}/>
      <View style={[S.row,{justifyContent:'space-between'}]}><Text style={{color:'#99C5BA',fontWeight:'800',letterSpacing:1.4,fontSize:11}}>TODAY'S MOMENTUM</Text><Feather name="activity" color="#A6D4C6" size={19}/></View>
      <View style={[S.row,{alignItems:'baseline',marginTop:14,gap:7}]}><Text style={{color:C.white,fontSize:55,fontWeight:'900',letterSpacing:-3.5}}>{data.todayReviewed}</Text><Text style={{color:'#A7C8C0',fontSize:15,fontWeight:'700'}}> / {settings.dailyGoal} reviewed</Text></View>
      <View style={{backgroundColor:'#3B625C',height:7,borderRadius:8,marginTop:7,overflow:'hidden'}}><View style={{height:'100%',backgroundColor:'#AAE6CA',borderRadius:8,width:`${pct}%`}}/></View>
      <View style={[S.row,{justifyContent:'space-between',marginTop:12}]}><Text style={{color:'#A9CCC3',fontSize:12}}>{pct>=100?'Daily goal reached':`${Math.max(0,settings.dailyGoal-data.todayReviewed)} cards to your daily goal`}</Text><Text style={{color:C.white,fontWeight:'900',fontSize:12}}>{pct}%</Text></View>
      <Pressable onPress={()=>onStudy(null)} disabled={!data.dueNow} accessibilityRole="button" style={[S.row,{justifyContent:'center',gap:8,backgroundColor:C.white,marginTop:21,minHeight:54,borderRadius:14,opacity:data.dueNow?1:.55}]}><Feather name="play" color="#143B38" size={16}/><Text style={{fontWeight:'900',color:'#143B38',fontSize:15}}>Study now</Text><Text style={{color:'#6B8480',fontSize:12}}>· {data.dueNow} due</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" onPress={onSpeed} style={[S.row,{backgroundColor:'#E4F2EA',borderRadius:20,padding:compact?15:18,gap:13,marginBottom:19,borderColor:'#CBE4D7',borderWidth:1}]}>
      <View style={{width:49,height:49,borderRadius:16,backgroundColor:'#C4E5D2',alignItems:'center',justifyContent:'center'}}><Feather name="zap" size={25} color="#165747"/></View><View style={{flex:1}}><Text style={{fontSize:17,fontWeight:'900',color:'#193F34'}}>Speed learning <Text style={{color:'#3A8365',fontSize:11}}>↗</Text></Text><Text style={{fontSize:12,color:'#5A776B',lineHeight:18,marginTop:3}}>Train any subset. Repeat misses. Master faster.</Text></View><Feather name="arrow-right" size={19} color="#25654E"/>
    </Pressable>
    <View style={[S.row,{gap:10,marginBottom:23}]}>{[
      {value:data.dueNow,label:'Due now',icon:'layers',color:C.accent},
      {value:data.daysStreak,label:'Day streak',icon:'award',color:C.amber},
      {value:data.totalCards,label:'Total cards',icon:'grid',color:C.blue}
    ].map(k=><View key={k.label} style={[S.panel,{flex:1,padding:compact?11:14,gap:7,borderRadius:17}]}><Feather name={k.icon as any} color={k.color} size={17}/><Text style={{fontSize:24,fontWeight:'900',color:C.ink,letterSpacing:-1}}>{k.value}</Text><Text style={{fontSize:11,color:C.muted}}>{k.label}</Text></View>)}</View>
    <View style={[S.row,{justifyContent:'space-between',marginBottom:14}]}><Text style={S.h2}>Your decks <Text style={{color:C.muted,fontWeight:'500',fontSize:13}}>· {data.decks.length}</Text></Text><Pressable onPress={onAddDeck} style={[S.row,{gap:4,minHeight:42}]}><Feather name="plus" size={17} color={C.accent}/><Text style={{color:C.accent,fontWeight:'800',fontSize:13}}>Create</Text></Pressable></View>
    {data.decks.map(item=><DeckRow key={item.id} compact={compact} item={item} onOpen={()=>onDeck(item.id)} onStudy={()=>onStudy(item.id)}/>) }
    {data.totalCards===0&&<View style={[S.panel,{marginTop:16,gap:10}]}><Text style={S.h2}>Start with your cards</Text><Paragraph>Import a deck, CSV, or Recall backup.</Paragraph><Action label="Import cards" icon="download" tone="outline" onPress={onImport}/></View>}
  </Page>;
}
function Browse({decks,onEdit,onNew,changeKey,ui}:{decks:Deck[];onEdit:(n:Note)=>void;onNew:()=>void;changeKey:number;ui:UIPrefs}){
  const [filter,setFilter]=useState(''),[query,setQuery]=useState(''),[target,setTarget]=useState<string|null>(null);
  const [notes,setNotes]=useState<(Note&{cards:number;suspended:number})[]>([]);
  useEffect(()=>{const handle=setTimeout(()=>setQuery(filter),170);return ()=>clearTimeout(handle);},[filter]);
  const request=useRef(0);
  const reload=useCallback(async()=>{const id=++request.current;try{const rows=await listNotes(query,target||undefined);if(id===request.current)setNotes(rows);}catch(e){alertError(e);}},[query,target]);
  useEffect(()=>{reload();return ()=>{request.current++;};},[reload,changeKey]);
  const header=<>
    <Top title="Card browser" subtitle="FIND & MANAGE" right={<IconButton icon="plus" onPress={onNew}/>}/>
    <View style={[S.row,{borderRadius:14,borderWidth:1,borderColor:C.border,backgroundColor:C.white,paddingHorizontal:14,gap:11,marginBottom:15}]}><Feather name="search" size={18} color={C.muted}/><TextInput value={filter} onChangeText={setFilter} style={{height:49,flex:1,color:C.ink,fontSize:14}} placeholder="Search questions, answers or tags" placeholderTextColor={C.muted}/>{!!filter&&<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>setFilter('')}><Feather name="x" size={18} color={C.muted}/></Pressable>}</View>
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{marginBottom:18}}><Pressable onPress={()=>setTarget(null)} style={[chip,target===null?{...chipActive,backgroundColor:C.accentLight,borderColor:C.accent}:null]}><Text style={{color:target===null?C.accent:C.muted,fontWeight:'800'}}>All decks</Text></Pressable>{decks.map(d=><Pressable key={d.id} onPress={()=>setTarget(d.id)} style={[chip,target===d.id?{...chipActive,backgroundColor:C.accentLight,borderColor:C.accent}:null]}><Text style={{color:target===d.id?C.accent:C.muted,fontWeight:'700'}}>{d.name}</Text></Pressable>)}</ScrollView>
    <Text style={[S.label,{marginBottom:13}]}>{notes.length} NOTES {notes.length===500?'(SHOWING FIRST 500)':''}</Text>
  </>;
  return <FlatList keyboardShouldPersistTaps="handled" style={S.screen} contentContainerStyle={S.content} data={notes} keyExtractor={note=>note.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7} removeClippedSubviews={false} ListHeaderComponent={header}
    renderItem={({item:note})=><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${plainText(note.front)}`} onPress={()=>onEdit(note)} style={[S.panel,{padding:ui.density==='compact'?11:16,marginBottom:8,borderRadius:17}]}>
      <View style={[S.row,{justifyContent:'space-between'}]}><Text numberOfLines={2} style={{fontSize:15,fontWeight:'800',color:C.ink,flex:1,marginRight:10}}>{plainText(note.front)}</Text><Feather name="edit-2" size={15} color={C.accent}/></View>
      <Text numberOfLines={2} style={[S.muted,{marginTop:6}]}>{plainText(note.back)}</Text>
      <View style={[S.row,{marginTop:10,gap:8,flexWrap:'wrap'}]}><Text style={{fontSize:11,color:C.accent,fontWeight:'800'}}>{note.type.toUpperCase()}</Text><Text style={{fontSize:11,color:C.muted}}>{note.cards} card(s)</Text>{note.tags.slice(0,3).map(t=><Text key={t} style={{backgroundColor:C.soft,borderRadius:6,padding:4,fontSize:10,color:C.dark}}>{t}</Text>)}
        <View style={{flex:1}}/><Pressable accessibilityRole="button" accessibilityLabel="Delete note" hitSlop={10} onPress={()=>asking('Delete note?','This also deletes its cards and scheduling.',async()=>{try{await removeNote(note.id);reload();}catch(e){alertError(e);}})}><Feather name="trash-2" size={16} color={C.red}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={note.suspended===note.cards?'Resume note':'Suspend note'} hitSlop={10} onPress={async()=>{try{await setNoteSuspended(note.id,note.suspended<note.cards);reload();}catch(e){alertError(e);}}}><Feather name={note.suspended===note.cards?'play-circle':'pause-circle'} size={17} color={C.amber}/></Pressable>
      </View>
    </Pressable>}
    ListEmptyComponent={<View style={[S.panel,{alignItems:'center',gap:12}]}><Feather name="search" color={C.muted} size={28}/><Text style={S.h2}>No notes found</Text><Paragraph>Change filters or add a new note.</Paragraph></View>}
  />;
}
const chip={paddingHorizontal:14,paddingVertical:11,borderRadius:12,backgroundColor:C.white,borderColor:C.border,borderWidth:1,marginRight:8} as const;
const chipActive={backgroundColor:C.accentLight,borderColor:'#B5B5F9'};
function StatScreen({data,refreshKey}:{data:Overview;refreshKey:number}){
  const [history,setHistory]=useState<{day:number;reviews:number;again:number;totalMs:number}[]>([]);
  useEffect(()=>{reviewHistory(35).then(setHistory).catch(alertError);},[refreshKey]);
  const today=epochDay(Date.now(),4), byDay=new Map(history.map(r=>[r.day,r]));
  const last14=Array.from({length:14},(_,i)=>byDay.get(today-13+i)||{day:today-13+i,reviews:0,again:0,totalMs:0});
  const max=Math.max(1,...last14.map(x=>x.reviews));
  const correct=history.reduce((s,r)=>s+r.reviews-r.again,0),all=history.reduce((s,r)=>s+r.reviews,0);
  return <Page><Top title="Your insights" subtitle="STATISTICS & TRENDS"/>
    <View style={[S.row,{gap:12,marginBottom:18}]}><View style={[S.panel,{flex:1,gap:8}]}><Label>Reviews · 35d</Label><Count count={all}/><Paragraph>Total answered</Paragraph></View><View style={[S.panel,{flex:1,gap:8}]}><Label>Success rate</Label><Text style={{fontSize:26,fontWeight:'900',color:C.green}}>{all?Math.round(100*correct/all):0}%</Text><Paragraph>Not rated Again</Paragraph></View></View>
    <View style={[S.panel,{marginBottom:18,paddingTop:22}]}><Text style={S.h2}>Daily activity</Text><Paragraph>Last 14 days</Paragraph>
      <View style={{flexDirection:'row',alignItems:'flex-end',height:180,gap:5,marginTop:25,marginBottom:10}}>{last14.map((d,i)=><View key={i} style={{flex:1,alignItems:'center',gap:7,justifyContent:'flex-end',height:'100%'}}><View style={{backgroundColor:i===13?C.accent:'#C4C3FB',width:'100%',height:Math.max(5,d.reviews/max*150),borderRadius:6}}/><Text style={{fontSize:9,color:C.muted}}>{new Date((d.day*86400000)+43200000).getDate()}</Text></View>)}</View>
    </View>
    <View style={[S.panel,{marginBottom:18}]}><Text style={S.h2}>Collection overview</Text><View style={[S.row,{justifyContent:'space-between',marginTop:20}]}><Paragraph>Notes</Paragraph><Text style={S.h2}>{data.totalNotes}</Text></View><View style={S.separator}/><View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Cards</Paragraph><Text style={S.h2}>{data.totalCards}</Text></View><View style={S.separator}/><View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Study days</Paragraph><Text style={S.h2}>{data.studiedDays}</Text></View><View style={S.separator}/><View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Time today</Paragraph><Text style={S.h2}>{fmtDuration(data.todayTimeMs)}</Text></View></View>
    <Paragraph>Success rate is the share of answers rated Hard, Good or Easy. It is not a calibrated FSRS retention estimate.</Paragraph>
  </Page>;
}
function NumberSetting({label,desc,value,min,max,step=1,onChange,suffix=''}:{label:string;desc:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void;suffix?:string}){
  return <View style={{paddingVertical:16,borderBottomWidth:1,borderColor:C.border}}><View style={[S.row,{justifyContent:'space-between'}]}><View style={{flex:1,marginRight:12}}><Text style={{color:C.ink,fontWeight:'800',fontSize:14}}>{label}</Text><Paragraph>{desc}</Paragraph></View><View style={[S.row,{gap:10}]}><Pressable onPress={()=>onChange(Math.max(min,Math.round((value-step)*100)/100))} style={smallRound}><Feather name="minus" size={15} color={C.accent}/></Pressable><Text style={{fontWeight:'900',color:C.ink,fontSize:15,minWidth:36,textAlign:'center'}}>{value}{suffix}</Text><Pressable onPress={()=>onChange(Math.min(max,Math.round((value+step)*100)/100))} style={smallRound}><Feather name="plus" size={15} color={C.accent}/></Pressable></View></View></View>;
}
const smallRound={width:28,height:28,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:C.accentLight} as const;
function SettingsScreen({settings,setSettings,onImport,onExportBackup,onExportTSV,onExportAPKG,defaultDeckId,ui,onUIChange}:{settings:Settings;setSettings:(s:Settings)=>void;onImport:()=>void;onExportBackup:()=>void;onExportTSV:()=>void;onExportAPKG:()=>void;defaultDeckId:string;ui:UIPrefs;onUIChange:(p:UIPrefs)=>void}){
  const [bridge,setBridge]=useState(''),[working,setWorking]=useState(false);
  const update=(key:keyof Settings,v:any)=>{const s={...settings,[key]:v};setSettings(s);saveSettings(s).catch(alertError);};
  const run=async(task:()=>Promise<any>,description:string)=>{try{setWorking(true);const result=await task();Alert.alert('Desktop bridge',`${description}\n${JSON.stringify(result??{},null,2)}`);}catch(e){alertError(e);}finally{setWorking(false);}};
  const changeUI=(patch:Partial<UIPrefs>)=>onUIChange({...ui,...patch});
  return <Page><Top title="Make it yours." subtitle="PREFERENCES / PERSONALIZATION"/>
    <View style={[S.panel,{gap:14,marginBottom:16}]}>
      <View style={[S.row,{justifyContent:'space-between'}]}><Text style={S.h2}>Interface</Text><IconCircle icon="sliders"/></View>
      <Label>Accent color</Label>
      <View style={[S.row,{gap:13}]}>{(Object.keys(PALETTES) as AccentName[]).map(name=><Pressable accessibilityLabel={`${name} color`} accessibilityRole="button" accessibilityState={{selected:ui.accent===name}} key={name} onPress={()=>changeUI({accent:name})} style={{width:44,height:44,borderRadius:15,backgroundColor:PALETTES[name].accent,alignItems:'center',justifyContent:'center',borderWidth:ui.accent===name?3:0,borderColor:'#B8DBCC'}}>{ui.accent===name&&<Feather name="check" size={21} color="white"/>}</Pressable>)}</View>
      <Label>Layout density</Label>
      <View style={[S.row,{gap:9}]}>{(['comfortable','compact'] as const).map(value=><Pressable accessibilityRole="button" accessibilityLabel={`${value} layout`} key={value} onPress={()=>changeUI({density:value})} style={{flex:1,minHeight:45,borderRadius:12,backgroundColor:ui.density===value?C.accentLight:C.bg,borderWidth:1,borderColor:ui.density===value?C.accent:C.border,justifyContent:'center',alignItems:'center'}}><Text style={{fontWeight:'800',color:ui.density===value?C.accent:C.muted,textTransform:'capitalize'}}>{value}</Text></Pressable>)}</View>
      <Label>Flashcard answer size</Label>
      <View style={[S.row,{gap:9}]}>{([22,26,30] as const).map(size=><Pressable accessibilityRole="button" accessibilityLabel={`Flashcard text ${size}`} key={size} onPress={()=>changeUI({answerSize:size})} style={{flex:1,minHeight:46,borderRadius:12,backgroundColor:ui.answerSize===size?C.accentLight:C.bg,borderWidth:1,borderColor:ui.answerSize===size?C.accent:C.border,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:size/1.7,fontWeight:'800',color:ui.answerSize===size?C.accent:C.ink}}>Aa</Text></Pressable>)}</View>
      {([{key:'showIntervals',label:'Show predicted answer intervals',desc:'Show FSRS estimates under Again / Hard / Good / Easy'}, {key:'tapToReveal',label:'Tap card to reveal',desc:'Also keep the separate reveal button'}] as const).map(({key,label,desc})=><Pressable accessibilityRole="switch" accessibilityState={{checked:ui[key]}} onPress={()=>changeUI({[key]:!ui[key]})} key={key} style={[S.row,{justifyContent:'space-between',minHeight:54}]}><View style={{flex:1,paddingRight:12}}><Text style={{fontWeight:'800',color:C.ink,fontSize:13}}>{label}</Text><Text style={{fontSize:11,color:C.muted,marginTop:3}}>{desc}</Text></View><View style={{width:45,height:27,borderRadius:18,backgroundColor:ui[key]?C.accent:'#CCD6D2',padding:3,alignItems:ui[key]?'flex-end':'flex-start'}}><View style={{width:21,height:21,borderRadius:11,backgroundColor:'white'}}/></View></Pressable>)}
      <Paragraph>Personalization is stored on this device; it does not alter your card schedules.</Paragraph>
    </View>
    <View style={[S.panel,{marginBottom:18}]}><View style={[S.row,{gap:11,marginBottom:3}]}><IconCircle icon="sliders"/><Text style={S.h2}>Study settings</Text></View>
      <NumberSetting label="New cards per day" desc="Per deck, unless overridden" value={settings.newPerDay} min={0} max={9999} onChange={v=>update('newPerDay',v)}/>
      <NumberSetting label="Max reviews per day" desc="Due reviews shown per deck" value={settings.reviewsPerDay} min={0} max={9999} step={10} onChange={v=>update('reviewsPerDay',v)}/>
      <NumberSetting label="Desired retention" desc="FSRS target recall probability" value={settings.desiredRetention} min={.7} max={.97} step={.01} onChange={v=>update('desiredRetention',v)}/>
      <NumberSetting label="Daily study goal" desc="Shown on the home screen" value={settings.dailyGoal} min={1} max={2000} step={5} onChange={v=>update('dailyGoal',v)}/>
      <NumberSetting label="Day begins at" desc="Local hour used for streaks and limits" value={settings.dayStartHour} min={0} max={23} onChange={v=>update('dayStartHour',v)} suffix="h"/>
      <NumberSetting label="Learn-ahead window" desc="Upcoming learning cards (reserved)" value={settings.learnAheadMinutes} min={0} max={120} step={5} onChange={v=>update('learnAheadMinutes',v)} suffix="m"/>
    </View>
    <View style={[S.panel,{gap:12,marginBottom:18}]}><Text style={S.h2}>Import & export</Text><Paragraph>Transfer between devices, share an Anki-compatible legacy deck, or preserve a full Recall collection backup.</Paragraph>
      <Action label="Import file" icon="download" onPress={onImport}/>
      <Action label="Export full JSON backup" icon="archive" tone="outline" onPress={onExportBackup}/>
      <Action label="Export TSV / Anki text" icon="file-text" tone="outline" onPress={onExportTSV}/>
      <Action label="Export .apkg (legacy)" icon="package" tone="outline" onPress={onExportAPKG}/>
      <Paragraph>Legacy .apkg import supports SQLite .anki2 / .anki21. Newer .anki21b and advanced models are not fully supported. JSON backup is the only lossless export of this app's FSRS data.</Paragraph>
    </View>
    <View style={[S.panel,{marginBottom:18,gap:12}]}><Text style={S.h2}>Desktop Anki bridge</Text>
      <View style={{padding:13,backgroundColor:'#FFF7EA',borderRadius:13,borderWidth:1,borderColor:'#F3E0B8'}}><Text style={{color:'#926122',fontSize:12,lineHeight:19}}>EXPERIMENTAL — Notes only. This is not direct AnkiWeb sync. Review history, FSRS states, media and deletions do not round-trip. Back up your Anki collection first.</Text></View>
      <Paragraph>Requires Anki Desktop, the AnkiConnect add-on, and a secure reachable address. Desktop must already be signed in to AnkiWeb.</Paragraph>
      <Field label="Desktop AnkiConnect URL" value={bridge} onChange={setBridge} placeholder="http://192.168.1.x:8765"/>
      <Action disabled={working} label="Test desktop connection" tone="outline" onPress={()=>run(()=>testBridge(bridge),'Connected to AnkiConnect')}/>
      <Action disabled={working} label="Pull notes from desktop" tone="outline" onPress={()=>run(()=>pullNotesFromDesktop(bridge),'Imported desktop notes')}/>
      <Action disabled={working} label="Push missing notes to desktop" tone="outline" onPress={()=>run(()=>pushNotesToDesktop(bridge),'Created Anki notes')}/>
      <Action disabled={working} label="Sync desktop with AnkiWeb" tone="outline" onPress={()=>run(()=>syncDesktopToAnkiWeb(bridge),'The DESKTOP collection synchronized with AnkiWeb; mobile review data was not sent.')}/>
    </View>
    <Paragraph>Recall stores study data locally in SQLite. Cloud synchronization with Anki's native protocol requires integration with Anki's official Rust backend.</Paragraph>
  </Page>;
}
function DeckDetail({deck,data,onBack,onStudy,onSpeed,onAdd,onEdit,onDelete,onExport}:{deck:Deck;data:Overview;onBack:()=>void;onStudy:()=>void;onSpeed:()=>void;onAdd:()=>void;onEdit:(d:Deck)=>void;onDelete:()=>void;onExport:()=>void}){
  const summary=data.decks.find(d=>d.id===deck.id);
  return <Page><View style={[S.row,{marginTop:17,marginBottom:30,gap:14}]}><IconButton icon="arrow-left" onPress={onBack}/><Label>DECK DETAILS</Label></View>
    <IconCircle icon={iconFor(deck.name)} size={60}/><Text style={[S.title,{marginTop:17,marginBottom:7}]}>{deck.name}</Text><Paragraph>{deck.description||'No description yet'}</Paragraph>
    <View style={[S.row,{gap:10,marginTop:28,marginBottom:23}]}>{[{n:summary?.newCount||0,title:'New',c:C.blue},{n:summary?.learningCount||0,title:'Learning',c:C.amber},{n:summary?.reviewCount||0,title:'Due',c:C.green}].map(x=><View key={x.title} style={[S.panel,{flex:1,gap:6}]}><Count count={x.n} color={x.c}/><Paragraph>{x.title}</Paragraph></View>)}</View>
    <Action label="Study deck + subdecks" onPress={onStudy} icon="play"/>
    <View style={{height:10}}/><Action label="Speed learn a subset" tone="outline" onPress={onSpeed} icon="zap"/>
    <View style={{height:16}}/><Action label="Add note" tone="outline" onPress={onAdd} icon="plus"/>
    <View style={{height:16}}/><Text style={S.h2}>Manage deck</Text>
    <View style={[S.panel,{marginTop:12,gap:11}]}><Action tone="ghost" icon="edit" label="Configure deck" onPress={()=>onEdit(deck)}/><View style={S.separator}/><Action tone="ghost" icon="share" label="Export deck (.apkg)" onPress={onExport}/><View style={S.separator}/><Action tone="danger" icon="trash" label="Delete deck & notes" onPress={onDelete}/></View>
  </Page>;
}
function DeckPreferences({deck,onClose,onSave}:{deck:Deck|null;onClose:()=>void;onSave:()=>void}) {
  const [desc,setDesc]=useState(''),[n,setN]=useState(''),[r,setR]=useState('');
  useEffect(()=>{setDesc(deck?.description||'');setN(deck?.newLimit==null?'':String(deck.newLimit));setR(deck?.reviewLimit==null?'':String(deck.reviewLimit));},[deck]);
  const num=(v:string)=>v.trim()===''?null:Math.max(0,Math.round(Number(v)||0));
  return <Modal visible={!!deck} transparent animationType="fade" onRequestClose={onClose}><View style={{flex:1,justifyContent:'center',backgroundColor:'#151B3299',padding:22}}><View style={[S.panel,{padding:24}]}><Text style={[S.h2,{marginBottom:20}]}>Deck preferences</Text><Field label="Description" value={desc} onChange={setDesc}/><Field label="New per day (blank = global)" value={n} onChange={setN}/><Field label="Reviews per day (blank = global)" value={r} onChange={setR}/><Action label="Save" onPress={async()=>{if(!deck)return;try{await updateDeck(deck.id,{description:desc,newLimit:num(n),reviewLimit:num(r)});onSave();onClose();}catch(e){alertError(e);}}}/><Action tone="ghost" label="Cancel" onPress={onClose}/></View></View></Modal>;
}
function StudyScreen({target,settings,onClose,onEdited,ui}:{target:string|null;settings:Settings;onClose:()=>void;onEdited:(id:string)=>void;ui:UIPrefs}){
  const [queue,setQueue]=useState<StudyCard[]>([]),[card,setCard]=useState<StudyCard|null>(null);
  const [flipped,setFlipped]=useState(false),[completed,setCompleted]=useState(0),[busy,setBusy]=useState(true);
  const last=useRef<{before:StudyCard;logId:string}|null>(null),started=useRef(Date.now());
  const load=async()=>{const cards=await dueCards(target,settings);setQueue(cards);setCard(cards[0]||null);setFlipped(false);started.current=Date.now();};
  useEffect(()=>{load().catch(alertError).finally(()=>setBusy(false));},[target]);
  const submit=async(rating:Rating)=>{if(!card||busy)return;try{setBusy(true);const result=await answerCard(card,rating,Date.now()-started.current,settings);last.current={before:card,logId:result.logId};setCompleted(c=>c+1);await load();}catch(e){alertError(e);}finally{setBusy(false);}};
  const undo=async()=>{if(!last.current||busy)return;try{setBusy(true);await undoAnswer(last.current.before,last.current.logId);last.current=null;setCompleted(c=>Math.max(0,c-1));await load();}catch(e){alertError(e);}finally{setBusy(false);}};
  const face=card?renderCard({front:card.front,back:card.back,type:card.noteType},card.ordinal,flipped):null;
  const estimates=useMemo(()=>card?ratingEstimates(card,settings):[],[card,settings]);
  const pct=Math.round(completed/Math.max(1,completed+queue.length)*100);
  return <View style={[S.screen,{flex:1}]}>
    <View style={{paddingHorizontal:20,paddingTop:18,paddingBottom:12}}>
      <View style={[S.row,{gap:12}]}><Pressable accessibilityRole="button" accessibilityLabel="Close study session" onPress={onClose} style={{width:42,height:42,borderRadius:13,backgroundColor:C.white,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:C.border}}><Feather name="x" size={19} color={C.ink}/></Pressable>
        <View style={{flex:1}}><Text style={{fontWeight:'900',color:C.ink,fontSize:16}} numberOfLines={1}>{card?.deckName||'Study session'}</Text><Text style={[S.muted,{fontSize:12}]}>{completed} reviewed  ·  {queue.length} remaining</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo last answer" onPress={undo} disabled={!last.current||busy} style={{padding:11,opacity:last.current?1:.3}}><Feather name="rotate-ccw" color={C.ink} size={19}/></Pressable>
      </View>
      <View style={{backgroundColor:C.soft,height:6,borderRadius:7,marginTop:17,overflow:'hidden'}}><View style={{width:`${pct}%`,backgroundColor:C.accent,height:6,borderRadius:7}}/></View>
    </View>
    {busy&&!card?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Paragraph>Loading your cards…</Paragraph></View>:card&&face?<>
      <Pressable accessibilityRole="button" accessibilityLabel={flipped?'Hide answer':'Reveal answer'} onPress={()=>{if(flipped||ui.tapToReveal)setFlipped(x=>!x);}} style={[S.panel,{flex:1,marginHorizontal:16,marginTop:5,marginBottom:12,justifyContent:'space-between',alignItems:'center',paddingHorizontal:24,paddingVertical:23,minHeight:200,borderRadius:24}]}>
        <View style={[S.row,{alignSelf:'stretch',justifyContent:'space-between'}]}><Text style={{fontSize:11,fontWeight:'900',letterSpacing:1.5,color:C.accent}}>{flipped?'02  /  ANSWER':'01  /  QUESTION'}</Text><View style={{backgroundColor:C.bg,paddingHorizontal:11,paddingVertical:6,borderRadius:10}}><Text style={{fontSize:11,color:C.muted,fontWeight:'700'}}>{card.noteType.toUpperCase()}</Text></View></View>
        <View style={{flex:1,justifyContent:'center',alignSelf:'stretch',alignItems:'center',paddingVertical:22}}><CardBody html={flipped?face.text:face.prompt} size={ui.answerSize}/></View>
        <View style={{height:1,backgroundColor:C.border,alignSelf:'stretch'}}/>
        <View style={[S.row,{gap:7,marginTop:17}]}><Feather name={flipped?'check-circle':'eye'} color={C.muted} size={15}/><Text style={{color:C.muted,fontSize:12}}>{flipped?'Rate how well you recalled it':ui.tapToReveal?'Tap card or press Reveal':'Press Reveal to see answer'}</Text></View>
      </Pressable>
      <View style={{paddingHorizontal:17,paddingTop:4,paddingBottom:17}}>
        {flipped?<View style={{flexDirection:'row',gap:7}}>{(['Again','Hard','Good','Easy'] as const).map((title,i)=>{
          const background=[ '#FBE8E8','#FFF1DE','#E0F4E9','#E3F0FA'][i],text=[C.red,'#AE742A','#188064','#3476B0'][i];
          return <Pressable accessibilityRole="button" accessibilityLabel={`Rate ${title}${ui.showIntervals?`, ${estimates[i]}`:''}`} key={title} onPress={()=>submit((i+1) as Rating)} disabled={busy} style={{flex:1,backgroundColor:background,minHeight:ui.showIntervals?73:61,borderRadius:14,alignItems:'center',justifyContent:'center',gap:5,opacity:busy?.5:1}}><Text style={{color:text,fontWeight:'900',fontSize:13}}>{title}</Text>{ui.showIntervals&&<Text numberOfLines={1} style={{color:text,fontSize:10,fontWeight:'700'}}>{estimates[i]}</Text>}</Pressable>;
        })}</View>:<Action label="Reveal answer" icon="eye" onPress={()=>setFlipped(true)} style={{minHeight:58}}/>}
        <View style={[S.row,{justifyContent:'space-around',marginTop:12}]}>{[
          {label:'Edit',icon:'edit-3',onPress:()=>onEdited(card.noteId)},
          {label:'Bury',icon:'moon',onPress:()=>buryCard(card.id,settings).then(load).catch(alertError)},
          {label:'Suspend',icon:'pause-circle',onPress:()=>suspendCard(card.id,true).then(load).catch(alertError)}
        ].map(k=><Pressable key={k.label} accessibilityRole="button" accessibilityLabel={k.label} onPress={k.onPress} style={[S.row,{gap:7,minHeight:42,paddingHorizontal:9}]}><Feather name={k.icon as any} color={C.muted} size={16}/><Text style={{color:C.muted,fontSize:12,fontWeight:'700'}}>{k.label}</Text></Pressable>)}</View>
      </View>
    </>:<View style={{flex:1,justifyContent:'center',alignItems:'center',padding:32,gap:16}}><IconCircle icon="check-circle" size={75} color={C.green} bg={C.accentLight}/><Text style={[S.title,{textAlign:'center'}]}>You're all caught up.</Text><Paragraph style={{textAlign:'center'}}>Completed {completed} reviews. Your next cards will appear when they are due.</Paragraph>{last.current&&<Action tone="outline" label="Undo last answer" onPress={undo} style={{width:'90%'}}/>}<Action label="Back to home" onPress={onClose} style={{width:'90%'}}/></View>}
  </View>;
}
export default function App(){
  const [view,setView]=useState<ViewName>('home'),[data,setData]=useState<Overview|null>(null),[settings,setSettings]=useState<Settings>(DEFAULT_SETTINGS),[decks,setDecks]=useState<Deck[]>([]);
  const [selectedDeck,setSelectedDeck]=useState<string|null>(null),[studyDeck,setStudyDeck]=useState<string|null>(null),[showNewDeck,setShowNewDeck]=useState(false),[editDeck,setEditDeck]=useState<Deck|null>(null),[editingNote,setEditingNote]=useState<Note|null>(null),[showNote,setShowNote]=useState(false);
  const [revision,setRevision]=useState(0),[ready,setReady]=useState(false),[bootError,setBootError]=useState<string|null>(null),[slowBoot,setSlowBoot]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setSlowBoot(true),3000);return()=>clearTimeout(t);},[]);
  const [ui,setUI]=useState<UIPrefs>(DEFAULT_UI_PREFS);
  const pendingUIPersist=useRef<Promise<void>>(Promise.resolve());
  const changeUI=(next:UIPrefs)=>{applyAccent(next.accent);setUI(next);pendingUIPersist.current=pendingUIPersist.current.then(()=>saveUIPrefs(next)).catch(alertError);};
  const [speedSession,setSpeedSession]=useState<SpeedSession|null>(null),[speedDeck,setSpeedDeck]=useState<string|null>(null);
  const refresh=useCallback(async()=>{try{const s=await getSettings();setSettings(s);const [d,stats]=await Promise.all([allDecks(),overview(s)]);setDecks(d);setData(stats);setRevision(k=>k+1);}catch(e){alertError(e);}},[]);
  useEffect(()=>{db().then(refresh).then(async()=>{const p=await loadUIPrefs();applyAccent(p.accent);setUI(p);setSpeedSession(await loadSpeedSession());}).catch(e=>{setBootError(e instanceof Error?e.message:String(e));alertError(e);}).finally(()=>setReady(true));},[]);
  const study=(deckId:string|null)=>{setStudyDeck(deckId);setView('study');};
  const speedSetup=(deckId:string|null=null)=>{setSpeedDeck(deckId);setView('speedSetup');};
  const startSpeed=async(ids:string[],options:SpeedOptions)=>{const session=newSpeedSession(ids,options,uid(),Date.now());await saveSpeedSession(session);setSpeedSession(session);setView('speed');};
  const changeSpeed=async(session:SpeedSession)=>{await saveSpeedSession(session);setSpeedSession(session);};
  const archiveSpeed=async()=>{if(speedSession)await archiveSpeedSession(speedSession.id);setSpeedSession(null);setView('home');await refresh();};
  const openAdd=(note?:Note|null,deckId?:string)=>{setEditingNote(note||null);if(deckId)setSelectedDeck(deckId);setShowNote(true);};
  const action=async(task:()=>Promise<any>,success?:string)=>{try{const result=await task();await refresh();if(success==='Import finished')setSpeedSession(await loadSpeedSession());if(success&&result!==null)Alert.alert(success,typeof result==='object'?`${result.imported||0} imported, ${result.skipped||0} skipped${result.media?`, ${result.media} media files`:''}${result.firstError?`
First error: ${result.firstError}`:''}`:'Completed.');}catch(e){alertError(e);}};
  const selected=decks.find(d=>d.id===selectedDeck);
  const exportThisDeck=()=>action(()=>exportAPKG(selectedDeck||undefined));
  return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:C.bg}} edges={['top','bottom']}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
    {!ready||!data?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text style={S.title}>Recall</Text><Paragraph>{bootError||(slowBoot?'Still opening… if Recall is open in another browser tab or window, close it.':'Opening your collection…')}</Paragraph></View>:
      <View style={{flex:1}}>
        {view==='home'?<Dashboard data={data} settings={settings} onStudy={study} onSpeed={()=>speedSetup(null)} onDeck={id=>{setSelectedDeck(id);setView('deck');}} onAddDeck={()=>setShowNewDeck(true)} onAddCard={()=>openAdd()} onImport={()=>action(()=>pickAndImport(decks[0]?.id),'Import finished')} refresh={refresh} ui={ui}/>:null}
        {view==='speedSetup'?<SpeedSetupScreen decks={decks} initialDeckId={speedDeck} active={speedSession} onClose={()=>setView('home')} onResume={()=>setView('speed')} onStart={startSpeed} ui={ui}/>:null}
        {view==='speed'&&speedSession?<SpeedPracticeScreen session={speedSession} onChange={changeSpeed} onArchive={archiveSpeed} onNew={()=>speedSetup(speedDeck)} onClose={()=>{setView('home');refresh();}} ui={ui}/>:null}
        {view==='browse'?<Browse decks={decks} onEdit={n=>openAdd(n)} onNew={()=>openAdd()} changeKey={revision} ui={ui}/>:null}
        {view==='stats'?<StatScreen data={data} refreshKey={revision}/>:null}
        {view==='settings'?<SettingsScreen settings={settings} setSettings={setSettings} defaultDeckId={decks[0]?.id} onImport={()=>action(()=>pickAndImport(decks[0]?.id),'Import finished')} onExportBackup={()=>action(exportBackup)} onExportTSV={()=>action(()=>exportTSV())} onExportAPKG={()=>action(()=>exportAPKG())} ui={ui} onUIChange={changeUI}/>:null}
        {view==='deck'&&selected?<DeckDetail deck={selected} data={data} onBack={()=>setView('home')} onStudy={()=>study(selected.id)} onSpeed={()=>speedSetup(selected.id)} onAdd={()=>openAdd(null,selected.id)} onEdit={setEditDeck} onExport={exportThisDeck} onDelete={()=>asking('Delete this deck?',`All notes in ${selected.name} and its subdecks will be deleted.`,()=>action(async()=>{await deleteDeck(selected.id);setView('home');}))}/>:null}
        {view==='study'?<StudyScreen target={studyDeck} settings={settings} onClose={()=>{setView('home');refresh();}} onEdited={async noteId=>{const notes=await listNotes('',undefined,5000);openAdd(notes.find(n=>n.id===noteId)||null);}} ui={ui}/>:null}
        {view!=='study'&&view!=='deck'&&view!=='speed'&&view!=='speedSetup'&&<View style={{flexDirection:'row',backgroundColor:C.white,borderTopColor:C.border,borderTopWidth:1,paddingBottom:8,paddingTop:10,justifyContent:'space-around'}}>{[
          ['home','Home','home'],['browse','Browse','grid'],['stats','Stats','bar-chart-2'],['settings','Settings','settings']
        ].map(([key,label,icon])=><Pressable key={key} onPress={()=>{setView(key as Tab);refresh();}} style={{alignItems:'center',gap:5,paddingHorizontal:15,paddingVertical:5}}><Feather name={icon as any} size={21} color={view===key?C.accent:C.muted}/><Text style={{fontWeight:view===key?'800':'600',color:view===key?C.accent:C.muted,fontSize:11}}>{label}</Text></Pressable>)}</View>}
      </View>}
    <NoteEditor visible={showNote} note={editingNote} deckId={selectedDeck||decks[0]?.id||''} decks={decks} onClose={()=>setShowNote(false)} onSaved={()=>refresh()}/>
    <DeckModal visible={showNewDeck} onClose={()=>setShowNewDeck(false)} onSave={refresh} decks={decks}/>
    <DeckPreferences deck={editDeck} onClose={()=>setEditDeck(null)} onSave={refresh}/>
  </SafeAreaView></SafeAreaProvider>;
}
