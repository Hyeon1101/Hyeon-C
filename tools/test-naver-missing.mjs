import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://zh.dict.naver.com/',
};

async function testFetch(word) {
  const url = `https://zh.dict.naver.com/api/zhko/search?query=${encodeURIComponent(word)}&range=all&page=1`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
}

async function run() {
  const words = ['没', '多', '打电话', '打篮球', '打印', '长江', '幸运', '除', '伙伴', '太太'];
  for (const w of words) {
    const res = await testFetch(w);
    const entries = res?.searchResultMap?.searchResultListMap?.WORD?.items || [];
    console.log(`=== ${w} (결과 ${entries.length}개) ===`);
    if (entries.length) {
      const top = entries[0];
      const meanList = top.meansCollector || [];
      console.log('  표제어:', top.expEntry, '병음:', top.phoneticSymbol);
      for (const mc of meanList.slice(0, 2)) {
        for (const m of (mc.means || []).slice(0, 2)) {
          console.log('   뜻:', m.value);
          for (const ex of (m.exampleList || []).slice(0, 2)) {
            console.log('    예문:', ex.expExample, '->', ex.expExampleTrans);
          }
        }
      }
    }
  }
}

run();
