/**
 * 학습 기록 저장소 — localStorage 기반.
 * 저장 단어 / 즐겨찾기 / 일별 학습기록 / 스트릭 / 설정을 담당한다.
 */

const BASE_KEY = 'hanyu.study.v1';
const GUEST_KEY = 'hanyu.study.v1:guest';
const USER_KEY = 'hanyu.user.profile';

let currentUser = loadUser();

// 게스트 상태일 때 기존 localStorage에 남아있던 게스트 데이터 정리
if (isGuest()) {
  try {
    localStorage.removeItem(GUEST_KEY);
    localStorage.removeItem(BASE_KEY);
  } catch (e) {}
}

function isGuest() {
  return !currentUser || (!currentUser.email && !currentUser.id);
}

function getStorage() {
  // 비로그인 게스트는 사이트 종료 시 초기화되는 sessionStorage 사용,
  // 로그인 유저는 영구 보존되는 localStorage 사용
  return isGuest() ? sessionStorage : localStorage;
}

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getStorageKey() {
  if (currentUser && (currentUser.email || currentUser.id)) {
    const userIdentifier = (currentUser.email || currentUser.id).toLowerCase().trim();
    return `${BASE_KEY}:user:${userIdentifier}`;
  }
  return GUEST_KEY;
}

const DEFAULTS = () => ({
  v: 1,
  words: {},   // 단어 -> 학습 정보
  days: {},    // 'YYYY-MM-DD' -> 그날의 학습량
  settings: {
    theme: 'auto',
    level: 1,
    showPinyin: true,
    showKo: true,
    ttsRate: 0.9,
    autoTTS: true,
    chatLevel: 'beginner',
  },
  meta: { createdAt: Date.now(), lastVisit: 0, sessionStart: Date.now() },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const storage = getStorage();
    const key = getStorageKey();
    const raw = storage.getItem(key);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      meta: { ...base.meta, ...(parsed.meta || {}) },
      words: parsed.words || {},
      days: parsed.days || {},
    };
  } catch {
    return DEFAULTS();
  }
}

let saveTimer = null;
let cloudSyncTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const storage = getStorage();
      const key = getStorageKey();
      storage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn('저장 실패', e);
    }
    debouncedCloudSync();
  }, 180);
  listeners.forEach((fn) => fn(state));
}

export function syncToCloud(customState) {
  if (isGuest()) return Promise.resolve(false);
  const user = currentUser?.email || currentUser?.id;
  if (!user) return Promise.resolve(false);

  const payloadData = customState || state;
  return fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save',
      user,
      data: payloadData,
    }),
  })
    .then((r) => r.json())
    .then((res) => Boolean(res.ok))
    .catch((err) => {
      console.warn('Cloud sync error:', err);
      return false;
    });
}

function debouncedCloudSync() {
  if (isGuest()) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    syncToCloud();
  }, 1200);
}

export async function syncFromCloud(user) {
  const targetUser = user || currentUser;
  const identifier = targetUser?.email || targetUser?.id;
  if (!identifier) return { success: false, reason: 'no_user' };

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'load',
        user: identifier,
      }),
    });
    const result = await res.json();
    if (result.ok && result.found && result.data) {
      const cloudData = result.data;
      state = mergeState(state, cloudData);
      const storage = getStorage();
      storage.setItem(getStorageKey(), JSON.stringify(state));
      listeners.forEach((fn) => fn(state));
      return { success: true, count: Object.keys(state.words || {}).length, syncedAt: result.syncedAt };
    } else if (result.ok && !result.found) {
      // 클라우드에 데이터가 없으나 로컬에 이미 학습한 단어가 있다면 즉시 클라우드로 백업
      if (Object.keys(state.words || {}).length > 0) {
        await syncToCloud(state);
      }
      return { success: true, count: Object.keys(state.words || {}).length, initialUploaded: true };
    }
    return { success: false, reason: result.error || 'not_found' };
  } catch (err) {
    console.warn('Sync from cloud failed:', err);
    return { success: false, reason: err.message };
  }
}

