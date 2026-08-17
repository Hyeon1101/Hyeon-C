/**
 * HSK 단어에 네이버 중국어사전 정보(병음 · 한국어 뜻 · 예문)를 입혀 정적 파일로 굽는다.
 *
 * 개선 사항:
 *  1. 한국어 사전(고려대 중한사전, 교학사, 한국외대, 표준중중한 등) 최우선 선택 (Collins 영중사전·HDWIKI 배제)
 *  2. 표제어 괄호 확장 ('端午(节)' -> '端午', '端午节' 모두 매칭, '模样(儿)', '大伙(儿)' 등)
 *  3. 참조형 표제어 (☞幸亏, ☞赢利, ☞边境 등) 자동 추적하여 실제 한국어 뜻과 예문 확보
 *  4. 병음 정제 (离合词 // 기호 제거, 불필요한 부호 정리) 및 HSK 표준 병음 연계
 *  5. 다중 워커 순차 수집 + 실시간 저장으로 안정적인 이어받기 지원
 *
 * 사용법:
 *   node tools/enrich-naver.mjs          # 전체 (1~6급)
 *   node tools/enrich-naver.mjs 6        # 6급만
 *   node tools/enrich-naver.mjs 6 --force # 6급 전체 강제 재수집
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');
const OUT = join(DATA, 'ko');

const CONCURRENCY = 3;
const DELAY_MS = 180;
const TIMEOUT_MS = 10000;
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

function getCandidates(rawEntry) {
  const s = strip(rawEntry).replace(/[《》]/g, '').trim();
  const set = new Set();
  set.add(s);

  // 괄호 내용 제거 (예: "端午(节)" -> "端午", "模样(儿)" -> "模样")
  const noParen = s.replace(/[\(（][^）\)]*[\)）]/g, '').trim();
  set.add(noParen);

  // 괄호 기호만 제거 (예: "端午(节)" -> "端午节", "大伙(儿)" -> "大伙儿")
  const unParen = s.replace(/[\(（\)]/g, '').replace(/（|）/g, '').trim();
  set.add(unParen);

  // 말줄임표/점/공백 제거 (예: "...分之..." -> "分之")
  set.add(s.replace(/[.·…\s]/g, ''));
  set.add(noParen.replace(/[.·…\s]/g, ''));
  set.add(unParen.replace(/[.·…\s]/g, ''));

  return Array.from(set).filter(Boolean);
}

function scoreItem(it, query) {
  const rawEntry = strip(it.expEntry);
  const cands = getCandidates(rawEntry);
  const src = it.sourceDictnameKO || '';

  let score = 0;
  if (rawEntry === query) {
    score += 100;
  } else if (cands.includes(query)) {
    score += 90;
  } else {
    return -1000;
  }

  // 사전 출처 우선순위 (한국어 중한사전 최우선)
  if (src.includes('고려대')) score += 80;
  else if (
    src.includes('교학사') ||
    src.includes('한국외국어') ||
    src.includes('표준중중한') ||
    src.includes('중한') ||
    src.includes('한중')
  )
    score += 65;
  else if (src.includes('국립국어원') || src.includes('한국어')) score += 40;
  else if (src.includes('Collins')) score -= 50; // 영중사전 감점
  else if (src.includes('HDWIKI')) score -= 80; // 백과사전 스니펫 감점
  else if (src.includes('웹수집')) score -= 20;

  // 한국어 뜻 포함 여부
  const meansText = (it.meansCollector || [])
    .flatMap((g) => (g.means || []).map((m) => m.value))
    .join(' ');
  if (/[가-힣]/.test(meansText)) score += 60;
  else score -= 40;

  // 단독 참조형(☞...) 감점 (실제 뜻이 있는 항목 우선)
  if (/^\(☞[^\)]+\)$/.test(strip(meansText))) score -= 40;

  if (it.meansCollector?.length) score += 15;
  if (it.searchPhoneticSymbolList?.[0]?.symbolValue) score += 10;
  if (it.frequencyAdd) score += 10;
  score += Number(it.documentQuality || 0);

  return score;
}

async function naverFetch(url) {
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
      await sleep(600 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function extractCrossReference(means) {
  for (const m of means) {
    const match = /^\(☞([^)]+)\)$/.exec(strip(m));
    if (match) return match[1].replace(/[\(（][^）\)]*[\)）]/g, '').replace(/\d+/g, '').trim();
  }
  return null;
}

function cleanPinyin(py) {
  return strip(py)
    .replace(/\/\//g, '')
    .replace(/[\(（][^）\)]*[\)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWord(word, baseItem = {}) {
  const url = `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(word)}&range=word&page=1&shouldSearchOpen=false`;
  const data = await naverFetch(url);
  if (!data) return null;

  const items = data?.searchResultMap?.searchResultListMap?.WORD?.items || [];
  let best = null;
  let bestScore = -999;

  for (const it of items) {
    const s = scoreItem(it, word);
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }

  if (!best) return { miss: true };

  const phon = best.searchPhoneticSymbolList?.[0] || {};
  let means = [];
  let examples = [];

  for (const g of best.meansCollector || []) {
    const pos = strip(g.partOfSpeech);
    for (const m of g.means || []) {
      const v = strip(m.value);
      if (v && means.length < 4) means.push(pos ? `[${pos}] ${v}` : v);
      if (m.exampleOri && examples.length < 2) {
        examples.push({ zh: strip(m.exampleOri), ko: strip(m.exampleTrans), py: '' });
      }
    }
  }

  // 단독 참조형(☞...)인 경우 참조 대상 단어를 조회하여 뜻 보강
  const crossRef = extractCrossReference(means);
  if (crossRef && crossRef !== word) {
    const refUrl = `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(crossRef)}&range=word&page=1&shouldSearchOpen=false`;
    const refData = await naverFetch(refUrl);
    const refItems = refData?.searchResultMap?.searchResultListMap?.WORD?.items || [];
    let refBest = null;
    let refBestScore = -999;
    for (const it of refItems) {
      const s = scoreItem(it, crossRef);
      if (s > refBestScore) {
        refBestScore = s;
        refBest = it;
      }
    }
    if (refBest) {
      const refMeans = [];
      for (const g of refBest.meansCollector || []) {
        const pos = strip(g.partOfSpeech);
        for (const m of g.means || []) {
          const v = strip(m.value);
          if (v && refMeans.length < 4) refMeans.push(pos ? `[${pos}] ${v}` : v);
          if (m.exampleOri && examples.length < 2) {
            examples.push({ zh: strip(m.exampleOri), ko: strip(m.exampleTrans), py: '' });
          }
        }
      }
      if (refMeans.length > 0) {
        means = refMeans;
      }
    }
  }

  const hskMatch = /HSK\s*(\d)/i.exec(String(best.frequencyAdd || ''));
  const parsedPinyin = cleanPinyin(phon.symbolValue);

  // 표제어에 괄호가 붙어 병음이 단어 전체보다 짧은 경우(예: 端午(节) -> Duānwǔ vs 端午节)는 baseItem.p 사용
  let finalPinyin = parsedPinyin;
  if (!finalPinyin || (baseItem.p && baseItem.w && strip(best.expEntry).replace(/[\(（][^）\)]*[\)）]/g, '').length < baseItem.w.length)) {
    finalPinyin = baseItem.p;
  }

  return {
    p: finalPinyin || baseItem.p || '',
    k: means,
    x: examples,
    h: hskMatch ? Number(hskMatch[1]) : (baseItem.l || 0),
    s: strip(best.sourceDictnameKO),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const levels = args.map(Number).filter((n) => n >= 1 && n <= 6);
  const targets = levels.length ? levels : [1, 2, 3, 4, 5, 6];

  console.log(`\n========================================`);
  console.log(`  HSK 네이버 사전 데이터 수집 시작`);
  console.log(`  대상 급수: HSK ${targets.join(', ')}급`);
  console.log(`  강제 재수집(Force): ${isForce ? 'YES' : 'NO'}`);
  console.log(`  동시 요청: ${CONCURRENCY}개, 딜레이: ${DELAY_MS}ms`);
  console.log(`========================================\n`);

  for (const lv of targets) {
    const words = JSON.parse(await readFile(join(DATA, `hsk${lv}.json`), 'utf8'));
    const outPath = join(OUT, `hsk${lv}.json`);
    const store = existsSync(outPath) && !isForce ? JSON.parse(await readFile(outPath, 'utf8')) : {};

    let done = 0;
    let miss = 0;
    let fail = 0;
    let skipped = 0;
    const t0 = Date.now();

    const pending = words.filter((item) => {
      if (isForce) return true;
      const existing = store[item.w];
      if (!existing) return true;
      // 기존에 한국어 뜻이 없거나 부실하거나 웹수집/Collins인 항목도 재수집 대상
      const textWithoutPos = (existing.k || []).map((m) => m.replace(/^\[[^\]]+\]\s*/, '')).join(' ');
      if (
        !/[가-힣]/.test(textWithoutPos) ||
        textWithoutPos.startsWith('(☞') ||
        existing.s?.includes('Collins') ||
        existing.s?.includes('웹수집') ||
        !existing.s
      ) {
        return true;
      }
      skipped++;
      return false;
    });

    console.log(`\n[HSK ${lv}급] 전체 ${words.length}개 중 수집 대상 ${pending.length}개 (이미 완료 ${skipped}개)`);

    let cursor = 0;
    let lastSave = Date.now();

    async function worker(workerId) {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        const r = await fetchWord(item.w, item);
        if (r === null) {
          fail++;
        } else if (r.miss) {
          store[item.w] = { p: item.p, k: (item.e || []).slice(0, 3), x: [], h: lv, s: '' };
          miss++;
        } else {
          if (!r.p) r.p = item.p;
          if (!r.h) r.h = lv;
          store[item.w] = r;
          done++;
        }

        const totalHandled = done + miss + fail;
        if (totalHandled % 20 === 0 || Date.now() - lastSave > 15000) {
          await writeFile(outPath, JSON.stringify(store), 'utf8');
          lastSave = Date.now();
          const elapsedSec = (Date.now() - t0) / 1000;
          const rate = (elapsedSec / Math.max(1, totalHandled)).toFixed(2);
          const remainSec = Math.round((pending.length - totalHandled) * (elapsedSec / Math.max(1, totalHandled)));
          const pct = Math.round(((skipped + totalHandled) / words.length) * 100);
          console.log(
            `  HSK ${lv}급 [${pct}%] ${skipped + totalHandled}/${words.length} (성공 ${done} / 미매칭 ${miss} / 실패 ${fail}) | ${rate}s/단어 | 남은시간: ~${remainSec}초`
          );
        }
        await sleep(DELAY_MS);
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, (_, i) => worker(i));
    await Promise.all(workers);

    await writeFile(outPath, JSON.stringify(store), 'utf8');
    console.log(
      `\n>>> HSK ${lv}급 완료! 총 ${Object.keys(store).length}개 저장 (새로 수집: ${done}, 미매칭: ${miss}, 실패: ${fail})`
    );
  }

  console.log('\n========================================');
  console.log('  모든 대상 급수 네이버 사전 수집 완료!');
  console.log('========================================\n');
}

main().catch((e) => {
  console.error('오류:', e);
  process.exit(1);
});
