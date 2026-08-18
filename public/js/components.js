/** 여러 화면에서 함께 쓰는 조각들 */

import { esc, ICON, toast, delegate } from './ui.js';
import { ruby, colorPinyin, ensurePinyin } from './pinyin.js';
import * as store from './store.js';
import { speak } from './speech.js';

/** 단어 하나를 카드로 */
export function wordCard(word, opts = {}) {
  const w = word.w || word.word;
  const pinyin = word.p || word.pinyin || '';
  const means = word.k?.length ? word.k : (word.e || []).map((x) => x);
  const example = (word.ex || word.examples || [])[0];
  const saved = store.hasWord(w);
  const entry = store.getWord(w);
  const fav = entry?.fav;
  const level = word.h || word.l || word.hsk || 0;
  const payload = esc(JSON.stringify({ w, p: pinyin, k: means.slice(0, 3), h: level, ex: example ? [example] : (word.ex || []) }));

  return `
  <article class="wordcard" data-word="${esc(w)}">
    <div class="wordcard__top">
      <div class="wordcard__zh">
        <button class="hz" data-goto="${esc(w)}" style="text-align:left" title="자세히 보기">${esc(w)}</button>
        <span class="pinyin">${colorPinyin(pinyin)}</span>
      </div>
      <div class="wordcard__acts">
        <button class="iconbtn-s" data-speak="${esc(w)}" title="발음 듣기" aria-label="발음 듣기">${ICON.speaker}</button>
        <button class="iconbtn-s ${fav ? 'is-on' : ''}" data-fav="${payload}" title="안 외워지는 단어로 표시" aria-label="즐겨찾기">${ICON.star}</button>
        <button class="iconbtn-s ${saved ? 'is-saved' : ''}" data-save="${payload}" title="${saved ? '저장됨' : '내 단어장에 저장'}" aria-label="단어 저장">${ICON.bookmark}</button>
      </div>
    </div>
    ${level ? `<div><span class="badge badge--hsk">HSK ${level}</span></div>` : ''}
    <div class="wordcard__means">${means.length ? esc(means.slice(0, 3).join(' · ')) : '<span style="color:var(--text-3)">뜻 정보 없음</span>'}</div>
    ${
      example && opts.example !== false
        ? `<div class="wordcard__ex"><b>${esc(example.zh)}</b><br>${esc(example.ko || '')}</div>`
        : ''
    }
  </article>`;
}

/** 예문 한 줄 (병음 루비 + 한국어) */
export function exampleRow(ex) {
  const py = ensurePinyin(ex.zh, ex.py);
  return `
  <div class="ex-item">
    <div class="ex-item__zh">${ruby(ex.zh, { pinyin: py })}</div>
    <div class="ex-item__ko">${esc(ex.ko || '')}</div>
    <div style="margin-top:5px;display:flex;gap:6px;align-items:center">
      <button class="btn btn--sm btn--ghost" data-speak="${esc(ex.zh)}">${ICON.speaker} 듣기</button>
      ${ex.source ? `<span style="font-size:11.5px;color:var(--text-3)">${esc(ex.source)}</span>` : ''}
    </div>
  </div>`;
}

/** 중국어 문장 블록 (루비 + 번역 + 듣기) */
export function sentenceBlock(zh, py, ko, { size = 20 } = {}) {
  return `
    <div class="zh" style="font-size:${size}px;line-height:2">${ruby(zh, { pinyin: ensurePinyin(zh, py) })}</div>
    ${ko ? `<div class="ko-mean" style="margin-top:4px">${esc(ko)}</div>` : ''}
  `;
}

/**
 * 화면 전체에 공통 동작을 연결한다.
 *  data-speak : 읽어주기
 *  data-save  : 내 단어장 저장 / 해제
 *  data-fav   : 즐겨찾기 토글
 *  data-goto  : 단어 상세로 이동
 */
export function bindCommonActions(root) {
  delegate(root, 'click', '[data-speak]', (e, el) => {
    e.preventDefault();
    speak(el.dataset.speak, { audioUrl: el.dataset.audio || null });
  });

  delegate(root, 'click', '[data-goto]', (e, el) => {
    e.preventDefault();
    location.hash = `#/word/${encodeURIComponent(el.dataset.goto)}`;
  });

  delegate(root, 'click', '[data-save]', (e, el) => {
    e.preventDefault();
    let data;
    try {
      data = JSON.parse(el.dataset.save);
    } catch {
      return;
    }
    if (store.hasWord(data.w)) {
      store.removeWord(data.w);
      el.classList.remove('is-saved');
      el.title = '내 단어장에 저장';
      toast(`${data.w} 저장을 해제했어요`);
    } else {
      store.saveWord(data);
      el.classList.add('is-saved');
      el.title = '저장됨';
      toast(`${data.w} 을(를) 내 단어장에 저장했어요`);
    }
    refreshBadges();
  });

  delegate(root, 'click', '[data-fav]', (e, el) => {
    e.preventDefault();
    let data;
    try {
      data = JSON.parse(el.dataset.fav);
    } catch {
      return;
    }
    if (!store.hasWord(data.w)) store.saveWord(data);
    const on = store.toggleFav(data.w);
    el.classList.toggle('is-on', on);
    // 저장 버튼 상태도 같이 갱신
    const card = el.closest('[data-word]');
    const saveBtn = card?.querySelector('[data-save]');
    if (saveBtn) saveBtn.classList.add('is-saved');
    toast(on ? `${data.w} 을(를) 복습 목록에 추가했어요` : `${data.w} 을(를) 복습 목록에서 뺐어요`);
    refreshBadges();
  });
}

/** 저장 단어 수 같은 표시를 갱신 */
export function refreshBadges() {
  const s = store.stats();
  document.querySelectorAll('[data-badge="saved"]').forEach((el) => (el.textContent = s.savedCount));
  document.querySelectorAll('[data-badge="fav"]').forEach((el) => (el.textContent = s.favCount));
}

/** 병음/뜻 가리기 토글 UI */
export function displayToggles() {
  const showPinyin = store.getSetting('showPinyin');
  const showKo = store.getSetting('showKo');
  return `
    <label class="switch">
      <input type="checkbox" data-toggle="showPinyin" ${showPinyin ? 'checked' : ''}>
      <span class="switch__track"></span> 병음 표시
    </label>
    <label class="switch">
      <input type="checkbox" data-toggle="showKo" ${showKo ? 'checked' : ''}>
      <span class="switch__track"></span> 뜻 표시
    </label>`;
}

export function bindDisplayToggles(root) {
  delegate(root, 'change', '[data-toggle]', (e, el) => {
    const name = el.dataset.toggle;
    store.setSetting(name, el.checked);
    applyDisplaySettings();
  });
}

export function applyDisplaySettings() {
  const view = document.getElementById('view');
  if (!view) return;
  view.classList.toggle('hide-pinyin', !store.getSetting('showPinyin'));
  view.classList.toggle('hide-ko', !store.getSetting('showKo'));
}
