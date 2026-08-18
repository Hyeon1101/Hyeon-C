import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_DIR = join(__dirname, '..', 'public', 'js');

async function checkJS() {
  const files = [];

  async function walk(dir) {
    const list = await readdir(dir, { withFileTypes: true });
    for (const item of list) {
      const p = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(p);
      } else if (item.name.endsWith('.js')) {
        files.push(p);
      }
    }
  }

  await walk(JS_DIR);

  for (const f of files) {
    const code = await readFile(f, 'utf-8');
    // Check common potential missing imports
    const apiFuncs = ['loadLevel', 'findInHsk', 'dictLookup', 'dictKoToZh', 'ai', 'loadIndex'];
    for (const fn of apiFuncs) {
      if (code.includes(fn + '(') && !code.includes(`import`) && !code.includes(`export function ${fn}`)) {
        console.log(`[Warning in ${f}] calls ${fn} but may not import it`);
      }
      // Check if imported
      if (code.includes(fn + '(')) {
        const lines = code.split('\n');
        const hasImportOrDef = lines.some(l => 
          (l.includes('import') && l.includes(fn)) || 
          l.includes(`function ${fn}`) ||
          l.includes(`const ${fn}`) ||
          l.includes(`let ${fn}`)
        );
        if (!hasImportOrDef) {
          console.log(`❌ Missing import of '${fn}' in ${f}`);
        }
      }
    }
  }
  console.log('✅ JS Reference Check Complete');
}

checkJS();
