import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

async function qualityCheck() {
  const issues = [];
  for (let lv = 1; lv <= 6; lv++) {
    const base = JSON.parse(await readFile(join(DATA, `hsk${lv}.json`), 'utf-8'));
    const ko = JSON.parse(await readFile(join(DATA, 'ko', `hsk${lv}.json`), 'utf-8'));

    for (const item of base) {
      const extra = ko[item.w] || {};
      const means = extra.k || [];
      const examples = extra.x || [];

      // check means
      const isRefOnly = means.length > 0 && means.every(m => /^[(\[](☞|→)/.test(m.trim()));
      const hasEmptyMean = means.some(m => !m.trim());

      // check examples
      const hasBadExample = examples.some(ex => !ex.zh || !ex.ko || ex.zh.trim().length < 2 || ex.ko.trim().length < 2);

      if (isRefOnly || hasEmptyMean || hasBadExample) {
        issues.push({
          level: lv,
          w: item.w,
          isRefOnly,
          hasEmptyMean,
          hasBadExample,
          means,
          examples,
        });
      }
    }
  }

  console.log(`품질 이슈 단어 수: ${issues.length}개`);
  for (const it of issues) {
    console.log(`[HSK ${it.level}급] ${it.w}:`, it.isRefOnly ? '참조형 뜻만 있음' : '', it.hasEmptyMean ? '빈 뜻 있음' : '', it.hasBadExample ? '부실한 예문 있음' : '');
  }
}

qualityCheck();
