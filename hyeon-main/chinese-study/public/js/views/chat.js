import { esc, toast, delegate, ICON, emptyBlock } from '../ui.js';
import { ruby, colorPinyin, ensurePinyin, toPinyin, hasHanzi } from '../pinyin.js';
import * as store from '../store.js';
import { ai } from '../api.js';
import { speak, stopSpeaking, listenOnce, sttSupported } from '../speech.js';

const SITUATIONS = [
  { id: '식당에서 음식 주문하기', emoji: '🍜', short: '식당 주문' },
  { id: '카페에서 음료 주문하기', emoji: '☕', short: '카페' },
  { id: '길 묻고 알려주기', emoji: '🗺️', short: '길 묻기' },
  { id: '상점에서 물건 사고 값 흥정하기', emoji: '🛍️', short: '쇼핑·흥정' },
  { id: '택시 타고 목적지 말하기', emoji: '🚕', short: '택시' },
  { id: '호텔 체크인하기', emoji: '🏨', short: '호텔' },
  { id: '공항에서 체크인과 수속하기', emoji: '✈️', short: '공항' },
  { id: '병원에서 증상 설명하기', emoji: '🏥', short: '병원' },
  { id: '처음 만난 사람과 자기소개하기', emoji: '🤝', short: '자기소개' },
  { id: '친구와 주말 계획 이야기하기', emoji: '🎈', short: '친구와 잡담' },
  { id: '회사 면접 보기', emoji: '💼', short: '면접' },
  { id: '전화로 예약하기', emoji: '📞', short: '전화 예약' },
];

const LEVELS = [
  { id: 'beginner', name: '초급', hint: 'HSK 1~2급' },
  { id: 'intermediate', name: '중급', hint: 'HSK 3~4급' },
  { id: 'advanced', name: '고급', hint: 'HSK 5~6급' },
];

const state = {
  tab: 'talk',
  situation: SITUATIONS[0].id,
  level: 'beginner',
  history: [],
  busy: false,
  autoTTS: true,
  pron: { target: '', pinyin: '', ko: '', result: null, heard: '', busy: false },
};

