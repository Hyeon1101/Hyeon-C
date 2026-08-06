import { esc, emptyBlock, shuffle, sample, toast, delegate, ICON } from '../ui.js';
import { colorPinyin } from '../pinyin.js';
import * as store from '../store.js';
import { loadLevel } from '../api.js';
import { speak } from '../speech.js';

const MODES = {
  meaning: { name: '뜻 맞추기', desc: '한자를 보고 알맞은 뜻 고르기', icon: '🀄' },
  hanzi: { name: '한자 맞추기', desc: '뜻을 보고 알맞은 한자 고르기', icon: '✍️' },
  pinyin: { name: '병음 맞추기', desc: '한자를 보고 알맞은 병음 고르기', icon: '🔤' },
  listen: { name: '듣고 맞추기', desc: '발음을 듣고 알맞은 한자 고르기', icon: '👂' },
};

let session = null;

export async function render(view) {
  session = null;
  await renderSetup(view);
}

/* ---------------- 설정 화면 ---------------- */

async function renderSetup(view) {
  const s = store.stats();
  const saved = store.allWords();
  const favs = store.favorites();

  view.innerHTML = `
    <div class="page-head">
      <h1>단어 퀴즈</h1>
      <p>공부한 단어를 4가지 방식으로 확인합니다. 틀린 단어는 자동으로 복습함에 담겨요.</p>
    </div>

    <div class="grid c4" style="margin-bottom:22px">
      <div class="stat"><div class="stat__label">누적 정답률</div><div class="stat__value">${s.quizTotal ? s.accuracy : 0}<small>%</small></div><div class="stat__hint">${s.quizRight}정답 / ${s.quizTotal}문제</div></div>
      <div class="stat"><div class="stat__label">내 단어장</div><div class="stat__value">${s.savedCount}<small>개</small></div></div>
      <div class="stat"><div class="stat__label">복습함</div><div class="stat__value">${s.favCount}<small>개</small></div></div>
      <div class="stat"><div class="stat__label">완전히 외운 단어</div><div class="stat__value">${s.masteredCount}<small>개</small></div><div class="stat__hint">퀴즈 4회 이상 정답</div></div>
    </div>

    <div class="card card__pad">
      <h2 style="margin:0 0 14px;font-size:16px">출제 범위</h2>
      <div class="seg" id="q-source" style="margin-bottom:18px;flex-wrap:wrap">
        <button data-source="fav" class="${favs.length >= 4 ? 'is-on' : ''}" ${favs.length < 4 ? 'disabled style="opacity:.4"' : ''}>복습함 (${favs.length})</button>
        <button data-source="saved" class="${favs.length < 4 && saved.length >= 4 ? 'is-on' : ''}" ${saved.length < 4 ? 'disabled style="opacity:.4"' : ''}>내 단어장 (${saved.length})</button>
        <button data-source="hsk" class="${saved.length < 4 ? 'is-on' : ''}">HSK 급수별</button>
      </div>

      <div id="q-hsk-pick" style="margin-bottom:18px;${saved.length < 4 ? '' : 'display:none'}">
        <div style="font-size:13px;color:var(--text-2);margin-bottom:8px">급수 선택</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${[1, 2, 3, 4, 5, 6]
            .map(
              (lv) =>
                `<button class="chip ${lv === (store.getSetting('level') || 1) ? 'is-on' : ''}" data-qlevel="${lv}">HSK ${lv}급</button>`
            )
            .join('')}
        </div>
      </div>

      <h2 style="margin:0 0 14px;font-size:16px">문제 유형
        <span style="font-weight:400;font-size:12.5px;color:var(--text-3);margin-left:6px">고르지 않으면 네 가지를 섞어서 출제합니다</span>
      </h2>
      <div class="grid c4" style="margin-bottom:18px">
        ${Object.entries(MODES)
          .map(
            ([key, m]) => `
          <button class="card card__pad" data-mode="${key}" style="text-align:left;transition:.15s">
            <div style="font-size:22px;margin-bottom:6px">${m.icon}</div>
            <b style="display:block;font-size:14.5px;margin-bottom:2px">${m.name}</b>
            <span style="font-size:12.5px;color:var(--text-3)">${m.desc}</span>
          </button>`
          )
          .join('')}
        </div>

      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <label style="font-size:13.5px;color:var(--text-2)">문제 수</label>
        <div class="seg" id="q-count">
          <button data-count="10" class="is-on">10문제</button>
          <button data-count="20">20문제</button>
          <button data-count="30">30문제</button>
        </div>
        <div class="toolbar__spacer" style="flex:1"></div>
        <button class="btn btn--primary btn--lg" id="q-start">퀴즈 시작 →</button>
      </div>
    </div>
  `;

  const cfg = {
    source: favs.length >= 4 ? 'fav' : saved.length >= 4 ? 'saved' : 'hsk',
    level: store.getSetting('level') || 1,
    mode: 'mixed',
    count: 10,
  };

  const modeBtns = view.querySelectorAll('[data-mode]');
  function paintModes() {
    modeBtns.forEach((b) => {
      const on = cfg.mode === b.dataset.mode;
      b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      b.style.background = on ? 'var(--accent-soft)' : 'var(--surface)';
    });
  }

  paintModes(); // 기본값은 '섞어서 출제'

  delegate(view, 'click', '[data-mode]', (e, el) => {
    cfg.mode = cfg.mode === el.dataset.mode ? 'mixed' : el.dataset.mode;
    paintModes();
  });

  delegate(view, 'click', '#q-source button', (e, el) => {
    if (el.disabled) return;
    cfg.source = el.dataset.source;
    view.querySelectorAll('#q-source button').forEach((b) => b.classList.toggle('is-on', b === el));
    view.querySelector('#q-hsk-pick').style.display = cfg.source === 'hsk' ? '' : 'none';
  });

  delegate(view, 'click', '[data-qlevel]', (e, el) => {
    cfg.level = Number(el.dataset.qlevel);
    view.querySelectorAll('[data-qlevel]').forEach((b) => b.classList.toggle('is-on', b === el));
  });

  delegate(view, 'click', '#q-count button', (e, el) => {
    cfg.count = Number(el.dataset.count);
    view.querySelectorAll('#q-count button').forEach((b) => b.classList.toggle('is-on', b === el));
  });

  view.querySelector('#q-start').addEventListener('click', async () => {
    const pool = await buildPool(cfg);
    if (pool.length < 4) {
      toast('퀴즈를 만들려면 뜻이 있는 단어가 4개 이상 필요해요.');
      return;
    }
    startQuiz(view, pool, cfg);
  });
}

