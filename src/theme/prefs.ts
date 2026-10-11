import {db} from '../data/database';
import {DEFAULT_UI_PREFS, PALETTES, type UIPrefs} from './ui';
export async function loadUIPrefs():Promise<UIPrefs>{
  const row=await (await db()).getFirstAsync<{value:string}>("SELECT value FROM preferences WHERE key='ui_prefs'");
  try{
    const parsed=JSON.parse(row?.value||'{}');
    return {
      accent: Object.prototype.hasOwnProperty.call(PALETTES,parsed.accent)?parsed.accent:DEFAULT_UI_PREFS.accent,
      density:parsed.density==='compact'?'compact':'comfortable',
      answerSize:[22,26,30].includes(parsed.answerSize)?parsed.answerSize:DEFAULT_UI_PREFS.answerSize,
      showIntervals:typeof parsed.showIntervals==='boolean'?parsed.showIntervals:DEFAULT_UI_PREFS.showIntervals,
      tapToReveal:typeof parsed.tapToReveal==='boolean'?parsed.tapToReveal:DEFAULT_UI_PREFS.tapToReveal,
    };
  }catch{return DEFAULT_UI_PREFS;}
}
export async function saveUIPrefs(value:UIPrefs){
  await (await db()).runAsync("INSERT INTO preferences(key,value) VALUES('ui_prefs',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(value));
}
