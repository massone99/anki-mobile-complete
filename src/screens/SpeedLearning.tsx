import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '../theme/alert';
import { Feather } from '@expo/vector-icons';
import type { Deck, StudyCard } from '../core/types';
import { plainText } from '../core/types';
import { renderCard } from '../core/cards';
import { C, S, Action, IconCircle, Label, Paragraph, type UIPrefs } from '../theme/ui';
import { CardBody } from '../theme/CardBody';
import { getSpeedCards, speedCandidates } from '../data/database';
import type { SpeedFilter, SpeedOptions, SpeedSession } from '../core/speed';
import { DEFAULT_SPEED_OPTIONS, SPEED_MAX_SELECTION, SPEED_MAX_PERFECT_ROUNDS, pruneSpeedSession, restartSpeedSession, speedAnswer, speedSkip, speedStats } from '../core/speed';

const errorMessage = (e: unknown) => Alert.alert('Speed Learning', e instanceof Error ? e.message : String(e));
const control = { paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.white, marginRight: 8 } as const;
function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={[control,active&&{backgroundColor:C.accentLight,borderColor:C.accent}]}><Text style={{color:active?C.accent:C.dark,fontSize:12,fontWeight:'800'}}>{label}</Text></Pressable>;
}
function HeaderBack({title,onBack}:{title:string;onBack:()=>void}) {
  return <View style={{flexDirection:'row',alignItems:'center',gap:12,marginBottom:18}}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={[control,{marginRight:0}]}><Feather name="arrow-left" size={18} color={C.ink}/></Pressable><Text style={[S.h2,{flex:1}]}>{title}</Text></View>;
}
export function SpeedSetupScreen({decks,initialDeckId,active,onResume,onClose,onStart,ui}:{
  decks:Deck[];initialDeckId:string|null;active:SpeedSession|null;onResume:()=>void;onClose:()=>void;ui:UIPrefs;
  onStart:(ids:string[],options:SpeedOptions)=>Promise<void>;
}) {
  const [deckId,setDeckId]=useState<string|null>(initialDeckId);
  const [search,setSearch]=useState(''),[tags,setTags]=useState(''),[state,setState]=useState<SpeedFilter>('all');
  const [includeSuspended,setIncludeSuspended]=useState(false);
  const [available,setAvailable]=useState<StudyCard[]>([]),[truncated,setTruncated]=useState(false);
  const [selected,setSelected]=useState<Record<string,boolean>>({}),[options,setOptions]=useState<SpeedOptions>(DEFAULT_SPEED_OPTIONS);
  const [loading,setLoading]=useState(false),[starting,setStarting]=useState(false);
  const selectedIds=useMemo(()=>Object.keys(selected).filter(id=>selected[id]),[selected]);
  const filterTags=tags.trim().split(/[\s,]+/).filter(Boolean);
  useEffect(()=>{
    let live=true;
    setLoading(true);
    speedCandidates({deckId,search,tags:filterTags,state,includeSuspended})
      .then(result=>{if(live){setAvailable(result.cards);setTruncated(result.truncated);}})
      .catch(e=>{if(live)errorMessage(e);})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[deckId,search,tags,state,includeSuspended]);
  const pick=(id:string)=>{
    if(!selected[id] && selectedIds.length>=SPEED_MAX_SELECTION){Alert.alert('Limit reached',`Choose at most ${SPEED_MAX_SELECTION} cards per sprint.`);return;}
    setSelected(prev=>{const copy={...prev};if(copy[id])delete copy[id];else copy[id]=true;return copy;});
  };
  const selectVisible=()=>{
    const remain=SPEED_MAX_SELECTION-selectedIds.length;
    const additions=available.filter(c=>!selected[c.id]).slice(0,remain);
    setSelected(prev=>{const next={...prev};additions.forEach(c=>{next[c.id]=true;});return next;});
    if(additions.length<available.filter(c=>!selected[c.id]).length)Alert.alert('Selection limit',`Selected the first ${SPEED_MAX_SELECTION} cards. Refine your filters for a more specific subset.`);
  };
  const launch=async(ids:string[])=>{
    if(!ids.length)return;
    const go=async()=>{try{setStarting(true);await onStart(ids,options);}catch(e){errorMessage(e);}finally{setStarting(false);}};
    if(active&&active.queue.length){Alert.alert('Replace active sprint?', 'Your current progress will remain in history, but the new sprint becomes the active session.',[
      {text:'Cancel',style:'cancel'},{text:'Start new sprint',onPress:go},
    ]);}else await go();
  };
  const primaryIds=selectedIds.length?selectedIds:available.slice(0,SPEED_MAX_SELECTION).map(c=>c.id);
  const selector=<>
    <Text style={[S.h2,{marginBottom:6}]}>Choose your targets.</Text>
    <Paragraph>Filter the collection or handpick cards. Only your chosen subset enters the sprint.</Paragraph>
    <Label>Deck</Label>
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{marginTop:10,marginBottom:19}}>
      <Chip label="All decks" active={deckId===null} onPress={()=>setDeckId(null)}/>
      {decks.map(d=><Chip key={d.id} label={d.name} active={deckId===d.id} onPress={()=>setDeckId(d.id)}/>)}
    </ScrollView>
    <View style={[S.row,{backgroundColor:C.white,borderRadius:14,borderColor:C.border,borderWidth:1,paddingHorizontal:14,gap:9,marginBottom:12}]}>
      <Feather name="search" color={C.muted} size={17}/>
      <TextInput style={{flex:1,color:C.ink,height:46}} placeholder="German verbs, anatomy, equations…" placeholderTextColor={C.muted} value={search} onChangeText={setSearch}/>
      {!!search&&<Pressable onPress={()=>setSearch('')}><Feather name="x" color={C.muted} size={17}/></Pressable>}
    </View>
    <View style={[S.row,{backgroundColor:C.white,borderRadius:14,borderColor:C.border,borderWidth:1,paddingHorizontal:14,gap:9,marginBottom:15}]}>
      <Feather name="tag" color={C.muted} size={17}/>
      <TextInput style={{flex:1,color:C.ink,height:46}} placeholder="Required tags (e.g. verbs A1)" placeholderTextColor={C.muted} value={tags} onChangeText={setTags} autoCapitalize="none"/>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:13}}>
      {([['all','All cards'],['new','New'],['due','Due now'],['missed','Previously lapsed']] as const).map(([value,label])=><Chip key={value} label={label} active={state===value} onPress={()=>setState(value)}/>)}
    </ScrollView>
    <Pressable onPress={()=>setIncludeSuspended(x=>!x)} style={[S.row,{gap:10,marginBottom:20}]}><Feather name={includeSuspended?'check-square':'square'} color={C.accent} size={19}/><Text style={S.body}>Include suspended cards</Text></Pressable>
    <View style={[S.panel,{marginBottom:18,gap:13}]}><View style={[S.row,{justifyContent:'space-between'}]}><Text style={S.h2}>Sprint settings</Text><Feather name="zap" size={19} color={C.accent}/></View>
      <Label>When is this sprint complete?</Label>
      <View style={[S.row,{flexWrap:'wrap',rowGap:9}]}>
        <Chip label="Perfect 100% rounds" active={(options.perfectRoundsRequired??0)>0} onPress={()=>setOptions(o=>({...o,perfectRoundsRequired:o.perfectRoundsRequired||2}))}/>
        <Chip label="Per-card mastery" active={(options.perfectRoundsRequired??0)===0} onPress={()=>setOptions(o=>({...o,perfectRoundsRequired:0}))}/>
      </View>
      {(options.perfectRoundsRequired??0)>0 ? <View style={{gap:12}}>
        <Label>Consecutive perfect rounds to finish</Label>
        <View style={[S.row,{alignItems:'center',justifyContent:'space-between',borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:C.bg,padding:9}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease perfect rounds" accessibilityState={{disabled:options.perfectRoundsRequired===1}} disabled={options.perfectRoundsRequired===1} onPress={()=>setOptions(o=>({...o,perfectRoundsRequired:Math.max(1,(o.perfectRoundsRequired??2)-1)}))} style={{width:48,height:48,alignItems:'center',justifyContent:'center',backgroundColor:C.white,borderRadius:12,opacity:options.perfectRoundsRequired===1?.35:1}}><Feather name="minus" size={21} color={C.ink}/></Pressable>
          <View style={{alignItems:'center'}}><Text style={{fontSize:27,fontWeight:'900',color:C.ink}}>{options.perfectRoundsRequired}</Text><Text style={{color:C.muted,fontWeight:'700',fontSize:11}}>IN A ROW · 100%</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase perfect rounds" accessibilityState={{disabled:options.perfectRoundsRequired===SPEED_MAX_PERFECT_ROUNDS}} disabled={options.perfectRoundsRequired===SPEED_MAX_PERFECT_ROUNDS} onPress={()=>setOptions(o=>({...o,perfectRoundsRequired:Math.min(SPEED_MAX_PERFECT_ROUNDS,(o.perfectRoundsRequired??2)+1)}))} style={{width:48,height:48,alignItems:'center',justifyContent:'center',backgroundColor:C.white,borderRadius:12,opacity:options.perfectRoundsRequired===SPEED_MAX_PERFECT_ROUNDS?.35:1}}><Feather name="plus" size={21} color={C.ink}/></Pressable>
        </View>
        <View style={[S.row,{flexWrap:'wrap',rowGap:9}]}>{[1,2,3,5,10].map(n=><Chip key={n} label={`${n} ${n===1?'round':'rounds'}`} active={options.perfectRoundsRequired===n} onPress={()=>setOptions(o=>({...o,perfectRoundsRequired:n}))}/>)}</View>
        <Paragraph>Each round includes every selected card exactly once. All answers must be Remembered for a 100% round. One mistake breaks your perfect-round streak; the next round starts with the full subset. Per-card mastery and retry spacing do not apply in this mode.</Paragraph>
      </View> : <>
        <Label>Correct answers in a row to master each card</Label>
        <View style={S.row}>{([1,2,3] as const).map(n=><Chip key={n} label={`${n} ${n===1?'pass':'passes'}`} active={options.passesRequired===n} onPress={()=>setOptions(o=>({...o,passesRequired:n}))}/>)}</View>
        <Label>Retry after other cards</Label>
        <View style={S.row}>{[0,2,4,8].map(n=><Chip key={n} label={n===0?'Immediately':`${n} cards`} active={options.retryGap===n} onPress={()=>setOptions(o=>({...o,retryGap:n}))}/>)}</View>
      </>}
      <Label>Response style</Label>
      <View style={S.row}><Chip label="Tap to reveal" active={options.input==='flip'} onPress={()=>setOptions(o=>({...o,input:'flip'}))}/><Chip label="Type then reveal" active={options.input==='type'} onPress={()=>setOptions(o=>({...o,input:'type'}))}/></View>
      <Pressable style={[S.row,{gap:9}]} onPress={()=>setOptions(o=>({...o,shuffle:!o.shuffle}))}><Feather name={options.shuffle?'check-square':'square'} size={18} color={C.accent}/><Text style={S.body}>Shuffle initial order</Text></Pressable>
    </View>
    <View style={[S.row,{justifyContent:'space-between',marginBottom:9}]}><Text style={S.h2}>Matching flashcards</Text><Text style={{color:C.accent,fontWeight:'800'}}>{selectedIds.length} selected</Text></View>
    <View style={[S.row,{gap:9,marginBottom:8}]}><Pressable onPress={selectVisible} style={{padding:9}} disabled={!available.length||loading}><Text style={{color:C.accent,fontWeight:'800'}}>Select matching</Text></Pressable><Pressable onPress={()=>setSelected({})} style={{padding:9}}><Text style={{color:C.muted,fontWeight:'800'}}>Clear selection</Text></Pressable></View>
    {truncated&&<Paragraph style={{marginBottom:10}}>Showing the first 500 matching cards. Refine the search or deck to find other cards.</Paragraph>}
    {loading&&<Paragraph style={{marginBottom:15}}>Finding flashcards…</Paragraph>}
  </>;
  return <View style={[S.screen,{flex:1}]}>
    <FlatList data={available} keyExtractor={c=>c.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingTop:15,paddingBottom:22}}
      ListHeaderComponent={<><HeaderBack title="Speed Learning" onBack={onClose}/>
        <View style={{backgroundColor:'#153E39',padding:19,borderRadius:21,marginBottom:17,overflow:'hidden'}}><View style={{position:'absolute',right:-27,top:-40,width:130,height:130,borderWidth:22,borderColor:'#2A5B51',borderRadius:100}}/><Text style={{color:'#A5DBC4',fontSize:10,fontWeight:'900',letterSpacing:1.5}}>FOCUSED PRACTICE</Text><Text style={{color:C.white,fontSize:27,fontWeight:'900',letterSpacing:-.9,marginTop:10}}>Learn at your speed.</Text><Text style={{color:'#B8D9C9',fontSize:12,marginTop:5,lineHeight:18}}>Fast recall · Smart retries · Zero FSRS changes</Text></View>
        {active&&active.queue.length>0&&<Pressable onPress={onResume} style={[S.panel,{marginBottom:20,borderColor:C.accent,backgroundColor:C.accentLight}]}><Text style={[S.h2,{color:C.accent}]}>Continue last sprint →</Text><Paragraph>{speedStats(active).perfectRoundsRequired ? `${speedStats(active).perfectStreak}/${speedStats(active).perfectRoundsRequired} perfect rounds · round ${speedStats(active).roundNumber}` : `${speedStats(active).mastered}/${active.selectedIds.length} mastered`} · {active.queue.length} cards remaining</Paragraph></Pressable>}{selector}</>}
      renderItem={({item})=>{
        const prompt=renderCard({front:item.front,back:item.back,type:item.noteType},item.ordinal,false).prompt;
        const checked=!!selected[item.id];
        return <Pressable onPress={()=>pick(item.id)} accessibilityRole="checkbox" accessibilityState={{checked}} style={[S.panel,{marginBottom:7,padding:ui.density==='compact'?10:14,borderRadius:14,borderColor:checked?C.accent:C.border,backgroundColor:checked?C.accentLight:C.white}]}>
          <View style={[S.row,{gap:11}]}><Feather name={checked?'check-square':'square'} size={21} color={checked?C.accent:C.muted}/>
            <View style={{flex:1}}><Text numberOfLines={2} style={{fontSize:14,fontWeight:'700',color:C.ink}}>{plainText(prompt)||'(empty)'}</Text><Text style={{fontSize:11,color:C.muted,marginTop:5}}>{item.deckName} · {item.noteType}{item.tags.length?` · ${item.tags.slice(0,2).join(', ')}`:''}</Text></View>
          </View>
        </Pressable>;
      }}
      ListEmptyComponent={!loading?<View style={[S.panel,{alignItems:'center',gap:8}]}><Feather name="inbox" size={26} color={C.muted}/><Paragraph>No cards match these filters.</Paragraph></View>:null}
    />
    <View style={{backgroundColor:C.white,paddingHorizontal:20,paddingTop:12,paddingBottom:14,borderTopWidth:1,borderColor:C.border}}>
      <Text style={{color:C.muted,textAlign:'center',fontSize:12,marginBottom:9}}>{selectedIds.length?`Practice your ${selectedIds.length} explicitly chosen cards`:`Practice the first ${Math.min(available.length,SPEED_MAX_SELECTION)} matching cards`} · no FSRS changes</Text>
      <Action loading={starting} disabled={!primaryIds.length||loading} label={`Launch focused sprint · ${primaryIds.length}` } icon="zap" onPress={()=>launch(primaryIds)}/>
    </View>
  </View>;
}

