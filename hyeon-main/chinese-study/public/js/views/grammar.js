import { esc, delegate, ICON, emptyBlock, errorBlock } from '../ui.js';
import { ruby, ensurePinyin } from '../pinyin.js';
import { ai } from '../api.js';

const TOPICS = [
  { q: '조사 了(le)의 용법', label: '了', hint: '완료·변화' },
  { q: '把자문(把字句)의 용법과 어순', label: '把자문', hint: '처치문' },
  { q: '被자문(被字句) 피동문 만들기', label: '被자문', hint: '피동' },
  { q: '是…的 강조 구문', label: '是…的', hint: '강조' },
  { q: '비교문 比 의 용법', label: '比', hint: '비교' },
  { q: '就과 才의 차이', label: '就 vs 才', hint: '뉘앙스' },
  { q: '동태조사 着(zhe)와 过(guo)의 차이', label: '着 / 过', hint: '지속·경험' },
  { q: '결과보어(结果补语)의 용법', label: '결과보어', hint: '보어' },
  { q: '방향보어(趋向补语) 来·去의 용법', label: '방향보어', hint: '보어' },
  { q: '정도보어(程度补语) 得의 용법', label: '정도보어', hint: '보어' },
  { q: '가능보어(可能补语)의 용법', label: '가능보어', hint: '보어' },
  { q: '능원동사 会·能·可以의 차이', label: '会/能/可以', hint: '조동사' },
  { q: '이합사(离合词)란 무엇이고 어떻게 쓰나', label: '이합사', hint: '어휘' },
  { q: '중국어 양사(量词) 사용법과 자주 쓰는 양사', label: '양사', hint: '수량' },
  { q: '의문문 만드는 여러 가지 방법', label: '의문문', hint: '문형' },
  { q: '중국어 어순의 기본 원칙', label: '기본 어순', hint: '문형' },
  { q: '在·正在·呢 진행형 표현의 차이', label: '진행형', hint: '시제' },
  { q: '연동문과 겸어문', label: '연동·겸어문', hint: '복문' },
];

let last = { query: '', result: null };

export async function render(view, params = {}) {
  view.innerHTML = `
    <div class="page-head">
      <h1>중국어 문법</h1>
      <p>헷갈리는 어법을 물어보세요. 문형 공식 · 예문 · 한국인이 자주 틀리는 부분까지 정리해 드립니다.</p>
    </div>

    <div class="card card__pad" style="margin-bottom:18px">
      <form id="g-form" style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="input" id="g-input" style="flex:1;min-width:220px"
               placeholder="예) 了는 언제 써요? / 把자문 어순이 헷갈려요"
               value="${esc(params.q || last.query || '')}">
        <button class="btn btn--primary" type="submit">설명 보기</button>
      </form>

      <div style="margin-top:14px">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:7px">자주 찾는 문법</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${TOPICS.map(
            (t) => `<button class="chip" data-topic="${esc(t.q)}" title="${esc(t.hint)}">${esc(t.label)}</button>`
          ).join('')}
        </div>
      </div>
    </div>

    <div id="g-result"></div>
  `;

  const input = view.querySelector('#g-input');
  const box = view.querySelector('#g-result');

  view.querySelector('#g-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(box, input.value.trim());
  });

  delegate(view, 'click', '[data-topic]', (e, el) => {
    input.value = el.dataset.topic;
    run(box, el.dataset.topic);
  });

  const initial = params.q || last.query;
  if (initial && last.result && last.query === initial) {
    box.innerHTML = renderResult(last.result);
  } else if (initial) {
    run(box, initial);
  } else {
    box.innerHTML = emptyBlock({
      icon: '📖',
      title: '무엇이 궁금하세요?',
      desc: '위 버튼을 누르거나 직접 질문을 입력해 보세요.',
    });
  }
}

export async function run(box, query) {
  if (!query) return;
  box.innerHTML = `<div class="card card__pad"><span class="spinner"></span> <b>${esc(query)}</b> 를 정리하고 있어요…</div>`;
  try {
    const result = await ai('grammar', { query });
    last = { query, result };
    box.innerHTML = renderResult(result);
  } catch (err) {
    box.innerHTML = errorBlock(err.message);
  }
}

export function renderResult(r) {
  return `
    <article class="card card__pad">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <h2 style="margin:0;font-size:20px;letter-spacing:-.3px">${esc(r.title)}</h2>
        ${r.level ? `<span class="badge badge--hsk">${esc(r.level)}</span>` : ''}
      </div>
      <p style="color:var(--text-2);margin:0 0 16px;font-size:14.5px">${esc(r.summary)}</p>

      ${r.structure ? `<div class="gr-struct zh">${esc(r.structure)}</div>` : ''}

      ${
        r.points?.length
          ? `<div style="margin-top:18px">
              <h3 style="font-size:15px;margin:0 0 4px">핵심 포인트</h3>
              ${r.points.map((p) => `<div class="gr-point"><h4>${esc(p.heading)}</h4><p>${esc(p.detail)}</p></div>`).join('')}
             </div>`
          : ''
      }

      ${
        r.examples?.length
          ? `<div style="margin-top:20px">
              <h3 style="font-size:15px;margin:0 0 6px">예문</h3>
              ${r.examples
                .map(
                  (ex) => `
                <div class="ex-item">
                  <div class="ex-item__zh">${ruby(ex.zh, { pinyin: ensurePinyin(ex.zh, ex.pinyin) })}</div>
                  <div class="ex-item__ko">${esc(ex.ko)}</div>
                  <button class="btn btn--sm btn--ghost" data-speak="${esc(ex.zh)}" style="margin-top:5px">${ICON.speaker} 듣기</button>
                </div>`
                )
                .join('')}
             </div>`
          : ''
      }

      ${
        r.mistakes?.length
          ? `<div style="margin-top:20px;padding:14px 16px;background:var(--err-soft);border-radius:12px">
              <h3 style="font-size:14.5px;margin:0 0 6px;color:var(--err)">한국인이 자주 틀리는 부분</h3>
              ${r.mistakes
                .map(
                  (m) => `
                <div class="mistake">
                  <div class="mistake__wrong">✗ ${esc(m.wrong)}</div>
                  <div class="mistake__right">✓ ${esc(m.right)}</div>
                  <div class="mistake__why">${esc(m.why)}</div>
                </div>`
                )
                .join('')}
             </div>`
          : ''
      }

      ${
        r.compare
          ? `<div style="margin-top:18px;padding:13px 15px;background:var(--info-soft);border-radius:12px;font-size:13.8px">
              <b style="color:var(--info)">비슷한 문법과 비교</b>
              <div style="margin-top:5px;color:var(--text-2)">${esc(r.compare)}</div>
             </div>`
          : ''
      }

      <div style="margin-top:18px;font-size:11.5px;color:var(--text-3)">AI가 생성한 설명입니다. 시험 대비 등 중요한 경우 교재로 한 번 더 확인하세요.</div>
    </article>`;
}
