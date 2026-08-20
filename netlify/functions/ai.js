/**
 * Gemini 기반 AI 기능 (번역 · 문법 · 회화 · 발음교정 · 퀴즈해설)
 *
 *  POST /api/ai  { action, ...payload }
 *
 * API 키는 서버 환경변수(GEMINI_API_KEY)에만 두고 브라우저로는 절대 내려보내지 않는다.
 */

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const LEVEL_GUIDE = {
  beginner: 'HSK 1~2급 수준. 아주 쉬운 단어와 짧은 문장(8자 이내)만 사용한다.',
  intermediate: 'HSK 3~4급 수준. 일상 회화에서 쓰는 자연스러운 문장(10~18자)을 사용한다.',
  advanced: 'HSK 5~6급 수준. 관용표현과 복문을 포함한 풍부한 문장을 사용한다.',
};

const S = {
  str: { type: 'STRING' },
  strArr: { type: 'ARRAY', items: { type: 'STRING' } },
  sentence: {
    type: 'OBJECT',
    properties: { zh: { type: 'STRING' }, pinyin: { type: 'STRING' }, ko: { type: 'STRING' } },
    required: ['zh', 'pinyin', 'ko'],
  },
};

const SCHEMAS = {
  translate: {
    type: 'OBJECT',
    properties: {
      zh: S.str,
      pinyin: S.str,
      ko: S.str,
      literal: S.str,
      notes: S.strArr,
      alternatives: { type: 'ARRAY', items: S.sentence },
      keywords: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { word: S.str, pinyin: S.str, meaning: S.str },
          required: ['word', 'pinyin', 'meaning'],
        },
      },
    },
    required: ['zh', 'pinyin', 'ko'],
  },

  grammar: {
    type: 'OBJECT',
    properties: {
      title: S.str,
      summary: S.str,
      level: S.str,
      structure: S.str,
      points: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { heading: S.str, detail: S.str },
          required: ['heading', 'detail'],
        },
      },
      examples: { type: 'ARRAY', items: S.sentence },
      mistakes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { wrong: S.str, right: S.str, why: S.str },
          required: ['wrong', 'right', 'why'],
        },
      },
      compare: S.str,
    },
    required: ['title', 'summary', 'points', 'examples'],
  },

  chat: {
    type: 'OBJECT',
    properties: {
      reply: S.sentence,
      feedback: {
        type: 'OBJECT',
        properties: {
          status: { type: 'STRING', enum: ['none', 'perfect', 'awkward', 'error'] },
          original: S.str,
          corrected: S.str,
          corrected_pinyin: S.str,
          corrected_ko: S.str,
          why: S.str,
        },
        required: ['status'],
      },
      suggestions: { type: 'ARRAY', items: S.sentence },
    },
    required: ['reply', 'feedback', 'suggestions'],
  },

  pron: {
    type: 'OBJECT',
    properties: {
      score: { type: 'INTEGER' },
      verdict: S.str,
      praise: S.str,
      issues: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            segment: S.str,
            expected: S.str,
            heard: S.str,
            problem: S.str,
            tip: S.str,
          },
          required: ['segment', 'expected', 'problem', 'tip'],
        },
      },
      focus: S.str,
    },
    required: ['score', 'verdict', 'issues'],
  },

  word: {
    type: 'OBJECT',
    properties: {
      word: S.str,
      pinyin: S.str,
      hsk: { type: 'INTEGER' },
      means: S.strArr,
      examples: { type: 'ARRAY', items: S.sentence },
      usage: S.str,
      related: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { word: S.str, pinyin: S.str, meaning: S.str, relation: S.str },
          required: ['word', 'pinyin', 'meaning'],
        },
      },
    },
    required: ['word', 'pinyin', 'means'],
  },

  dictation_generate: {
    type: 'OBJECT',
    properties: {
      sentences: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            ko: S.str,
            hint_words: S.strArr,
            answer_zh: S.str,
            answer_pinyin: S.str,
          },
          required: ['ko', 'hint_words', 'answer_zh', 'answer_pinyin'],
        },
      },
    },
    required: ['sentences'],
  },

  dictation_check: {
    type: 'OBJECT',
    properties: {
      status: { type: 'STRING', enum: ['perfect', 'good', 'partial', 'wrong'] },
      score: { type: 'INTEGER' },
      corrected: S.str,
      corrected_pinyin: S.str,
      differences: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            user_part: S.str,
            correct_part: S.str,
            explanation: S.str,
          },
          required: ['user_part', 'correct_part', 'explanation'],
        },
      },
      overall_feedback: S.str,
      grammar_notes: S.strArr,
      alternative: S.sentence,
    },
    required: ['status', 'score', 'corrected', 'corrected_pinyin', 'overall_feedback'],
  },
};

