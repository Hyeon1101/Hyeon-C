import { getStore } from '@netlify/blobs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST 요청만 지원합니다.' }, 405);
  }

  let payload;
  try {
    const raw = await req.text();
    if (raw.length > 500000) {
      return json({ ok: false, error: '데이터 크기가 너무 큽니다. (최대 500KB)' }, 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: '잘못된 JSON 형식입니다.' }, 400);
  }

  const { action, user, data } = payload || {};
  if (!user || typeof user !== 'string') {
    return json({ ok: false, error: '유효한 사용자 식별자가 필요합니다.' }, 400);
  }

  // 안전한 16진수 고유 키 생성 (Netlify Blobs 키 제약 준수)
  const safeUserKey = 'usr_' + Buffer.from(user.toLowerCase().trim()).toString('hex');

  try {
    let store;
    try {
      store = getStore('hanyu-user-data');
    } catch (e) {
      console.warn('Blobs getStore fallback:', e.message);
      store = getStore({ name: 'hanyu-user-data' });
    }

    if (action === 'save') {
      if (!data || typeof data !== 'object') {
        return json({ ok: false, error: '저장할 데이터가 없습니다.' }, 400);
      }
      const toSave = {
        ...data,
        syncedAt: Date.now(),
        syncedUser: safeUserKey,
      };
      await store.set(safeUserKey, JSON.stringify(toSave));
      return json({ ok: true, syncedAt: toSave.syncedAt });
    }

    if (action === 'load') {
      let stored = null;
      try {
        const raw = await store.get(safeUserKey);
        if (raw) {
          stored = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
      } catch (e) {
        console.warn('Blobs get error:', e.message);
      }

      if (!stored) {
        return json({ ok: true, found: false, data: null });
      }
      return json({ ok: true, found: true, data: stored, syncedAt: stored.syncedAt || 0 });
    }

    if (action === 'delete') {
      try {
        await store.delete(safeUserKey);
      } catch (e) {}
      return json({ ok: true, deleted: true });
    }

    return json({ ok: false, error: `알 수 없는 action: ${action}` }, 400);
  } catch (err) {
    console.error('Blobs sync error:', err);
    return json({ ok: false, error: '클라우드 스토리지 동기화 중 오류가 발생했습니다.', detail: err.message }, 500);
  }
};
