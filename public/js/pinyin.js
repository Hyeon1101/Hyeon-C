/**
 * 병음 유틸 — vendor/pinyin-pro.js(UMD) 위의 얇은 래퍼.
 * pinyin-pro 는 문맥을 보고 다음자(多音字)를 처리하며,
 * type:'array' 결과가 원문 글자와 1:1 로 정렬되므로 루비 표기에 그대로 쓸 수 있다.
 */

const HANZI = /[㐀-䶿一-鿿豈-﫿]/;

function lib() {
  return typeof window !== 'undefined' ? window.pinyinPro : null;
}

export function hasHanzi(text) {
  return HANZI.test(String(text || ''));
}

export function isHanziChar(ch) {
  return HANZI.test(ch);
}

/** 한자 비율 (문장이 중국어인지 판별할 때 사용) */
export function hanziRatio(text) {
  const chars = [...String(text || '')].filter((c) => /\S/.test(c));
  if (!chars.length) return 0;
  return chars.filter((c) => HANZI.test(c)).length / chars.length;
}

export function hasHangul(text) {
  return /[가-힣ᄀ-ᇿ㄰-㆏]/.test(String(text || ''));
}

/** 문장 전체 병음 (성조 부호) */
export function toPinyin(text, opts = {}) {
  const pp = lib();
  if (!pp) return '';
  try {
    return pp.pinyin(String(text), { toneType: 'symbol', ...opts });
  } catch {
    return '';
  }
}

/** 글자별 병음 배열 — 원문과 길이가 같다 */
export function pinyinArray(text) {
  const pp = lib();
  const chars = [...String(text || '')];
  if (!pp) return chars.map(() => '');
  try {
    const arr = pp.pinyin(String(text), { toneType: 'symbol', type: 'array' });
    return arr.length === chars.length ? arr : chars.map((c) => (HANZI.test(c) ? pp.pinyin(c) : ''));
  } catch {
    return chars.map(() => '');
  }
}

const TONE_MAP = {
  1: 'āēīōūǖĀĒĪŌŪǕ',
  2: 'áéíóúǘÁÉÍÓÚǗ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓǙ',
  4: 'àèìòùǜÀÈÌÒÙǛ',
};

/** 병음 음절의 성조 (1~4, 경성 0) */
export function toneOf(syllable) {
  const s = String(syllable || '');
  for (const [tone, marks] of Object.entries(TONE_MAP)) {
    for (const ch of s) if (marks.includes(ch)) return Number(tone);
  }
  return 0;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/**
 * 한자 위에 병음을 얹은 루비 HTML.
 * @param {string} text     중국어 원문
 * @param {object} opts
 *   - pinyin: 미리 알고 있는 문장 병음(네이버 예문 등). 음절 수가 맞으면 우선 사용.
 *   - tone: true 면 성조별 색상 적용
 */
export function ruby(text, opts = {}) {
  const src = String(text || '');
  const chars = [...src];
  let py = pinyinArray(src);

  // 외부에서 받은 병음이 한자 수와 맞으면 그쪽을 신뢰한다 (사전 표기가 더 정확)
  if (opts.pinyin) {
    const given = String(opts.pinyin).trim().split(/\s+/);
    const hanziCount = chars.filter((c) => HANZI.test(c)).length;
    if (given.length === hanziCount) {
      let i = 0;
      py = chars.map((c) => (HANZI.test(c) ? given[i++] : ''));
    }
  }

  return chars
    .map((ch, i) => {
      if (!HANZI.test(ch)) return esc(ch);
      const p = py[i] || '';
      const cls = opts.tone === false ? '' : ` class="tone-${toneOf(p)}"`;
      return `<ruby>${esc(ch)}<rt${cls}>${esc(p)}</rt></ruby>`;
    })
    .join('');
}

/** 성조 색을 입힌 병음 텍스트 */
export function colorPinyin(pinyinText) {
  return String(pinyinText || '')
    .split(/(\s+)/)
    .map((tok) => (/\s/.test(tok) || !tok ? esc(tok) : `<span class="tone-${toneOf(tok)}">${esc(tok)}</span>`))
    .join('');
}

/** 문장 병음이 없을 때 채워 넣기 */
export function ensurePinyin(zh, given) {
  const g = String(given || '').trim();
  if (g) return g;
  return toPinyin(zh);
}
