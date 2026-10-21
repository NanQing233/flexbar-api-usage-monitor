const { plugin, logger } = require('@eniac/flexdesigner');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const VERSION = '0.1.0';
const REQUEST_TIMEOUT_MS = 12000;
const KEY_CID = 'com.nanqing.apiusage.monitor';

const states = new Map();
const timers = new Map();
// providerId -> endpoint template that last returned data; tried first next time.
const preferredEndpoints = new Map();
let lastTestNonce = 0;

const BRAND_COLORS = {
  deepseek: '#4D6BFA',
  kimi: '#00B2FF',
  chatgpt: '#10A37F',
  claude: '#D97757',
  custom: '#424242'
};

const DEFAULT_CONFIG = {
  intervalSeconds: 30,
  asciiOnlyTitles: true,
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
      scale: 1,
      unit: 'CNY'
    },
    kimi: {
      enabled: true,
      name: 'Kimi',
      apiKey: '',
      endpoint: 'https://api.moonshot.ai/v1/users/me/balance',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      query: '',
      valuePath: 'data.available_balance',
      valueField: '',
      currency: '',
      sumField: '',
      scale: 1,
      unit: 'USD'
    },
    chatgpt: {
      enabled: true,
      name: 'ChatGPT',
      apiKey: '',
      endpoint: 'https://api.openai.com/v1/organization/costs',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      // start_time is Unix seconds; a month never needs more than 31 daily buckets,
      // but limit is raised to 180 so a single page always covers the whole month.
      query: 'start_time={monthStart}&end_time={now}&bucket_width=1d&limit=180',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: 'amount.value',
      scale: 1,
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
      query: 'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d&limit=31',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: 'amount',
      // The cost report returns `amount` in the currency's lowest unit (cents),
      // as a decimal string, so 123.45 means 1.2345 USD.
      scale: 0.01,
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
      scale: 1,
      unit: ''
    }
  }
};

// Known-good hosts/paths per provider. Only used when the configured endpoint is
// empty or one of these known values, so a user-supplied relay URL is never
// silently replaced.
const ALTERNATE_ENDPOINTS = {
  kimi: [
    'https://api.moonshot.ai/v1/users/me/balance',
    'https://api.moonshot.cn/v1/users/me/balance'
  ],
  claude: [
    'https://api.anthropic.com/v1/organizations/cost_report',
    'https://api.anthropic.com/v1/organizations/analytics/cost_report'
  ]
};

// Built-in defaults shipped by 1.0.0. A stored value that still equals one of
// these was never customized by the user, so upgrading it is safe and is the
// only way an existing install ever picks up the fixed providers.
const LEGACY_VALUES = {
  'kimi.endpoint': [
    'https://api.moonshot.cn/v1/users/me/balance'
  ],
  'kimi.unit': ['CNY'],
  'chatgpt.query': [
    'start_time={monthStart}&bucket_width=1d&limit=31',
    'start_time={monthStart}&end_time={now}&bucket_width=1d&limit=31'
  ],
  'claude.query': [
    'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d'
  ]
};

function migrateLegacyValue(providerId, field, value) {
  const legacy = LEGACY_VALUES[providerId + '.' + field];
  if (!legacy || typeof value !== 'string') return value;
  return legacy.indexOf(value) >= 0 ? DEFAULT_CONFIG.providers[providerId][field] : value;
}

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
    const provider = deepMerge(DEFAULT_CONFIG.providers[id], (base.providers || {})[id] || {});
    for (const field of ['endpoint', 'unit', 'query']) {
      provider[field] = migrateLegacyValue(id, field, provider[field]);
    }
    // Claude reports cost in fractional cents; a config written by 1.0.0 has no
    // scale at all, and a missing scale inherits the new 0.01 default. A cleared
    // field (NaN/0) falls back to the default instead of silently becoming 1.
    provider.scale = Number(provider.scale);
    if (!Number.isFinite(provider.scale) || provider.scale === 0) {
      const fallback = Number(DEFAULT_CONFIG.providers[id].scale);
      provider.scale = Number.isFinite(fallback) && fallback !== 0 ? fallback : 1;
    }
    provider.id = id;
    merged[id] = provider;
  }
  base.providers = merged;
  return base;
}

