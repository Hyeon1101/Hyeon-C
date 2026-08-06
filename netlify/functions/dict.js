/**
 * 네이버 중국어사전 프록시
 *
 *  GET /api/dict?q=学习              단어 상세 (뜻 · 병음 · 예문 · 원어민 음원 · HSK급수)
 *  GET /api/dict?q=学习&ex=1         예문까지 함께 (문장 전체 병음 포함)
 *  GET /api/dict?words=你好,学习,...  목록용 간략 정보 일괄 조회 (최대 30개)
 *  GET /api/dict?q=공부&dir=kozh     한국어 → 중국어
 *
 * 브라우저에서 네이버로 직접 요청하면 CORS 로 막히므로 서버에서 중계한다.
 * 응답은 결정적이라 CDN 에 길게 캐싱시켜 네이버 호출량을 줄인다.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Referer: 'https://zh.dict.naver.com/',
};

// 웜 람다 재사용을 노린 메모리 캐시
const memo = new Map();
const MEMO_MAX = 800;
const MEMO_TTL = 1000 * 60 * 60 * 6;

function cacheGet(key) {
  const hit = memo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MEMO_TTL) {
    memo.delete(key);
    return null;
  }
  return hit.val;
}

function cacheSet(key, val) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, { at: Date.now(), val });
}

function strip(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function naver(url, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) return null; // 차단 시 HTML 에러페이지가 온다
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function searchUrl(query, { range = 'word', lang = 'zhko' } = {}) {
  const host = lang === 'kozh' ? 'korean.dict.naver.com' : 'zh.dict.naver.com';
  return (
    `https://${host}/api3/${lang}/search?query=${encodeURIComponent(query)}` +
    `&range=${range}&page=1&shouldSearchOpen=false`
  );
}

function pickItems(data, key) {
  return data?.searchResultMap?.searchResultListMap?.[key]?.items || [];
}

/** 검색 결과 중 실제로 찾던 표제어를 고른다 */
function bestEntry(items, query) {
  let best = null;
  let bestScore = -1;
  for (const it of items) {
    const entry = strip(it.expEntry);
    let score = 0;
    if (entry === query) score += 100;
    else if (entry.replace(/[《》\s]/g, '') === query) score += 60;
    else continue; // 표제어가 다르면 후보에서 제외
    if (String(it.matchType || '').startsWith('exact:entry')) score += 30;
    if (it.meansCollector?.length) score += 20;
    if (it.searchPhoneticSymbolList?.[0]?.symbolValue) score += 15;
    if (it.frequencyAdd) score += 10;
    score += Number(it.documentQuality || 0);
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function parseAudio(symbolFile) {
  if (!symbolFile) return null;
  const [female, male] = String(symbolFile).split('|');
  return { female: female || null, male: male || null };
}

function parseHsk(frequencyAdd) {
  const m = /HSK\s*(\d)/i.exec(String(frequencyAdd || ''));
  return m ? Number(m[1]) : null;
}

/** 단어 항목 → 우리 앱 형식 */
function parseWord(it) {
  if (!it) return null;
  const phon = it.searchPhoneticSymbolList?.[0] || {};
  const means = [];
  const examples = [];

  for (const group of it.meansCollector || []) {
    const pos = strip(group.partOfSpeech);
    for (const m of group.means || []) {
      const value = strip(m.value);
      if (value) means.push({ pos, text: value });
      if (m.exampleOri) {
        examples.push({ zh: strip(m.exampleOri), ko: strip(m.exampleTrans), py: '' });
      }
    }
  }

  return {
    word: strip(it.expEntry),
    traditional: strip(it.searchTraditionalChineseList?.[0]?.value || ''),
    pinyin: strip(phon.symbolValue),
    audio: parseAudio(phon.symbolFile),
    hsk: parseHsk(it.frequencyAdd),
    means,
    examples,
    source: strip(it.sourceDictnameKO),
    link: it.destinationLinkKo || '',
  };
}

/** 예문 검색 결과 (문장 전체 병음이 들어있다) */
function parseExamples(data, limit = 6) {
  return pickItems(data, 'EXAMPLE')
    .filter((it) => it.expExample1 && it.expExample2)
    .slice(0, limit)
    .map((it) => ({
      zh: strip(it.expExample1),
      py: strip(it.expExample1Pronun),
      ko: strip(it.expExample2),
      source: strip(it.sourceDictnameKO),
    }));
}

async function lookupWord(query) {
  const key = `w:${query}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const data = await naver(searchUrl(query));
  const parsed = parseWord(bestEntry(pickItems(data, 'WORD'), query));
  cacheSet(key, parsed);
  return parsed;
}

async function lookupExamples(query) {
  const key = `e:${query}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const data = await naver(searchUrl(query, { range: 'example' }));
  const parsed = parseExamples(data);
  cacheSet(key, parsed);
  return parsed;
}

/** 동시 요청 수를 제한해 네이버 쪽 차단을 피한다 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function json(body, { status = 200, cache = 'public, max-age=86400, s-maxage=604800' } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
    },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const words = (url.searchParams.get('words') || '').trim();
  const dir = url.searchParams.get('dir') || 'zhko';
  const withExamples = url.searchParams.get('ex') === '1';

  try {
    // 목록용 일괄 조회
    if (words) {
      const list = [...new Set(words.split(',').map((w) => w.trim()).filter(Boolean))].slice(0, 30);
      const results = await mapLimit(list, 5, async (w) => {
        const parsed = await lookupWord(w);
        if (!parsed) return { word: w, missing: true };
        return {
          word: parsed.word,
          pinyin: parsed.pinyin,
          hsk: parsed.hsk,
          audio: parsed.audio,
          means: parsed.means.slice(0, 2),
          examples: parsed.examples.slice(0, 1),
        };
      });
      return json({ ok: true, items: results });
    }

    if (!q) return json({ ok: false, error: 'q 또는 words 파라미터가 필요합니다.' }, { status: 400, cache: 'no-store' });

    // 한국어 → 중국어
    if (dir === 'kozh') {
      const data = await naver(searchUrl(q, { lang: 'kozh' }));
      const items = pickItems(data, 'WORD')
        .slice(0, 8)
        .map((it) => ({
          entry: strip(it.expEntry),
          means: (it.meansCollector || [])
            .flatMap((g) => (g.means || []).map((m) => strip(m.value)))
            .filter(Boolean)
            .slice(0, 3),
        }))
        .filter((x) => x.means.length);
      return json({ ok: true, dir: 'kozh', query: q, items });
    }

    // 중국어 단어 상세
    const [word, examples] = await Promise.all([
      lookupWord(q),
      withExamples ? lookupExamples(q) : Promise.resolve([]),
    ]);

    if (!word && !examples.length) {
      return json({ ok: true, found: false, query: q }, { cache: 'public, max-age=600' });
    }

    // 사전 예문(병음 없음) 뒤에 문장 병음이 있는 예문을 우선 배치
    const merged = [...examples];
    for (const ex of word?.examples || []) {
      if (merged.length >= 8) break;
      if (!merged.some((m) => m.zh === ex.zh)) merged.push(ex);
    }

    return json({ ok: true, found: true, query: q, ...(word || { word: q }), examples: merged });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, { status: 500, cache: 'no-store' });
  }
};
