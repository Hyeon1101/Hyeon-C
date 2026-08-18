import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');

async function inspect4() {
  for (const [lv, w] of [[3, '春'], [4, '复印'], [5, '枪'], [5, '卷']]) {
    const ko = JSON.parse(await readFile(join(DATA, 'ko', `hsk${lv}.json`), 'utf-8'));
    console.log(`[${w}]`, JSON.stringify(ko[w], null, 2));
  }
}

inspect4();
