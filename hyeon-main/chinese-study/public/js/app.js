/** 라우터 · 상단 검색 · 테마 */

import { $, $$, toast, delegate } from './ui.js';
import { bindCommonActions, bindDisplayToggles, applyDisplaySettings, refreshBadges } from './components.js';
import * as store from './store.js';
import { listenOnce, sttSupported, stopSpeaking } from './speech.js';
import { detectMode } from './views/search.js';

const view = $('#view');
let currentRoute = '';

/* ---------------- 테마 ---------------- */

function applyTheme() {
  const setting = store.getSetting('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = setting === 'auto' ? (prefersDark ? 'dark' : 'light') : setting;
  document.documentElement.dataset.theme = theme;
}

applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.getSetting('theme') === 'auto') applyTheme();
});

$('#theme-toggle').addEventListener('click', () => {
  const now = document.documentElement.dataset.theme;
  store.setSetting('theme', now === 'dark' ? 'light' : 'dark');
  applyTheme();
});

/* ---------------- 라우팅 ---------------- */

const ROUTES = {
  home: () => import('./views/home.js'),
  words: () => import('./views/words.js'),
  quiz: () => import('./views/quiz.js'),
  chat: () => import('./views/chat.js'),
  grammar: () => import('./views/grammar.js'),
  stats: () => import('./views/stats.js'),
  search: () => import('./views/search.js'),
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = {};
  if (queryPart) {
    for (const [k, v] of new URLSearchParams(queryPart)) params[k] = v;
  }
  return { name: segments[0] || 'home', rest: segments.slice(1), params };
}

async function route() {
  const { name, rest, params } = parseHash();
  const key = `${name}:${rest.join('/')}:${JSON.stringify(params)}`;
  if (key === currentRoute) return;
  currentRoute = key;

  stopSpeaking();
  markActiveTab(name);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  // 화면마다 새 컨테이너를 준다. 각 화면이 여기에 이벤트를 위임하므로
  // 컨테이너를 버리면 그 화면의 리스너도 함께 사라진다(중복 등록 방지).
  view.innerHTML = '';
  const root = document.createElement('div');
  view.appendChild(root);

  try {
    // 단어 상세는 검색 화면이 담당한다
    if (name === 'word') {
      const mod = await ROUTES.search();
      const word = decodeURIComponent(rest.join('/') || '');
      if (!word) {
        location.hash = '#/home';
        return;
      }
      await mod.renderWordDetail(root, word);
    } else {
      const loader = ROUTES[name] || ROUTES.home;
      const mod = await loader();
      await mod.render(root, params);
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty"><div class="empty__icon">⚠️</div><h3>화면을 여는 데 실패했어요</h3><p>${err.message}</p></div>`;
  }

  applyDisplaySettings();
  refreshBadges();
  view.focus({ preventScroll: true });
}

function markActiveTab(name) {
  const tabName = name === 'word' || name === 'search' ? '' : name;
  $$('#tabs a, .mobilebar a').forEach((a) => a.classList.toggle('is-on', a.dataset.tab === tabName));
}

window.addEventListener('hashchange', route);

/* ---------------- 상단 검색 ---------------- */

let searchMode = 'auto';

delegate($('#search-modes'), 'click', '.chip', (e, el) => {
  searchMode = el.dataset.mode;
  $$('#search-modes .chip').forEach((c) => c.classList.toggle('is-on', c === el));
  const input = $('#search-input');
  if (input.value.trim()) submitSearch(input.value);
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitSearch($('#search-input').value);
});

function submitSearch(raw) {
  const q = raw.trim();
  if (!q) return;

  const mode = searchMode === 'auto' ? detectMode(q) : searchMode;
  if (mode === 'grammar') {
    location.hash = `#/grammar?q=${encodeURIComponent(q)}`;
  } else {
    location.hash = `#/search?q=${encodeURIComponent(q)}&mode=${searchMode}`;
  }
  // 같은 검색어를 다시 눌러도 결과를 새로 그린다
  currentRoute = '';
  route();
}

/* 검색창 음성 입력 */
const micBtn = $('#search-mic');
let searchRec = null;
micBtn.addEventListener('click', async () => {
  if (searchRec) {
    searchRec.stop();
    return;
  }
  if (!sttSupported()) {
    toast('음성 검색은 크롬·엣지에서 사용할 수 있어요.');
    return;
  }
  const input = $('#search-input');
  micBtn.classList.add('is-rec');
  stopSpeaking();
  searchRec = listenOnce({ lang: 'zh-CN', interim: (t) => (input.value = t) });
  try {
    const { text } = await searchRec.promise;
    input.value = text;
    submitSearch(text);
  } catch (err) {
    if (err.message) toast(err.message);
  } finally {
    micBtn.classList.remove('is-rec');
    searchRec = null;
  }
});

/* 단축키: / 로 검색창 포커스 */
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('#search-input').focus();
  }
});

/* ---------------- 공통 동작 ---------------- */

bindCommonActions(view);
bindDisplayToggles(view);

// 오늘 방문 기록 (스트릭 계산의 기준이 되는 날짜 항목을 만들어 둔다)
store.recordSeconds(0.001);

route();
