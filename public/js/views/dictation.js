/**
 * 받아쓰기(작문 연습) — 한국어 문장을 중국어로 번역하는 연습
 *
 * 플로우: 설정 → AI 출제 → 사용자 입력 → AI 채점 → 결과 요약
 */

import { esc, emptyBlock, sample, toast, delegate, ICON } from '../ui.js';
import { ruby, colorPinyin, ensurePinyin } from '../pinyin.js';
import * as store from '../store.js';
import { loadLevel, ai } from '../api.js';
import { speak, stopSpeaking, listenOnce, sttSupported } from '../speech.js';
import * as quiz from './quiz.js';

const LEVELS = [
  { id: 'beginner', name: '초급', hint: 'HSK 1~2급 · 짧은 문장' },
  { id: 'intermediate', name: '중급', hint: 'HSK 3~4급 · 일상 문장' },
  { id: 'advanced', name: '고급', hint: 'HSK 5~6급 · 복문·관용' },
];

let session = null;

export async function render(view) {
  session = null;
  await renderSetup(view);
}

/* ==================== 설정 화면 ==================== */

async function renderSetup(view) {
  const s = store.stats();
  const saved = store.allWords();
  const favs = store.favorites();

  view.innerHTML = `
    <div class="page-head">
      <h1>퀴즈 & 받아쓰기</h1>
      <p>오늘 배운 단어로 만든 한국어 문장을 중국어로 번역해 보세요. AI가 즉시 채점하고 어디가 틀렸는지 알려드려요.</p>
    </div>

    <div class="seg" id="dict-tab-switcher" style="margin-bottom:22px;display:flex;width:100%;max-width:440px">
      <button data-qmode="mcq" style="flex:1;padding:9px 14px;font-size:14px;font-weight:600">🎯 4지선다 퀴즈</button>
      <button class="is-on" data-qmode="dictation" style="flex:1;padding:9px 14px;font-size:14px;font-weight:600">✍️ 한중 받아쓰기 (AI)</button>
    </div>

    <div class="grid c4" style="margin-bottom:22px">
      <div class="stat"><div class="stat__label">✍️ 받아쓰기</div><div class="stat__value">${s.dictation || 0}<small>문제</small></div></div>
      <div class="stat"><div class="stat__label">📚 내 단어장</div><div class="stat__value">${s.savedCount}<small>개</small></div></div>
      <div class="stat"><div class="stat__label">⭐ 복습함</div><div class="stat__value">${s.favCount}<small>개</small></div></div>
      <div class="stat"><div class="stat__label">🔥 연속 학습</div><div class="stat__value">${s.streak}<small>일</small></div></div>
    </div>

    <div class="card card__pad">
      <h2 style="margin:0 0 14px;font-size:16px">출제 범위</h2>
      <div class="seg" id="d-source" style="margin-bottom:18px;flex-wrap:wrap">
        <button data-source="fav" class="${favs.length >= 4 ? 'is-on' : ''}" ${favs.length < 4 ? 'disabled style="opacity:.4"' : ''}>복습함 (${favs.length})</button>
        <button data-source="saved" class="${favs.length < 4 && saved.length >= 4 ? 'is-on' : ''}" ${saved.length < 4 ? 'disabled style="opacity:.4"' : ''}>내 단어장 (${saved.length})</button>
        <button data-source="hsk" class="${saved.length < 4 ? 'is-on' : ''}">HSK 급수별</button>
      </div>

      <div id="d-hsk-pick" style="margin-bottom:18px;${saved.length < 4 ? '' : 'display:none'}">
        <div style="font-size:13px;color:var(--text-2);margin-bottom:8px">급수 선택</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${[1, 2, 3, 4, 5, 6]
            .map(
              (lv) =>
                `<button class="chip ${lv === (store.getSetting('level') || 1) ? 'is-on' : ''}" data-dlevel="${lv}">HSK ${lv}급</button>`
            )
            .join('')}
        </div>
      </div>

      <h2 style="margin:0 0 14px;font-size:16px">난이도</h2>
      <div class="seg" id="d-difficulty" style="margin-bottom:18px;width:100%">
        ${LEVELS.map(
          (l) =>
            `<button data-diff="${l.id}" class="${l.id === (store.getSetting('chatLevel') || 'beginner') ? 'is-on' : ''}" style="flex:1" title="${l.hint}">${l.name} <small style="font-size:11px;opacity:.7">${l.hint}</small></button>`
        ).join('')}
      </div>

      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <label style="font-size:13.5px;color:var(--text-2)">문제 수</label>
        <div class="seg" id="d-count">
          <button data-count="5">5문제</button>
          <button data-count="10" class="is-on">10문제</button>
          <button data-count="15">15문제</button>
        </div>
        <div class="toolbar__spacer" style="flex:1"></div>
        <button class="btn btn--primary btn--lg" id="d-start">받아쓰기 시작 →</button>
      </div>
    </div>
  `;

  const cfg = {
    source: favs.length >= 4 ? 'fav' : saved.length >= 4 ? 'saved' : 'hsk',
    level: store.getSetting('level') || 1,
    difficulty: store.getSetting('chatLevel') || 'beginner',
    count: 10,
  };

  delegate(view, 'click', '#d-source button', (e, el) => {
    if (el.disabled) return;
    cfg.source = el.dataset.source;
    view.querySelectorAll('#d-source button').forEach((b) => b.classList.toggle('is-on', b === el));
    view.querySelector('#d-hsk-pick').style.display = cfg.source === 'hsk' ? '' : 'none';
  });

  delegate(view, 'click', '[data-dlevel]', (e, el) => {
    cfg.level = Number(el.dataset.dlevel);
    view.querySelectorAll('[data-dlevel]').forEach((b) => b.classList.toggle('is-on', b === el));
  });

  delegate(view, 'click', '#d-difficulty button', (e, el) => {
    cfg.difficulty = el.dataset.diff;
    view.querySelectorAll('#d-difficulty button').forEach((b) => b.classList.toggle('is-on', b === el));
  });

  delegate(view, 'click', '#d-count button', (e, el) => {
    cfg.count = Number(el.dataset.count);
    view.querySelectorAll('#d-count button').forEach((b) => b.classList.toggle('is-on', b === el));
  });

  delegate(view, 'click', '#dict-tab-switcher button', async (e, el) => {
    if (el.dataset.qmode === 'mcq') {
      await quiz.render(view);
    }
  });

  view.querySelector('#d-start').addEventListener('click', async () => {
    const pool = await buildPool(cfg);
    if (pool.length < 4) {
      toast('뜻이 있는 단어가 4개 이상 필요해요. 먼저 단어를 학습해 주세요.');
      return;
    }
    await startDictation(view, pool, cfg);
  });
}

