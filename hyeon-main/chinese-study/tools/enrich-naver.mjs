/**
 * HSK 단어에 네이버 중국어사전 정보(병음 · 한국어 뜻 · 예문)를 입혀 정적 파일로 굽는다.
 *
 * 네이버는 동시 요청을 강하게 조인다(20개 동시 요청 → 5분, 6개 실패).
 * 그래서 순차 + 간격을 두고 천천히 긁고, 중간 결과를 계속 저장해 언제든 이어받을 수 있게 한다.
 *
 *   node tools/enrich-naver.mjs          # 전체(1~6급)
 *   node tools/enrich-naver.mjs 1 2 3    # 특정 급수만
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');
const OUT = join(DATA, 'ko');

const DELAY_MS = 260; // 요청 간격
const TIMEOUT_MS = 9000;
const MAX_RETRY = 3;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Referer: 'https://zh.dict.naver.com/',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const strip = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function naver(url) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
      const text = await res.text();
      if (text.trimStart().startsWith('{')) return JSON.parse(text);
      throw new Error('차단된 응답(HTML)');
    } catch (e) {
      if (attempt === MAX_RETRY) return null;
      await sleep(700 * attempt); // 백오프
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function bestEntry(items, query) {
  let best = null;
  let bestScore = -1;
  for (const it of items) {
    const entry = strip(it.expEntry);
    if (entry !== query) continue;
    let score = 0;
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

async function fetchWord(word) {
  const data = await naver(
    `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(word)}&range=word&page=1&shouldSearchOpen=false`
  );
  if (!data) return null;

  const it = bestEntry(data?.searchResultMap?.searchResultListMap?.WORD?.items || [], word);
  if (!it) return { miss: true };

  const phon = it.searchPhoneticSymbolList?.[0] || {};
  const means = [];
  const examples = [];
  for (const g of it.meansCollector || []) {
    const pos = strip(g.partOfSpeech);
    for (const m of g.means || []) {
      const v = strip(m.value);
      if (v && means.length < 4) means.push(pos ? `[${pos}] ${v}` : v);
      if (m.exampleOri && examples.length < 2) {
        examples.push({ zh: strip(m.exampleOri), ko: strip(m.exampleTrans), py: '' });
      }
    }
  }

  const hskMatch = /HSK\s*(\d)/i.exec(String(it.frequencyAdd || ''));

  return {
    p: strip(phon.symbolValue) || '',
    k: means,
    x: examples,
    h: hskMatch ? Number(hskMatch[1]) : 0,
    s: strip(it.sourceDictnameKO),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const levels = process.argv.slice(2).map(Number).filter((n) => n >= 1 && n <= 6);
  const targets = levels.length ? levels : [1, 2, 3, 4, 5, 6];

  for (const lv of targets) {
    const words = JSON.parse(await readFile(join(DATA, `hsk${lv}.json`), 'utf8'));
    const outPath = join(OUT, `hsk${lv}.json`);
    const store = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) : {};

    let done = 0;
    let miss = 0;
    let fail = 0;
    const t0 = Date.now();

    for (const item of words) {
      if (store[item.w]) continue; // 이어받기
      const r = await fetchWord(item.w);
      if (r === null) {
        fail++;
      } else if (r.miss) {
        store[item.w] = { p: item.p, k: [], x: [], h: lv, s: '' };
        miss++;
      } else {
        if (!r.p) r.p = item.p;
        if (!r.h) r.h = lv;
        store[item.w] = r;
        done++;
      }

      const n = done + miss + fail;
      if (n % 25 === 0) {
        await writeFile(outPath, JSON.stringify(store), 'utf8');
        const rate = ((Date.now() - t0) / 1000 / n).toFixed(2);
        console.log(`  HSK${lv} ${Object.keys(store).length}/${words.length} (성공 ${done} / 없음 ${miss} / 실패 ${fail}) ${rate}s per word`);
      }
      await sleep(DELAY_MS);
    }

    await writeFile(outPath, JSON.stringify(store), 'utf8');
    console.log(`HSK${lv} 완료: 저장 ${Object.keys(store).length} / 전체 ${words.length} (실패 ${fail})`);
  }
  console.log('전체 완료');
}

main().catch((e) => {
  console.error('오류:', e);
  process.exit(1);
});
