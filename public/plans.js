(function () {
  const KEY = 'xinyi_plan';
  const order = ['free', 'light', 'standard', 'pro'];
  const plans = {
    free: {
      key: 'free',
      price: 0,
      caps: { chatDaily: 5, chartLibrary: 3, hehunMonthly: 1, floorplanMonthly: 1, proStyle: false },
    },
    light: {
      key: 'light',
      price: 9.9,
      caps: { chatDaily: 30, chartLibrary: 10, hehunMonthly: 3, floorplanMonthly: Infinity, proStyle: false },
    },
    standard: {
      key: 'standard',
      price: 29.9,
      caps: { chatDaily: 100, chartLibrary: 30, hehunMonthly: Infinity, floorplanMonthly: Infinity, proStyle: false },
    },
    pro: {
      key: 'pro',
      price: 99.9,
      caps: { chatDaily: 500, chartLibrary: 100, hehunMonthly: Infinity, floorplanMonthly: Infinity, proStyle: true },
    },
  };

  function normalize(key) {
    return plans[key] ? key : 'free';
  }

  function currentKey() {
    return normalize(localStorage.getItem(KEY) || 'free');
  }

  function current() {
    return plans[currentKey()];
  }

  function set(key) {
    const next = normalize(key);
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent('xinyi:planchange', { detail: { plan: plans[next] } }));
    return plans[next];
  }

  function cap(name) {
    return current().caps[name];
  }

  function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function usageKey(name) {
    return `xinyi_usage_${name}_${currentKey()}`;
  }

  function usage(name) {
    let u;
    try { u = JSON.parse(localStorage.getItem(usageKey(name)) || 'null'); } catch { u = null; }
    if (!u || u.month !== monthKey()) u = { month: monthKey(), count: 0 };
    return u;
  }

  function used(name) {
    return usage(name).count || 0;
  }

  function limit(name) {
    return cap(name);
  }

  function unlimited(name) {
    return limit(name) === Infinity;
  }

  function canUse(name) {
    const lim = limit(name);
    return lim === Infinity || used(name) < Number(lim || 0);
  }

  function remaining(name) {
    const lim = limit(name);
    return lim === Infinity ? Infinity : Math.max(0, Number(lim || 0) - used(name));
  }

  function consume(name) {
    if (unlimited(name)) return { ok: true, remaining: Infinity };
    if (!canUse(name)) return { ok: false, remaining: 0 };
    const u = usage(name);
    u.count += 1;
    localStorage.setItem(usageKey(name), JSON.stringify(u));
    return { ok: true, remaining: remaining(name) };
  }

  window.XinyiPlans = { KEY, order, plans, normalize, currentKey, current, set, cap, limit, unlimited, used, remaining, canUse, consume };
})();
