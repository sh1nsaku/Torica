"use strict";

/** ========= デモ用 共有ストレージ ========= **/
const K = {
  STUDENTS: "torica_students",
  LOGS: "torica_logs",              // 日付キー -> 配列
  EMERGENCIES: "torica_emergencies",// 未処理が上
  TEACHERS: "torica_teachers",
  TEACHER_SESSION: "torica_teacher_session",
  GUARDIANS: "torica_guardians",
  GUARDIAN_SESSION: "torica_guardian_session",
  GUEST_TOKENS: "torica_guest_tokens" // token -> {cardId, place, exp, wrote:false}
};

// 学校情報（ゲストページ表示）
const SCHOOL_INFO = {
  name: "〇〇学園",
  campHotel: "△△リゾートホテル",
  emergencyTel: "03-1234-5678",
  helpNote: "位置情報送信は、迷子やトラブルの早期発見のために先生側へ現在地を共有する機能です。状況が落ち着いたら近くの先生の指示に従ってください。"
};

/** 初期データを投入（重複投入しない） */
function ensureInitData(){
  // 学生（例：2名）
  const students = JSON.parse(localStorage.getItem(K.STUDENTS) || "{}");
  if (!students["STU1234"]) students["STU1234"] = { name:"山田 太郎", grade:"高1-2", group:"A", serial:"SER-0001", number:"15" };
  if (!students["STU5678"]) students["STU5678"] = { name:"佐藤 花子", grade:"中3-1", group:"B", serial:"SER-0002", number:"8"  };
  localStorage.setItem(K.STUDENTS, JSON.stringify(students));

  // 教師アカウント（デモ）
  const teachers = JSON.parse(localStorage.getItem(K.TEACHERS) || "[]");
  if (!teachers.find(u=>u.email==="teacher@example.com")){
    teachers.push({name:"担任 標準", email:"teacher@example.com", pass:"torica123"});
    localStorage.setItem(K.TEACHERS, JSON.stringify(teachers));
  }

  // 保護者アカウント（デフォで2件）
  const guardians = JSON.parse(localStorage.getItem(K.GUARDIANS) || "[]");
  const has1 = guardians.some(g=>g.email==="parent1@example.com");
  const has2 = guardians.some(g=>g.email==="parent2@example.com");
  if (!has1) guardians.push({
    name:"山田 保護者", email:"parent1@example.com", pass:"parent123", schools:["SCH-0001"],
    child:{ cardId:"STU1234", name:"山田 太郎", grade:"高1-2", number:"15", group:"A" }
  });
  if (!has2) guardians.push({
    name:"佐藤 保護者", email:"parent2@example.com", pass:"parent123", schools:["SCH-0001"],
    child:{ cardId:"STU5678", name:"佐藤 花子", grade:"中3-1", number:"8", group:"B" }
  });
  if (!has1 || !has2) localStorage.setItem(K.GUARDIANS, JSON.stringify(guardians));

  // 空の入れ物
  if (!localStorage.getItem(K.EMERGENCIES)) localStorage.setItem(K.EMERGENCIES, "[]");
  if (!localStorage.getItem(K.LOGS)) localStorage.setItem(K.LOGS, "{}");
  if (!localStorage.getItem(K.GUEST_TOKENS)) localStorage.setItem(K.GUEST_TOKENS, "{}");
}
ensureInitData();

/** ========= ユーティリティ ========= **/
const nowISO = ()=> new Date().toISOString();
const todayKey = ()=> new Date().toISOString().slice(0,10);
const uid = ()=> Math.random().toString(36).slice(2)+Date.now().toString(36);
function jget(k, d){ try{ return JSON.parse(localStorage.getItem(k)||d);}catch{ return JSON.parse(d);} }
function jset(k, v){ localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new StorageEvent("storage",{key:k})); }

/** 文字列から安定カードID生成（シリアル→STUxxxxxx） */
function cardIdFromSerial(serial) {
  const clean = (serial||"").replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  let h = 0; for (let i=0;i<clean.length;i++){ h = (h*31 + clean.charCodeAt(i)) >>> 0; }
  return "STU" + h.toString(36).toUpperCase().padStart(6,'0').slice(-6);
}

/** ========= ログ（通過記録） ========= **/
function recordPassage({cardId, place, source="gate"}) {
  const all = jget(K.LOGS, "{}");
  const day = todayKey();
  all[day] = all[day] || [];
  const students = jget(K.STUDENTS, "{}");
  const s = students[cardId];
  all[day].unshift({
    id: uid(), ts: nowISO(), cardId, place,
    name: s? s.name : "(未登録)", grade: s? s.grade : "-", group: s? s.group : "-",
    source
  });
  jset(K.LOGS, all);
}