function buildPrompt(action, p) {
  switch (action) {
    case 'translate': {
      const dirText =
        p.to === 'ko'
          ? '아래 중국어를 한국어로 번역한다.'
          : '아래 한국어를 자연스러운 중국어(간체)로 번역한다.';
      return {
        system:
          '너는 한국인 학습자를 가르치는 30년 경력의 중국어 번역가다. ' +
          '직역투를 피하고 중국인이 실제로 쓰는 표현으로 옮긴다. ' +
          'pinyin 필드에는 중국어 문장(zh)의 성조 부호가 붙은 병음을 정확히 적는다. ' +
          'notes 에는 번역하며 알아두면 좋은 어법·뉘앙스를 한국어로 1~3개 적는다. ' +
          'alternatives 에는 격식/구어 등 결이 다른 대안 표현을 1~2개 넣는다. ' +
          'keywords 에는 문장 속 핵심 단어를 최대 5개까지 뽑아 병음과 뜻을 적는다.',
        user: `${dirText}\n\n"""${p.text}"""`,
        schema: SCHEMAS.translate,
      };
    }

    case 'grammar':
      return {
        system:
          '너는 한국인을 위한 중국어 문법 전문 강사다. 한국어로 아주 쉽게 설명한다. ' +
          '한국어 어법과 다른 지점을 반드시 짚어준다. ' +
          'structure 에는 "주어 + 把 + 목적어 + 동사 + 기타성분" 같은 문형 공식을 적는다. ' +
          'examples 는 4~6개, 쉬운 것부터 어려운 순서로 배치하고 병음과 한국어 번역을 모두 적는다. ' +
          'mistakes 에는 한국인이 자주 틀리는 예를 2~3개 넣는다. ' +
          'compare 에는 혼동하기 쉬운 비슷한 문법과의 차이를 적는다(없으면 빈 문자열).',
        user: `다음 중국어 문법 질문에 답하라.\n\n"""${p.query}"""`,
        schema: SCHEMAS.grammar,
      };

    case 'chat': {
      const guide = LEVEL_GUIDE[p.level] || LEVEL_GUIDE.beginner;
      const history = (p.history || [])
        .slice(-12)
        .map((m) => `${m.role === 'user' ? '학습자' : 'AI'}: ${m.text}`)
        .join('\n');
      return {
        system:
          `너는 한국인 학습자와 중국어로 대화하는 원어민 회화 선생님이다. 상황: "${p.situation}".\n` +
          `${guide}\n` +
          '규칙:\n' +
          '1. reply.zh 는 반드시 중국어(간체)로만 쓴다. 한국어를 섞지 않는다.\n' +
          '2. reply.zh 는 1~2문장으로 짧게 하고, **반드시 학습자에게 던지는 질문으로 끝낸다.** 대화가 끊기지 않게 계속 물어본다.\n' +
          '3. reply.pinyin 은 성조 부호가 붙은 병음, reply.ko 는 한국어 번역이다.\n' +
          '4. feedback 은 학습자의 **마지막 발화**에 대한 평가다. ' +
          '문법 오류가 있으면 status="error", 문법은 맞지만 어색하면 status="awkward", ' +
          '자연스러우면 status="perfect", 학습자 발화가 없으면 status="none". ' +
          'error/awkward 이면 corrected(고친 중국어) · corrected_pinyin · corrected_ko · why(한국어로 이유) 를 채운다. ' +
          'why 는 "왜 어색한지"를 한국어로 친절하게 2문장 이내로 적는다.\n' +
          '5. suggestions 에는 학습자가 지금 대답으로 쓸 만한 중국어 문장 2~3개를 병음·한국어와 함께 넣는다.\n' +
          '6. 학습자가 한국어로 말해도 너는 중국어로 대화를 이어간다.',
        user:
          (history ? `지금까지의 대화:\n${history}\n\n` : '') +
          (p.userText
            ? `학습자의 새 발화: "${p.userText}"\n이에 답하라.`
            : `대화를 시작하라. "${p.situation}" 상황에 맞는 첫 인사와 질문을 던져라.`),
        schema: SCHEMAS.chat,
      };
    }

    case 'pron':
      return {
        system:
          '너는 중국어 발음 교정 전문가다. 학습자가 목표 문장을 소리내어 읽었고, ' +
          '음성인식기가 받아적은 결과가 주어진다. 둘을 비교해 발음 문제를 진단한다.\n' +
          '- score 는 0~100 정수. 완전히 같으면 95 이상.\n' +
          '- 음성인식 결과가 목표와 다른 글자로 인식됐다면, 그 글자의 성모/운모/성조 중 무엇을 틀렸는지 추론한다.\n' +
          '  예) 목표 "四" 인데 "十" 로 인식 → 권설음/설치음 혼동, 목표 "买" 인데 "卖" 로 인식 → 3성을 4성으로 발음.\n' +
          '- issues[].segment 는 문제가 된 글자, expected 는 올바른 병음, heard 는 그렇게 들린 이유나 인식된 글자, ' +
          'problem 은 무엇이 틀렸는지, tip 은 혀 위치·입모양·성조 곡선을 한국어로 구체적으로 알려주는 교정법.\n' +
          '- 한국인이 특히 어려워하는 zh/ch/sh, z/c/s, r, ü, 3성 변조, 경성을 눈여겨본다.\n' +
          '- 모든 설명은 한국어로 한다. 잘한 점(praise)도 반드시 한 마디 적는다.',
        user:
          `목표 문장: ${p.target}\n` +
          `목표 병음: ${p.targetPinyin || '(제공 안 됨)'}\n` +
          `음성인식 결과: ${p.heard || '(인식 실패)'}\n` +
          `인식 신뢰도: ${p.confidence != null ? p.confidence : '알 수 없음'}`,
        schema: SCHEMAS.pron,
      };

    case 'word':
      return {
        system:
          '너는 한국인을 위한 중국어 사전이다. 주어진 중국어 단어를 설명한다. ' +
          'means 는 한국어 뜻을 품사와 함께 1~4개. examples 는 예문 3개(중국어·병음·한국어). ' +
          'usage 는 쓰임새와 뉘앙스 설명. related 는 유의어/반의어/함께 쓰는 표현 3개. ' +
          'hsk 는 추정 급수(1~6, 모르면 0).',
        user: `단어: ${p.word}`,
        schema: SCHEMAS.word,
      };

    case 'dictation_generate': {
      const guide = LEVEL_GUIDE[p.level] || LEVEL_GUIDE.beginner;
      const wordList = (p.words || []).map(w => `${w.word}(${w.pinyin}: ${w.meaning})`).join(', ');
      return {
        system:
          '너는 한국인 중국어 학습자를 위한 받아쓰기(작문 연습) 출제 전문가다. ' +
          '주어진 단어 목록 중 1~2개를 반드시 포함하는 자연스러운 한국어 문장을 만든다.\n' +
          `${guide}\n` +
          '규칙:\n' +
          '1. ko 필드에는 한국어 문장을 적는다. 자연스럽고 일상적인 문장이어야 한다.\n' +
          '2. hint_words 에는 이 문장에 사용된 학습 단어(중국어)를 적는다.\n' +
          '3. answer_zh 에는 가장 자연스러운 중국어 번역을 적는다.\n' +
          '4. answer_pinyin 에는 성조 부호가 붙은 병음을 적는다.\n' +
          '5. 문장마다 다른 단어를 사용해서 다양하게 출제한다.\n' +
          '6. 한국어 문장은 학습자 수준에 맞게 조절한다.',
        user: `다음 단어들을 활용하여 ${p.count || 5}개의 받아쓰기 문제를 만들어라.\n\n단어 목록: ${wordList}`,
        schema: SCHEMAS.dictation_generate,
      };
    }

    case 'dictation_check':
      return {
        system:
          '너는 한국인 학습자의 중국어 작문을 채점하는 전문 교사다.\n' +
          '한국어 원문과 모범 답안을 참고하여 학습자의 중국어 답안을 평가한다.\n' +
          '규칙:\n' +
          '1. score 는 0~100 정수. 완벽하면 100, 의미가 통하면 60 이상, 틀리면 그 이하.\n' +
          '2. status: 모범답안과 동일하거나 완전히 자연스러우면 "perfect", ' +
          '의미가 통하고 문법이 맞으면 "good", 부분적으로 맞으면 "partial", 틀리면 "wrong".\n' +
          '3. corrected 에는 학습자의 답안을 기반으로 가장 자연스럽게 고친 중국어를 적는다.\n' +
          '4. differences 에는 학습자가 틀리거나 어색하게 쓴 부분을 하나씩 짚어준다. ' +
          'user_part 는 학습자가 쓴 부분, correct_part 는 올바른 표현, ' +
          'explanation 은 왜 틀렸고 어떻게 써야 하는지 한국어로 친절하게 설명한다.\n' +
          '5. overall_feedback 은 전체적인 평가를 한국어로 2~3문장으로 적는다.\n' +
          '6. grammar_notes 에는 관련 어법 포인트를 1~3개 적는다.\n' +
          '7. alternative 에는 같은 의미의 다른 자연스러운 표현을 하나 제시한다.\n' +
          '8. 모범답안과 다르더라도 문법적으로 맞고 의미가 통하면 높은 점수를 준다.\n' +
          '9. 학습자의 답안이 비어있으면 score 0, status "wrong" 으로 처리한다.',
        user:
          `한국어 원문: "${p.ko}"\n` +
          `모범 답안: "${p.reference}"\n` +
          `학습자 답안: "${p.userAnswer || '(미입력)'}"`,
        schema: SCHEMAS.dictation_check,
      };

    default:
      return null;
  }
}

