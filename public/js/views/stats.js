import { esc, fmtSeconds, fmtDate, toast, delegate } from '../ui.js';
import * as store from '../store.js';

const LEVEL_TOTALS = { 1: 150, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 };

export async function render(view) {
  const s = store.stats();
  const days = store.recentDays(84);

  view.innerHTML = `
    <div class="page-head">
      <h1>학습 통계</h1>
      <p>얼마나 꾸준히 했는지, 무엇을 더 해야 하는지 한눈에 확인하세요.</p>
    </div>

    <div class="grid c4">
      <div class="stat">
        <div class="stat__label">🔥 연속 학습</div>
        <div class="stat__value">${s.streak}<small>일</small></div>
        <div class="stat__hint">최장 기록 ${s.longest}일</div>
      </div>
      <div class="stat">
        <div class="stat__label">📅 총 학습 일수</div>
        <div class="stat__value">${s.studyDays}<small>일</small></div>
        <div class="stat__hint">총 ${fmtSeconds(s.totalSec)}</div>
      </div>
      <div class="stat">
        <div class="stat__label">📚 저장한 단어</div>
        <div class="stat__value">${s.savedCount}<small>개</small></div>
        <div class="stat__hint">완전히 외운 단어 ${s.masteredCount}개</div>
      </div>
      <div class="stat">
        <div class="stat__label">🎯 퀴즈 정답률</div>
        <div class="stat__value">${s.quizTotal ? s.accuracy : 0}<small>%</small></div>
        <div class="stat__hint">${s.quizRight}정답 / ${s.quizTotal}문제</div>
      </div>
    </div>

    <div class="section-title"><h2>학습 달력</h2><span class="sub">최근 12주</span></div>
    <div class="card card__pad">
      ${heatmap(days)}
    </div>

    <div class="section-title"><h2>최근 30일 학습량</h2><span class="sub">단어 · 퀴즈 · 회화</span></div>
    <div class="card card__pad">
      ${barChart(days.slice(-30))}
    </div>

    <div class="grid c2" style="margin-top:16px">
      <div class="card card__pad">
        <h2 style="font-size:16px;margin:0 0 10px">HSK 급수별 진도</h2>
        ${[1, 2, 3, 4, 5, 6]
          .map((lv) => {
            const done = s.byLevel[lv] || 0;
            const total = LEVEL_TOTALS[lv];
            const pct = Math.min(100, Math.round((done / total) * 100));
            return `
            <div class="levelrow">
              <span class="levelrow__name">HSK ${lv}급</span>
              <span class="levelrow__bar"><span class="bar"><span class="bar__fill" style="width:${pct}%"></span></span></span>
              <span class="levelrow__num">${done} / ${total}</span>
            </div>`;
          })
          .join('')}
        <div style="font-size:12px;color:var(--text-3);margin-top:8px">내 단어장에 저장한 단어 기준입니다.</div>
      </div>

      <div class="card card__pad">
        <h2 style="font-size:16px;margin:0 0 10px">활동 요약</h2>
        <div class="list">
          ${row('💬 AI 회화 대화 수', `${s.chat}턴`)}
          ${row('🎤 발음 연습 횟수', `${s.pron}회`)}
          ${row('✍️ 받아쓰기 연습', `${s.dictation || 0}문제`)}
          ${row('⭐ 복습이 필요한 단어', `${s.favCount}개`)}
          ${row('✅ 완전히 외운 단어', `${s.masteredCount}개`)}
          ${row('❌ 퀴즈 오답', `${s.quizWrong}문제`)}
          ${row('⏱️ 총 학습 시간', fmtSeconds(s.totalSec))}
        </div>
      </div>
    </div>

    <div class="section-title"><h2>가장 안 외워지는 단어</h2><span class="sub">오답이 많은 순</span></div>
    <div class="card card__pad" id="st-hard"></div>

    <div class="section-title"><h2>데이터 관리</h2></div>
    <div class="card card__pad">
      <p style="margin:0 0 12px;font-size:13.5px;color:var(--text-2)">
        학습 기록은 이 브라우저에만 저장됩니다. 다른 기기에서 이어서 하려면 백업 파일을 내려받아 옮기세요.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--ghost btn--sm" id="st-export">📥 백업 내려받기</button>
        <label class="btn btn--ghost btn--sm" style="cursor:pointer">
          📤 백업 불러오기
          <input type="file" id="st-import" accept="application/json" hidden>
        </label>
        <button class="btn btn--ghost btn--sm" id="st-reset" style="color:var(--err)">전체 기록 삭제</button>
      </div>
    </div>
  `;

  /* 어려운 단어 */
  const hard = store
    .allWords()
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.mastery - b.mastery)
    .slice(0, 10);

  view.querySelector('#st-hard').innerHTML = hard.length
    ? `<div class="list">${hard
        .map(
          (w) => `
        <div class="list__row">
          <button class="hanzi hanzi--sm" data-goto="${esc(w.w)}" style="width:78px;text-align:left">${esc(w.w)}</button>
          <span class="pinyin" style="width:110px">${esc(w.p || '')}</span>
          <span class="ko-mean" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((w.k || []).slice(0, 2).join(' · '))}</span>
          <span class="badge badge--err">오답 ${w.wrong}</span>
          <span class="badge">정답 ${w.right}</span>
        </div>`
        )
        .join('')}</div>`
    : `<div style="color:var(--text-3);font-size:13.5px;padding:8px 0">아직 퀴즈 오답이 없어요. 퀴즈를 풀면 약한 단어를 여기 모아드립니다.</div>`;

  /* 백업 */
  view.querySelector('#st-export').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `중국어학습기록_${store.todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('백업 파일을 내려받았어요');
  });

  view.querySelector('#st-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      toast('백업을 불러왔어요');
      render(view);
    } catch (err) {
      toast(`불러오기 실패: ${err.message}`);
    }
  });

  view.querySelector('#st-reset').addEventListener('click', () => {
    if (!confirm('저장한 단어와 학습 기록이 모두 사라집니다. 정말 삭제할까요?')) return;
    store.resetAll();
    toast('기록을 모두 삭제했습니다');
    render(view);
  });
}

function row(label, value) {
  return `<div class="list__row"><span style="flex:1;font-size:13.8px;color:var(--text-2)">${label}</span><b style="font-size:14.5px">${esc(value)}</b></div>`;
}

/* ---------------- 히트맵 ---------------- */

function heatmap(days) {
  // 일요일 시작 주 단위로 자른다
  const cols = [];
  let col = [];
  const first = days[0].date.getDay();
  for (let i = 0; i < first; i++) col.push(null);

  for (const d of days) {
    col.push(d);
    if (col.length === 7) {
      cols.push(col);
      col = [];
    }
  }
  if (col.length) {
    while (col.length < 7) col.push(null);
    cols.push(col);
  }

  const level = (d) => {
    if (!d || !d.data) return 0;
    const score = store.dayScore(d.data);
    if (score === 0) return 0;
    if (score < 5) return 1;
    if (score < 15) return 2;
    if (score < 30) return 3;
    return 4;
  };

  return `
    <div class="heat">
      ${cols
        .map(
          (c) => `<div class="heat__col">${c
            .map((d) =>
              d
                ? `<div class="heat__cell" data-lv="${level(d)}" title="${fmtDate(d.date)} · ${
                    d.data ? `단어 ${d.data.learned + d.data.review} · 퀴즈 ${d.data.quizRight + d.data.quizWrong} · 회화 ${d.data.chat}` : '학습 없음'
                  }"></div>`
                : `<div class="heat__cell" style="visibility:hidden"></div>`
            )
            .join('')}</div>`
        )
        .join('')}
    </div>
    <div class="heat__legend">
      적음
      <span class="heat__cell" data-lv="0"></span>
      <span class="heat__cell" data-lv="1"></span>
      <span class="heat__cell" data-lv="2"></span>
      <span class="heat__cell" data-lv="3"></span>
      <span class="heat__cell" data-lv="4"></span>
      많음
    </div>`;
}

