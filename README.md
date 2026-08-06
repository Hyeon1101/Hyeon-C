# 汉语 학습소 — 중국어 학습 도우미

HSK 급수별 단어 학습부터 AI 회화·발음 교정까지 한곳에서 하는 한국인용 중국어 학습 웹앱.

**배포 주소: https://hanyu-study.netlify.app**

---

## 기능

| 구분 | 내용 |
|---|---|
| 통합 검색 | 한 칸에서 단어·번역·문법을 자동 판별. 수동 모드(단어/번역/문법) 지정도 가능 |
| 중국어 단어 | HSK 1~6급 4,991개. 병음·한국어 뜻·예문·원어민 음원. 급수별 진도 표시 |
| 학습 모드 | 플래시카드(뒤집기·모름/외움), 병음·뜻 가리기 토글 |
| 퀴즈 | 뜻 맞추기 / 한자 맞추기 / 병음 맞추기 / 듣고 맞추기. 틀린 단어는 복습함에 자동 등록 |
| 문법 | 문형 공식 · 핵심 포인트 · 예문 · 한국인이 자주 틀리는 부분 · 유사 문법 비교 |
| 번역 | 한↔중 번역 + 문장 병음 + 핵심 단어 + 대안 표현 + 어법 노트 |
| AI 회화 | 12개 상황 × 3단계 난이도. AI가 매 턴 질문으로 대화를 이어감 |
| 문장 피드백 | 학습자 발화를 자연스러움/문법 기준으로 즉시 교정 (완벽·어색·오류) |
| 발음 교정 | 목표 문장을 따라 말하면 글자별 정오 표시 + 성모/운모/성조 진단 + 교정 팁 |
| STT / TTS | 브라우저 음성 인식(zh-CN)으로 말하고, 음성 합성으로 듣기. 속도 조절 |
| 학습 기록 | 저장 단어, 복습함(즐겨찾기), 연속 학습일, 학습 달력, 30일 학습량 그래프, 급수별 진도 |

## 구조

```
public/
  index.html            앱 셸 (상단 검색 · 탭)
  css/styles.css        디자인 시스템 (라이트/다크)
  js/
    app.js              해시 라우터 · 검색 · 테마
    api.js              /api/dict · /api/ai · HSK 데이터 로더
    store.js            localStorage 학습 기록 (단어·일별기록·설정)
    pinyin.js           병음 유틸 (루비 표기 · 성조 색)
    speech.js           TTS / STT
    components.js       단어 카드 · 공통 액션
    views/              home · words · quiz · chat · grammar · stats · search
  data/
    hsk1~6.json         HSK 단어 목록 (한자·병음·영어뜻·빈도)
    ko/hsk1~6.json      네이버 사전에서 미리 받아둔 한국어 뜻·예문
  vendor/pinyin-pro.js  한자 → 병음 변환 (문맥 기반 다음자 처리)

netlify/functions/
  dict.js               네이버 중국어사전 프록시 (CORS 우회 + CDN 캐싱)
  ai.js                 Gemini 호출 (번역·문법·회화·발음교정)

tools/
  build-data.mjs        HSK 단어 목록 빌드
  enrich-naver.mjs      네이버 사전 정보 수집 (순차 · 이어받기 지원)
```

## 데이터

- **HSK 단어 목록** — `drkameleon/complete-hsk-vocabulary` (HSK 2.0 1~6급, 급수별 전용 단어)
- **한국어 뜻 · 예문 · 병음 · 원어민 음원** — 네이버 중국어사전 (`zh.dict.naver.com/api3/zhko/search`)

네이버는 동시 요청을 강하게 제한한다(20개 동시 요청 시 5분 소요·30% 실패). 그래서 급수별 단어 정보는
`tools/enrich-naver.mjs`로 **빌드 시점에 순차 수집해 정적 파일로 굽고**, 실시간 검색만 프록시로 처리한다.

```bash
npm run build:data    # HSK 단어 목록 내려받기
npm run enrich        # 네이버 사전 정보 수집 (약 55분, 중단 후 이어받기 가능)
npm run enrich 3 4    # 특정 급수만 다시 수집
```

## 실행

```bash
netlify dev --port 8791
```

`GEMINI_API_KEY`는 Netlify 환경변수에만 두고 브라우저로 내려보내지 않는다.
로컬에서 AI 기능을 쓰려면 사이트에 연결(`netlify link`)되어 있어야 한다 —
`netlify env:set`으로 넣을 때 **컨텍스트를 지정하면 `dev` 컨텍스트에는 들어가지 않으니 주의**.

## 배포

```bash
netlify deploy --prod --site a715958f-c2fe-45f5-9c42-bcd2e2b00eee
```

## 알려진 제약

- 음성 인식(STT)은 Chrome·Edge 계열에서만 동작한다. Safari·Firefox에서는 텍스트 입력으로 대체된다.
- 학습 기록은 브라우저 localStorage에 저장된다. 기기를 옮기려면 통계 화면에서 백업 파일을 내보내고 불러온다.
- 문법·번역·회화 설명은 AI 생성 결과다. 시험 대비 등 중요한 경우 교재로 한 번 더 확인하는 것이 좋다.
