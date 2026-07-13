const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function supabaseConfigStatus() {
  return {
    enabled: supabaseEnabled,
    hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
  };
}

function ensureConfigured() {
  if (!supabaseEnabled) {
    const err = new Error('Supabase 未配置:请设置 SUPABASE_URL 与 SUPABASE_ANON_KEY');
    err.status = 503;
    throw err;
  }
}

async function readJSONSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function supabaseFetch(path, { method = 'GET', token, service = false, body, headers = {} } = {}) {
  ensureConfigured();
  const key = service && SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await readJSONSafe(res);
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.message || data?.hint || data?.raw || `Supabase 请求失败(${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function signUp({ email, password, name }) {
  return supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: {
      email,
      password,
      data: { name: name || email?.split('@')?.[0] || '' },
    },
  });
}

export async function signInWithPassword({ email, password }) {
  return supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
}

export async function signOut(accessToken) {
  return supabaseFetch('/auth/v1/logout', {
    method: 'POST',
    token: accessToken,
  });
}

export async function getUser(accessToken) {
  if (!accessToken) {
    const err = new Error('请先登录');
    err.status = 401;
    throw err;
  }
  return supabaseFetch('/auth/v1/user', { token: accessToken });
}

export async function getUserData(accessToken, key) {
  const user = await getUser(accessToken);
  const userId = user?.id;
  const filters = [`user_id=eq.${encodeURIComponent(userId)}`];
  if (key) filters.push(`key=eq.${encodeURIComponent(key)}`);
  const rows = await supabaseFetch(`/rest/v1/user_data?${filters.join('&')}&select=key,value,updated_at`, {
    token: accessToken,
    service: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    headers: { Accept: 'application/json' },
  });
  return { user, data: rows || [] };
}

export async function upsertUserData(accessToken, key, value) {
  if (!key || typeof key !== 'string') {
    const err = new Error('缺少数据 key');
    err.status = 400;
    throw err;
  }
  const user = await getUser(accessToken);
  const userId = user?.id;
  const row = {
    user_id: userId,
    key,
    value,
    updated_at: new Date().toISOString(),
  };
  const data = await supabaseFetch('/rest/v1/user_data?on_conflict=user_id,key', {
    method: 'POST',
    token: accessToken,
    service: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    body: row,
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
      Accept: 'application/json',
    },
  });
  return { user, data: Array.isArray(data) ? data[0] : data };
}

export async function deleteUserData(accessToken, key) {
  if (!key || typeof key !== 'string') {
    const err = new Error('缺少数据 key');
    err.status = 400;
    throw err;
  }
  const user = await getUser(accessToken);
  const userId = user?.id;
  await supabaseFetch(`/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    token: accessToken,
    service: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    headers: { Prefer: 'return=minimal' },
  });
  return { user, ok: true };
}
