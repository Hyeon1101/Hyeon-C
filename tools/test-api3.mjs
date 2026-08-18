import { readFile } from 'node:fs/promises';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://zh.dict.naver.com/',
};

async function testFetch(word) {
  const url = `https://zh.dict.naver.com/api3/zhko/search?query=${encodeURIComponent(word)}&range=all&page=1&shouldSearchOpen=false`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function run() {
  const words = ['没', '多', '打电话', '打篮球', '打印', '长江', '幸运', '除', '伙伴', '太太'];
  for (const w of words) {
    const res = await testFetch(w);
    const wordItems = res?.searchResultMap?.searchResultListMap?.WORD?.items || [];
    const exampleItems = res?.searchResultMap?.searchResultListMap?.EXAMPLE?.items || [];
    console.log(`=== ${w} (단어 ${wordItems.length}개, 예문 ${exampleItems.length}개) ===`);
    if (wordItems.length) {
      console.log(' 표제어:', wordItems[0].expEntry, '병음:', wordItems[0].phoneticSymbol);
    }
    if (exampleItems.length) {
      console.log(' 첫 예문:', exampleItems[0].expExample1, '->', exampleItems[0].expExample2);
    }
  }
}

run();