async function callGemini({ system, user, schema, temperature = 0.6, maxTokens = 2048 }, apiKey) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
      // 사고 토큰이 출력 한도를 잡아먹어 응답이 잘리는 것을 막는다
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };

  let lastErr = '';
  for (const model of MODELS) {
    try {
      const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();

      if (!res.ok) {
        lastErr = `${model} ${res.status}`;
        // 과부하·쿼터 초과면 다음(가벼운) 모델로 재시도
        if (res.status === 503 || res.status === 429 || res.status === 500) continue;
        return { ok: false, error: `Gemini 오류 (${res.status})`, detail: text.slice(0, 300) };
      }

      const data = JSON.parse(text);
      const out = data?.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
      if (!out) {
        lastErr = `${model} 빈 응답`;
        continue;
      }
      return { ok: true, model, data: JSON.parse(out) };
    } catch (e) {
      lastErr = `${model} ${e.message}`;
    }
  }
  return { ok: false, error: 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.', detail: lastErr };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST 요청만 지원합니다.' }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(
      { ok: false, error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' },
      500
    );
  }

  let payload;
  try {
    const raw = await req.text();
    if (raw.length > 20000) {
      return json({ ok: false, error: '요청 본문이 너무 큽니다. (최대 20KB)' }, 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: '잘못된 JSON 요청 형식입니다.' }, 400);
  }

  const { action } = payload || {};
  const prompt = buildPrompt(action, payload);
  if (!prompt) return json({ ok: false, error: `알 수 없는 action: ${action}` }, 400);

  const tuning = {
    translate: { temperature: 0.3, maxTokens: 2048 },
    grammar: { temperature: 0.4, maxTokens: 4096 },
    chat: { temperature: 0.85, maxTokens: 2048 },
    pron: { temperature: 0.3, maxTokens: 2048 },
    word: { temperature: 0.3, maxTokens: 2048 },
    dictation_generate: { temperature: 0.7, maxTokens: 4096 },
    dictation_check: { temperature: 0.3, maxTokens: 2048 },
  }[action] || {};

  const result = await callGemini({ ...prompt, ...tuning }, apiKey);
  if (!result.ok) return json(result, 502);
  return json({ ok: true, action, model: result.model, result: result.data });
};