/** ========= 緊急（優先表示） ========= **/
function pushEmergency({cardId, lat=null, lng=null, place="緊急タッチ"}) {
  const list = jget(K.EMERGENCIES, "[]");
  const students = jget(K.STUDENTS, "{}");
  const s = students[cardId];
  list.unshift({
    id: uid(), ts: nowISO(), status:"open",
    cardId, name: s? s.name:"(未登録)", grade: s? s.grade:"-", group: s? s.group:"-",
    lat, lng, place
  });
  jset(K.EMERGENCIES, list);
}
function closeEmergency(id){
  const list = jget(K.EMERGENCIES, "[]");
  const idx = list.findIndex(e=>e.id===id);
  if (idx>=0){ list[idx].status="closed"; jset(K.EMERGENCIES, list); }
}
function getOpenEmergencies(){ return jget(K.EMERGENCIES,"[]").filter(e=>e.status==="open"); }

/** ========= ログ取得 ========= **/
function getTodayLogs(){ const all=jget(K.LOGS,"{}"); return all[todayKey()]||[]; }
function clearTodayLogs(){ const all=jget(K.LOGS,"{}"); all[todayKey()]=[]; jset(K.LOGS,all); }

/** ========= ゲストURL用セッショントークン ========= **/
function createGuestToken({cardId, place, ttlMs=10*60*1000}) {
  const tokens = jget(K.GUEST_TOKENS, "{}");
  const t = uid();
  tokens[t] = { cardId, place, exp: Date.now()+ttlMs, wrote:false };
  jset(K.GUEST_TOKENS, tokens);
  return t;
}
function readGuestToken(t){
  const tokens = jget(K.GUEST_TOKENS, "{}");
  const info = tokens[t];
  if (!info) return {ok:false, reason:"notfound"};
  if (Date.now()>info.exp) return {ok:false, reason:"expired"};
  return {ok:true, info};
}
function markGuestTokenWrote(t){
  const tokens = jget(K.GUEST_TOKENS, "{}");
  if (tokens[t]) { tokens[t].wrote = true; jset(K.GUEST_TOKENS, tokens); }
}

/** ========= 教師ログイン ========= **/
function teacherLogin(email, pass){
  const list = jget(K.TEACHERS,"[]");
  const u = list.find(x=>x.email===email && x.pass===pass);
  if (!u) return null;
  jset(K.TEACHER_SESSION, { email:u.email, name:u.name, at:Date.now() });
  return u;
}
function teacherSession(){ try{ return JSON.parse(localStorage.getItem(K.TEACHER_SESSION)); }catch{ return null; } }
function teacherLogout(){ localStorage.removeItem(K.TEACHER_SESSION); }

/** ========= 保護者アカウント（登録=学生登録/更新） ========= **/
function guardianRegister({name,email,pass,schoolCode,schoolPass,serial,student}){
  if (schoolCode!=="SCH-0001" || schoolPass!=="PASS-0001") return {ok:false, msg:"学校コード/パスワードが不正です"};

  const students = jget(K.STUDENTS,"{}");
  let match = Object.entries(students).find(([cid, s])=> (s.serial||"") === serial);
  let cardId;
  if (match) {
    cardId = match[0];
    students[cardId] = { ...(students[cardId]||{}), serial, ...student };
  } else {
    cardId = cardIdFromSerial(serial);
    if (students[cardId]) { cardId = cardId + Math.random().toString(36).slice(2,4).toUpperCase(); }
    students[cardId] = { ...student, serial };
  }
  jset(K.STUDENTS, students);

  const gs = jget(K.GUARDIANS,"[]");
  if (gs.find(g=>g.email===email)) return {ok:false,msg:"このメールは既に登録済みです"};
  gs.push({name,email,pass,schools:["SCH-0001"], child:{cardId, ...student}});
  jset(K.GUARDIANS, gs);

  jset(K.GUARDIAN_SESSION, {email,name,cardId, at:Date.now()});
  return {ok:true};
}
function guardianLogin(email, pass){
  const gs = jget(K.GUARDIANS,"[]");
  const g = gs.find(x=>x.email===email && x.pass===pass);
  if (!g) return null;
  jset(K.GUARDIAN_SESSION, {email, name:g.name, cardId:g.child.cardId, at:Date.now()});
  return g;
}
function guardianSession(){ try{ return JSON.parse(localStorage.getItem(K.GUARDIAN_SESSION)); }catch{return null;} }
function guardianLogout(){ localStorage.removeItem(K.GUARDIAN_SESSION); }

/** ========= 公開 ========= **/
window.ToriCa = {
  K,SCHOOL_INFO,
  recordPassage, getTodayLogs, clearTodayLogs,
  pushEmergency, getOpenEmergencies, closeEmergency,
  createGuestToken, readGuestToken, markGuestTokenWrote,
  teacherLogin, teacherSession, teacherLogout,
  guardianRegister, guardianLogin, guardianSession, guardianLogout
};
