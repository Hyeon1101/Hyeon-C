import { esc, emptyBlock, fmtSeconds, sample, loadingBlock } from '../ui.js';
import { wordCard } from '../components.js';
import * as store from '../store.js';
import { loadLevel, findInHsk } from '../api.js';

export async function render(view) {
  const s = store.stats();
  const level = store.getSetting('level') || 1;

  view.innerHTML = `
    <section class="hero">
      <h1>你好! 오늘도 중국어 한 걸음 👋</h1>
      <p>HSK 급수별 단어부터 AI 회화까지, 하루 10분이면 충분합니다.</p>
      <div class="hero__stats">
        <div class="hero__stat"><b>${s.streak}일</b><span>연속 학습</span></div>
        <div class="hero__stat"><b>${s.savedCount}개</b><span>저장한 단어</span></div>
        <div class="hero__stat"><b>${s.favCount}개</b><span>복습할 단어</span></div>
        <div class="hero__stat"><b>${s.quizTotal ? s.accuracy + '%' : '-'}</b><span>퀴즈 정답률</span></div>
      </div>
    </section>

    <div class="quick">
      <a href="#/words">
        <div class="quick__ico">📚</div>
        <b>HSK 급수별 단어</b>
        <span>1~6급 4,991개 단어를 병음·뜻·예문과 함께</span>
      </a>
      <a href="#/quiz">
        <div class="quick__ico">✍️</div>
        <b>퀴즈 & 받아쓰기</b>
        <span>4가지 객관식 퀴즈와 AI 한중 작문 받아쓰기</span>
      </a>
      <a href="#/chat">
        <div class="quick__ico">💬</div>
        <b>AI 회화 연습</b>
        <span>상황별 대화 · 발음 교정 · 문장 피드백</span>
      </a>
      <a href="#/grammar">
        <div class="quick__ico">📖</div>
        <b>문법 설명</b>
        <span>了 · 把 · 被 … 헷갈리는 어법을 쉽게</span>
      </a>
    </div>

    <div class="section-title">
      <h2>오늘의 학습 현황</h2>
      <span class="sub">${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</span>
    </div>
    <div class="grid c4">
      <div class="stat">
        <div class="stat__label">오늘 새로 배운 단어</div>
        <div class="stat__value">${s.today.learned}<small>개</small></div>
      </div>
      <div class="stat">
        <div class="stat__label">오늘 퀴즈</div>
        <div class="stat__value">${s.today.quizRight + s.today.quizWrong}<small>문제</small></div>
        <div class="stat__hint">정답 ${s.today.quizRight} · 오답 ${s.today.quizWrong}</div>
      </div>
      <div class="stat">
        <div class="stat__label">오늘 회화</div>
        <div class="stat__value">${s.today.chat}<small>턴</small></div>
      </div>
      <div class="stat">
        <div class="stat__label">오늘 학습 시간</div>
        <div class="stat__value" style="font-size:22px">${fmtSeconds(s.today.sec)}</div>
      </div>
    </div>

    <div class="section-title">
      <h2>복습이 필요한 단어</h2>
      <a class="sub" href="#/quiz" style="color:var(--accent)">퀴즈로 복습하기 →</a>
    </div>
    <div id="home-review"></div>

    <div class="section-title">
      <h2>HSK ${level}급 추천 단어</h2>
      <a class="sub" href="#/words" style="color:var(--accent)">전체 보기 →</a>
    </div>
    <div id="home-recommend">${loadingBlock('단어를 불러오는 중…')}</div>
  `;

  /* 복습 단어 */
  const rawFavs = store.favorites().sort((a, b) => (a.mastery - b.mastery) || (b.wrong - a.wrong));
  const favs = await Promise.all(
    rawFavs.slice(0, 8).map(async (w) => {
      if (!w.ex?.length || !w.k?.length || !w.p) {
        const hsk = await findInHsk(w.w).catch(() => null);
        if (hsk) {
          return {
            ...w,
            ex: w.ex?.length ? w.ex : hsk.ex,
            k: w.k?.length ? w.k : hsk.k,
            p: w.p || hsk.p,
            h: w.h || hsk.h,
          };
        }
      }
      return w;
    })
  );
  const reviewBox = view.querySelector('#home-review');
  reviewBox.innerHTML = favs.length
    ? `<div class="grid c4">${favs.map((w) => wordCard(w)).join('')}</div>`
    : emptyBlock({
        icon: '⭐',
        title: '복습할 단어가 아직 없어요',
        desc: '단어 카드의 별을 누르면 잘 안 외워지는 단어가 여기에 모입니다. 퀴즈에서 틀린 단어도 자동으로 추가돼요.',
        action: '<a class="btn btn--primary" href="#/words">단어 보러 가기</a>',
      });

  /* 추천 단어 — 아직 저장하지 않은 단어 위주 */
  const recBox = view.querySelector('#home-recommend');
  try {
    const list = await loadLevel(level);
    const fresh = list.filter((x) => !store.hasWord(x.w));
    const picks = sample(fresh.length >= 8 ? fresh.slice(0, 120) : list, 8);
    recBox.innerHTML = `<div class="grid c4">${picks.map((w) => wordCard(w)).join('')}</div>`;
  } catch (err) {
    recBox.innerHTML = `<div class="card card__pad" style="color:var(--text-3)">단어를 불러오지 못했습니다. ${esc(err.message)}</div>`;
  }
}