export function mergeState(local, cloud) {
  const base = DEFAULTS();
  const mergedWords = { ...(cloud.words || {}), ...(local.words || {}) };

  // 양쪽에 모두 있는 단어는 최신/높은 학습량 기준으로 스마트 병합
  for (const [w, cItem] of Object.entries(cloud.words || {})) {
    if (local.words?.[w]) {
      const lItem = local.words[w];
      mergedWords[w] = {
        ...cItem,
        ...lItem,
        seen: Math.max(cItem.seen || 0, lItem.seen || 0),
        quizRight: (cItem.quizRight || 0) + (lItem.quizRight || 0),
        quizWrong: (cItem.quizWrong || 0) + (lItem.quizWrong || 0),
        fav: Boolean(cItem.fav || lItem.fav),
        mastery: Math.max(cItem.mastery || 0, lItem.mastery || 0),
        lastSeen: Math.max(cItem.lastSeen || 0, lItem.lastSeen || 0),
      };
    }
  }

  // 일별 통계 병합
  const mergedDays = { ...(cloud.days || {}) };
  for (const [dayKey, lDay] of Object.entries(local.days || {})) {
    if (mergedDays[dayKey]) {
      const cDay = mergedDays[dayKey];
      mergedDays[dayKey] = {
        learned: Math.max(cDay.learned || 0, lDay.learned || 0),
        review: Math.max(cDay.review || 0, lDay.review || 0),
        quizRight: Math.max(cDay.quizRight || 0, lDay.quizRight || 0),
        quizWrong: Math.max(cDay.quizWrong || 0, lDay.quizWrong || 0),
        chat: Math.max(cDay.chat || 0, lDay.chat || 0),
        pron: Math.max(cDay.pron || 0, lDay.pron || 0),
        dictation: Math.max(cDay.dictation || 0, lDay.dictation || 0),
        sec: Math.max(cDay.sec || 0, lDay.sec || 0),
      };
    } else {
      mergedDays[dayKey] = lDay;
    }
  }

  return {
    ...base,
    ...cloud,
    ...local,
    words: mergedWords,
    days: mergedDays,
    settings: { ...base.settings, ...(cloud.settings || {}), ...(local.settings || {}) },
    meta: {
      ...base.meta,
      ...(cloud.meta || {}),
      ...(local.meta || {}),
      lastVisit: Math.max(cloud.meta?.lastVisit || 0, local.meta?.lastVisit || 0),
    },
  };
}

export function getUser() {
  return currentUser;
}

export function setUser(user) {
  currentUser = user;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn(e);
  }
  state = load();
  listeners.forEach((fn) => fn(state));
  // 로그인 시 즉시 클라우드 데이터 동기화
  syncFromCloud(user);
}

export function clearUser() {
  currentUser = null;
  try {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(GUEST_KEY);
  } catch (e) {
    console.warn(e);
  }
  state = load();
  listeners.forEach((fn) => fn(state));
}

// 시작 시 로그인 상태면 백그라운드 클라우드 동기화 수행
if (!isGuest()) {
  setTimeout(() => {
    syncFromCloud(currentUser);
  }, 400);
}