/* ==================== 단어 풀 구성 ==================== */

async function buildPool(cfg) {
  let list;
  if (cfg.source === 'fav') list = store.favorites();
  else if (cfg.source === 'saved') list = store.allWords();
  else list = await loadLevel(cfg.level);

  return list
    .map((x) => ({
      word: x.w,
      pinyin: x.p || '',
      meaning: ((x.k && x.k.length ? x.k : x.e || []).map(cleanMean).filter(Boolean))[0] || '',
      means: (x.k && x.k.length ? x.k : x.e || []).map(cleanMean).filter(Boolean),
    }))
    .filter((x) => x.word && x.meaning && x.pinyin);
}

function cleanMean(text) {
  let s = String(text || '').replace(/^\[[^\]]*\]\s*/, '');
  let prev;
  do {
    prev = s;
    s = s.replace(/\([^()]*\)/g, '').replace(/\[[^[\]]*\]/g, '');
  } while (s !== prev);
  return s
    .replace(/[()[\]]/g, '')
    .replace(/[=→↔]\s*\S*/g, '')
    .replace(/[\s.。,，·]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/* ==================== 세션 시작 ==================== */

async function startDictation(view, pool, cfg) {
  const picked = sample(pool, Math.min(cfg.count * 3, pool.length));

  // 출제할 단어 정보를 AI에 전달
  const wordInfo = picked.map((w) => ({
    word: w.word,
    pinyin: w.pinyin,
    meaning: w.meaning,
  }));

  view.innerHTML = `
    <div class="dict-stage">
      <div class="dict-prompt">
        <span class="spinner"></span>
        <p style="color:var(--text-3);font-size:14px;margin:12px 0 0">AI가 문제를 만들고 있어요…</p>
      </div>
    </div>`;

  try {
    const result = await ai('dictation_generate', {
      words: wordInfo,
      level: cfg.difficulty,
      count: cfg.count,
    });

    if (!result.sentences || !result.sentences.length) {
      toast('문제를 만들지 못했어요. 다시 시도해 주세요.');
      renderSetup(view);
      return;
    }

    session = {
      questions: result.sentences.slice(0, cfg.count),
      idx: 0,
      results: [],
      totalScore: 0,
    };

    drawQuestion(view);
  } catch (err) {
    toast(err.message || 'AI 요청에 실패했어요.');
    renderSetup(view);
  }
}

/* ==================== 문제 화면 ==================== */

function drawQuestion(view) {
  const q = session.questions[session.idx];
  if (!q) return drawResult(view);

  const total = session.questions.length;
  const progress = ((session.idx) / total) * 100;

  view.innerHTML = `
    <div class="dict-stage">
      <div class="quiz-progress">
        <span class="badge">✍️ 받아쓰기</span>
        <div class="bar" style="flex:1"><div class="bar__fill" style="width:${progress}%"></div></div>
        <span>${session.idx + 1} / ${total}</span>
        <button class="iconbtn-s" id="d-quit" title="그만두기" aria-label="그만두기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>

      <div class="dict-prompt">
        <div style="font-size:13px;color:var(--text-3);margin-bottom:12px">다음 문장을 중국어로 써 보세요</div>
        <div class="dict-prompt__ko">${esc(q.ko)}</div>
        ${
          q.hint_words && q.hint_words.length
            ? `<div class="dict-hint">
                <span style="font-size:12px;color:var(--text-3);line-height:28px">💡 힌트:</span>
                ${q.hint_words.map((w) => `<span class="dict-hint__chip">${esc(w)}</span>`).join('')}
               </div>`
            : ''
        }
      </div>

      <div style="position:relative;margin-top:16px">
        <textarea class="dict-input" id="d-answer" rows="2" placeholder="중국어로 입력하거나 마이크로 말해 보세요…" style="margin-top:0;padding-right:52px" autofocus></textarea>
        <button type="button" class="mic-btn" id="d-mic" title="음성으로 입력 (중국어)" aria-label="음성 입력" style="position:absolute;right:10px;bottom:14px;width:36px;height:36px;border-radius:10px">
          ${ICON.mic}
        </button>
      </div>

      <div class="dict-actions">
        <button class="btn btn--primary btn--lg" id="d-submit" style="flex:1;max-width:240px">확인</button>
        <button class="btn btn--ghost btn--lg" id="d-skip">모르겠어요</button>
      </div>

      <div id="d-feedback" style="margin-top:16px"></div>
    </div>`;

  const textarea = view.querySelector('#d-answer');
  const submitBtn = view.querySelector('#d-submit');
  const skipBtn = view.querySelector('#d-skip');
  const micBtn = view.querySelector('#d-mic');

  // 자동 포커스
  setTimeout(() => textarea.focus(), 100);

  // 음성 입력 (STT)
  let recorder = null;
  micBtn.addEventListener('click', async () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!sttSupported()) {
      toast('음성 입력은 크롬·엣지에서 지원돼요.');
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
      textarea.focus();
    } catch (err) {
      if (err.message) toast(err.message);
    } finally {
      micBtn.classList.remove('is-rec');
      recorder = null;
    }
  });

  // Enter로 제출 (Shift+Enter = 줄바꿈)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitAnswer(view, textarea.value.trim());
    }
  });

  submitBtn.addEventListener('click', () => submitAnswer(view, textarea.value.trim()));
  skipBtn.addEventListener('click', () => submitAnswer(view, ''));
  view.querySelector('#d-quit').addEventListener('click', () => {
    if (recorder) recorder.stop();
    if (session.results.length > 0) drawResult(view);
    else renderSetup(view);
  });
}

