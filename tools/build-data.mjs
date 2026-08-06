/**
 * HSK 단어 데이터 빌드 스크립트
 * - drkameleon/complete-hsk-vocabulary 에서 HSK 2.0(1~6급) 단어 목록을 받아
 *   { w: 간체, t: 번체, p: 병음, n: 숫자병음, e: 영어뜻, l: 급수 } 형태로 압축 저장한다.
 * - 한국어 뜻/예문은 런타임에 네이버 중국어사전 프록시(/api/dict)로 채운다.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'data');
const BASE = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old';

await mkdir(OUT, { recursive: true });

const index = [];

for (let lv = 1; lv <= 6; lv++) {
  const res = await fetch(`${BASE}/${lv}.json`);
  if (!res.ok) throw new Error(`HSK ${lv} 다운로드 실패: ${res.status}`);
  const raw = await res.json();

  const words = raw.map((item) => {
    const form = item.forms?.[0] || {};
    const tr = form.transcriptions || {};
    // 영어 뜻은 최대 3개까지만 (용량 절감)
    const en = (form.meanings || []).slice(0, 3).map((m) => m.replace(/\s+/g, ' ').trim());
    return {
      w: item.simplified,
      t: form.traditional && form.traditional !== item.simplified ? form.traditional : '',
      p: tr.pinyin || '',
      n: tr.numeric || '',
      e: en,
      f: item.frequency || 0,
      l: lv,
    };
  }).filter((x) => x.w && x.p);

  // 빈도순(자주 쓰는 단어 먼저) 정렬 — frequency 값이 작을수록 고빈도
  words.sort((a, b) => (a.f || 99999) - (b.f || 99999));

  await writeFile(join(OUT, `hsk${lv}.json`), JSON.stringify(words), 'utf8');
  index.push({ level: lv, count: words.length });
  console.log(`HSK ${lv}급: ${words.length}개`);
}

await writeFile(join(OUT, 'index.json'), JSON.stringify({ levels: index, total: index.reduce((s, x) => s + x.count, 0) }, null, 2), 'utf8');
console.log('총', index.reduce((s, x) => s + x.count, 0), '개 단어 저장 완료');