export async function render(view) {
  state.level = store.getSetting('chatLevel') || 'beginner';
  state.autoTTS = store.getSetting('autoTTS') !== false;

  view.innerHTML = `
    <div class="page-head">
      <h1>AI 회화 연습</h1>
      <p>상황을 골라 중국어로 대화하고, 발음과 문장을 바로 교정받으세요. 마이크로 말하고 AI 목소리로 들을 수 있습니다.</p>
    </div>

    <div class="seg" id="c-tabs" style="margin-bottom:16px">
      <button data-ctab="talk" class="is-on">💬 상황별 회화</button>
      <button data-ctab="pron">🎤 발음 연습 · 교정</button>
    </div>

    <div id="c-body"></div>
  `;

  delegate(view, 'click', '#c-tabs button', (e, el) => {
    switchTab(view, el.dataset.ctab);
  });

  // 회화 중 "따라 말하기" → 발음 연습 탭으로 넘어가 그 문장을 목표로 설정
  delegate(view, 'click', '[data-pron-target]', (e, el) => {
    const target = el.dataset.pronTarget;
    switchTab(view, 'pron');
    setTarget(view.querySelector('#c-body'), target);
  });

  // 번역 화면 등에서 "발음 연습"으로 넘어온 경우
  const pending = sessionStorage.getItem('pronTarget');
  if (pending) {
    sessionStorage.removeItem('pronTarget');
    state.tab = 'pron';
    view.querySelectorAll('#c-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.ctab === 'pron'));
    drawBody(view);
    setTarget(view.querySelector('#c-body'), pending);
    return;
  }

  drawBody(view);
}

function switchTab(view, tab) {
  if (state.tab === tab) return;
  state.tab = tab;
  view.querySelectorAll('#c-tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.ctab === tab));
  drawBody(view);
}

function drawBody(view) {
  const box = view.querySelector('#c-body');
  if (state.tab === 'talk') drawTalk(box);
  else drawPron(box);
}

/* ==================== 상황별 회화 ==================== */

function drawTalk(box) {
  box.innerHTML = `
    <div class="chat-wrap">
      <aside class="card card__pad">
        <h3 style="margin:0 0 10px;font-size:14px">상황 선택</h3>
        <div class="sit-list" id="c-sits">
          ${SITUATIONS.map(
            (s) => `<button class="sit ${s.id === state.situation ? 'is-on' : ''}" data-sit="${esc(s.id)}">
              <span class="sit__emoji">${s.emoji}</span> ${esc(s.short)}
            </button>`
          ).join('')}
        </div>

        <h3 style="margin:18px 0 8px;font-size:14px">난이도</h3>
        <div class="seg" id="c-levels" style="width:100%">
          ${LEVELS.map(
            (l) => `<button data-clevel="${l.id}" class="${l.id === state.level ? 'is-on' : ''}" style="flex:1" title="${l.hint}">${l.name}</button>`
          ).join('')}
        </div>

        <div style="margin-top:16px;display:flex;flex-direction:column;gap:9px">
          <label class="switch">
            <input type="checkbox" id="c-autotts" ${state.autoTTS ? 'checked' : ''}>
            <span class="switch__track"></span> AI 답변 자동 재생
          </label>
          <label style="font-size:13px;color:var(--text-2)">
            말하기 속도
            <input type="range" id="c-rate" min="0.5" max="1.2" step="0.1" value="${store.getSetting('ttsRate') || 0.9}" style="width:100%">
          </label>
        </div>

        <button class="btn btn--ghost btn--sm" id="c-reset" style="width:100%;margin-top:14px">${ICON.refresh} 대화 새로 시작</button>
      </aside>

      <div>
        <div class="chat-log" id="c-log"></div>
        <div class="chat-input">
          <textarea id="c-text" rows="1" placeholder="중국어로 입력하거나 마이크를 눌러 말해 보세요"></textarea>
          <button class="mic-btn" id="c-mic" title="말하기 (중국어)" aria-label="음성 입력">${ICON.mic}</button>
          <button class="btn btn--primary" id="c-send" style="height:42px" aria-label="보내기">${ICON.send}</button>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:7px">
          Enter 로 전송 · Shift+Enter 줄바꿈 ${sttSupported() ? '' : '· 이 브라우저는 음성 입력을 지원하지 않아요 (크롬·엣지 권장)'}
        </div>
      </div>
    </div>`;

  const log = box.querySelector('#c-log');
  drawLog(log);
  if (!state.history.length) startConversation(log);

  delegate(box, 'click', '[data-sit]', (e, el) => {
    state.situation = el.dataset.sit;
    box.querySelectorAll('[data-sit]').forEach((b) => b.classList.toggle('is-on', b === el));
    state.history = [];
    drawLog(log);
    startConversation(log);
  });

  delegate(box, 'click', '[data-clevel]', (e, el) => {
    state.level = el.dataset.clevel;
    store.setSetting('chatLevel', state.level);
    box.querySelectorAll('[data-clevel]').forEach((b) => b.classList.toggle('is-on', b === el));
    toast(`난이도를 ${LEVELS.find((l) => l.id === state.level).name}으로 바꿨어요`);
  });

  box.querySelector('#c-autotts').addEventListener('change', (e) => {
    state.autoTTS = e.target.checked;
    store.setSetting('autoTTS', state.autoTTS);
  });

  box.querySelector('#c-rate').addEventListener('input', (e) => {
    store.setSetting('ttsRate', Number(e.target.value));
  });

  box.querySelector('#c-reset').addEventListener('click', () => {
    state.history = [];
    stopSpeaking();
    drawLog(log);
    startConversation(log);
  });

  const textarea = box.querySelector('#c-text');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(120, textarea.scrollHeight) + 'px';
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(log, textarea);
    }
  });

  box.querySelector('#c-send').addEventListener('click', () => send(log, textarea));

  /* 마이크 */
  const micBtn = box.querySelector('#c-mic');
  let recorder = null;
  micBtn.addEventListener('click', async () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    micBtn.classList.add('is-rec');
    stopSpeaking();
    recorder = listenOnce({
      lang: 'zh-CN',
      interim: (t) => {
        textarea.value = t;
      },
    });
    try {
      const { text } = await recorder.promise;
      textarea.value = text;
      send(log, textarea);
    } catch (err) {
      if (err.message) toast(err.message);
    } finally {
      micBtn.classList.remove('is-rec');
      recorder = null;
    }
  });

  /* 추천 문장 클릭 */
  delegate(box, 'click', '[data-suggest]', (e, el) => {
    textarea.value = el.dataset.suggest;
    send(log, textarea);
  });
}