async function buildPool(cfg) {
  let list;
  if (cfg.source === 'fav') list = store.favorites();
  else if (cfg.source === 'saved') list = store.allWords();
  else list = await loadLevel(cfg.level);

  return list
    .map((x) => ({
      w: x.w,
      p: x.p || '',
      k: (x.k && x.k.length ? x.k : x.e || []).map(cleanMean).filter(Boolean),
      h: x.h || x.l || 0,
    }))
    .filter((x) => x.w && x.k.length && x.p);
}

/** 보기로 쓰기 좋게 뜻을 짧게 다듬는다 */
function cleanMean(text) {
  let s = String(text || '').replace(/^\[[^\]]*\]\s*/, ''); // [명사] 같은 품사 표시 제거

  // 중첩 괄호까지 없어질 때까지 안쪽부터 반복해서 걷어낸다
  let prev;
  do {
    prev = s;
    s = s.replace(/\([^()]*\)/g, '').replace(/\[[^[\]]*\]/g, '');
  } while (s !== prev);

  return s
    .replace(/[()[\]]/g, '')          // 짝이 안 맞아 남은 괄호
    .replace(/[=→↔]\s*\S*/g, '')      // 동의어·반의어 참조 표시
    .replace(/[\s.。,，·]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/* ---------------- 퀴즈 진행 ---------------- */

function startQuiz(view, pool, cfg) {
  const modes = cfg.mode === 'mixed' ? Object.keys(MODES) : [cfg.mode];
  const picked = sample(pool, Math.min(cfg.count, pool.length));

  session = {
    questions: picked.map((item, i) => ({
      item,
      mode: modes[i % modes.length],
      options: makeOptions(item, pool, modes[i % modes.length]),
    })),
    idx: 0,
    right: 0,
    wrong: [],
    answered: false,
  };
  drawQuestion(view);
}

function makeOptions(item, pool, mode) {
  const key = mode === 'meaning' ? 'k' : mode === 'pinyin' ? 'p' : 'w';
  const answer = mode === 'meaning' ? item.k[0] : mode === 'pinyin' ? item.p : item.w;

  const distractors = shuffle(pool.filter((x) => x.w !== item.w))
    .map((x) => (key === 'k' ? x.k[0] : x[key]))
    .filter((v, i, arr) => v && v !== answer && arr.indexOf(v) === i)
    .slice(0, 3);

  return shuffle([answer, ...distractors]);
}

function drawQuestion(view) {
  const q = session.questions[session.idx];
  if (!q) return drawResult(view);

  session.answered = false;
  const mode = MODES[q.mode];
  const total = session.questions.length;

  const prompt = {
    meaning: `<div class="hanzi hanzi--lg">${esc(q.item.w)}</div>
              <div class="pinyin" style="font-size:16px;margin-top:6px">${colorPinyin(q.item.p)}</div>`,
    pinyin: `<div class="hanzi hanzi--lg">${esc(q.item.w)}</div>`,
    hanzi: `<div style="font-size:22px;font-weight:600;line-height:1.5">${esc(q.item.k[0])}</div>`,
    listen: `<button class="btn btn--primary btn--lg" id="q-play" style="margin:8px auto">${ICON.speaker} 다시 듣기</button>
             <div style="font-size:13px;color:var(--text-3);margin-top:6px">발음을 듣고 알맞은 한자를 고르세요</div>`,
  }[q.mode];

  view.innerHTML = `
    <div class="quiz-stage">
      <div class="quiz-progress">
        <span class="badge">${mode.icon} ${mode.name}</span>
        <div class="bar" style="flex:1"><div class="bar__fill" style="width:${(session.idx / total) * 100}%"></div></div>
        <span>${session.idx + 1} / ${total}</span>
        <button class="iconbtn-s" id="q-quit" title="그만두기" aria-label="그만두기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>

      <div class="quiz-q">${prompt}</div>

      <div class="quiz-opts" id="q-opts">
        ${q.options
          .map(
            (opt, i) => `
          <button class="quiz-opt" data-opt="${esc(opt)}">
            <span class="quiz-opt__key">${i + 1}</span>
            <span class="${q.mode === 'hanzi' || q.mode === 'listen' ? 'zh' : ''}" style="${
              q.mode === 'hanzi' || q.mode === 'listen' ? 'font-size:21px;font-weight:600' : ''
            }">${esc(opt)}</span>
          </button>`
          )
          .join('')}
      </div>

      <div id="q-after" style="margin-top:16px"></div>
    </div>`;

  if (q.mode === 'listen') {
    speak(q.item.w);
    view.querySelector('#q-play').addEventListener('click', () => speak(q.item.w));
  }

  view.querySelector('#q-quit').addEventListener('click', () => renderSetup(view));

  delegate(view, 'click', '[data-opt]', (e, el) => {
    if (session.answered) return;
    answer(view, el.dataset.opt, el);
  });

  const keyHandler = (e) => {
    // 퀴즈 화면을 떠났으면 스스로 정리한다
    if (!document.body.contains(view) || !view.querySelector('.quiz-stage')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }
    if (!/^[1-4]$/.test(e.key)) return;
    const btn = view.querySelectorAll('[data-opt]')[Number(e.key) - 1];
    if (btn && !session.answered) answer(view, btn.dataset.opt, btn);
  };
  document.addEventListener('keydown', keyHandler);
  session.cleanup = () => document.removeEventListener('keydown', keyHandler);
}

