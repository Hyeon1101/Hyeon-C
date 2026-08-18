import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

async function findAllMissing() {
  const missingList = [];

  for (let lv = 1; lv <= 6; lv++) {
    const baseRaw = await readFile(join(DATA, `hsk${lv}.json`), 'utf-8');
    const base = JSON.parse(baseRaw);
    let ko = {};
    try {
      const koRaw = await readFile(join(DATA, 'ko', `hsk${lv}.json`), 'utf-8');
      ko = JSON.parse(koRaw);
    } catch {}

    for (const item of base) {
      const w = item.w;
      const extra = ko[w] || null;
      const pinyin = extra?.p || item.p || '';
      const koreanMeans = extra?.k || [];
      const examples = extra?.x || [];

      const issues = [];
      if (!pinyin.trim()) issues.push('병음 누락');
      if (!koreanMeans.length) issues.push('한국어 뜻 누락');
      if (!examples.length) issues.push('예문 누락');
      else {
        const hasEmptyKo = examples.some(ex => !(ex.ko || '').trim());
        if (hasEmptyKo) issues.push('예문 한국어 누락');
      }

      if (issues.length > 0) {
        missingList.push({
          level: lv,
          w,
          pinyin,
          english: item.e || [],
          korean: koreanMeans,
          examples,
          issues,
        });
      }
    }
  }

  console.log(`총 문제 단어 수: ${missingList.length}개\n`);
  for (const item of missingList) {
    console.log(`[HSK ${item.level}급] ${item.w} (${item.pinyin}): 이슈=[${item.issues.join(', ')}], 뜻=${item.korean.join(' / ') || item.english.join(' / ')}`);
  }
}

findAllMissing();