/* ---------------- 막대 그래프 ---------------- */

function barChart(days) {
  const W = 720;
  const H = 160;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const bw = innerW / days.length;

  const values = days.map((d) => {
    const x = d.data || {};
    return {
      words: (x.learned || 0) + (x.review || 0),
      quiz: (x.quizRight || 0) + (x.quizWrong || 0),
      chat: x.chat || 0,
      key: d.key,
      date: d.date,
    };
  });

  const max = Math.max(4, ...values.map((v) => v.words + v.quiz + v.chat));
  const yTick = [0, Math.round(max / 2), max];

  const bars = values
    .map((v, i) => {
      const x = pad.l + i * bw + bw * 0.15;
      const w = bw * 0.7;
      const stack = [
        { v: v.words, c: 'var(--accent)' },
        { v: v.quiz, c: 'var(--gold)' },
        { v: v.chat, c: 'var(--info)' },
      ];
      let y = pad.t + innerH;
      return stack
        .map((s) => {
          if (!s.v) return '';
          const h = (s.v / max) * innerH;
          y -= h;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${s.c}"><title>${fmtDate(v.date)} — 단어 ${v.words} · 퀴즈 ${v.quiz} · 회화 ${v.chat}</title></rect>`;
        })
        .join('');
    })
    .join('');

  const grid = yTick
    .map((t) => {
      const y = pad.t + innerH - (t / max) * innerH;
      return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
              <text x="${pad.l - 6}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="var(--text-3)">${t}</text>`;
    })
    .join('');

  const labels = values
    .map((v, i) => {
      if (i % 6 !== 0) return '';
      const x = pad.l + i * bw + bw / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-3)">${v.date.getMonth() + 1}/${v.date.getDate()}</text>`;
    })
    .join('');

  return `
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;height:auto;display:block">
        ${grid}${bars}${labels}
      </svg>
    </div>
    <div style="display:flex;gap:14px;font-size:12px;color:var(--text-2);margin-top:8px;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--accent);border-radius:2px;margin-right:4px"></span>단어 학습</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--gold);border-radius:2px;margin-right:4px"></span>퀴즈</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--info);border-radius:2px;margin-right:4px"></span>AI 회화</span>
    </div>`;
}
