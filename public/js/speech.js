/**
 * 음성 입출력
 *  - TTS: Web Speech Synthesis (중국어 zh-CN)
 *  - STT: Web Speech Recognition (Chrome/Edge 계열)
 * 브라우저가 지원하지 않으면 조용히 비활성화하고 안내만 띄운다.
 */

import { toast } from './ui.js';
import { getSetting } from './store.js';

/* ---------- TTS ---------- */

let voices = [];

function refreshVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = window.speechSynthesis.getVoices() || [];
}

if ('speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

export function ttsSupported() {
  return 'speechSynthesis' in window;
}

function pickVoice(lang) {
  if (!voices.length) refreshVoices();
  const want = lang.toLowerCase();
  // 정확히 일치 → 언어코드 앞부분 일치 순
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(want.split('-')[0])) ||
    null
  );
}

let currentAudio = null;

/**
 * 중국어(또는 지정 언어) 읽어주기.
 * 네이버 원어민 음원 URL 이 있으면 그것을 우선 재생한다.
 */
export function speak(text, { lang = 'zh-CN', rate, audioUrl = null } = {}) {
  if (!text) return;

  if (audioUrl) {
    try {
      if (currentAudio) currentAudio.pause();
      currentAudio = new Audio(audioUrl);
      currentAudio.play().catch(() => playTTS(text, lang, rate));
      return;
    } catch {
      /* 실패하면 TTS 로 */
    }
  }
  playTTS(text, lang, rate);
}

function playTTS(text, lang, rate) {
  if (!ttsSupported()) {
    toast('이 브라우저는 음성 재생을 지원하지 않습니다.');
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(String(text));
  utter.lang = lang;
  utter.rate = rate ?? getSetting('ttsRate') ?? 0.9;
  utter.pitch = 1;
  const voice = pickVoice(lang);
  if (voice) utter.voice = voice;

  // 크롬에서 긴 문장이 중간에 끊기는 것을 막는 통상적인 우회
  synth.resume();
  synth.speak(utter);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export function hasChineseVoice() {
  if (!voices.length) refreshVoices();
  return voices.some((v) => /^zh/i.test(v.lang));
}

/* ---------- STT ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function sttSupported() {
  return Boolean(SR);
}

/**
 * 한 번 듣고 결과를 돌려준다.
 * @returns {{stop:Function, promise:Promise<{text:string, confidence:number}>}}
 */
export function listenOnce({ lang = 'zh-CN', interim = null } = {}) {
  if (!SR) {
    return {
      stop() {},
      promise: Promise.reject(new Error('이 브라우저는 음성 인식을 지원하지 않습니다. 크롬이나 엣지에서 사용해 주세요.')),
    };
  }

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = Boolean(interim);
  rec.maxAlternatives = 3;
  rec.continuous = false;

  let settled = false;

  const promise = new Promise((resolve, reject) => {
    let best = { text: '', confidence: 0 };

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result[0];
        if (result.isFinal) {
          best = { text: alt.transcript.trim(), confidence: alt.confidence ?? 0 };
        } else if (interim) {
          interim(alt.transcript);
        }
      }
    };

    rec.onerror = (e) => {
      if (settled) return;
      settled = true;
      const messages = {
        'no-speech': '소리가 들리지 않았어요. 다시 말해 보세요.',
        'audio-capture': '마이크를 찾을 수 없습니다.',
        'not-allowed': '마이크 사용이 차단되어 있습니다. 브라우저 주소창의 권한을 허용해 주세요.',
        network: '음성 인식 서버에 연결하지 못했습니다.',
        aborted: '',
      };
      const msg = messages[e.error] ?? `음성 인식 오류: ${e.error}`;
      reject(new Error(msg));
    };

    rec.onend = () => {
      if (settled) return;
      settled = true;
      if (best.text) resolve(best);
      else reject(new Error('인식된 음성이 없습니다. 조금 더 또렷하게 말해 보세요.'));
    };
  });

  try {
    rec.start();
  } catch {
    /* 이미 시작된 경우 무시 */
  }

  return {
    stop() {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
    promise,
  };
}
