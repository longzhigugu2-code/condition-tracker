
const DB_NAME = 'conditionTrackerDB';
const DB_VERSION = 1;
let db;
let deferredPrompt = null;
let pendingFoodEstimate = null;

const DEFAULT_SETTINGS = { kcal:2200, p:150, f:60, c:250, weeklyWorkout:150 };

const FOOD_DB = {
  "ご飯": {unit:"100g", kcal:156,p:2.5,f:0.3,c:37.1},
  "白米": {unit:"100g", kcal:156,p:2.5,f:0.3,c:37.1},
  "玄米": {unit:"100g", kcal:152,p:2.8,f:1.0,c:35.6},
  "納豆": {unit:"1パック", kcal:90,p:7.4,f:4.5,c:5.4},
  "卵": {unit:"1個", kcal:76,p:6.2,f:5.2,c:0.2},
  "ゆで卵": {unit:"1個", kcal:76,p:6.2,f:5.2,c:0.2},
  "味噌汁": {unit:"1杯", kcal:40,p:2.5,f:1.5,c:4.0},
  "鶏胸肉": {unit:"100g", kcal:165,p:31.0,f:3.6,c:0},
  "鶏むね肉": {unit:"100g", kcal:165,p:31.0,f:3.6,c:0},
  "鶏もも肉": {unit:"100g", kcal:200,p:25.0,f:10.0,c:0},
  "豚ロース": {unit:"100g", kcal:248,p:19.3,f:19.2,c:0.2},
  "牛肉": {unit:"100g", kcal:250,p:17.1,f:21.1,c:0.3},
  "鮭": {unit:"1切れ", kcal:150,p:22.0,f:6.0,c:0},
  "鯖": {unit:"1切れ", kcal:260,p:20.0,f:20.0,c:0},
  "サバ": {unit:"1切れ", kcal:260,p:20.0,f:20.0,c:0},
  "豆腐": {unit:"100g", kcal:73,p:6.6,f:4.2,c:1.6},
  "ヨーグルト": {unit:"100g", kcal:62,p:3.6,f:3.0,c:4.9},
  "プロテイン": {unit:"1杯", kcal:120,p:23.0,f:2.0,c:4.0},
  "バナナ": {unit:"1本", kcal:93,p:1.1,f:0.2,c:22.5},
  "りんご": {unit:"1個", kcal:140,p:0.4,f:0.3,c:37.0},
  "食パン": {unit:"1枚", kcal:158,p:5.6,f:2.5,c:28.0},
  "うどん": {unit:"1杯", kcal:320,p:9.0,f:2.0,c:66.0},
  "そば": {unit:"1杯", kcal:360,p:14.0,f:2.5,c:70.0},
  "醤油ラーメン": {unit:"1杯", kcal:480,p:20.0,f:14.0,c:68.0},
  "ラーメン": {unit:"1杯", kcal:500,p:20.0,f:16.0,c:70.0},
  "親子丼": {unit:"1杯", kcal:680,p:28.0,f:18.0,c:95.0},
  "カレー": {unit:"1皿", kcal:750,p:18.0,f:25.0,c:105.0},
  "牛丼": {unit:"1杯", kcal:700,p:22.0,f:25.0,c:95.0},
  "サラダ": {unit:"1皿", kcal:80,p:3.0,f:3.0,c:10.0},
  "アボカド": {unit:"1個", kcal:260,p:3.5,f:25.0,c:12.0},
  "オートミール": {unit:"100g", kcal:380,p:13.7,f:5.7,c:69.1},
  "ツナ缶": {unit:"1缶", kcal:70,p:16.0,f:0.7,c:0.2},
  "おにぎり": {unit:"1個", kcal:180,p:3.5,f:0.7,c:40.0},
  "唐揚げ": {unit:"1個", kcal:80,p:5.0,f:5.0,c:4.0},
  "餃子": {unit:"1個", kcal:45,p:2.0,f:2.5,c:4.0},
  "ビール": {unit:"1杯", kcal:140,p:1.0,f:0,c:11.0},
};

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('days')) d.createObjectStore('days',{keyPath:'date'});
      if(!d.objectStoreNames.contains('settings')) d.createObjectStore('settings',{keyPath:'id'});
    };
    req.onsuccess=e=>{db=e.target.result;resolve(db)};
    req.onerror=e=>reject(e.target.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function getRecord(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putRecord(store,val){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>res(val);r.onerror=()=>rej(r.error)})}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}

