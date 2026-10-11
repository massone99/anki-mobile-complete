import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Alert } from './alert';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { C } from './ui';
import { plainText } from '../core/types';
import { mediaURI } from '../services/importExport';
function AudioClip({uri}:{uri:string}) {
  const player=useAudioPlayer({uri});
  return <Pressable accessibilityRole="button" accessibilityLabel="Play audio" onPress={async()=>{try{await player.seekTo(0);player.play();}catch(e){Alert.alert('Cannot play audio',String(e));}}} style={{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.accentLight,paddingVertical:10,paddingHorizontal:15,borderRadius:12}}><Feather name="volume-2" color={C.accent} size={18}/><Text style={{color:C.accent,fontWeight:'800'}}>Play audio</Text></Pressable>;
}
export function CardBody({html,size=24}:{html:string;size?:number}){
  const images=[...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].slice(0,5);
  const sounds=[...html.matchAll(/\[sound:([^\]]+)\]/g)].slice(0,5);
  const body=plainText(html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/\[sound:[^\]]+\]/g,''));
  return <View style={{alignItems:'center',width:'100%',gap:13}}>
    <Text selectable style={{fontSize:size,fontWeight:'600',lineHeight:size*1.44,textAlign:'center',color:C.ink}}>{body||((images.length||sounds.length)?'':'(empty)')}</Text>
    {images.map((m,i)=>{const uri=mediaURI(m[1]);return uri?<Image key={`${m[1]}-${i}`} source={{uri}} resizeMode="contain" style={{height:180,width:'95%',borderRadius:12}}/>:null;})}
    {sounds.map((m,i)=>{const uri=mediaURI(m[1]);return uri?<AudioClip key={`${m[1]}-${i}`} uri={uri}/>:null;})}
  </View>;
}
