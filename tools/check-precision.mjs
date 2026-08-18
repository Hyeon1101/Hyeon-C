import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

async function checkAll() {
  for (let lv = 1; lv <= 6; lv++) {
    const base = JSON.parse(await readFile(join(DATA, `hsk${lv}.json`), 'utf-8'));
    const ko = JSON.parse(await readFile(join(DATA, 'ko', `hsk${lv}.json`), 'utf-8'));

    const noK = [];
    const noP = [];
    const noEx = [];

    for (const item of base) {
      const extra = ko[item.w];
      if (!extra) {
        noK.push(item.w);
        continue;
      }
      if (!extra.k || extra.k.length === 0) noK.push(item.w);
      if (!extra.p && !item.p) noP.push(item.w);
      if (!extra.x || extra.x.length === 0) noEx.push(item.w);
    }

    console.log(`HSK ${lv}급 (총 ${base.length}개): 뜻 없음=${noK.length}개, 병음 없음=${noP.length}개, 예문 없음=${noEx.length}개`);
  }
}

checkAll();