function dateKey(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localIso(){ return new Date().toISOString(); }
function minutesBetween(a,b){ return Math.max(0, Math.round((new Date(b)-new Date(a))/60000)); }
function fmtTime(iso){ if(!iso) return '--:--'; return new Date(iso).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); }
function fmtDuration(min){ return `${Math.floor(min/60)}時間${String(min%60).padStart(2,'0')}分`; }
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function round1(n){return Math.round(n*10)/10}

async function getSettings(){
  return (await getRecord('settings','main')) || {id:'main',...DEFAULT_SETTINGS};
}
async function ensureDay(key=dateKey()){
  let day=await getRecord('days',key);
  if(!day){ day={date:key,sleep:null,foods:[],workouts:[],finalized:false}; await putRecord('days',day); }
  day.foods ||= []; day.workouts ||= [];
  return day;
}

function sleepDurationScore(minutes){
  const h=minutes/60;
  if(h>=7 && h<=9) return 30;
  if(h>=6.5) return 27;
  if(h>=6) return 23;
  if(h>=5.5) return 18;
  if(h>=5) return 12;
  if(h>=4) return 6;
  if(h<4) return 0;
  if(h<=10) return 27;
  if(h<=11) return 22;
  return 15;
}
function rhythmPart(diffMin){
  if(diffMin<=30)return 5;if(diffMin<=60)return 4;if(diffMin<=90)return 3;if(diffMin<=120)return 1;return 0;
}
function circularMinuteDiff(a,b){
  let d=Math.abs(a-b); return Math.min(d,1440-d);
}
function minuteOfDay(iso){const d=new Date(iso);return d.getHours()*60+d.getMinutes()}
async function computeSleepScore(day,allDays){
  if(!day.sleep?.start || !day.sleep?.end) return {score:null, detail:'未確定'};
  const mins=minutesBetween(day.sleep.start,day.sleep.end);
  const base=sleepDurationScore(mins);
  const prev=allDays.filter(d=>d.date<day.date && d.sleep?.start && d.sleep?.end).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  if(prev.length<3) return {score:Math.round(base/30*40), detail:fmtDuration(mins)};
  const avg=(arr)=>arr.reduce((a,b)=>a+b,0)/arr.length;
  const avgBed=avg(prev.map(x=>minuteOfDay(x.sleep.start)));
  const avgWake=avg(prev.map(x=>minuteOfDay(x.sleep.end)));
  const rhythm=rhythmPart(circularMinuteDiff(minuteOfDay(day.sleep.start),avgBed))+rhythmPart(circularMinuteDiff(minuteOfDay(day.sleep.end),avgWake));
  return {score:base+rhythm, detail:fmtDuration(mins)};
}
function foodTotals(day){
  return day.foods.reduce((a,x)=>({kcal:a.kcal+x.kcal,p:a.p+x.p,f:a.f+x.f,c:a.c+x.c}),{kcal:0,p:0,f:0,c:0});
}
function computeFoodScore(day,s){
  if(!day.foods.length) return {score:null,totals:foodTotals(day)};
  const t=foodTotals(day);
  const err=Math.abs(t.kcal-s.kcal)/s.kcal;
  const kcal=15*Math.max(0,1-err/0.35);
  const p=10*Math.min(t.p/s.p,1);
  const f=5*Math.max(0,1-Math.abs(t.f-s.f)/(s.f*0.5));
  const c=5*Math.max(0,1-Math.abs(t.c-s.c)/(s.c*0.5));
  return {score:Math.round((kcal+p+f+c)*10)/10,totals:t};
}
function workoutMinutes(day){return day.workouts.reduce((a,x)=>a+Number(x.minutes||0),0)}
async function computeWorkoutScore(day,allDays,s){
  const recentKeys=[];
  const base=new Date(day.date+'T12:00:00');
  for(let i=0;i<7;i++){const d=new Date(base);d.setDate(d.getDate()-i);recentKeys.push(dateKey(d))}
  const recent=allDays.filter(d=>recentKeys.includes(d.date));
  const weekly=recent.reduce((a,d)=>a+workoutMinutes(d),0);
  const today=workoutMinutes(day);
  if(today===0 && !day.workouts.length && weekly===0) return {score:null,weekly,today};
  let todayScore;
  if(today>0) todayScore=15*Math.min(today/30,1);
  else todayScore=(weekly>=s.weeklyWorkout*0.7)?12:0;
  const weeklyScore=10*Math.min(weekly/s.weeklyWorkout,1);
  return {score:Math.round((todayScore+weeklyScore)*10)/10,weekly,today};
}
async function condition(day,allDays,s){
  const sl=await computeSleepScore(day,allDays);
  const fd=computeFoodScore(day,s);
  const wo=await computeWorkoutScore(day,allDays,s);
  const parts=[{x:sl.score,max:40},{x:fd.score,max:35},{x:wo.score,max:25}];
  const available=parts.filter(p=>p.x!==null);
  const maxAvail=available.reduce((a,b)=>a+b.max,0);
  const earned=available.reduce((a,b)=>a+b.x,0);
  let score=maxAvail?Math.round(earned/maxAvail*100):null;
  const coverage=Math.round(maxAvail/100*100);
  if(sl.score!==null && day.sleep?.start && day.sleep?.end){
    const h=minutesBetween(day.sleep.start,day.sleep.end)/60;
    if(h<4 && score!==null) score=Math.min(score,60);
    else if(h<5 && score!==null) score=Math.min(score,75);
  }
  return {score,coverage,sl,fd,wo};
}