/* ==================== 채점 ==================== */

async function submitAnswer(view, userAnswer) {
  const q = session.questions[session.idx];
  const feedbackBox = view.querySelector('#d-feedback');
  const submitBtn = view.querySelector('#d-submit');
  const skipBtn = view.querySelector('#d-skip');
  const textarea = view.querySelector('#d-answer');

  // 중복 제출 방지
  submitBtn.disabled = true;
  skipBtn.disabled = true;
  textarea.disabled = true;

  if (!userAnswer) {
    // 모르겠어요 → 바로 정답 표시
    showFeedback(view, feedbackBox, q, {
      status: 'wrong',
      score: 0,
      corrected: q.answer_zh,
      corrected_pinyin: q.answer_pinyin,
      overall_feedback: '괜찮아요! 정답을 확인하고 다음에 도전해 보세요.',
      differences: [],
      grammar_notes: [],
    }, userAnswer);
    return;
  }

  feedbackBox.innerHTML = `<div class="card card__pad"><span class="spinner"></span> AI가 채점하고 있어요…</div>`;

  try {
    const result = await ai('dictation_check', {
      ko: q.ko,
      reference: q.answer_zh,
      userAnswer,
    });

    showFeedback(view, feedbackBox, q, result, userAnswer);
  } catch (err) {
    feedbackBox.innerHTML = `<div class="card card__pad" style="color:var(--err)">${esc(err.message)}</div>`;
    submitBtn.disabled = false;
    skipBtn.disabled = false;
    textarea.disabled = false;
  }
}