async function getConfig() {
  try {
    const raw = await plugin.getConfig();
    const normalized = normalizeConfig(raw || {});
    if (!raw || !raw.providers || Object.keys(raw.providers || {}).length === 0) {
      try {
        await plugin.setConfig(normalized);
      } catch (e) {
        logger.warn('[API Usage] seed config failed: ' + e.message);
      }
    }
    return normalized;
  } catch (e) {
    logger.warn('[API Usage] getConfig failed: ' + e.message);
    return normalizeConfig({});
  }
}

/* ------------------------------------------------------------------ */
/* value extraction                                                    */
/* ------------------------------------------------------------------ */

function toPathParts(path) {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function getValueByPath(obj, path) {
  const parts = toPathParts(path);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Walks the whole JSON tree and sums every occurrence of `path`.
// Numeric strings are accepted (Anthropic returns `amount` as a decimal string).
function sumByPath(obj, path) {
  const parts = toPathParts(path);
  if (!parts.length) return null;
  let total = 0;
  let found = false;
  const seen = new Set();

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    const cur = getValueByPath(node, path);
    const num = toNumber(cur);
    if (num != null) {
      total += num;
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

function toNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const s = raw.trim().replace(/,/g, '');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractValue(json, provider) {
  if (provider.sumField) return sumByPath(json, provider.sumField);

  let raw = getValueByPath(json, provider.valuePath);

  if (Array.isArray(raw)) {
    let pick = null;
    if (provider.currency) {
      const target = String(provider.currency).toUpperCase();
      pick = raw.find((item) => item && String(item.currency || '').toUpperCase() === target) || null;
    }
    // Fall back to the first array entry instead of showing "no data".
    if (!pick) pick = raw.length ? raw[0] : null;
    raw = pick;
  }

  if (raw && typeof raw === 'object' && provider.valueField) raw = raw[provider.valueField];
  return raw;
}

/* ------------------------------------------------------------------ */
/* URL / headers                                                       */
/* ------------------------------------------------------------------ */

function placeholderMap(now) {
  const unix = (d) => String(Math.floor(d.getTime() / 1000));
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return {
    '{now}': unix(now),
    '{nowUnix}': unix(now),
    '{nowISO}': now.toISOString(),
    '{monthStart}': unix(monthStart),
    '{monthStartUnix}': unix(monthStart),
    '{monthStartISO}': monthStart.toISOString(),
    '{yearStart}': unix(yearStart),
    '{yearStartISO}': yearStart.toISOString(),
    '{days7ISO}': daysAgo(7).toISOString(),
    '{days30ISO}': daysAgo(30).toISOString(),
    '{days31ISO}': daysAgo(31).toISOString(),
    '{yesterdayISO}': daysAgo(1).toISOString(),
    '{timestamp}': String(now.getTime()),
    '{random}': String(Math.floor(Math.random() * 1e9))
  };
}

function expandQuery(query) {
  const repl = placeholderMap(new Date());
  let out = String(query || '');
  // Placeholders expand to RFC 3986-safe characters (digits, '-', ':', '.', 'Z'),
  // so no percent-encoding is needed here.
  for (const k of Object.keys(repl)) out = out.split(k).join(repl[k]);
  return out;
}

function buildUrl(provider, endpoint) {
  let url = endpoint || provider.endpoint || '';
  const query = expandQuery(provider.query);
  if (query) url += (url.indexOf('?') >= 0 ? '&' : '?') + query;
  return url;
}

function buildHeaders(provider) {
  const headers = { Accept: 'application/json', 'User-Agent': 'FlexbarApiUsage/' + VERSION };
  const key = String(provider.apiKey || '').trim();
  if (key) {
    if (provider.authType === 'x-api-key') {
      headers['x-api-key'] = key;
    } else if (provider.authType === 'custom') {
      headers[provider.headerName || 'Authorization'] = (provider.headerPrefix || '') + key;
    } else if (provider.authType !== 'none') {
      headers.Authorization = 'Bearer ' + key;
    }
  }
  if (provider.id === 'claude') headers['anthropic-version'] = '2023-06-01';
  return headers;
}

function endpointCandidates(provider) {
  const known = ALTERNATE_ENDPOINTS[provider.id] || [];
  const list = [];
  const push = (e) => {
    const v = String(e || '').trim();
    if (v && list.indexOf(v) < 0) list.push(v);
  };

  const current = String(provider.endpoint || '').trim();
  // Alternates and the "last endpoint that worked" memory only apply while the
  // configured endpoint is still one of the built-in ones; a user-supplied relay
  // URL is always used exactly as typed.
  const useKnown = !current || known.indexOf(current) >= 0;
  const pref = preferredEndpoints.get(provider.id);
  if (useKnown && pref && known.indexOf(pref) >= 0) push(pref);
  if (current) push(current);
  if (useKnown) known.forEach(push);

  return list;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function httpGet(url, headers, redirects) {
  const depth = redirects || 0;
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(new Error('invalid url: ' + url));
      return;
    }
    const client = u.protocol === 'https:' ? https : http;
    const req = client.get(u, { headers }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && depth < 3) {
        res.resume();
        let next;
        try {
          next = new URL(res.headers.location, u).toString();
        } catch (e) {
          reject(new Error('bad redirect: ' + res.headers.location));
          return;
        }
        httpGet(next, headers, depth + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        try {
          if (/gzip/i.test(String(res.headers['content-encoding'] || ''))) buf = zlib.gunzipSync(buf);
        } catch (e) {
          /* keep raw bytes */
        }
        resolve({ status, text: buf.toString('utf8') });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const err = new Error('timeout after ' + REQUEST_TIMEOUT_MS + 'ms');
      err.code = 'ETIMEDOUT';
      req.destroy(err);
      reject(err);
    });
  });
}

function clip(text, max) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const n = max || 220;
  return s.length > n ? s.slice(0, n) + '...' : s;
}

/* ------------------------------------------------------------------ */
/* query                                                               */
/* ------------------------------------------------------------------ */

const HTTP_CODES = { 401: 'E401', 403: 'E403', 404: 'E404', 429: 'E429' };

function httpCode(status) {
  return HTTP_CODES[status] || 'E' + status;
}

// Retry the next candidate endpoint on auth/not-found/network problems only:
// a 429 or 5xx means "this host is right, try again later".
function shouldTryNext(status) {
  return status === 401 || status === 403 || status === 404;
}

function requireKey(provider) {
  if (provider.authType === 'none') return false;
  if (provider.id === 'custom') return false;
  return true;
}

async function queryProvider(provider) {
  if (!provider.enabled) return { ok: false, code: 'OFF', detail: 'provider disabled' };

  const candidates = endpointCandidates(provider);
  if (!candidates.length) return { ok: false, code: 'NOURL', detail: 'endpoint not set' };

  const key = String(provider.apiKey || '').trim();
  if (!key && requireKey(provider)) return { ok: false, code: 'NOKEY', detail: 'apiKey not set' };

  let firstErr = null;

  for (let i = 0; i < candidates.length; i++) {
    const endpoint = candidates[i];
    const url = buildUrl(provider, endpoint);
    try {
      const res = await httpGet(url, buildHeaders(provider));
      const text = res.text || '';

      if (res.status < 200 || res.status >= 300) {
        const err = { ok: false, code: httpCode(res.status), detail: 'HTTP ' + res.status + ': ' + clip(text, 160), url };
        if (!firstErr) firstErr = err;
        if (shouldTryNext(res.status)) continue;
        return err;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        const err = { ok: false, code: 'EBADJSON', detail: 'non-JSON body: ' + clip(text, 160), url };
        if (!firstErr) firstErr = err;
        continue;
      }

      const raw = extractValue(json, provider);
      const num = toNumber(raw);
      if (num == null) {
        const path = provider.sumField || provider.valuePath || '(root)';
        const err = { ok: false, code: 'NODATA', detail: 'no numeric value at ' + path + ' :: ' + clip(text, 200), url };
        if (!firstErr) firstErr = err;
        continue;
      }

      const scale = Number(provider.scale);
      const factor = Number.isFinite(scale) && scale !== 0 ? scale : 1;
      if (ALTERNATE_ENDPOINTS[provider.id]) preferredEndpoints.set(provider.id, endpoint);
      return { ok: true, value: num * factor, raw, code: 'OK', detail: 'ok', url };
    } catch (e) {
      const isTimeout = e && e.code === 'ETIMEDOUT';
      const err = {
        ok: false,
        code: isTimeout ? 'TIMEOUT' : 'ENET',
        detail: (e && e.message) || String(e),
        url
      };
      if (!firstErr) firstErr = err;
      continue;
    }
  }

  return firstErr || { ok: false, code: 'ENET', detail: 'no endpoint reachable' };
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function trimZeros(s) {
  if (s.indexOf('.') < 0) return s;
  return s.replace(/\.?0+$/, '');
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const v = Number(value);
  const a = Math.abs(v);
  if (v === 0) return '0';
  if (a >= 1000) return v.toFixed(0);
  if (a >= 1) return trimZeros(v.toFixed(2));
  return trimZeros(v.toFixed(3));
}

function formatValue(value, unit) {
  const s = formatNumber(value);
  if (s === '--') return s;
  return unit ? s + unit : s;
}

// FlexDesigner's built-in key font has no CJK glyphs, so a Chinese status
// string is drawn as "boxes". Everything that reaches key.title stays ASCII.
function asciiSafe(text, fallback) {
  const cleaned = String(text == null ? '' : text)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(fallback || '');
}

function statusText(provider, result) {
  if (result && result.ok) return formatValue(result.value, provider.unit);
  if (!result) return '...';
  switch (result.code) {
    case 'OFF':
      return 'OFF';
    case 'NOKEY':
      return 'NOKEY';
    case 'NOURL':
      return 'NOURL';
    case 'NODATA':
      return 'NODATA';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'ENET':
      return 'ENET';
    case 'EBADJSON':
      return 'EBADJSON';
    default:
      return result.code || 'ERR';
  }
}

function stateKey(serialNumber, key, index) {
  return serialNumber + '|' + (key.uid || key.cid + '#' + index);
}

function displayLabel(state) {
  const data = state.key.data || {};
  const provider = state.provider || {};
  const raw = data.label || provider.name || state.providerId;
  const fallback = asciiSafe(provider.name || state.providerId || 'API', 'API');
  if (state.asciiOnly) return asciiSafe(raw, fallback);
  return String(raw || fallback);
}

function drawKey(state) {
  const key = state.key;
  const provider = state.provider || {};
  if (!key.data) key.data = {};
  const data = key.data;
  key.style = key.style || {};

  const brandColor = BRAND_COLORS[state.providerId] || '#424242';
  if (!data.colorInitialized || data.colorInitialized !== state.providerId) {
    key.style.bgColor = brandColor;
    data.colorInitialized = state.providerId;
  }

  const label = displayLabel(state);
  const status = statusText(provider, state.lastResult);
  key.title = label + ' ' + status;

  key.style.showTitle = true;
  key.style.showIcon = false;
  key.style.showImage = false;
  key.style.showEmoji = false;
  // Long titles ("ChatGPT 1234USD") need a smaller face to stay inside the key.
  key.style.fontSize = key.title.length > 14 ? 13 : 18;

  try {
    plugin.draw(state.serialNumber, key, 'draw');
    logger.info('[API Usage] draw ' + state.providerId + ' title="' + key.title + '"');
  } catch (e) {
    logger.error('[API Usage] plugin.draw failed: ' + e.message);
  }
}

/* ------------------------------------------------------------------ */
/* state / timers                                                      */
/* ------------------------------------------------------------------ */

function resolveProvider(cfg, providerId) {
  const pid = cfg.providers[providerId] ? providerId : 'custom';
  return { id: pid, ...cfg.providers[pid] };
}

async function refreshKey(sk) {
  const state = states.get(sk);
  if (!state) return;
  const cfg = await getConfig();
  const data = state.key.data || {};
  const pid = data.provider || state.providerId || 'deepseek';
  state.providerId = pid;
  state.asciiOnly = cfg.asciiOnlyTitles !== false;
  const provider = resolveProvider(cfg, pid);
  provider.enabled = cfg.providers[pid] ? cfg.providers[pid].enabled !== false : true;
  state.provider = provider;
  state.lastResult = await queryProvider(provider);
  if (!state.lastResult.ok) {
    logger.warn('[API Usage] ' + pid + ' ' + state.lastResult.code + ' ' + clip(state.lastResult.detail, 260));
  }
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
    lastResult: null,
    asciiOnly: true
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
  if (t) {
    clearInterval(t);
    timers.delete(sk);
  }
  states.delete(sk);
}

function stopSerial(serialNumber) {
  for (const sk of Array.from(states.keys())) {
    if (sk.indexOf(serialNumber + '|') === 0) stopKey(sk);
  }
}

function restartTimers(cfg) {
  const ms = intervalMs(cfg);
  for (const sk of Array.from(timers.keys())) {
    const t = timers.get(sk);
    if (t) clearInterval(t);
    timers.set(sk, setInterval(() => refreshKey(sk), ms));
  }
}

/* ------------------------------------------------------------------ */
/* "Test" button support (config page -> backend round trip)           */
/* ------------------------------------------------------------------ */

async function handleTestRequest(cfg) {
  const req = cfg && cfg.testRequest;
  if (!req || !req.provider) return false;

  const nonce = Number(req.nonce) || 0;
  if (nonce && nonce === lastTestNonce) return false;
  lastTestNonce = nonce;

  const pid = req.provider;
  const provider = resolveProvider(cfg, pid);
  provider.enabled = true; // allow testing before enabling the provider

  const result = await queryProvider(provider);
  const name = asciiSafe(provider.name || pid, pid);
  let message;
  if (result.ok) {
    message = name + ' OK ' + formatValue(result.value, provider.unit);
  } else {
    message = name + ' ' + result.code + (result.detail ? ' - ' + clip(result.detail, 160) : '');
  }

  logger.info('[API Usage] TEST ' + message);
  try {
    if (typeof plugin.showSnackbarMessage === 'function') {
      await plugin.showSnackbarMessage(result.ok ? 'success' : 'error', 'API Usage | ' + message, 8000);
    }
  } catch (e) {
    logger.warn('[API Usage] showSnackbarMessage failed: ' + e.message);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

plugin.on('plugin.alive', async (payload) => {
  const { serialNumber, keys } = payload || {};
  const list = keys || [];
  logger.info('[API Usage] alive serial=' + serialNumber + ' keys=' + list.map((k) => k.cid).join(','));
  for (let i = 0; i < list.length; i++) {
    if (list[i].cid === KEY_CID) await startKey(serialNumber, list[i], i);
  }
});

plugin.on('plugin.dead', (payload) => {
  if (payload && payload.serialNumber) stopSerial(payload.serialNumber);
});

plugin.on('plugin.config.updated', async (payload) => {
  logger.info('[API Usage] config updated');
  const cfg = (payload && payload.config && normalizeConfig(payload.config)) || (await getConfig());
  await handleTestRequest(cfg);
  for (const sk of Array.from(states.keys())) await refreshKey(sk);
  restartTimers(cfg);
});

plugin.on('plugin.data', async (payload) => {
  const { serialNumber, data } = payload || {};
  const key = data && data.key;
  if (!key || key.cid !== KEY_CID) return;
  for (const sk of Array.from(states.keys())) {
    if (sk.indexOf(serialNumber + '|') === 0) await refreshKey(sk);
  }
});

plugin.start();
logger.info('[API Usage] plugin started v' + VERSION);