function scoreLabel(n){
  if(n===null)return 'データ待ち';
  if(n>=90)return '非常に良い';
  if(n>=80)return '良い';
  if(n>=70)return 'まずまず';
  if(n>=60)return '少し整えたい';
  return '回復を優先';
}
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),1800);
}
function escapeHtml(s=''){return s.replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))}

function parseAmount(text,key,item){
  const idx=text.indexOf(key);
  if(idx<0) return 1;
  const slice=text.slice(idx,idx+30);
  let m=slice.match(/(\d+(?:\.\d+)?)\s*g/);
  if(m && item.unit==='100g') return Number(m[1])/100;
  m=slice.match(/(\d+(?:\.\d+)?)\s*(個|杯|枚|本|パック|皿|切れ|缶)/);
  if(m) return Number(m[1]);
  return 1;
}
function analyzeFood(text){
  const found=[];
  // longer keys first to avoid "ラーメン" double counting "醤油ラーメン"
  const keys=Object.keys(FOOD_DB).sort((a,b)=>b.length-a.length);
  let masked=text;
  for(const key of keys){
    if(masked.includes(key)){
      const it=FOOD_DB[key];
      const qty=parseAmount(text,key,it);
      found.push({name:key,qty,unit:it.unit,kcal:it.kcal*qty,p:it.p*qty,f:it.f*qty,c:it.c*qty});
      masked=masked.replaceAll(key,' '.repeat(key.length));
    }
  }
  const totals=found.reduce((a,x)=>({kcal:a.kcal+x.kcal,p:a.p+x.p,f:a.f+x.f,c:a.c+x.c}),{kcal:0,p:0,f:0,c:0});
  return {items:found,kcal:Math.round(totals.kcal),p:round1(totals.p),f:round1(totals.f),c:round1(totals.c)};
}

