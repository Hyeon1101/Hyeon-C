/**
 * 서버 API 래퍼
 *  - /api/dict : 네이버 중국어사전 프록시
 *  - /api/ai   : Gemini (번역 · 문법 · 회화 · 발음교정)
 *  - /data/*   : 빌드 시 구워둔 HSK 단어 데이터
 */

const memCache = new Map();
const DICT_CACHE_KEY = 'hanyu.dict.v1';

let diskCache = {};
try {
  diskCache = JSON.parse(localStorage.getItem(DICT_CACHE_KEY) || '{}');
} catch {
  diskCache = {};
}

let flushTimer = null;
function flushDisk() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    try {
      const keys = Object.keys(diskCache);
      // 너무 커지면 오래된 것부터 버린다
      if (keys.length > 600) {
        const trimmed = {};
        for (const k of keys.slice(-500)) trimmed[k] = diskCache[k];
        diskCache = trimmed;
      }
      localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(diskCache));
    } catch {
      /* 용량 초과 시 무시 */
    }
  }, 400);
}

/* ---------- 사전 ---------- */

export async function dictLookup(word, { examples = true } = {}) {
  const key = `d:${word}:${examples ? 1 : 0}`;
  if (memCache.has(key)) return memCache.get(key);
  if (diskCache[key]) {
    memCache.set(key, diskCache[key]);
    return diskCache[key];
  }

  const url = `/api/dict?q=${encodeURIComponent(word)}${examples ? '&ex=1' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`사전 조회 실패 (${res.status})`);
  const data = await res.json();

  memCache.set(key, data);
  diskCache[key] = data;
  flushDisk();
  return data;
}

export async function dictKoToZh(korean) {
  const key = `k:${korean}`;
  if (memCache.has(key)) return memCache.get(key);
  const res = await fetch(`/api/dict?q=${encodeURIComponent(korean)}&dir=kozh`);
  if (!res.ok) throw new Error(`사전 조회 실패 (${res.status})`);
  const data = await res.json();
  memCache.set(key, data);
  return data;
}

/* ---------- AI ---------- */

export async function ai(action, payload = {}) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `AI 요청 실패 (${res.status})`);
  }
  return data.result;
}

/* ---------- HSK 데이터 ---------- */

const levelCache = new Map();

/** 급수별 단어 목록 (기본 정보 + 네이버에서 미리 구워둔 한국어 뜻·예문) */
export async function loadLevel(level) {
  if (levelCache.has(level)) return levelCache.get(level);

  const [baseRes, koRes] = await Promise.all([
    fetch(`/data/hsk${level}.json`),
    fetch(`/data/ko/hsk${level}.json`).catch(() => null),
  ]);

  if (!baseRes.ok) throw new Error(`HSK ${level}급 단어를 불러오지 못했습니다.`);
  const base = await baseRes.json();
  const ko = koRes && koRes.ok ? await koRes.json().catch(() => ({})) : {};

  const merged = base.map((item) => {
    const extra = ko[item.w] || null;
    return {
      w: item.w,
      t: item.t || '',
      p: extra?.p || item.p,
      n: item.n,
      e: item.e || [],
      // 한국어 뜻 (네이버). 없으면 영어 뜻으로 대체 표시한다.
      k: extra?.k || [],
      ex: extra?.x || [],
      // 급수는 지금 보고 있는 목록 기준으로 표시한다 (사전의 HSK 태그와 다를 수 있음)
      h: item.l,
      l: item.l,
      f: item.f,
      src: extra?.s || '',
    };
  });

  levelCache.set(level, merged);
  return merged;
}

let indexCache = null;
export async function loadIndex() {
  if (indexCache) return indexCache;
  const res = await fetch('/data/index.json');
  indexCache = res.ok ? await res.json() : { levels: [], total: 0 };
  return indexCache;
}

/** 전체 급수에서 단어 찾기 (검색 자동완성·급수 배지에 사용) */
export async function findInHsk(word) {
  for (let lv = 1; lv <= 6; lv++) {
    const list = await loadLevel(lv).catch(() => []);
    const hit = list.find((x) => x.w === word);
    if (hit) return hit;
  }
  return null;
}