export function SpeedPracticeScreen({session,onChange,onArchive,onNew,onClose,ui}:{
  session:SpeedSession;onChange:(next:SpeedSession)=>Promise<void>;onArchive:()=>Promise<void>;onNew:()=>void;onClose:()=>void;ui:UIPrefs;
}) {
  const [cards,setCards]=useState<Record<string,StudyCard>>({});
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false);
  const [flipped,setFlipped]=useState(false),[typed,setTyped]=useState('');
  const previous=useRef<SpeedSession|null>(null);
  const visitStart=useRef(Date.now());
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    let alive=true;setLoading(true);
    getSpeedCards(session.selectedIds).then(async results=>{
      if(!alive)return;
      const byId=Object.fromEntries(results.map(c=>[c.id,c]));setCards(byId);
      if(results.length!==session.selectedIds.length){
        const corrected=pruneSpeedSession(session,results.map(c=>c.id));
        await onChange(corrected);
      }
    }).catch(errorMessage).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[session.id]);
  useEffect(()=>{visitStart.current=Date.now();setElapsed(0);const tick=()=>setElapsed(Math.floor((Date.now()-visitStart.current)/1000));const t=setInterval(tick,1000);return ()=>clearInterval(t);},[session.id]);
  const stats=speedStats(session);
  const card=session.queue.length?cards[session.queue[0]]:undefined;
  const face=card?renderCard({front:card.front,back:card.back,type:card.noteType},card.ordinal,flipped):null;
  const score=card?session.scores[card.id]:undefined;
  const update=async(next:SpeedSession,withUndo=true)=>{
    if(working)return;
    setWorking(true);
    try{await onChange(next);if(withUndo)previous.current=session;else previous.current=null;setFlipped(false);setTyped('');}
    catch(e){errorMessage(e);}finally{setWorking(false);}
  };
  const grade=(correct:boolean)=>update(speedAnswer(session,correct,Date.now()));
  const skip=()=>update(speedSkip(session,Date.now()),false);
  const undo=()=>{if(previous.current)update({...previous.current,updatedAt:Date.now()},false);};
  const restart=async(mode:'all'|'mistakes')=>{
    const next=restartSpeedSession(session,mode,`${Date.now()}-${Math.floor(Math.random()*1e9)}`,Date.now());
    if(next){previous.current=null;await update(next,false);}
  };
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[S.screen,{flex:1}]}>
    <View style={{paddingHorizontal:19,paddingTop:15,paddingBottom:14}}><HeaderBack title="Speed Learning" onBack={onClose}/>
      <View style={[S.row,{justifyContent:'space-between',marginBottom:12}]}>
        <View><Label>{stats.perfectRoundsRequired?'PERFECT ROUNDS':'MASTERED'}</Label><Text style={{color:C.ink,fontSize:25,fontWeight:'900'}}>{stats.perfectRoundsRequired?stats.perfectStreak:stats.mastered}<Text style={{color:C.muted,fontSize:16}}> / {stats.perfectRoundsRequired||stats.total}</Text></Text></View>
        <View><Label>{stats.perfectRoundsRequired?'ROUND PROGRESS':'ACCURACY'}</Label><Text style={{color:C.ink,fontSize:25,fontWeight:'900'}}>{stats.perfectRoundsRequired?`${stats.roundAnswered}/${stats.total}`:`${stats.accuracy}%`}</Text></View>
        <View><Label>THIS VISIT</Label><Text style={{color:C.ink,fontSize:25,fontWeight:'900'}}>{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</Text></View>
      </View>
      <View style={{height:8,backgroundColor:C.soft,borderRadius:8,overflow:'hidden'}}><View style={{height:'100%',width:`${stats.total?Math.round((stats.perfectRoundsRequired?stats.roundAnswered:stats.mastered)/stats.total*100):100}%`,backgroundColor:C.accent,borderRadius:8}}/></View>
      {stats.perfectRoundsRequired ? <View style={{marginTop:9,gap:4}}>
        <View style={[S.row,{justifyContent:'space-between'}]}><Text style={S.muted}>Round {stats.roundNumber} · {stats.roundMistakes?`${stats.roundMistakes} mistakes — streak reset`:'100% still possible'}</Text><Text style={S.muted}>{stats.completedRounds} rounds completed</Text></View>
        {stats.lastRound&&<Text style={[S.muted,{fontSize:11}]}>Previous: round {stats.lastRound.number} · {stats.lastRound.correct}/{stats.lastRound.total} correct {stats.lastRound.perfect?'· perfect ✓':'· streak restarted'}</Text>}
      </View> : <View style={[S.row,{justifyContent:'space-between',marginTop:8}]}><Text style={S.muted}>{session.queue.length} in rotation</Text><Text style={S.muted}>{stats.difficult} missed · {session.attempts} attempts</Text></View>}
    </View>
    {loading?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Paragraph>Loading selected cards…</Paragraph></View>:
      session.queue.length===0?<ScrollView contentContainerStyle={{flexGrow:1,padding:25,justifyContent:'center',gap:15}}>
        <View style={{alignItems:'center',gap:15}}><IconCircle icon="award" color={C.green} bg="#DFF9F0" size={74}/><Text style={[S.title,{textAlign:'center'}]}>Sprint completed</Text>
          <Paragraph style={{textAlign:'center'}}>{stats.perfectRoundsRequired ? `You completed ${stats.perfectRoundsRequired} consecutive 100% rounds across ${stats.total} cards. ${stats.completedRounds} total rounds and ${stats.wrong} incorrect recalls.` : `You mastered ${stats.mastered} cards with ${stats.right} successful recalls and ${stats.wrong} retries.`} Speed Learning never changed your normal review schedule.</Paragraph></View>
        <View style={[S.panel,{gap:13,marginTop:10}]}><Text style={S.h2}>Your results</Text>{stats.perfectRoundsRequired>0&&<View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Consecutive perfect rounds</Paragraph><Text style={S.h2}>{stats.perfectStreak}/{stats.perfectRoundsRequired}</Text></View>}{stats.perfectRoundsRequired>0&&<View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Total rounds completed</Paragraph><Text style={S.h2}>{stats.completedRounds}</Text></View>}<View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Correct recall rate</Paragraph><Text style={S.h2}>{stats.accuracy}%</Text></View><View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Cards that caused trouble</Paragraph><Text style={S.h2}>{stats.difficult}</Text></View><View style={[S.row,{justifyContent:'space-between'}]}><Paragraph>Total attempts</Paragraph><Text style={S.h2}>{session.attempts}</Text></View></View>
        {stats.difficult>0&&<Action icon="repeat" label={`Retry ${stats.difficult} difficult cards`} onPress={()=>restart('mistakes')} loading={working}/>}
        <Action tone="outline" label="Repeat entire subset" onPress={()=>restart('all')} loading={working}/><Action tone="ghost" label="Pick another subset" onPress={onNew}/><Action label="Finish and return home" onPress={()=>onArchive().catch(errorMessage)} />
      </ScrollView>:!card?<View style={{flex:1,justifyContent:'center',alignItems:'center',gap:15,padding:25}}><Paragraph>One or more selected flashcards were deleted. Exit and resume to refresh this sprint.</Paragraph><Action label="Return home" onPress={onClose}/></View>:
      <>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,paddingHorizontal:19,paddingTop:10,paddingBottom:20}}>
          <View style={[S.panel,{flexGrow:1,minHeight:280,justifyContent:'space-between',alignItems:'center',padding:23,gap:16,borderRadius:24}]}>
            <View style={{alignSelf:'stretch',flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:C.accent}}>{flipped?'02 / ANSWER':'01 / RECALL'}</Text><Feather name="zap" size={17} color={C.accent}/></View>
            <Text style={{fontSize:11,color:C.muted,textAlign:'center'}}>{card.deckName} · {card.noteType}{card.ordinal?` · #${card.ordinal+1}`:''}</Text>
            <View style={{flex:1,justifyContent:'center',paddingVertical:20,width:'100%'}}><CardBody html={flipped?face?.text||'':face?.prompt||''} size={ui.answerSize}/></View>
            {!flipped&&session.options.input==='type'&&<TextInput value={typed} onChangeText={setTyped} multiline placeholder="Try to type your answer first…" placeholderTextColor={C.muted} style={[S.input,{minHeight:88,width:'100%',textAlignVertical:'top',paddingTop:14}]}/>}
            {flipped&&typed.trim().length>0&&<View style={{backgroundColor:C.accentLight,width:'100%',borderRadius:12,padding:12}}><Label>YOUR RECALL</Label><Text selectable style={{color:C.ink,marginTop:6}}>{typed}</Text></View>}
            {flipped&&<Text style={{color:C.muted,fontSize:12,textAlign:'center'}}>Compare the correct answer with what you recalled. Self-grade your memory, not typing exactness.</Text>}
          </View>
          <View style={[S.row,{justifyContent:'space-between',marginTop:13}]}><Text style={S.muted}>{stats.perfectRoundsRequired?`Round ${stats.roundNumber} · ${stats.perfectStreak}/${stats.perfectRoundsRequired} perfect in a row`:`Current streak: ${score?.streak??0}/${session.options.passesRequired}`}</Text><Text style={S.muted}>{stats.perfectRoundsRequired?`Round mistakes: ${stats.roundMistakes}`:`Misses: ${score?.wrong??0}`}</Text></View>
        </ScrollView>
        <View style={{paddingHorizontal:19,paddingBottom:14,paddingTop:12,borderTopWidth:1,borderColor:C.border,backgroundColor:C.white,gap:12}}>
          {flipped?<View style={{flexDirection:'row',gap:10}}>
            <Pressable onPress={()=>grade(false)} disabled={working} style={{flex:1,borderRadius:16,minHeight:67,justifyContent:'center',backgroundColor:'#FBE8E8',alignItems:'center',opacity:working?.5:1}}><Feather name="refresh-ccw" color={C.red} size={19}/><Text style={{color:C.red,fontWeight:'900',marginTop:5}}>Again</Text></Pressable>
            <Pressable onPress={()=>grade(true)} disabled={working} style={{flex:1,borderRadius:16,minHeight:67,justifyContent:'center',backgroundColor:C.accent,alignItems:'center',opacity:working?.5:1}}><Feather name="check" color={C.white} size={19}/><Text style={{color:C.white,fontWeight:'900',marginTop:5}}>Remembered</Text></Pressable>
          </View>:<Action label="Reveal answer" icon="eye" onPress={()=>setFlipped(true)} />}
          <View style={[S.row,{justifyContent:'space-between',paddingHorizontal:13}]}><Pressable onPress={skip} disabled={working||session.queue.length<2} style={[S.row,{gap:6,opacity:session.queue.length<2?.35:1}]}><Feather name="skip-forward" size={16} color={C.muted}/><Text style={S.muted}>Skip</Text></Pressable><Pressable onPress={undo} disabled={working||!previous.current} style={[S.row,{gap:6,opacity:!previous.current?.35:1}]}><Feather name="rotate-ccw" size={16} color={C.muted}/><Text style={S.muted}>Undo rating</Text></Pressable><Pressable onPress={onNew} style={[S.row,{gap:6}]}><Feather name="sliders" size={16} color={C.muted}/><Text style={S.muted}>Change subset</Text></Pressable></View>
        </View>
      </>}
  </KeyboardAvoidingView>;
}
