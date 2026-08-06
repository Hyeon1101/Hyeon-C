import { esc, ICON, loadingBlock, errorBlock, emptyBlock, toast, delegate, josa } from '../ui.js';
import { ruby, colorPinyin, ensurePinyin, hanziRatio, hasHangul, toPinyin } from '../pinyin.js';
import { exampleRow } from '../components.js';
import * as store from '../store.js';
import { dictLookup, ai, findInHsk } from '../api.js';
import { speak } from '../speech.js';
import { renderResult as renderGrammar } from './grammar.js';

const GRAMMAR_HINTS = /(용법|문법|어순|차이|구분|언제\s*쓰|어떻게\s*쓰|왜\s|무슨\s*뜻|설명해|알려줘|뭐가\s*달라|헷갈)/;

/** 입력만 보고 무엇을 원하는지 추측한다 */
export function detectMode(text) {
  const t = text.trim();
  const zh = hanziRatio(t);

  if (zh > 0.6) {
    const compact = t.replace(/[\s。，、！？,.!?]/g, '');
    return compact.length <= 4 ? 'word' : 'translate';
  }
  if (hasHangul(t)) {
    if (GRAMMAR_HINTS.test(t)) return 'grammar';
    return t.length <= 8 && !/\s/.test(t) ? 'koword' : 'translate';
  }
  return 'translate';
}

export async function render(view, params = {}) {
  const query = (params.q || '').trim();
  let mode = params.mode || 'auto';
  if (!query) {
    view.innerHTML = emptyBlock({ icon: '🔍', title: '검색어를 입력해 주세요' });
    return;
  }
  if (mode === 'auto') mode = detectMode(query);

  view.innerHTML = `
    <div class="page-head">
      <h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span>‘${esc(query)}’ 검색 결과</span>
        <span class="badge">${modeLabel(mode)}</span>
      </h1>
    </div>
    <div id="s-body">${loadingBlock()}</div>`;

  const box = view.querySelector('#s-body');

  try {
    if (mode === 'word') await renderWordResult(box, query);
    else if (mode === 'grammar') await renderGrammarResult(box, query);
    else if (mode === 'koword') await renderKoWord(box, query);
    else await renderTranslate(box, query);
  } catch (err) {
    box.innerHTML = errorBlock(err.message);
  }
}

function modeLabel(mode) {
  return { word: '단어', translate: '번역', grammar: '문법', koword: '한→중 단어' }[mode] || '검색';
}

/* ---------------- 단어 상세 ---------------- */

export async function renderWordDetail(view, word) {
  view.innerHTML = `<div id="s-body">${loadingBlock(`${word} 을(를) 찾는 중…`)}</div>`;
  store.recordSeen();
  try {
    await renderWordResult(view.querySelector('#s-body'), word);
  } catch (err) {
    view.querySelector('#s-body').innerHTML = errorBlock(err.message);
  }
}