function showFeedback(view, feedbackBox, q, result, userAnswer) {
  const score = Math.max(0, Math.min(100, Number(result.score) || 0));
  const statusMap = {
    perfect: { color: 'var(--ok)', icon: '🎉', title: '완벽해요!' },
    good: { color: 'var(--ok)', icon: '👍', title: '잘했어요!' },
    partial: { color: 'var(--warn)', icon: '💪', title: '거의 맞았어요!' },
    wrong: { color: 'var(--err)', icon: '📖', title: '다시 확인해 봐요' },
  };
  const meta = statusMap[result.status] || statusMap.wrong;

  // 결과 저장
  session.results.push({
    question: q,
    userAnswer,
    result,
    score,
  });
  session.totalScore += score;

  // 학습 기록
  store.recordDictation(1);

  const correctedPy = ensurePinyin(result.corrected || q.answer_zh, result.corrected_pinyin || q.answer_pinyin);

  feedbackBox.innerHTML = `
    <div class="card card__pad" style="border-color:${meta.color}22;background:${score >= 80 ? 'var(--ok-soft)' : score >= 50 ? 'var(--warn-soft)' : 'var(--err-soft)'}">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap">
        <div class="dict-score" style="color:${meta.color}">${score}</div>
        <div style="flex:1;min-width:140px">
          <div style="font-size:17px;font-weight:650">${meta.icon} ${meta.title}</div>
          <div style="font-size:13px;color:var(--text-2);margin-top:3px">${esc(result.overall_feedback || '')}</div>
        </div>
      </div>

      <div style="padding:14px 0;border-top:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:6px">정답</div>
        <div class="zh" style="font-size:22px;line-height:2">${ruby(result.corrected || q.answer_zh, { pinyin: correctedPy })}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn--sm btn--ghost" data-speak="${esc(result.corrected || q.answer_zh)}">${ICON.speaker} 듣기</button>
        </div>
      </div>

      ${
        userAnswer
          ? `<div style="padding:14px 0;border-top:1px solid var(--border)">
              <div style="font-size:12.5px;color:var(--text-3);margin-bottom:6px">내 답안</div>
              <div class="zh" style="font-size:18px">${esc(userAnswer)}</div>
             </div>`
          : ''
      }

      ${
        result.differences && result.differences.length
          ? `<div style="padding:14px 0;border-top:1px solid var(--border)">
              <div style="font-size:13px;font-weight:650;margin-bottom:6px">📌 교정 사항</div>
              ${result.differences
                .map(
                  (d) => `
                <div class="dict-issue">
                  <div class="dict-issue__arrow">→</div>
                  <div class="dict-issue__body">
                    <div class="dict-issue__parts">
                      ${d.user_part ? `<span class="dict-issue__wrong">${esc(d.user_part)}</span>` : '<span style="color:var(--text-3);font-size:13px">(빠진 부분)</span>'}
                      <span style="color:var(--text-3)">→</span>
                      <span class="dict-issue__right">${esc(d.correct_part)}</span>
                    </div>
                    <div class="dict-issue__why">${esc(d.explanation)}</div>
                  </div>
                </div>`
                )
                .join('')}
             </div>`
          : ''
      }

      ${
        result.grammar_notes && result.grammar_notes.length
          ? `<div style="padding:12px;margin-top:8px;background:var(--info-soft);border-radius:10px">
              <div style="font-size:12.5px;font-weight:600;margin-bottom:5px">📝 어법 포인트</div>
              ${result.grammar_notes.map((n) => `<div style="font-size:13px;color:var(--text-2);line-height:1.6">• ${esc(n)}</div>`).join('')}
             </div>`
          : ''
      }

      ${
        result.alternative
          ? `<div style="padding:12px;margin-top:8px;background:var(--surface-2);border-radius:10px">
              <div style="font-size:12.5px;font-weight:600;margin-bottom:5px">💡 이렇게도 쓸 수 있어요</div>
              <div class="zh" style="font-size:16px">${ruby(result.alternative.zh, { pinyin: result.alternative.pinyin })}</div>
              <div style="font-size:13px;color:var(--text-2);margin-top:3px">${esc(result.alternative.ko || '')}</div>
             </div>`
          : ''
      }

      <button class="btn btn--primary" id="d-next" style="width:100%;margin-top:14px">
        ${session.idx + 1 >= session.questions.length ? '결과 보기' : '다음 문제 →'}
      </button>
    </div>`;

  view.querySelector('#d-next').addEventListener('click', () => {
    session.idx += 1;
    drawQuestion(view);
  });

  // Enter 키로 다음 문제
  const enterHandler = (e) => {
    const nextBtn = view.querySelector('#d-next');
    if (!nextBtn || !document.body.contains(nextBtn)) {
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

/* ==================== 결과 화면 ==================== */

function drawResult(view) {
  const total = session.results.length;
  if (total === 0) {
    renderSetup(view);
    return;
  }

  const avg = Math.round(session.totalScore / total);
  const perfect = session.results.filter((r) => r.result.status === 'perfect' || r.result.status === 'good').length;
  const wrong = session.results.filter((r) => r.result.status === 'wrong').length;

  const emoji = avg >= 90 ? '🏆' : avg >= 70 ? '🎉' : avg >= 50 ? '💪' : '📖';
  const comment =
    avg >= 90
      ? '훌륭해요! 작문 실력이 빛나고 있어요.'
      : avg >= 70
        ? '잘하고 있어요! 틀린 문장만 한 번 더 복습해 보세요.'
        : avg >= 50
          ? '절반 이상 맞혔어요. 조금만 더 연습하면 완벽해질 거예요.'
          : '괜찮아요! 반복하면 반드시 실력이 늘어요.';

  view.innerHTML = `
    <div class="dict-stage">
      <div class="dict-prompt">
        <div style="font-size:52px;margin-bottom:8px">${emoji}</div>
        <div style="font-size:40px;font-weight:800;letter-spacing:-1.5px">${avg}<span style="color:var(--text-3);font-size:22px">점</span></div>
        <div style="color:var(--accent);font-weight:650;margin:4px 0 6px">평균 점수</div>
        <div style="display:flex;gap:20px;justify-content:center;margin-top:10px;font-size:14px">
          <span style="color:var(--ok)">✅ ${perfect}문제 정답</span>
          <span style="color:var(--err)">❌ ${wrong}문제 오답</span>
          <span style="color:var(--text-3)">총 ${total}문제</span>
        </div>
        <p style="color:var(--text-2);margin:12px 0 0;font-size:14px">${comment}</p>
      </div>

      ${
        session.results.filter((r) => r.score < 80).length
          ? `<div class="card card__pad" style="margin-top:16px">
              <h3 style="margin:0 0 10px;font-size:15px">다시 복습할 문장 <span style="font-weight:400;font-size:13px;color:var(--text-3)">— 80점 미만</span></h3>
              <div style="display:flex;flex-direction:column;gap:12px">
                ${session.results
                  .filter((r) => r.score < 80)
                  .map(
                    (r) => `
                  <div style="padding:12px;background:var(--surface-2);border-radius:10px">
                    <div style="font-size:14px;color:var(--text-2);margin-bottom:6px">${esc(r.question.ko)}</div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span class="zh" style="font-size:17px;font-weight:600">${esc(r.result.corrected || r.question.answer_zh)}</span>
                      <span class="pinyin" style="font-size:13px">${colorPinyin(r.result.corrected_pinyin || r.question.answer_pinyin)}</span>
                      <button class="iconbtn-s" data-speak="${esc(r.result.corrected || r.question.answer_zh)}">${ICON.speaker}</button>
                    </div>
                    ${r.userAnswer ? `<div style="font-size:12.5px;color:var(--err);margin-top:4px">내 답안: ${esc(r.userAnswer)}</div>` : ''}
                  </div>`
                  )
                  .join('')}
              </div>
             </div>`
          : ''
      }

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn--primary" id="d-again" style="flex:1">한 번 더 풀기</button>
        <button class="btn btn--ghost" id="d-setup" style="flex:1">설정 바꾸기</button>
      </div>
    </div>`;

  view.querySelector('#d-again').addEventListener('click', () => {
    // 기존 문제 순서 섞어서 다시 출제
    session.idx = 0;
    session.results = [];
    session.totalScore = 0;
    session.questions = [...session.questions].sort(() => Math.random() - 0.5);
    drawQuestion(view);
  });

  view.querySelector('#d-setup').addEventListener('click', () => renderSetup(view));
}
