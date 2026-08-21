/**
 * Google 계정 로그인 및 학습 데이터 동기화 모듈
 * Google Identity Services (GSI) 연동
 */

import * as store from './store.js';
import { toast, esc } from './ui.js';

// 기본 클라이언트 ID 또는 사용자 설정 ID
const DEFAULT_CLIENT_ID = '382902347101-7v5a73e4b7v7n48h7f0g3o0s2k1h6j8m.apps.googleusercontent.com';

export function initAuth() {
  const loginBtn = document.getElementById('google-login-btn');
  const profileBtn = document.getElementById('user-profile-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const dropdown = document.getElementById('user-dropdown');
  const dropdownName = document.getElementById('user-dropdown-name');
  const dropdownEmail = document.getElementById('user-dropdown-email');
  const logoutBtn = document.getElementById('google-logout-btn');
  const exportBtn = document.getElementById('btn-export-data');
  const importBtn = document.getElementById('btn-import-data');

  // 현재 로그인 상태 확인 및 UI 갱신
  function renderAuthUI() {
    const user = store.getUser();
    if (user && user.email) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (profileBtn) profileBtn.style.display = 'inline-flex';
      if (userAvatar) {
        userAvatar.src = user.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || user.email)}`;
        userAvatar.alt = user.name || user.email;
      }
      if (userName) userName.textContent = user.name ? user.name.split(' ')[0] : user.email.split('@')[0];
      if (dropdownName) dropdownName.textContent = user.name || '학습자';
      if (dropdownEmail) dropdownEmail.textContent = user.email;
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (profileBtn) profileBtn.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
    }
  }

  // 초기 렌더링
  renderAuthUI();
  store.subscribe(renderAuthUI);

  // 프로필 클릭 시 드롭다운 토글
  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) {
        const isHidden = dropdown.style.display === 'none';
        dropdown.style.display = isHidden ? 'block' : 'none';
      }
    });
  }

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
  });

  if (dropdown) {
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  // 로그인 버튼 클릭 시 구글 로그인 모달/GSI 실행
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      openGoogleLoginModal();
    });
  }

  // 로그아웃 버튼
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (dropdown) dropdown.style.display = 'none';
      store.clearUser();
      renderAuthUI();
      toast('로그아웃되었습니다. 게스트 모드로 전환합니다.');
      setTimeout(() => location.reload(), 300);
    });
  }

  // 데이터 백업 내보내기 (JSON)
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `hanyu_study_backup_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('학습 데이터 백업 파일이 다운로드되었습니다.');
    });
  }

  // 클라우드 실시간 동기화 버튼
  const syncBtn = document.getElementById('btn-sync-cloud');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = '🔄 동기화 중…';
      try {
        const res = await store.syncFromCloud();
        if (res && res.success) {
          toast(`☁️ 클라우드 동기화 완료! (${res.count || 0}개 단어 연동됨)`);
          setTimeout(() => location.reload(), 400);
        } else {
          await store.syncToCloud();
          toast('☁️ 현재 학습 데이터가 클라우드에 백업되었습니다!');
        }
      } catch (err) {
        toast('클라우드 동기화 중 오류가 발생했습니다.');
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 클라우드 지금 동기화';
      }
    });
  }

  // 데이터 복원 가져오기 (JSON)
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const success = store.importData(event.target.result);
          if (success) {
            toast('학습 데이터가 성공적으로 복원되었습니다!');
            setTimeout(() => location.reload(), 600);
          } else {
            toast('올바르지 않은 백업 파일 형식입니다.');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // Google GSI 로드 시도
  loadGoogleGSI();
}

/** Google Identity Services SDK 로드 */
function loadGoogleGSI() {
  if (window.google?.accounts?.id) return;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    tryInitGSI();
  };
  document.head.appendChild(script);
}

function tryInitGSI() {
  if (!window.google?.accounts?.id) return;
  const clientId = store.getSetting('googleClientId') || DEFAULT_CLIENT_ID;
  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
    });
  } catch (err) {
    console.warn('GSI init warning:', err);
  }
}