async function startConversation(log) {
  await turn(log, null);
}

async function send(log, textarea) {
  const text = textarea.value.trim();
  if (!text || state.busy) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  await turn(log, text);
}

async function turn(log, userText) {
  if (state.busy) return;
  state.busy = true;

  if (userText) {
    state.history.push({ role: 'user', text: userText });
    drawLog(log);
  } else if (!state.history.length) {
    log.innerHTML = ''; // 첫 인사를 기다리는 동안 안내문과 겹치지 않게
  }

  const thinking = document.createElement('div');
  thinking.className = 'msg';
  thinking.innerHTML = `<div class="msg__av">汉</div><div class="msg__body"><span class="spinner"></span> <span style="color:var(--text-3);font-size:13px">생각하는 중…</span></div>`;
  log.appendChild(thinking);
  log.scrollTop = log.scrollHeight;

  try {
    const result = await ai('chat', {
      situation: state.situation,
      level: state.level,
      history: state.history,
      userText: userText || '',
    });

    // 학습자 발화에 대한 피드백을 직전 사용자 메시지에 붙인다
    if (userText && result.feedback && result.feedback.status !== 'none') {
      const last = [...state.history].reverse().find((m) => m.role === 'user');
      if (last) last.feedback = result.feedback;
    }

    state.history.push({
      role: 'ai',
      text: result.reply.zh,
      pinyin: result.reply.pinyin,
      ko: result.reply.ko,
      suggestions: result.suggestions || [],
    });

    store.recordChat(1);
    drawLog(log);

    if (state.autoTTS) speak(result.reply.zh);
  } catch (err) {
    thinking.remove();
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `<div class="msg__av">!</div><div class="msg__body" style="background:var(--err-soft);color:var(--err);font-size:13px">${esc(err.message)}</div>`;
    log.appendChild(el);
  } finally {
    state.busy = false;
  }
}

function drawLog(log) {
  if (!state.history.length) {
    log.innerHTML = `<div class="empty" style="margin:auto"><div class="empty__icon">💬</div><h3>대화를 준비하고 있어요…</h3></div>`;
    return;
  }

  log.innerHTML = state.history
    .map((m, i) => (m.role === 'user' ? userMsg(m) : aiMsg(m, i === state.history.length - 1)))
    .join('');
  log.scrollTop = log.scrollHeight;
}

function userMsg(m) {
  const zh = hasHanzi(m.text);
  return `
    <div class="msg msg--me">
      <div class="msg__av">나</div>
      <div style="min-width:0">
        <div class="msg__body">
          <div class="msg__zh" style="${zh ? '' : 'font-family:var(--font-ko);font-size:15px'}">${
            zh ? ruby(m.text) : esc(m.text)
          }</div>
        </div>
        ${m.feedback ? feedbackCard(m.feedback) : ''}
      </div>
    </div>`;
}

function feedbackCard(fb) {
  const map = {
    perfect: { cls: 'perfect', icon: '✅', title: '자연스러워요!' },
    awkward: { cls: 'awkward', icon: '💡', title: '이렇게 하면 더 자연스러워요' },
    error: { cls: 'error', icon: '✏️', title: '문법을 고쳐볼게요' },
  };
  const meta = map[fb.status];
  if (!meta) return '';

  return `
    <div class="feedback feedback--${meta.cls}">
      <div class="feedback__head">${meta.icon} ${meta.title}</div>
      ${
        fb.corrected
          ? `<div class="feedback__fix">${ruby(fb.corrected, { pinyin: ensurePinyin(fb.corrected, fb.corrected_pinyin) })}</div>
             ${fb.corrected_ko ? `<div style="font-size:12.5px;color:var(--text-2)">${esc(fb.corrected_ko)}</div>` : ''}
             <div style="margin-top:6px;display:flex;gap:6px">
               <button class="btn btn--sm btn--ghost" data-speak="${esc(fb.corrected)}">${ICON.speaker} 듣기</button>
               <button class="btn btn--sm btn--ghost" data-pron-target="${esc(fb.corrected)}">🎤 따라 말하기</button>
             </div>`
          : ''
      }
      ${fb.why ? `<div class="feedback__why" style="margin-top:7px">${esc(fb.why)}</div>` : ''}
    </div>`;
}

