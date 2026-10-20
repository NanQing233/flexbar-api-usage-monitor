const { plugin, logger } = require('@eniac/flexdesigner');
const https = require('https');
const http = require('http');

const states = new Map();
const timers = new Map();
const BRAND_COLORS = {
  deepseek: '#4D6BFA',
  kimi: '#00B2FF',
  chatgpt: '#10A37F',
  claude: '#D97757',
  custom: '#424242'
};

const DEFAULT_CONFIG = {
  intervalSeconds: 30,
  providers: {
    deepseek: {
      enabled: true,
      name: 'DeepSeek',
      apiKey: '',
      endpoint: 'https://api.deepseek.com/user/balance',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      query: '',
      valuePath: 'balance_infos',
      valueField: 'total_balance',
      currency: 'CNY',
      sumField: '',
      unit: 'CNY'
    },
    kimi: {
      enabled: true,
      name: 'Kimi',
      apiKey: '',
      endpoint: 'https://api.moonshot.cn/v1/users/me/balance',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      query: '',
      valuePath: 'data.available_balance',
      valueField: '',
      currency: '',
      sumField: '',
      unit: 'CNY'
    },
    chatgpt: {
      enabled: true,
      name: 'ChatGPT',
      apiKey: '',
      endpoint: 'https://api.openai.com/v1/organization/costs',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      query: 'start_time={monthStart}&bucket_width=1d&limit=31',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: 'amount.value',
      unit: 'USD'
    },
    claude: {
      enabled: true,
      name: 'Claude',
      apiKey: '',
      endpoint: 'https://api.anthropic.com/v1/organizations/cost_report',
      authType: 'x-api-key',
      headerName: '',
      headerPrefix: '',
      query: 'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: 'amount',
      unit: 'USD'
    },
    custom: {
      enabled: true,
      name: 'Custom',
      apiKey: '',
      endpoint: '',
      authType: 'bearer',
      headerName: 'Authorization',
      headerPrefix: 'Bearer ',
      query: '',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: '',
      unit: ''
    }
  }
};

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    const s = source[key];
    const t = out[key];
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      out[key] = deepMerge(t || {}, s);
    } else {
      out[key] = s;
    }
  }
  return out;
}

function normalizeConfig(cfg) {
  const base = deepMerge(DEFAULT_CONFIG, cfg || {});
  const merged = {};
  for (const id of Object.keys(DEFAULT_CONFIG.providers)) {
    merged[id] = deepMerge(DEFAULT_CONFIG.providers[id], (base.providers || {})[id] || {});
  }
  base.providers = merged;
  return base;
}

async function getConfig() {
  try {
    const raw = await plugin.getConfig();
    const normalized = normalizeConfig(raw || {});
    if (!raw || !raw.providers || Object.keys(raw.providers || {}).length === 0) {
      try { await plugin.setConfig(normalized); } catch (e) { logger.warn('[API Usage] seed config failed: ' + e.message); }
    }
    return normalized;
  } catch (e) {
    logger.warn('[API Usage] getConfig failed: ' + e.message);
    return DEFAULT_CONFIG;
  }
}

function getValueByPath(obj, path) {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function sumByPath(obj, path) {
  if (!path) return null;
  const parts = path.split('.').filter(Boolean);
  let total = 0;
  let found = false;
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    let cur = node;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') { cur = undefined; break; }
      cur = cur[p];
    }
    if (typeof cur === 'number' || (typeof cur === 'string' && cur.trim() !== '' && !isNaN(Number(cur)))) {
      total += Number(cur);
      found = true;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v);
    }
  }
  walk(obj);
  return found ? total : null;
}

function extractValue(json, provider) {
  if (provider.sumField) {
    return sumByPath(json, provider.sumField);
  }
  let raw = getValueByPath(json, provider.valuePath);
  if (Array.isArray(raw) && provider.currency) {
    const target = String(provider.currency).toUpperCase();
    const match = raw.find(item => item && String(item.currency || '').toUpperCase() === target);
    raw = match || null;
  }
  if (raw && typeof raw === 'object' && provider.valueField) {
    raw = raw[provider.valueField];
  }
  return raw;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T00:00:00Z';
}

function buildUrl(provider) {
  let url = provider.endpoint || '';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const repl = {
    '{now}': String(Math.floor(now.getTime() / 1000)),
    '{nowISO}': now.toISOString(),
    '{monthStart}': String(Math.floor(monthStart.getTime() / 1000)),
    '{monthStartISO}': isoDate(monthStart)
  };
  let query = provider.query || '';
  for (const k of Object.keys(repl)) {
    query = query.split(k).join(repl[k]);
  }
  if (query) {
    url += (url.indexOf('?') >= 0 ? '&' : '?') + query;
  }
  return url;
}

