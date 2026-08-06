/** 화면 조립에 쓰는 자잘한 도구들 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

let toastTimer = null;
export function toast(message, ms = 2000) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export function debounce(fn, ms = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

/**
 * 한국어 조사 고르기 — josa('사과', '은/는') → '는'
 * 한글이 아니면(한자·영문 등) 받침을 알 수 없으므로 앞쪽 형태를 그대로 쓴다.
 */
export function josa(word, pair) {
  const [withBatchim, withoutBatchim] = pair.split('/');
  const last = String(word || '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return withBatchim;
  return (code - 0xac00) % 28 !== 0 ? withBatchim : withoutBatchim;
}

export function fmtSeconds(sec) {
  const s = Math.round(sec || 0);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
}

export function fmtDate(d) {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

/** 로딩 스켈레톤 */
export function skeleton(lines = 3, height = 16) {
  return `<div style="display:flex;flex-direction:column;gap:9px">${Array.from(
    { length: lines },
    (_, i) => `<div class="skeleton" style="height:${height}px;width:${100 - i * 12}%"></div>`
  ).join('')}</div>`;
}

export function loadingBlock(text = '불러오는 중…') {
  return `<div class="empty"><span class="spinner"></span><p style="margin-top:10px">${esc(text)}</p></div>`;
}

export function errorBlock(message, retryAttr = '') {
  return `
    <div class="empty">
      <div class="empty__icon">⚠️</div>
      <h3>문제가 생겼어요</h3>
      <p>${esc(message)}</p>
      ${retryAttr ? `<button class="btn btn--ghost" ${retryAttr}>다시 시도</button>` : ''}
    </div>`;
}

export function emptyBlock({ icon = '📭', title, desc, action = '' }) {
  return `
    <div class="empty">
      <div class="empty__icon">${icon}</div>
      <h3>${esc(title)}</h3>
      ${desc ? `<p>${esc(desc)}</p>` : ''}
      ${action}
    </div>`;
}

/* ---------- 자주 쓰는 아이콘 ---------- */

export const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
};

/** 이벤트 위임 */
export function delegate(root, eventName, selector, handler) {
  root.addEventListener(eventName, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}