export function getSavedAccounts() {
  const accounts = [];
  const prefix = `${BASE_KEY}:user:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const identifier = k.slice(prefix.length);
        const dataStr = localStorage.getItem(k);
        let wordCount = 0;
        let lastVisit = 0;
        try {
          const d = JSON.parse(dataStr);
          wordCount = Object.keys(d.words || {}).length;
          lastVisit = d.meta?.lastVisit || 0;
        } catch {}
        const isCurrent = currentUser && (currentUser.email || currentUser.id).toLowerCase() === identifier;
        accounts.push({
          id: identifier,
          email: identifier.includes('@') ? identifier : `${identifier}@google.com`,
          name: identifier.includes('@') ? identifier.split('@')[0] : identifier,
          wordCount,
          lastVisit,
          isCurrent,
        });
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return accounts.sort((a, b) => b.lastVisit - a.lastVisit);
}

export function deleteAccount(identifier) {
  const key = `${BASE_KEY}:user:${identifier.toLowerCase().trim()}`;
  try {
    localStorage.removeItem(key);
    if (currentUser && (currentUser.email || currentUser.id).toLowerCase() === identifier.toLowerCase()) {
      clearUser();
    }
  } catch (e) {
    console.warn(e);
  }
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.words) return false;
    state = { ...DEFAULTS(), ...parsed };
    persist();
    return true;
  } catch {
    return false;
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

/* ---------- 날짜 ---------- */

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayEntry(key = todayKey()) {
  if (!state.days[key]) {
    state.days[key] = { learned: 0, review: 0, quizRight: 0, quizWrong: 0, chat: 0, pron: 0, dictation: 0, sec: 0 };
  }
  return state.days[key];
}

/* ---------- 설정 ---------- */

export function getSetting(name) {
  return state.settings[name];
}

export function setSetting(name, value) {
  state.settings[name] = value;
  persist();
}

/* ---------- 단어 ---------- */

/** 단어 저장 (이미 있으면 정보만 보강) */
export function saveWord(word) {
  const w = word.w || word.word;
  if (!w) return null;
  const prev = state.words[w];
  const entry = {
    w,
    p: word.p || word.pinyin || prev?.p || '',
    k: word.k || word.means || prev?.k || [],
    h: word.h || word.hsk || prev?.h || 0,
    ex: word.ex || word.examples || prev?.ex || [],
    fav: prev?.fav || false,
    mastery: prev?.mastery || 0,
    right: prev?.right || 0,
    wrong: prev?.wrong || 0,
    addedAt: prev?.addedAt || Date.now(),
    lastAt: Date.now(),
  };
  const isNew = !prev;
  state.words[w] = entry;
  if (isNew) dayEntry().learned += 1;
  else dayEntry().review += 1;
  touchVisit();
  persist();
  return { entry, isNew };
}

export function removeWord(w) {
  delete state.words[w];
  persist();
}

export function hasWord(w) {
  return Boolean(state.words[w]);
}

export function getWord(w) {
  return state.words[w] || null;
}

export function allWords() {
  return Object.values(state.words);
}

export function favorites() {
  return Object.values(state.words).filter((x) => x.fav);
}

/** 즐겨찾기(안 외워지는 단어) 토글 */
export function toggleFav(word) {
  const w = word.w || word.word || word;
  if (!state.words[w]) {
    if (typeof word === 'object') saveWord(word);
    else return false;
  }
  const entry = state.words[w];
  entry.fav = !entry.fav;
  persist();
  return entry.fav;
}

/* ---------- 학습 기록 ---------- */

export function recordQuiz(word, correct) {
  const entry = state.words[word];
  if (entry) {
    if (correct) {
      entry.right += 1;
      entry.mastery = Math.min(5, entry.mastery + 1);
      // 3회 연속 수준으로 익숙해지면 즐겨찾기에서 자동 해제
      if (entry.mastery >= 4) entry.fav = false;
    } else {
      entry.wrong += 1;
      entry.mastery = Math.max(0, entry.mastery - 1);
      entry.fav = true; // 틀린 단어는 자동으로 즐겨찾기(복습함)에 넣는다
    }
    entry.lastAt = Date.now();
  }
  const d = dayEntry();
  if (correct) d.quizRight += 1;
  else d.quizWrong += 1;
  touchVisit();
  persist();
}

/** 단어를 자세히 들여다본 것도 학습으로 친다 */
export function recordSeen(n = 1) {
  dayEntry().review += n;
  touchVisit();
  persist();
}

export function recordChat(n = 1) {
  dayEntry().chat += n;
  touchVisit();
  persist();
}

export function recordPron() {
  dayEntry().pron += 1;
  touchVisit();
  persist();
}

export function recordDictation(n = 1) {
  dayEntry().dictation += n;
  touchVisit();
  persist();
}

/** 페이지에 머문 시간 누적 */
export function recordSeconds(sec) {
  if (sec <= 0) return;
  dayEntry().sec += Math.round(sec);
  persist();
}

function touchVisit() {
  state.meta.lastVisit = Date.now();
}

/* ---------- 통계 ---------- */

/** 학습한 날인지 (무엇이든 한 가지라도 했으면 참) */
function isActive(d) {
  if (!d) return false;
  return d.learned + d.review + d.quizRight + d.quizWrong + d.chat + d.pron + (d.dictation || 0) > 0;
}

export function dayScore(d) {
  if (!d) return 0;
  return d.learned + d.review * 0.5 + d.quizRight + d.quizWrong + d.chat + d.pron + (d.dictation || 0);
}

/** 연속 학습일 (오늘 아직 안 했으면 어제까지로 계산) */
export function streak() {
  const now = new Date();
  let count = 0;
  let cursor = new Date(now);

  if (!isActive(state.days[todayKey(now)])) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 3650; i++) {
    if (isActive(state.days[todayKey(cursor)])) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return count;
}

export function longestStreak() {
  const keys = Object.keys(state.days).filter((k) => isActive(state.days[k])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    const d = new Date(k + 'T00:00:00');
    if (prev && (d - prev) / 86400000 === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function totalStudyDays() {
  return Object.values(state.days).filter(isActive).length;
}

export function stats() {
  const words = allWords();
  const days = Object.entries(state.days);
  const quizRight = days.reduce((s, [, d]) => s + d.quizRight, 0);
  const quizWrong = days.reduce((s, [, d]) => s + d.quizWrong, 0);
  const totalSec = days.reduce((s, [, d]) => s + (d.sec || 0), 0);
  const chat = days.reduce((s, [, d]) => s + d.chat, 0);
  const pron = days.reduce((s, [, d]) => s + (d.pron || 0), 0);
  const dictation = days.reduce((s, [, d]) => s + (d.dictation || 0), 0);

  const byLevel = {};
  for (let lv = 1; lv <= 6; lv++) byLevel[lv] = 0;
  for (const w of words) {
    const lv = w.h >= 1 && w.h <= 6 ? w.h : 0;
    if (lv) byLevel[lv] += 1;
  }

  return {
    savedCount: words.length,
    favCount: words.filter((w) => w.fav).length,
    masteredCount: words.filter((w) => w.mastery >= 4).length,
    quizRight,
    quizWrong,
    quizTotal: quizRight + quizWrong,
    accuracy: quizRight + quizWrong ? Math.round((quizRight / (quizRight + quizWrong)) * 100) : 0,
    chat,
    pron,
    dictation,
    totalSec,
    streak: streak(),
    longest: longestStreak(),
    studyDays: totalStudyDays(),
    byLevel,
    today: state.days[todayKey()] || { learned: 0, review: 0, quizRight: 0, quizWrong: 0, chat: 0, pron: 0, dictation: 0, sec: 0 },
  };
}

/** 최근 N일의 일별 기록 (오래된 → 최신) */
export function recentDays(n = 84) {
  const out = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const key = todayKey(cursor);
    out.push({ key, date: new Date(cursor), data: state.days[key] || null });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/* ---------- 백업 ---------- */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.words) throw new Error('형식이 올바르지 않습니다.');
  state = { ...DEFAULTS(), ...parsed };
  persist();
}

export function resetAll() {
  state = DEFAULTS();
  persist();
}

/* 세션 체류시간 기록 */
if (typeof window !== 'undefined') {
  let lastTick = Date.now();
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      if (delta < 90) recordSeconds(delta);
      lastTick = now;
    } else {
      lastTick = Date.now();
    }
  }, 30000);
}