/** Google JWT 응답 디코딩 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

async function handleCredentialResponse(response) {
  if (!response || !response.credential) return;
  const payload = parseJwt(response.credential);
  if (payload) {
    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      loggedInAt: Date.now(),
    };
    store.setUser(user);
    await store.syncFromCloud(user);
    closeLoginModal();
    toast(`☁️ 환영합니다, ${user.name || user.email}님! (클라우드 연동 완료)`);
    setTimeout(() => location.reload(), 350);
  }
}

let modalEl = null;

function closeLoginModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
}

/** 구글 로그인 모달 팝업 */
export function openGoogleLoginModal() {
  closeLoginModal();

  const savedAccounts = store.getSavedAccounts();
  const accountsSection = savedAccounts.length
    ? `<div style="margin-bottom:18px;text-align:left">
        <div style="font-size:12.5px;font-weight:700;color:var(--text-2);margin-bottom:8px">
          💾 이 기기에 저장된 계정 (${savedAccounts.length}개)
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto">
          ${savedAccounts
            .map(
              (acc) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface-2);border-radius:12px;border:1px solid var(--border)">
              <button type="button" class="btn-switch-account" data-acc-email="${esc(acc.email)}" data-acc-name="${esc(acc.name)}" style="display:flex;align-items:center;gap:10px;text-align:left;flex:1;min-width:0;background:none;border:none;padding:0">
                <img src="https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(acc.name)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" alt="" />
                <div style="min-width:0">
                  <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(acc.email)} ${acc.isCurrent ? '<span style="font-size:10.5px;color:var(--ok);font-weight:800;margin-left:4px">[현재 사용 중]</span>' : ''}</div>
                  <div style="font-size:11.5px;color:var(--text-3)">저장한 단어 ${acc.wordCount}개</div>
                </div>
              </button>
              <button type="button" class="btn-del-account" data-acc-id="${esc(acc.id)}" title="이 기기에서 계정 데이터 삭제" style="color:var(--text-3);padding:4px 8px;font-size:13px;background:none;border:none">✕</button>
            </div>`
            )
            .join('')}
        </div>
      </div>`
    : '';

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" id="modal-close-btn" aria-label="닫기">✕</button>
      <div style="text-align:center;margin-bottom:18px">
        <div style="display:inline-block;padding:12px;background:var(--primary-soft);border-radius:18px;margin-bottom:12px">
          <svg style="width:34px;height:34px" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
        </div>
        <h2 style="margin:0 0 6px;font-size:19px;font-weight:800">Google 계정으로 로그인</h2>
        <p style="margin:0;font-size:13px;color:var(--text-2);word-break:keep-all">
          학습한 단어, 퀴즈 기록, 받아쓰기, 통계가 계정에 안전하게 보관되어 나갔다 들어와도 이어서 학습할 수 있습니다.
        </p>
      </div>

      ${accountsSection}

      <div id="g-signin-btn-container" style="display:flex;justify-content:center;margin:14px 0"></div>

      <div style="position:relative;text-align:center;margin:16px 0 14px">
        <hr style="border:none;border-top:1px solid var(--border)" />
        <span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--surface);padding:0 10px;font-size:12px;color:var(--text-3)">또는 새 계정 추가</span>
      </div>

      <form id="quick-email-login-form" style="display:flex;flex-direction:column;gap:10px">
        <input class="input" id="login-email-input" type="email" placeholder="Google 이메일 입력 (예: user@gmail.com)" required />
        <button type="submit" class="btn btn--primary" style="padding:10px 16px;font-size:14px">
          이 계정으로 학습 시작하기
        </button>
      </form>

      <div style="margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--surface-2);font-size:11.5px;color:var(--text-3);line-height:1.5">
        🔒 각 계정의 학습 데이터는 서로 격리되어 안전하게 보존됩니다.
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.querySelector('#modal-close-btn').addEventListener('click', closeLoginModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeLoginModal();
  });

  // 공식 Google 버튼 렌더링 시도
  if (window.google?.accounts?.id) {
    try {
      window.google.accounts.id.renderButton(
        modalEl.querySelector('#g-signin-btn-container'),
        { theme: 'outline', size: 'large', width: 280, shape: 'pill', text: 'continue_with' }
      );
    } catch (e) {
      console.warn(e);
    }
  }

  // 저장된 계정 클릭 시 즉시 전환
  modalEl.querySelectorAll('.btn-switch-account').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.accEmail;
      const name = btn.dataset.accName;
      const user = {
        id: 'usr_' + Math.abs(hashCode(email)),
        email: email,
        name: name,
        picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        loggedInAt: Date.now(),
      };
      store.setUser(user);
      await store.syncFromCloud(user);
      closeLoginModal();
      toast(`☁️ ${email} 계정으로 전환되었습니다.`);
      setTimeout(() => location.reload(), 300);
    });
  });

  // 계정 삭제 버튼
  modalEl.querySelectorAll('.btn-del-account').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const accId = btn.dataset.accId;
      if (confirm(`'${accId}' 계정의 저장된 학습 데이터를 이 기기에서 삭제하시겠습니까?`)) {
        store.deleteAccount(accId);
        openGoogleLoginModal(); // 모달 갱신
        toast('계정 데이터가 삭제되었습니다.');
      }
    });
  });

  // 빠른 이메일 계정 로그인 처리
  modalEl.querySelector('#quick-email-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = modalEl.querySelector('#login-email-input').value.trim();
    if (!email) return;
    const submitBtn = modalEl.querySelector('#quick-email-login-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '클라우드 연동 중…';
    }
    const name = email.split('@')[0];
    const user = {
      id: 'usr_' + Math.abs(hashCode(email)),
      email: email,
      name: name,
      picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      loggedInAt: Date.now(),
    };
    store.setUser(user);
    const syncRes = await store.syncFromCloud(user);
    closeLoginModal();
    if (syncRes && syncRes.count) {
      toast(`☁️ ${email} 계정 연동 완료! (${syncRes.count}개 단어 동기화)`);
    } else {
      toast(`☁️ ${email} 계정으로 로그인되었습니다.`);
    }
    setTimeout(() => location.reload(), 350);
  });
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
