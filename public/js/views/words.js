import { esc, emptyBlock, loadingBlock, errorBlock, delegate, ICON, toast, shuffle } from '../ui.js';
import { wordCard, displayToggles, applyDisplaySettings } from '../components.js';
import { ruby, colorPinyin, ensurePinyin } from '../pinyin.js';
import * as store from '../store.js';
import { loadLevel } from '../api.js';
import { speak } from '../speech.js';

const PAGE = 60;

const ui = {
  tab: 'hsk',      // hsk | saved | fav
  level: 1,
  filter: '',
  sort: 'freq',    // freq | pinyin | new
  shown: PAGE,
};

export async function render(view) {
  ui.level = store.getSetting('level') || 1;

  view.innerHTML = `
    <div class="page-head">
      <h1>중국어 단어</h1>
      <p>HSK 급수별 단어를 병음·뜻·예문과 함께 학습하고, 내 단어장에 모아 복습하세요.</p>
    </div>

    <div class="seg" id="w-tabs" style="margin-bottom:16px">
      <button data-tab="hsk" class="is-on">HSK 급수별</button>
      <button data-tab="saved">내 단어장 <span data-badge="saved">0</span></button>
      <button data-tab="fav">복습함 <span data-badge="fav">0</span></button>
    </div>

    <div id="w-levels"></div>

    <div class="toolbar">
      <input class="input" id="w-filter" placeholder="이 목록에서 찾기 (한자 · 병음 · 뜻)" style="max-width:280px">
      <div class="seg" id="w-sort">
        <button data-sort="freq" class="is-on">빈도순</button>
        <button data-sort="pinyin">병음순</button>
        <button data-sort="new">최신순</button>
      </div>
      <div class="toolbar__spacer"></div>
      ${displayToggles()}
      <button class="btn btn--primary btn--sm" id="w-flash">🃏 학습 모드</button>
    </div>

    <div id="w-body">${loadingBlock()}</div>
  `;

  bind(view);
  renderLevels(view);
  await renderBody(view);
  applyDisplaySettings();
  updateBadges();
}

function updateBadges() {
  const s = store.stats();
  document.querySelectorAll('[data-badge="saved"]').forEach((el) => (el.textContent = s.savedCount));
  document.querySelectorAll('[data-badge="fav"]').forEach((el) => (el.textContent = s.favCount));
}

function bind(view) {
  delegate(view, 'click', '#w-tabs button', async (e, el) => {
    ui.tab = el.dataset.tab;
    ui.shown = PAGE;
    view.querySelectorAll('#w-tabs button').forEach((b) => b.classList.toggle('is-on', b === el));
    renderLevels(view);
    await renderBody(view);
    applyDisplaySettings();
  });

  delegate(view, 'click', '[data-level]', async (e, el) => {
    ui.level = Number(el.dataset.level);
    ui.shown = PAGE;
    store.setSetting('level', ui.level);
    renderLevels(view);
    await renderBody(view);
    applyDisplaySettings();
  });

  delegate(view, 'click', '#w-sort button', async (e, el) => {
    ui.sort = el.dataset.sort;
    view.querySelectorAll('#w-sort button').forEach((b) => b.classList.toggle('is-on', b === el));
    await renderBody(view);
    applyDisplaySettings();
  });

  let t = null;
  view.querySelector('#w-filter').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(async () => {
      ui.filter = e.target.value.trim().toLowerCase();
      ui.shown = PAGE;
      await renderBody(view);
      applyDisplaySettings();
    }, 220);
  });

  delegate(view, 'click', '#w-more', async () => {
    ui.shown += PAGE;
    await renderBody(view);
    applyDisplaySettings();
  });

  view.querySelector('#w-flash').addEventListener('click', async () => {
    let list = await currentList();
    if (!list.length) return toast('학습할 단어가 없습니다.');

    // HSK 급수별 탭에서 학습할 때, 이미 내 단어장에 저장된 단어는 중복 학습되지 않도록 제외
    if (ui.tab === 'hsk') {
      const unlearned = list.filter((w) => !store.hasWord(w.w));
      if (!unlearned.length) {
        return toast(`HSK ${ui.level}급 단어(${list.length}개)를 모두 학습하여 내 단어장에 저장했습니다! '내 단어장'이나 '복습함'에서 복습할 수 있어요.`);
      }
      const savedCount = list.length - unlearned.length;
      if (savedCount > 0) {
        toast(`이미 저장된 ${savedCount}개 단어를 제외하고, 미학습 단어 ${unlearned.length}개 중 ${Math.min(40, unlearned.length)}개로 학습을 시작합니다.`);
      }
      list = unlearned;
    }

    startFlashcards(view, shuffle(list).slice(0, 40));
  });
}