async function refreshHome(){
  const key=dateKey(),day=await ensureDay(key),all=await getAll('days'),s=await getSettings(),c=await condition(day,all,s);
  document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
  document.getElementById('scoreNumber').textContent=c.score??'--';
  document.getElementById('scoreLabel').textContent=scoreLabel(c.score);
  document.getElementById('coverageLabel').textContent=`データ充足率 ${c.coverage}%`;
  document.getElementById('scoreRing').style.background=`conic-gradient(#111827 ${(c.score||0)*3.6}deg,#eef0f3 0deg)`;
  document.getElementById('scoreNote').textContent=c.score===null?'「起きた」や食事・運動を記録すると自動で更新されます。':(c.coverage<100?'暫定スコアです。記録が増えると精度が上がります。':'今日の記録から算出した確定に近いスコアです。');

  document.getElementById('sleepPoints').textContent=c.sl.score===null?'--/40':`${Math.round(c.sl.score)}/40`;
  document.getElementById('sleepDuration').textContent=c.sl.detail;
  document.getElementById('sleepTimes').textContent=day.sleep?.start?(day.sleep.end?`${fmtTime(day.sleep.start)} → ${fmtTime(day.sleep.end)}`:`${fmtTime(day.sleep.start)} → 睡眠中`):'寝る / 起きた で記録';

  document.getElementById('kcalNow').textContent=Math.round(c.fd.totals.kcal);
  document.getElementById('kcalTarget').textContent=s.kcal;
  document.getElementById('foodPoints').textContent=c.fd.score===null?'--/35':`${Math.round(c.fd.score)}/35`;
  document.getElementById('macroSummary').textContent=`P ${Math.round(c.fd.totals.p)}/${s.p}g　F ${Math.round(c.fd.totals.f)}/${s.f}g　C ${Math.round(c.fd.totals.c)}/${s.c}g`;

  document.getElementById('workoutPoints').textContent=c.wo.score===null?'--/25':`${Math.round(c.wo.score)}/25`;
  document.getElementById('workoutSummary').textContent=c.wo.today?`${c.wo.today}分`:'未記録';
  document.getElementById('weeklyWorkout').textContent=`直近7日 ${c.wo.weekly}/${s.weeklyWorkout}分`;
  document.getElementById('streakCount').textContent=`${calcStreak(all)}日`;

  const btn=document.getElementById('sleepActionBtn');
  btn.textContent=day.sleep?.start && !day.sleep.end?'起きた':'寝る';

  let next='まずは1つ記録してみましょう。';
  if(day.sleep?.start && !day.sleep.end) next='起きたら「起きた」を押すだけで睡眠時間を自動計算します。';
  else if(c.fd.totals.p < s.p*0.8 && day.foods.length) next=`たんぱく質が目標まで約${Math.max(0,Math.round(s.p-c.fd.totals.p))}gです。`;
  else if(c.wo.today===0) next='まだ運動記録がありません。10〜30分の活動でも記録できます。';
  else if(c.score!==null) next='今日の記録は順調です。夜は「寝る」を押して終了です。';
  document.getElementById('nextActionText').textContent=next;

  await refreshFoodList(day);
  await refreshWorkoutList(day);
}
function calcStreak(all){
  const map=new Map(all.map(d=>[d.date,d]));
  let count=0,d=new Date();
  while(true){
    const k=dateKey(d),x=map.get(k);
    if(x && (x.sleep?.start || x.foods?.length || x.workouts?.length)){count++;d.setDate(d.getDate()-1)}
    else break;
  }
  return count;
}
async function sleepAction(){
  const day=await ensureDay();
  if(!day.sleep?.start || day.sleep?.end){
    day.sleep={start:localIso(),end:null};
    toast('就寝時刻を記録しました');
  }else{
    day.sleep.end=localIso();
    toast('起床時刻を記録しました');
  }
  await putRecord('days',day); await refreshHome();
}
async function refreshFoodList(day){
  const el=document.getElementById('foodLogList');
  if(!day.foods.length){el.innerHTML='<div class="muted small">まだ食事記録はありません。</div>';return}
  el.innerHTML=day.foods.slice().reverse().map(x=>`<div class="log-item"><div><strong>${escapeHtml(x.mealType)}｜${escapeHtml(x.text)}</strong><small>${x.kcal}kcal / P${x.p} F${x.f} C${x.c}</small></div><small>${fmtTime(x.time)}</small></div>`).join('');
}
async function refreshWorkoutList(day){
  const el=document.getElementById('workoutLogList');
  if(!day.workouts.length){el.innerHTML='<div class="muted small">まだ運動記録はありません。</div>';return}
  el.innerHTML=day.workouts.slice().reverse().map(x=>`<div class="log-item"><div><strong>${escapeHtml(x.type)} ${x.minutes}分</strong><small>${escapeHtml(x.memo||'')}</small></div><small>${fmtTime(x.time)}</small></div>`).join('');
}

async function renderHistory(){
  const all=(await getAll('days')).sort((a,b)=>a.date.localeCompare(b.date));
  const s=await getSettings();
  const last=[];
  const base=new Date();
  for(let i=6;i>=0;i--){const d=new Date(base);d.setDate(d.getDate()-i);last.push(dateKey(d))}
  const rows=[];
  for(const k of last){
    const day=all.find(x=>x.date===k)||{date:k,foods:[],workouts:[],sleep:null};
    const c=await condition(day,all,s); rows.push({day,c});
  }
  document.getElementById('historyChart').innerHTML=rows.map(r=>{
    const date=new Date(r.day.date+'T12:00:00');
    const label=date.toLocaleDateString('ja-JP',{weekday:'short'});
    const score=r.c.score??0;
    return `<div class="bar-col"><div class="bar-score">${r.c.score??'--'}</div><div class="bar" style="height:${score}%"></div><div class="bar-label">${label}</div></div>`;
  }).join('');
  document.getElementById('historyList').innerHTML=rows.slice().reverse().map(r=>{
    const t=r.c.fd.totals,w=r.c.wo.today,sd=r.c.sl.detail;
    return `<div class="history-row"><div><strong>${r.day.date}</strong><small>睡眠 ${sd} / ${Math.round(t.kcal)}kcal / 運動 ${w}分</small></div><strong>${r.c.score??'--'}点</strong></div>`;
  }).join('');
}

