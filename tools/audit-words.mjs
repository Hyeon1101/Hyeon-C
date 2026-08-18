import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

async function audit() {
  console.log('=== HSK 단어 전수 조사 시작 ===\n');

  for (let lv = 1; lv <= 6; lv++) {
    const baseRaw = await readFile(join(DATA, `hsk${lv}.json`), 'utf-8');
    const base = JSON.parse(baseRaw);
    let ko = {};
    try {
      const koRaw = await readFile(join(DATA, 'ko', `hsk${lv}.json`), 'utf-8');
      ko = JSON.parse(koRaw);
    } catch {}

    let total = base.length;
    let missingPinyin = 0;
    let missingKoreanMean = 0;
    let missingExample = 0;
    let missingExKo = 0;

    const sampleMissing = [];

    for (const item of base) {
      const w = item.w;
      const extra = ko[w] || null;
      const pinyin = extra?.p || item.p || '';
      const koreanMeans = extra?.k || [];
      const examples = extra?.x || [];

      if (!pinyin.trim()) missingPinyin++;
      if (!koreanMeans.length) {
        missingKoreanMean++;
        if (sampleMissing.length < 5) sampleMissing.push({ w, reason: '뜻 없음' });
      }
      if (!examples.length) {
        missingExample++;
        if (sampleMissing.length < 5) sampleMissing.push({ w, reason: '예문 없음' });
      } else {
        const hasKoInEx = examples.some(ex => (ex.ko || '').trim().length > 0);
        if (!hasKoInEx) missingExKo++;
      }
    }

    console.log(`[HSK ${lv}급] 총 ${total}개 단어`);
    console.log(` - 병음 누락: ${missingPinyin}개`);
    console.log(` - 한국어 뜻 누락: ${missingKoreanMean}개 (${((missingKoreanMean/total)*100).toFixed(1)}%)`);
    console.log(` - 예문 누락: ${missingExample}개 (${((missingExample/total)*100).toFixed(1)}%)`);
    console.log(` - 예문 한국어 번역 누락: ${missingExKo}개`);
    if (sampleMissing.length) {
      console.log(` - 샘플 누락 단어:`, sampleMissing.map(s => `${s.w}(${s.reason})`).join(', '));
    }
    console.log('');
  }
}

audit();