function renderLevels(view) {
  const box = view.querySelector('#w-levels');
  if (ui.tab !== 'hsk') {
    box.innerHTML = '';
    return;
  }
  const counts = { 1: 150, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 };
  const s = store.stats();
  box.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${[1, 2, 3, 4, 5, 6]
        .map((lv) => {
          const done = s.byLevel[lv] || 0;
          const pct = Math.min(100, Math.round((done / counts[lv]) * 100));
          return `
        <button class="chip ${ui.level === lv ? 'is-on' : ''}" data-level="${lv}" style="padding:8px 14px;font-size:13.5px">
          HSK ${lv}급
          <span style="opacity:.65;font-size:11.5px;margin-left:3px">${done}/${counts[lv]} · ${pct}%</span>
        </button>`;
        })
        .join('')}
    </div>`;
}

async function currentList() {
  let list = [];
  if (ui.tab === 'hsk') {
    list = await loadLevel(ui.level);
  } else if (ui.tab === 'saved') {
    list = await Promise.all(store.allWords().map(enrichSavedEntry));
  } else {
    list = await Promise.all(store.favorites().map(enrichSavedEntry));
  }

  if (ui.filter) {
    const q = ui.filter.toLowerCase();
    list = list.filter(
      (x) =>
        x.w.includes(q) ||
        (x.p || '').toLowerCase().includes(q) ||
        (x.k || []).join(' ').toLowerCase().includes(q) ||
        (x.e || []).join(' ').toLowerCase().includes(q)
    );
  }

  if (ui.sort === 'pinyin') {
    list = [...list].sort((a, b) => (a.p || '').localeCompare(b.p || ''));
  } else if (ui.sort === 'new') {
    list = [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } else if (ui.tab === 'hsk') {
    list = [...list].sort((a, b) => (a.f || 99999) - (b.f || 99999));
  }
  return list;
}

async function enrichSavedEntry(entry) {
  let ex = entry.ex || [];
  let k = entry.k || [];
  let p = entry.p || '';
  if (!ex.length || !k.length || !p) {
    const hsk = await findInHsk(entry.w).catch(() => null);
    if (hsk) {
      if (!ex.length) ex = hsk.ex || [];
      if (!k.length) k = hsk.k || [];
      if (!p) p = hsk.p || '';
    }
  }
  return {
    w: entry.w,
    p: p,
    k: k,
    ex: ex,
    h: entry.h,
    l: entry.h,
    addedAt: entry.addedAt,
    mastery: entry.mastery,
  };
}

async function renderBody(view) {
  const box = view.querySelector('#w-body');
  box.innerHTML = loadingBlock();
  try {
    const list = await currentList();

    if (!list.length) {
      box.innerHTML =
        ui.tab === 'saved'
          ? emptyBlock({
              icon: '🔖',
              title: '저장한 단어가 없어요',
              desc: '단어 카드의 책갈피 아이콘을 누르면 내 단어장에 모입니다.',
              action: '<button class="btn btn--primary" data-tab-jump="hsk">HSK 단어 보기</button>',
            })
          : ui.tab === 'fav'
          ? emptyBlock({
              icon: '⭐',
              title: '복습함이 비어 있어요',
              desc: '잘 안 외워지는 단어의 별을 눌러두면 여기 모입니다. 퀴즈에서 틀린 단어도 자동으로 들어와요.',
            })
          : emptyBlock({ icon: '🔍', title: '검색 결과가 없습니다', desc: '다른 검색어로 찾아보세요.' });

      view.querySelectorAll('[data-tab-jump]').forEach((b) =>
        b.addEventListener('click', () => view.querySelector('#w-tabs button[data-tab="hsk"]').click())
      );
      return;
    }

    const slice = list.slice(0, ui.shown);
    box.innerHTML = `
      <div style="font-size:13px;color:var(--text-3);margin-bottom:10px">전체 ${list.length}개 중 ${slice.length}개 표시</div>
      <div class="grid c4">${slice.map((w) => wordCard(w)).join('')}</div>
      ${
        list.length > ui.shown
          ? `<div style="text-align:center;margin-top:20px"><button class="btn btn--ghost" id="w-more">${list.length - ui.shown}개 더 보기</button></div>`
          : ''
      }`;
  } catch (err) {
    box.innerHTML = errorBlock(err.message);
  }
}

/* ---------------- 플래시카드 학습 모드 ---------------- */

function startFlashcards(view, list) {
  let idx = 0;
  let flipped = false;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.55);
    display:grid;place-items:center;padding:20px;backdrop-filter:blur(3px)`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    renderBody(view).then(applyDisplaySettings);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === ' ') {
      e.preventDefault();
      flipped = !flipped;
      draw();
    } else if (e.key === 'ArrowRight') next(true);
    else if (e.key === 'ArrowLeft') {
      idx = Math.max(0, idx - 1);
      flipped = false;
      draw();
    }
  }

  function next(known) {
    const item = list[idx];
    if (item) {
      store.saveWord(item);
      const entry = store.getWord(item.w);
      // 모르는 단어는 복습함에 넣고, 외운 단어는 복습함에서 뺀다
      if (entry && !known && !entry.fav) store.toggleFav(item.w);
      if (entry && known && entry.fav) store.toggleFav(item.w);
    }
    idx += 1;
    flipped = false;
    draw();
  }

  function draw() {
    if (idx >= list.length) {
      overlay.innerHTML = `
        <div class="card card__pad" style="max-width:420px;text-align:center;padding:36px">
          <div style="font-size:44px;margin-bottom:10px">🎉</div>
          <h2 style="margin:0 0 6px">${list.length}개 카드 학습 완료!</h2>
          <p style="color:var(--text-2);margin:0 0 20px">모르는 단어는 복습함에 담아두었어요.</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn--primary" id="fc-quiz">퀴즈로 확인하기</button>
            <button class="btn btn--ghost" id="fc-close">닫기</button>
          </div>
        </div>`;
      overlay.querySelector('#fc-close').addEventListener('click', close);
      overlay.querySelector('#fc-quiz').addEventListener('click', () => {
        close();
        location.hash = '#/quiz';
      });
      return;
    }

    const item = list[idx];
    const py = item.p || '';
    const means = item.k?.length ? item.k : item.e || [];
    const ex = (item.ex || [])[0];

    overlay.innerHTML = `
      <div class="card" style="max-width:520px;width:100%;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;color:var(--text-2)">${idx + 1} / ${list.length}</span>
          <div class="bar" style="flex:1;margin:0 14px"><div class="bar__fill" style="width:${((idx + 1) / list.length) * 100}%"></div></div>
          <button class="iconbtn-s" id="fc-x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>

        <div id="fc-card" style="padding:44px 24px;text-align:center;cursor:pointer;min-height:250px;display:flex;flex-direction:column;justify-content:center;gap:10px">
          <div class="hanzi hanzi--lg">${esc(item.w)}</div>
          ${
            flipped
              ? `<div class="pinyin" style="font-size:18px">${colorPinyin(py)}</div>
                 <div style="font-size:15.5px;color:var(--text);margin-top:6px">${esc(means.slice(0, 3).join(' · ') || '뜻 정보 없음')}</div>
                 ${ex ? `<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border);font-size:14px">
                    <div class="zh" style="line-height:1.9">${ruby(ex.zh, { pinyin: ensurePinyin(ex.zh, ex.py) })}</div>
                    <div style="color:var(--text-2);font-size:13px;margin-top:3px">${esc(ex.ko || '')}</div>
                 </div>` : ''}`
              : `<div style="color:var(--text-3);font-size:13.5px;margin-top:8px">카드를 눌러 뜻 보기 · 스페이스바</div>`
          }
        </div>

        <div style="display:flex;gap:8px;padding:14px 16px;border-top:1px solid var(--border)">
          <button class="btn btn--ghost" id="fc-speak" style="flex:0 0 auto">${ICON.speaker}</button>
          <button class="btn" id="fc-again" style="flex:1;background:var(--err-soft);color:var(--err)">아직 몰라요</button>
          <button class="btn btn--primary" id="fc-known" style="flex:1">외웠어요</button>
        </div>
      </div>`;

    overlay.querySelector('#fc-x').addEventListener('click', close);
    overlay.querySelector('#fc-card').addEventListener('click', () => {
      flipped = !flipped;
      draw();
    });
    overlay.querySelector('#fc-speak').addEventListener('click', (e) => {
      e.stopPropagation();
      speak(item.w);
    });
    overlay.querySelector('#fc-known').addEventListener('click', () => next(true));
    overlay.querySelector('#fc-again').addEventListener('click', () => next(false));
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  draw();
}