async function saveSettings(){
  const s={id:'main',kcal:+setKcal.value||2200,p:+setP.value||150,f:+setF.value||60,c:+setC.value||250,weeklyWorkout:+setWeeklyWorkout.value||150};
  await putRecord('settings',s);toast('設定を保存しました');await refreshHome();
}
async function loadSettingsForm(){
  const s=await getSettings();
  setKcal.value=s.kcal;setP.value=s.p;setF.value=s.f;setC.value=s.c;setWeeklyWorkout.value=s.weeklyWorkout;
}
async function exportJson(){
  const payload={exportedAt:new Date().toISOString(),settings:await getSettings(),days:await getAll('days')};
  downloadBlob(JSON.stringify(payload,null,2),'condition-backup.json','application/json');
}
async function exportCsv(){
  const all=(await getAll('days')).sort((a,b)=>a.date.localeCompare(b.date));const s=await getSettings();
  const lines=['date,sleep_minutes,kcal,protein_g,fat_g,carbs_g,workout_minutes,condition_score'];
  for(const d of all){
    const c=await condition(d,all,s);const sm=(d.sleep?.start&&d.sleep?.end)?minutesBetween(d.sleep.start,d.sleep.end):'';
    lines.push([d.date,sm,Math.round(c.fd.totals.kcal),round1(c.fd.totals.p),round1(c.fd.totals.f),round1(c.fd.totals.c),c.wo.today,c.score??''].join(','));
  }
  downloadBlob('\ufeff'+lines.join('\n'),'condition-history.csv','text/csv;charset=utf-8');
}
function downloadBlob(content,name,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}

function nav(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(name+'View').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(name==='history')renderHistory();
  if(name==='settings')loadSettingsForm();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b)nav(b.dataset.nav)});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});
installBtn?.addEventListener('click',async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true}else{toast('Safariの共有 → ホーム画面に追加 を使ってください')}});

sleepActionBtn.addEventListener('click',sleepAction);
analyzeFoodBtn.addEventListener('click',()=>{
  const text=foodText.value.trim();
  if(!text){toast('食事内容を入力してください');return}
  const result=analyzeFood(text); pendingFoodEstimate={...result,text,mealType:mealType.value,time:localIso()};
  estKcal.textContent=result.kcal;estP.textContent=result.p+'g';estF.textContent=result.f+'g';estC.textContent=result.c+'g';
  foodBreakdown.innerHTML=result.items.length?result.items.map(x=>`・${escapeHtml(x.name)} × ${round1(x.qty)} → ${Math.round(x.kcal)}kcal`).join('<br>'):'食品データに一致しませんでした。登録済み食品名を含めて入力してください。';
  foodEstimateCard.hidden=false;
});
saveFoodBtn.addEventListener('click',async()=>{
  if(!pendingFoodEstimate)return;
  if(!pendingFoodEstimate.items.length){toast('解析できる食品がありません');return}
  const day=await ensureDay();day.foods.push(pendingFoodEstimate);await putRecord('days',day);
  pendingFoodEstimate=null;foodText.value='';foodEstimateCard.hidden=true;toast('食事を保存しました');await refreshHome();nav('home');
});
saveWorkoutBtn.addEventListener('click',async()=>{
  const m=Number(workoutMinutes.value);
  if(!m){toast('運動時間を入力してください');return}
  const day=await ensureDay();day.workouts.push({type:workoutType.value,minutes:m,memo:workoutMemo.value.trim(),time:localIso()});
  await putRecord('days',day);workoutMinutes.value='';workoutMemo.value='';toast('運動を保存しました');await refreshHome();nav('home');
});
saveSettingsBtn.addEventListener('click',saveSettings);
exportJsonBtn.addEventListener('click',exportJson);
exportCsvBtn.addEventListener('click',exportCsv);

(async function init(){
  await openDB();await ensureDay();await refreshHome();await loadSettingsForm();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