function answer(view, chosen, btnEl) {
  const q = session.questions[session.idx];
  const correct =
    q.mode === 'meaning' ? q.item.k[0] : q.mode === 'pinyin' ? q.item.p : q.item.w;
  const isRight = chosen === correct;

  session.answered = true;
  view.querySelectorAll('[data-opt]').forEach((b) => {
    b.disabled = true;
    if (b.dataset.opt === correct) b.classList.add('is-right');
    else if (b === btnEl) b.classList.add('is-wrong');
  });

  // 퀴즈에 나온 단어는 자동으로 단어장에 들어간다
  if (!store.hasWord(q.item.w)) store.saveWord(q.item);
  store.recordQuiz(q.item.w, isRight);

  if (isRight) session.right += 1;
  else session.wrong.push(q.item);

  const after = view.querySelector('#q-after');
  after.innerHTML = `
    <div class="card card__pad" style="background:${isRight ? 'var(--ok-soft)' : 'var(--err-soft)'};border-color:transparent">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${isRight ? '0' : '8px'}">
        <b style="color:${isRight ? 'var(--ok)' : 'var(--err)'}">${isRight ? '정답이에요!' : '아쉬워요'}</b>
        ${!isRight ? `<span style="font-size:13px;color:var(--text-2)">복습함에 담아둘게요</span>` : ''}
      </div>
      ${
        !isRight
          ? `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span class="hanzi hanzi--sm">${esc(q.item.w)}</span>
              <span class="pinyin">${colorPinyin(q.item.p)}</span>
              <span class="ko-mean">${esc(q.item.k.slice(0, 2).join(' · '))}</span>
              <button class="btn btn--sm btn--ghost" data-speak="${esc(q.item.w)}">${ICON.speaker}</button>
             </div>`
          : ''
      }
      <button class="btn btn--primary" id="q-next" style="width:100%;margin-top:12px">
        ${session.idx + 1 >= session.questions.length ? '결과 보기' : '다음 문제 →'}
      </button>
    </div>`;

  const nextBtn = view.querySelector('#q-next');
  nextBtn.focus();
  nextBtn.addEventListener('click', () => {
    session.cleanup?.();
    session.idx += 1;
    drawQuestion(view);
  });

  const enterHandler = (e) => {
    if (!document.body.contains(nextBtn)) {
      document.removeEventListener('keydown', enterHandler);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.removeEventListener('keydown', enterHandler);
      nextBtn.click();
    }
  };
  document.addEventListener('keydown', enterHandler);
}