async function renderWordResult(box, word) {
  const [dict, hsk] = await Promise.all([
    dictLookup(word, { examples: true }).catch(() => null),
    findInHsk(word).catch(() => null),
  ]);

  const found = dict && dict.found;
  if (!found && !hsk) {
    // 사전에 없으면 AI 에게 물어본다 (신조어 · 고유명사 등)
    box.innerHTML = loadingBlock('사전에 없는 단어예요. AI에게 물어보는 중…');
    try {
      const r = await ai('word', { word });
      box.innerHTML = aiWordCard(word, r);
      return;
    } catch {
      box.innerHTML = emptyBlock({
        icon: '🤔',
        title: `‘${word}’ 를 찾지 못했어요`,
        desc: '철자를 확인하거나, 문장이라면 번역으로 검색해 보세요.',
      });
      return;
    }
  }

  const pinyin = dict?.pinyin || hsk?.p || toPinyin(word);
  const level = dict?.hsk || hsk?.h || hsk?.l || 0;
  const means = dict?.means?.length
    ? dict.means.map((m) => (m.pos ? `[${m.pos}] ${m.text}` : m.text))
    : hsk?.k?.length
    ? hsk.k
    : hsk?.e || [];
  const examples = dict?.examples?.length ? dict.examples : hsk?.ex || [];
  const audio = dict?.audio?.female || dict?.audio?.male || null;
  const payload = esc(JSON.stringify({ w: word, p: pinyin, k: means.slice(0, 3), h: level }));
  const saved = store.hasWord(word);
  const fav = store.getWord(word)?.fav;

  box.innerHTML = `
    <article class="card card__pad" data-word="${esc(word)}">
      <div class="result-head">
        <div style="flex:1;min-width:200px">
          <div class="hanzi hanzi--lg">${ruby(word, { pinyin })}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
            <span class="pinyin" style="font-size:17px">${colorPinyin(pinyin)}</span>
            ${level ? `<span class="badge badge--hsk">HSK ${level}급</span>` : ''}
            ${dict?.traditional ? `<span class="badge">번체 ${esc(dict.traditional)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:7px;align-items:center">
          <button class="btn btn--ghost btn--sm" data-speak="${esc(word)}" ${audio ? `data-audio="${esc(audio)}"` : ''}>${ICON.speaker} 발음</button>
          <button class="iconbtn-s ${fav ? 'is-on' : ''}" data-fav="${payload}" title="복습함에 추가">${ICON.star}</button>
          <button class="iconbtn-s ${saved ? 'is-saved' : ''}" data-save="${payload}" title="내 단어장에 저장">${ICON.bookmark}</button>
        </div>
      </div>

      ${
        means.length
          ? `<section>
              <h3 style="font-size:14.5px;margin:0 0 4px">뜻</h3>
              ${means.map((m, i) => `<div class="mean-item"><span class="mean-item__no">${i + 1}</span><span>${esc(m)}</span></div>`).join('')}
             </section>`
          : ''
      }

      ${
        examples.length
          ? `<section style="margin-top:20px">
              <h3 style="font-size:14.5px;margin:0 0 4px">예문 <span style="font-weight:400;font-size:12px;color:var(--text-3)">${examples.length}개</span></h3>
              ${examples.slice(0, 8).map(exampleRow).join('')}
             </section>`
          : ''
      }

      <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--ghost btn--sm" data-ai-more="${esc(word)}">🤖 AI 에게 더 물어보기</button>
        <a class="btn btn--ghost btn--sm" href="#/chat">💬 이 표현으로 회화 연습</a>
      </div>
      <div id="s-more" style="margin-top:14px"></div>

      ${dict?.source ? `<div style="margin-top:16px;font-size:11.5px;color:var(--text-3)">출처: 네이버 중국어사전 · ${esc(dict.source)}</div>` : ''}
    </article>`;

  delegate(box, 'click', '[data-ai-more]', async (e, el) => {
    const more = box.querySelector('#s-more');
    el.disabled = true;
    more.innerHTML = `<div class="card card__pad"><span class="spinner"></span> AI가 정리하는 중…</div>`;
    try {
      const r = await ai('word', { word: el.dataset.aiMore });
      more.innerHTML = aiExtra(r);
    } catch (err) {
      more.innerHTML = `<div class="card card__pad" style="color:var(--err)">${esc(err.message)}</div>`;
    } finally {
      el.disabled = false;
    }
  });
}

function aiWordCard(word, r) {
  const payload = esc(JSON.stringify({ w: word, p: r.pinyin, k: r.means?.slice(0, 3) || [], h: r.hsk || 0 }));
  return `
    <article class="card card__pad" data-word="${esc(word)}">
      <div class="result-head">
        <div style="flex:1">
          <div class="hanzi hanzi--lg">${ruby(word, { pinyin: r.pinyin })}</div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="pinyin" style="font-size:17px">${colorPinyin(r.pinyin)}</span>
            ${r.hsk ? `<span class="badge badge--hsk">HSK ${r.hsk}급</span>` : ''}
            <span class="badge badge--info">AI 설명</span>
          </div>
        </div>
        <div style="display:flex;gap:7px">
          <button class="btn btn--ghost btn--sm" data-speak="${esc(word)}">${ICON.speaker}</button>
          <button class="iconbtn-s" data-save="${payload}">${ICON.bookmark}</button>
        </div>
      </div>
      ${(r.means || []).map((m, i) => `<div class="mean-item"><span class="mean-item__no">${i + 1}</span><span>${esc(m)}</span></div>`).join('')}
      ${aiExtra(r)}
      <div style="margin-top:14px;font-size:11.5px;color:var(--text-3)">네이버 사전에 없어 AI가 설명했습니다.</div>
    </article>`;
}

function aiExtra(r) {
  return `
    ${
      r.examples?.length
        ? `<section style="margin-top:18px">
            <h3 style="font-size:14.5px;margin:0 0 4px">AI 예문</h3>
            ${r.examples.map((ex) => exampleRow({ zh: ex.zh, py: ex.pinyin, ko: ex.ko })).join('')}
           </section>`
        : ''
    }
    ${r.usage ? `<div style="margin-top:14px;padding:12px 14px;background:var(--surface-2);border-radius:11px;font-size:13.8px"><b>쓰임새</b><div style="margin-top:4px;color:var(--text-2)">${esc(r.usage)}</div></div>` : ''}
    ${
      r.related?.length
        ? `<div style="margin-top:14px">
            <h3 style="font-size:14px;margin:0 0 7px">함께 알아두면 좋은 표현</h3>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              ${r.related
                .map(
                  (x) => `<button class="suggest" data-goto="${esc(x.word)}">
                    <b>${esc(x.word)}</b><small>${esc(x.pinyin)} · ${esc(x.meaning)}${x.relation ? ` (${esc(x.relation)})` : ''}</small>
                  </button>`
                )
                .join('')}
            </div>
           </div>`
        : ''
    }`;
}

/* ---------------- 번역 ---------------- */

async function renderTranslate(box, text) {
  const toKo = hanziRatio(text) > 0.4;
  box.innerHTML = loadingBlock(toKo ? '중국어를 한국어로 옮기는 중…' : '한국어를 중국어로 옮기는 중…');

  const r = await ai('translate', { text, to: toKo ? 'ko' : 'zh' });
  const zh = r.zh;
  const py = ensurePinyin(zh, r.pinyin);

  box.innerHTML = `
    <article class="card card__pad">
      <div style="font-size:12.5px;color:var(--text-3);margin-bottom:6px">${toKo ? '중국어 원문' : '번역 결과 (중국어)'}</div>
      <div class="zh" style="font-size:24px;line-height:2.1">${ruby(zh, { pinyin: py })}</div>
      <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn--sm btn--ghost" data-speak="${esc(zh)}">${ICON.speaker} 듣기</button>
        <button class="btn btn--sm btn--ghost" data-copy="${esc(zh)}">복사</button>
        <button class="btn btn--sm btn--ghost" data-pron-jump="${esc(zh)}">🎤 발음 연습</button>
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:4px">${toKo ? '한국어 번역' : '입력한 한국어'}</div>
        <div style="font-size:17px">${esc(r.ko)}</div>
        ${r.literal ? `<div style="font-size:13px;color:var(--text-3);margin-top:5px">직역: ${esc(r.literal)}</div>` : ''}
      </div>

      ${
        r.keywords?.length
          ? `<div style="margin-top:18px">
              <h3 style="font-size:14px;margin:0 0 8px">문장 속 핵심 단어</h3>
              <div style="display:flex;gap:7px;flex-wrap:wrap">
                ${r.keywords
                  .map(
                    (k) => `<button class="suggest" data-goto="${esc(k.word)}">
                      <b>${esc(k.word)}</b><small>${esc(k.pinyin)} · ${esc(k.meaning)}</small>
                    </button>`
                  )
                  .join('')}
              </div>
             </div>`
          : ''
      }

      ${
        r.alternatives?.length
          ? `<div style="margin-top:18px">
              <h3 style="font-size:14px;margin:0 0 6px">다른 표현</h3>
              ${r.alternatives
                .map(
                  (a) => `<div class="ex-item">
                    <div class="ex-item__zh">${ruby(a.zh, { pinyin: ensurePinyin(a.zh, a.pinyin) })}</div>
                    <div class="ex-item__ko">${esc(a.ko)}</div>
                    <button class="btn btn--sm btn--ghost" data-speak="${esc(a.zh)}" style="margin-top:4px">${ICON.speaker}</button>
                  </div>`
                )
                .join('')}
             </div>`
          : ''
      }

      ${
        r.notes?.length
          ? `<div style="margin-top:18px;padding:12px 14px;background:var(--info-soft);border-radius:11px;font-size:13.5px">
              <b style="color:var(--info)">알아두면 좋아요</b>
              <ul style="margin:6px 0 0;padding-left:18px;color:var(--text-2)">
                ${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
              </ul>
             </div>`
          : ''
      }
    </article>`;

  delegate(box, 'click', '[data-copy]', (e, el) => {
    navigator.clipboard?.writeText(el.dataset.copy).then(
      () => toast('복사했어요'),
      () => toast('복사에 실패했어요')
    );
  });

  delegate(box, 'click', '[data-pron-jump]', (e, el) => {
    sessionStorage.setItem('pronTarget', el.dataset.pronJump);
    location.hash = '#/chat';
  });
}

/* ---------------- 한국어 단어 → 중국어 ---------------- */

async function renderKoWord(box, korean) {
  box.innerHTML = loadingBlock('중국어 표현을 찾는 중…');
  const r = await ai('translate', { text: korean, to: 'zh' });
  const zh = r.zh;

  box.innerHTML = `
    <article class="card card__pad">
      <div style="font-size:12.5px;color:var(--text-3)">‘${esc(korean)}’${josa(korean, '은/는')} 중국어로</div>
      <div class="hanzi hanzi--lg" style="margin-top:6px">${ruby(zh, { pinyin: ensurePinyin(zh, r.pinyin) })}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <span class="pinyin" style="font-size:16px">${colorPinyin(ensurePinyin(zh, r.pinyin))}</span>
        <button class="btn btn--sm btn--ghost" data-speak="${esc(zh)}">${ICON.speaker} 듣기</button>
        <button class="btn btn--sm btn--ghost" data-goto="${esc(zh)}">사전에서 자세히 보기</button>
      </div>
      ${
        r.alternatives?.length
          ? `<div style="margin-top:18px">
              <h3 style="font-size:14px;margin:0 0 6px">다른 표현</h3>
              ${r.alternatives
                .map(
                  (a) => `<div class="ex-item">
                    <div class="ex-item__zh">${ruby(a.zh, { pinyin: ensurePinyin(a.zh, a.pinyin) })}</div>
                    <div class="ex-item__ko">${esc(a.ko)}</div>
                  </div>`
                )
                .join('')}
             </div>`
          : ''
      }
      ${
        r.notes?.length
          ? `<div style="margin-top:16px;padding:12px 14px;background:var(--info-soft);border-radius:11px;font-size:13.5px">
              <ul style="margin:0;padding-left:18px;color:var(--text-2)">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
             </div>`
          : ''
      }
    </article>`;
}

/* ---------------- 문법 ---------------- */

async function renderGrammarResult(box, query) {
  box.innerHTML = loadingBlock('문법을 정리하는 중…');
  const r = await ai('grammar', { query });
  box.innerHTML = renderGrammar(r);
}
