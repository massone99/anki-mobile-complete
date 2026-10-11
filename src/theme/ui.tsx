import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

export const PALETTES = {
  forest: { accent:'#16796E', accentLight:'#E0F3ED', dark:'#125348' },
  indigo: { accent:'#5A56D9', accentLight:'#ECEBFF', dark:'#39338C' },
  ocean: { accent:'#2667CA', accentLight:'#E5EFFF', dark:'#173E89' },
  berry: { accent:'#A94770', accentLight:'#F9E7EF', dark:'#702D4B' },
} as const;
export type AccentName = keyof typeof PALETTES;
export type UIPrefs = {accent:AccentName;density:'comfortable'|'compact';answerSize:22|26|30;showIntervals:boolean;tapToReveal:boolean};
export const DEFAULT_UI_PREFS:UIPrefs = {accent:'forest',density:'comfortable',answerSize:26,showIntervals:true,tapToReveal:true};
export const C = {
  bg:'#F5F7F6', white:'#FFFFFF', ink:'#142C30', muted:'#7C8B8D', soft:'#E6EEEB',
  accent:'#16796E', accentLight:'#E0F3ED', border:'#E4EBE8', green:'#1C9474',
  amber:'#C58E35', red:'#CB5C65', blue:'#4B81C0', dark:'#125348',
};
export function applyAccent(accent:AccentName){Object.assign(C,PALETTES[accent]);}
export const S = StyleSheet.create({
  screen:{flex:1,backgroundColor:C.bg},content:{paddingHorizontal:20,paddingBottom:116},
  title:{fontSize:32,fontWeight:'900',letterSpacing:-1.25,color:C.ink},
  h2:{fontSize:20,fontWeight:'800',color:C.ink,letterSpacing:-.6},
  body:{fontSize:14,color:C.ink,lineHeight:22},muted:{fontSize:13,color:C.muted,lineHeight:20},
  label:{fontSize:11,fontWeight:'800',letterSpacing:1.35,color:C.muted,textTransform:'uppercase'},
  panel:{backgroundColor:C.white,borderRadius:20,borderColor:C.border,borderWidth:1,padding:18},
  input:{backgroundColor:C.white,borderWidth:1,borderColor:C.border,borderRadius:13,minHeight:50,paddingHorizontal:15,fontSize:15,color:C.ink},
  separator:{height:1,backgroundColor:C.border,marginVertical:15},row:{flexDirection:'row',alignItems:'center'},
  shadow:{shadowColor:'#142C30',shadowOpacity:.045,shadowRadius:15,shadowOffset:{width:0,height:5},elevation:2},
});
export function Label({children}:{children:React.ReactNode}){return <Text style={S.label}>{children}</Text>}
export function Paragraph({children,style}:{children:React.ReactNode;style?:any}){return <Text style={[S.muted,style]}>{children}</Text>}
export function Page({children,refreshControl}:{children:React.ReactNode;refreshControl?:any}){return <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refreshControl} style={S.screen} contentContainerStyle={S.content}>{children}</ScrollView>}
export function Action({label,icon,onPress,tone='primary',disabled=false,loading=false,style}:{label:string;icon?:string;onPress:()=>void;tone?:'primary'|'outline'|'ghost'|'danger';disabled?:boolean;loading?:boolean;style?:ViewStyle}){
  const solid=tone==='primary';return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled||loading} style={[{minHeight:52,borderRadius:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,backgroundColor:solid?C.accent:tone==='danger'?'#FBEAEB':tone==='outline'?C.white:'transparent',borderWidth:tone==='outline'?1:0,borderColor:C.border,opacity:disabled?.45:1},style]}>
    {loading?<ActivityIndicator color={solid?C.white:C.accent}/>:icon?<Feather name={icon as any} color={solid?C.white:tone==='danger'?C.red:C.accent} size={17}/>:null}
    <Text style={{fontSize:14,fontWeight:'800',color:solid?C.white:tone==='danger'?C.red:C.accent}}>{label}</Text>
  </Pressable>;
}
export function Field({label,value,onChange,placeholder,multiline=false,secure=false}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean;secure?:boolean}){
  return <View style={{gap:9,marginBottom:16}}><Label>{label}</Label><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} multiline={multiline} secureTextEntry={secure} textAlignVertical={multiline?'top':'center'} style={[S.input,multiline?{minHeight:115,paddingTop:14}:null]}/></View>
}
export function Top({subtitle,title,right}:{subtitle:string;title:string;right?:React.ReactNode}){
  return <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:26,marginBottom:25}}><View style={{flex:1}}><Label>{subtitle}</Label><Text style={[S.title,{marginTop:5}]}>{title}</Text></View>{right}</View>;
}
export function IconCircle({icon,color=C.accent,bg=C.accentLight,size=42}:{icon:string;color?:string;bg?:string;size?:number}){return <View style={{width:size,height:size,borderRadius:Math.round(size*.32),backgroundColor:bg,alignItems:'center',justifyContent:'center'}}><Feather name={icon as any} size={Math.round(size*.44)} color={color}/></View>}
export function Count({count,color=C.accent}:{count:number;color?:string}){return <Text style={{color,fontSize:25,fontWeight:'900',letterSpacing:-1}}>{count}</Text>}