function aiMsg(m, isLast) {
  const py = ensurePinyin(m.text, m.pinyin);
  return `
    <div class="msg">
      <div class="msg__av">汉</div>
      <div style="min-width:0">
        <div class="msg__body">
          <div class="msg__zh">${ruby(m.text, { pinyin: py })}</div>
          <div class="msg__ko ko-mean">${esc(m.ko || '')}</div>
          <div class="msg__tools">
            <button class="btn btn--sm btn--ghost" data-speak="${esc(m.text)}">${ICON.speaker} 듣기</button>
            <button class="btn btn--sm btn--ghost" data-pron-target="${esc(m.text)}">🎤 따라 말하기</button>
          </div>
        </div>
        ${
          isLast && m.suggestions?.length
            ? `<div class="suggests">
                ${m.suggestions
                  .map(
                    (s) => `<button class="suggest" data-suggest="${esc(s.zh)}">
                      <b>${esc(s.zh)}</b>
                      <small>${esc(s.pinyin || '')} · ${esc(s.ko || '')}</small>
                    </button>`
                  )
                  .join('')}
               </div>`
            : ''
        }
      </div>
    </div>`;
}

/* ==================== 발음 연습 · 교정 ==================== */

function drawPron(box) {
  const p = state.pron;
  box.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div>
        <div class="card card__pad" style="margin-bottom:14px">
          <h3 style="margin:0 0 10px;font-size:14.5px">연습할 문장</h3>
          <textarea class="input" id="p-input" rows="2" placeholder="중국어 문장을 입력하거나 아래 예문을 고르세요" style="font-family:var(--font-zh);font-size:16px">${esc(p.target)}</textarea>
          <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap">
            <button class="btn btn--sm btn--primary" id="p-set">이 문장으로 연습</button>
            <button class="btn btn--sm btn--ghost" id="p-random">예문 랜덤 추천</button>
          </div>
        </div>

        <div class="card card__pad">
          <h3 style="margin:0 0 10px;font-size:14.5px">자주 틀리는 발음 연습</h3>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${DRILLS.map(
              (d) => `<button class="suggest" data-drill="${esc(d.zh)}" style="width:100%">
                <b>${esc(d.zh)}</b>
                <small>${esc(d.py)} · ${esc(d.tip)}</small>
              </button>`
            ).join('')}
          </div>
        </div>
      </div>

      <div id="p-stage">
        ${
          p.target
            ? pronStage(p)
            : emptyBlock({
                icon: '🎤',
                title: '문장을 골라 발음을 연습해 보세요',
                desc: '문장을 들은 뒤 따라 말하면, 어느 글자의 성모·운모·성조가 틀렸는지 짚어드립니다.',
              })
        }
      </div>
    </div>`;

  const input = box.querySelector('#p-input');

  box.querySelector('#p-set').addEventListener('click', () => {
    const v = input.value.trim();
    if (!hasHanzi(v)) return toast('중국어 문장을 입력해 주세요.');
    setTarget(box, v);
  });

  box.querySelector('#p-random').addEventListener('click', () => {
    const pick = SAMPLE_SENTENCES[Math.floor(Math.random() * SAMPLE_SENTENCES.length)];
    input.value = pick.zh;
    setTarget(box, pick.zh, pick.ko);
  });

  delegate(box, 'click', '[data-drill]', (e, el) => {
    input.value = el.dataset.drill;
    setTarget(box, el.dataset.drill);
  });

  bindStage(box);
}

const DRILLS = [
  { zh: '四是四，十是十', py: 'sì shì sì, shí shì shí', tip: '설치음 s / 권설음 sh 구분' },
  { zh: '知道了，真的吗', py: 'zhīdào le, zhēn de ma', tip: 'zh 권설음 — 혀끝을 입천장에' },
  { zh: '我很喜欢喝绿茶', py: 'wǒ hěn xǐhuān hē lǜchá', tip: 'ü(위) 발음과 3성 변조' },
  { zh: '日本人认识他', py: 'rìběn rén rènshi tā', tip: 'r 발음 — 한국어 ㄹ 이 아님' },
  { zh: '请给我一杯水', py: 'qǐng gěi wǒ yì bēi shuǐ', tip: 'q / j / x 설면음' },
  { zh: '妈麻马骂', py: 'mā má mǎ mà', tip: '1·2·3·4성 순서대로' },
];

const SAMPLE_SENTENCES = [
  { zh: '你好，很高兴认识你。', ko: '안녕하세요, 만나서 반갑습니다.' },
  { zh: '请问洗手间在哪里？', ko: '실례지만 화장실이 어디예요?' },
  { zh: '我想要一杯咖啡，谢谢。', ko: '커피 한 잔 주세요, 감사합니다.' },
  { zh: '这个多少钱？可以便宜一点吗？', ko: '이거 얼마예요? 조금 깎아 줄 수 있나요?' },
  { zh: '我今天学了很多新单词。', ko: '저는 오늘 새 단어를 많이 배웠어요.' },
  { zh: '明天我们一起去看电影吧。', ko: '내일 우리 같이 영화 보러 가요.' },
  { zh: '对不起，我听不懂，请说慢一点。', ko: '죄송해요, 못 알아들었어요. 조금 천천히 말해 주세요.' },
  { zh: '他每天早上七点起床跑步。', ko: '그는 매일 아침 7시에 일어나 달리기를 해요.' },
];

function setTarget(box, zh, ko = '') {
  state.pron = { target: zh, pinyin: toPinyin(zh), ko, result: null, heard: '', busy: false };
  box.querySelector('#p-stage').innerHTML = pronStage(state.pron);
  const input = box.querySelector('#p-input');
  if (input) input.value = zh;
}

function pronStage(p) {
  return `
    <div class="pron-target">
      <div class="zh" style="font-size:26px;line-height:2.1">${ruby(p.target, { pinyin: p.pinyin })}</div>
      ${p.ko ? `<div class="ko-mean" style="margin-top:6px">${esc(p.ko)}</div>` : ''}
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn--ghost" data-speak="${esc(p.target)}">${ICON.speaker} 원어민 발음 듣기</button>
        <button class="btn btn--ghost btn--sm" id="p-slow">🐢 느리게</button>
      </div>
      <button class="btn btn--primary btn--lg js-rec" style="margin-top:14px;width:100%;max-width:320px">
        ${ICON.mic} 따라 말하기
      </button>
      <div id="p-live" style="font-size:13px;color:var(--text-3);min-height:20px;margin-top:8px"></div>
    </div>

    <div id="p-result" style="margin-top:14px">${p.result ? pronResult(p) : ''}</div>`;
}

function bindStage(box) {
  let recorder = null;

  delegate(box, 'click', '#p-slow', () => speak(state.pron.target, { rate: 0.55 }));

  delegate(box, 'click', '.js-rec', async (e, btn) => {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!sttSupported()) {
      toast('음성 인식은 크롬·엣지에서 사용할 수 있어요.');
      return;
    }
    stopSpeaking();
    btn.classList.add('is-rec');
    btn.innerHTML = `${ICON.mic} 듣는 중… (누르면 종료)`;
    const live = box.querySelector('#p-live');

    recorder = listenOnce({
      lang: 'zh-CN',
      interim: (t) => {
        live.textContent = t;
      },
    });

    try {
      const { text, confidence } = await recorder.promise;
      live.textContent = '';
      await evaluate(box, text, confidence);
    } catch (err) {
      if (err.message) toast(err.message);
      live.textContent = '';
    } finally {
      btn.classList.remove('is-rec');
      btn.innerHTML = `${ICON.mic} 따라 말하기`;
      recorder = null;
    }
  });

  // 회화 탭의 "따라 말하기" 버튼에서 넘어오는 경우
  delegate(box, 'click', '[data-pron-target]', (e, el) => {
    setTarget(box, el.dataset.pronTarget);
  });
}

async function evaluate(box, heard, confidence) {
  const p = state.pron;
  p.heard = heard;
  const resultBox = box.querySelector('#p-result');
  resultBox.innerHTML = `<div class="card card__pad"><span class="spinner"></span> 발음을 분석하고 있어요…</div>`;

  try {
    const result = await ai('pron', {
      target: p.target,
      targetPinyin: p.pinyin,
      heard,
      confidence,
    });
    p.result = result;
    store.recordPron();
    resultBox.innerHTML = pronResult(p);
  } catch (err) {
    resultBox.innerHTML = `<div class="card card__pad" style="color:var(--err)">${esc(err.message)}</div>`;
  }
}

/** 목표 문장과 인식 결과를 글자 단위로 비교 */
function diffChars(target, heard) {
  const a = [...target].filter((c) => /[一-鿿]/.test(c));
  const b = [...heard].filter((c) => /[一-鿿]/.test(c));

  // LCS 로 일치 구간을 찾는다
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Set();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matched.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return a.map((ch, idx) => ({ ch, ok: matched.has(idx) }));
}

function pronResult(p) {
  const r = p.result;
  const score = Math.max(0, Math.min(100, Number(r.score) || 0));
  const color = score >= 85 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  const diff = diffChars(p.target, p.heard);

  return `
    <div class="card card__pad">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div style="text-align:center">
          <div class="pron-score" style="color:${color}">${score}</div>
          <div style="font-size:12px;color:var(--text-3)">발음 점수</div>
        </div>
        <div style="flex:1;min-width:180px">
          <b style="font-size:15px">${esc(r.verdict || '')}</b>
          ${r.praise ? `<div style="font-size:13px;color:var(--ok);margin-top:3px">👍 ${esc(r.praise)}</div>` : ''}
        </div>
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:6px">내 발음이 이렇게 들렸어요</div>
        <div class="zh" style="font-size:22px;letter-spacing:2px">
          ${diff.map((d) => `<span class="${d.ok ? 'diff-ok' : 'diff-bad'}">${esc(d.ch)}</span>`).join('')}
        </div>
        <div style="font-size:12.5px;color:var(--text-3);margin-top:6px">인식 결과: ${esc(p.heard || '-')}</div>
      </div>

      ${
        r.issues?.length
          ? `<div style="margin-top:16px">
              <div style="font-size:13.5px;font-weight:650;margin-bottom:4px">고칠 점 ${r.issues.length}가지</div>
              ${r.issues
                .map(
                  (is) => `
                <div class="pron-issue">
                  <div class="pron-issue__ch">${esc(is.segment)}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13.5px"><span class="pinyin">${esc(is.expected || '')}</span>
                      ${is.heard ? `<span style="color:var(--text-3);font-size:12.5px"> ← ${esc(is.heard)}</span>` : ''}
                    </div>
                    <div style="font-size:13px;color:var(--text-2);margin-top:2px">${esc(is.problem)}</div>
                    <div style="font-size:12.8px;color:var(--info);margin-top:3px">💡 ${esc(is.tip)}</div>
                  </div>
                  <button class="iconbtn-s" data-speak="${esc(is.segment)}" title="이 글자만 듣기">${ICON.speaker}</button>
                </div>`
                )
                .join('')}
            </div>`
          : `<div style="margin-top:14px;color:var(--ok);font-size:13.5px">🎯 특별히 고칠 점이 없어요. 아주 좋습니다!</div>`
      }

      ${r.focus ? `<div style="margin-top:14px;padding:11px 13px;background:var(--info-soft);border-radius:10px;font-size:13px">🎯 <b>다음 연습 포인트</b> — ${esc(r.focus)}</div>` : ''}

      <button class="btn btn--primary js-rec" style="width:100%;margin-top:14px">${ICON.mic} 다시 도전하기</button>
    </div>`;
}
