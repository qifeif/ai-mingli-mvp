(function () {
  const SESSION_KEY = 'xy_auth_session';
  const ACCOUNT_KEY = 'xy_account';
  const PROFILE_KEY = 'xy_profile';

  const json = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    },
  };

  function auth() {
    return json.get(SESSION_KEY);
  }

  function token() {
    return auth()?.access_token || '';
  }

  function userFromAuth(authData) {
    return authData?.user || authData?.auth?.user || null;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const tk = token();
    if (tk) headers.Authorization = `Bearer ${tk}`;
    const res = await fetch(path, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.error || data?.message || res.statusText || '请求失败');
    return data;
  }

  function storeAuthPayload(payload) {
    const authData = payload?.auth || payload;
    if (!authData?.access_token) return false;
    json.set(SESSION_KEY, authData);
    const user = userFromAuth(authData);
    json.set(ACCOUNT_KEY, {
      email: user?.email || '',
      name: user?.user_metadata?.name || user?.email?.split('@')?.[0] || '用户',
      id: user?.id || '',
      ts: Date.now(),
    });
    window.dispatchEvent(new CustomEvent('xy-auth-changed', { detail: { user, session: authData } }));
    return true;
  }

  async function login(email, password) {
    const payload = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    storeAuthPayload(payload);
    await migrateLocalData();
    return payload;
  }

  async function signup(email, password, name) {
    const payload = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    // Supabase 若关闭邮箱确认会直接返回 access_token;若开启邮箱确认,这里只保存账号提示,不伪造登录态。
    if (payload?.auth?.access_token) {
      storeAuthPayload(payload);
      await migrateLocalData();
    }
    return payload;
  }

  async function logout() {
    try { if (token()) await request('/api/auth/logout', { method: 'POST' }); } catch {}
    json.remove(SESSION_KEY);
    json.remove(ACCOUNT_KEY);
    window.dispatchEvent(new CustomEvent('xy-auth-changed', { detail: { user: null, session: null } }));
  }

  async function loadData(key, fallback = null) {
    if (!token()) return fallback;
    const payload = await request(`/api/user-data?key=${encodeURIComponent(key)}`);
    const row = Array.isArray(payload?.data) ? payload.data.find((r) => r.key === key) : null;
    return row ? row.value : fallback;
  }

  async function saveData(key, value) {
    if (!token()) return { ok: false, reason: 'not_signed_in' };
    return request('/api/user-data', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }

  function getProfile() {
    return json.get(PROFILE_KEY);
  }

  async function saveProfile(profile) {
    if (!profile || !profile.datetime || !profile.gender) return { ok: false, reason: 'missing_profile' };
    const clean = {
      datetime: String(profile.datetime).replace('T', ' '),
      gender: profile.gender,
      name: profile.name || '',
      location: profile.location || profile.place || profile.city || '',
    };
    json.set(PROFILE_KEY, clean);
    window.dispatchEvent(new CustomEvent('xy-profile-changed', { detail: { profile: clean } }));
    try { await saveData(PROFILE_KEY, clean); } catch (err) { console.warn('[心易] 生辰档案云端同步失败:', err.message); }
    return { ok: true, profile: clean };
  }

  async function migrateLocalData() {
    if (!token()) return;
    const keys = ['xinyi_mingli', 'xy_sessions', 'xy_profile'];
    await Promise.all(keys.map(async (key) => {
      const value = json.get(key);
      if (value == null) return;
      try { await saveData(key, value); }
      catch (err) { console.warn(`[心易] ${key} 同步失败:`, err.message); }
    }));
  }

  window.XinyiAuth = {
    auth,
    token,
    user: () => userFromAuth(auth()),
    isSignedIn: () => Boolean(token()),
    login,
    signup,
    logout,
    loadData,
    saveData,
    getProfile,
    saveProfile,
    migrateLocalData,
  };
})();