function buildHeaders(provider) {
  const headers = { 'Accept': 'application/json' };
  const key = provider.apiKey || '';
  if (key) {
    if (provider.authType === 'x-api-key') {
      headers['x-api-key'] = key;
    } else if (provider.authType === 'custom') {
      headers[provider.headerName || 'Authorization'] = (provider.headerPrefix || '') + key;
    } else {
      headers['Authorization'] = 'Bearer ' + key;
    }
  }
  if (provider.id === 'claude') {
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const client = url.indexOf('https:') === 0 ? https : http;
    const req = client.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 160)));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function queryProvider(provider) {
  if (!provider.enabled) return { ok: false, value: null, error: 'disabled' };
  if (!provider.endpoint) return { ok: false, value: null, error: 'no endpoint' };
  if (!provider.apiKey) return { ok: false, value: null, error: 'no key' };
  try {
    const json = await fetchJson(buildUrl(provider), buildHeaders(provider));
    const raw = extractValue(json, provider);
    const value = raw == null ? null : Number(raw);
    if (value == null || Number.isNaN(value)) return { ok: false, value: null, error: 'value not found' };
    return { ok: true, value, raw };
  } catch (e) {
    logger.warn('[API Usage] ' + provider.name + ' fetch failed: ' + e.message);
    return { ok: false, value: null, error: e.message };
  }
}

function formatValue(value, unit) {
  if (value == null || Number.isNaN(value)) return '--';
  const s = Number(value).toFixed(2).replace(/\.00$/, '');
  return unit ? s + unit : s;
}

function statusText(provider, result) {
  if (result && result.ok) return formatValue(result.value, provider.unit);
  if (!result) return '...';
  if (result.error === 'no key') return '未配置Key';
  if (result.error === 'disabled') return '已禁用';
  if (result.error === 'no endpoint') return '无接口';
  if (result.error === 'value not found') return '无数据';
  return 'Err';
}

function stateKey(serialNumber, key, index) {
  return serialNumber + '|' + (key.uid || (key.cid + '#' + index));
}

function drawKey(state) {
  const key = state.key;
  const provider = state.provider || {};
  if (!key.data) key.data = {};
  const data = key.data;
  const label = data.label || provider.name || state.providerId;
  const brandColor = BRAND_COLORS[state.providerId] || '#424242';

  if (!data.colorInitialized || data.colorInitialized !== state.providerId) {
    key.style = key.style || {};
    key.style.bgColor = brandColor;
    data.colorInitialized = state.providerId;
  }

  key.title = label + ' ' + statusText(provider, state.lastResult);
  key.style = key.style || {};
  key.style.showTitle = true;
  key.style.showIcon = false;
  key.style.showImage = false;
  key.style.showEmoji = false;

  try {
    plugin.draw(state.serialNumber, key, 'draw');
    logger.info('[API Usage] draw ' + state.providerId + ' title="' + key.title + '"');
  } catch (e) {
    logger.error('[API Usage] plugin.draw failed: ' + e.message);
  }
}

async function refreshKey(sk) {
  const state = states.get(sk);
  if (!state) return;
  const cfg = await getConfig();
  const data = state.key.data || {};
  const pid = data.provider || state.providerId || 'deepseek';
  state.providerId = pid;
  const provider = { ...(cfg.providers[pid] || cfg.providers.custom || DEFAULT_CONFIG.providers.custom), id: pid };
  state.provider = provider;
  state.lastResult = await queryProvider(provider);
  drawKey(state);
}

function intervalMs(cfg) {
  return Math.max(5000, ((cfg && cfg.intervalSeconds) || 30) * 1000);
}

async function startKey(serialNumber, key, index) {
  const sk = stateKey(serialNumber, key, index);
  stopKey(sk);
  const data = key.data || {};
  const state = {
    serialNumber,
    key,
    providerId: data.provider || 'deepseek',
    provider: null,
    lastResult: null
  };
  states.set(sk, state);
  const cfg = await getConfig();
  await refreshKey(sk);
  const t = setInterval(() => refreshKey(sk), intervalMs(cfg));
  timers.set(sk, t);
  logger.info('[API Usage] start key ' + sk + ' provider=' + state.providerId);
}

function stopKey(sk) {
  const t = timers.get(sk);
  if (t) { clearInterval(t); timers.delete(sk); }
  states.delete(sk);
}

function stopSerial(serialNumber) {
  for (const sk of Array.from(states.keys())) {
    if (sk.indexOf(serialNumber + '|') === 0) stopKey(sk);
  }
}

plugin.on('plugin.alive', async (payload) => {
  const { serialNumber, keys } = payload;
  logger.info('[API Usage] alive serial=' + serialNumber + ' keys=' + (keys || []).map(k => k.cid).join(','));
  const list = keys || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].cid === 'com.nanqing.apiusage.monitor') {
      await startKey(serialNumber, list[i], i);
    }
  }
});

plugin.on('plugin.dead', (payload) => {
  stopSerial(payload.serialNumber);
});

plugin.on('plugin.config.updated', async () => {
  logger.info('[API Usage] config updated');
  const cfg = await getConfig();
  for (const sk of Array.from(states.keys())) {
    const state = states.get(sk);
    if (!state) continue;
    const t = timers.get(sk);
    if (t) clearInterval(t);
    await refreshKey(sk);
    timers.set(sk, setInterval(() => refreshKey(sk), intervalMs(cfg)));
  }
});

plugin.on('plugin.data', async (payload) => {
  const { serialNumber, data } = payload;
  const key = data && data.key;
  if (!key || key.cid !== 'com.nanqing.apiusage.monitor') return;
  for (const sk of Array.from(states.keys())) {
    if (sk.indexOf(serialNumber + '|') === 0) await refreshKey(sk);
  }
});

plugin.start();
logger.info('[API Usage] plugin started v0.1.1');