function drawResult(view) {
  session.cleanup?.();
  const total = session.questions.length;
  const pct = Math.round((session.right / total) * 100);
  const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '💪' : '📖';
  const comment =
    pct >= 90 ? '완벽해요! 다음 급수에 도전해 볼까요?'
    : pct >= 70 ? '잘하고 있어요. 틀린 단어만 한 번 더!'
    : pct >= 50 ? '절반은 맞혔어요. 복습함에서 다시 확인해 보세요.'
    : '괜찮아요. 반복하면 반드시 외워집니다.';

  view.innerHTML = `
    <div class="quiz-stage">
      <div class="quiz-q">
        <div style="font-size:52px;margin-bottom:8px">${emoji}</div>
        <div style="font-size:40px;font-weight:800;letter-spacing:-1.5px">${session.right} <span style="color:var(--text-3);font-size:24px">/ ${total}</span></div>
        <div style="color:var(--accent);font-weight:650;margin:4px 0 10px">정답률 ${pct}%</div>
        <p style="color:var(--text-2);margin:0">${comment}</p>
      </div>

      ${
        session.wrong.length
          ? `<div class="card card__pad" style="margin-top:16px">
              <h3 style="margin:0 0 10px;font-size:15px">틀린 단어 ${session.wrong.length}개 <span style="font-weight:400;font-size:13px;color:var(--text-3)">— 복습함에 담았어요</span></h3>
              <div class="list">
                ${session.wrong
                  .map(
                    (w) => `
                  <div class="list__row">
                    <span class="hanzi hanzi--sm" style="width:76px">${esc(w.w)}</span>
                    <span class="pinyin" style="width:110px">${colorPinyin(w.p)}</span>
                    <span class="ko-mean" style="flex:1">${esc(w.k.slice(0, 2).join(' · '))}</span>
                    <button class="iconbtn-s" data-speak="${esc(w.w)}">${ICON.speaker}</button>
                  </div>`
                  )
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn--primary" id="q-again" style="flex:1">한 번 더 풀기</button>
        <button class="btn btn--ghost" id="q-setup" style="flex:1">설정 바꾸기</button>
      </div>
    </div>`;

  view.querySelector('#q-again').addEventListener('click', () => {
    const items = session.questions.map((q) => q.item);
    startQuiz(view, items, { mode: 'mixed', count: items.length });
  });
  view.querySelector('#q-setup').addEventListener('click', () => renderSetup(view));
}
