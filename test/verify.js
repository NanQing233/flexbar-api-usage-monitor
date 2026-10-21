/*
 * Offline harness: stubs @eniac/flexdesigner and serves fake provider payloads,
 * then drives plugin.alive and inspects the titles that would be drawn.
 * Run: node test/verify.js
 */
const http = require('http');
const path = require('path');
const Module = require('module');

const draws = [];
const messages = [];
const requests = [];
const listeners = {};
let configFixture = null;

const stub = {
  plugin: {
    getConfig: async () => JSON.parse(JSON.stringify(configFixture)),
    setConfig: async () => {},
    draw: (serialNumber, key) => {
      draws.push({ serialNumber, title: key.title, data: JSON.parse(JSON.stringify(key.data || {})) });
    },
    on: (ev, fn) => {
      (listeners[ev] = listeners[ev] || []).push(fn);
    },
    start: () => {},
    showSnackbarMessage: async (color, message) => {
      messages.push({ color, message });
    }
  },
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@eniac/flexdesigner') return stub;
  return origLoad.call(this, request, parent, isMain);
};

function send(res, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

const seq = [];
let lastKey = null;

const server = http.createServer((req, res) => {
  requests.push({ url: req.url, headers: req.headers });
  const name = req.url.split('?')[0].replace(/^\//, '');
  switch (name) {
    case 'deepseek':
      return send(res, 200, {
        is_available: true,
        balance_infos: [
          { currency: 'USD', total_balance: '1.00' },
          { currency: 'CNY', total_balance: '12.34' }
        ]
      });
    case 'kimi':
      return send(res, 200, { code: 0, data: { available_balance: 49.58894, voucher_balance: 46.5, cash_balance: 3.1 }, scode: '0x0', status: true });
    case 'chatgpt':
      return send(res, 200, {
        object: 'page',
        data: [
          { object: 'bucket', results: [{ object: 'organization.costs.result', amount: { value: 0.06, currency: 'usd' } }] },
          { object: 'bucket', results: [{ object: 'organization.costs.result', amount: { value: 1.5, currency: 'usd' } }] }
        ],
        has_more: false,
        next_page: null
      });
    case 'claude':
      return send(res, 200, {
        data: [
          { starting_at: '2026-10-01T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }, { amount: '6.55', currency: 'USD' }] }
        ],
        has_more: false,
        next_page: null
      });
    case 'custom-unauth':
      return send(res, 401, { error: { message: 'invalid api key' } });
    case 'custom-ok':
      return send(res, 200, { usage: { credit: '8.5' } });
    case 'custom-nodata':
      return send(res, 200, { hello: 'world' });
    case 'custom-plain':
      return send(res, 200, 'not json at all');
    default:
      return send(res, 404, { error: 'nope' });
  }
});

function base(id) {
  return 'http://127.0.0.1:' + server.address().port + '/' + id;
}

function provider(overrides) {
  return Object.assign(
    {
      enabled: true,
      name: '',
      apiKey: 'sk-test',
      endpoint: '',
      authType: 'bearer',
      headerName: '',
      headerPrefix: '',
      query: '',
      valuePath: '',
      valueField: '',
      currency: '',
      sumField: '',
      scale: 1,
      unit: ''
    },
    overrides
  );
}

function key(providerId, label, uid) {
  return { cid: 'com.nanqing.apiusage.monitor', uid, data: { provider: providerId, label }, style: {} };
}

function lastWithPrefix(prefix) {
  for (let i = draws.length - 1; i >= 0; i--) {
    if (String(draws[i].title || '').indexOf(prefix) === 0) return draws[i].title;
  }
  return null;
}

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '  ->  ' + actual : '  expected=' + expected + '  actual=' + actual));
}

function checkContains(name, actual, needle) {
  const ok = typeof actual === 'string' && actual.indexOf(needle) >= 0;
  if (ok) pass++;
  else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '  ->  ' + actual : '  expected to contain ' + JSON.stringify(needle) + '  actual=' + actual));
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const url = base('deepseek');
  configFixture = {
    intervalSeconds: 30,
    asciiOnlyTitles: true,
    providers: {
      deepseek: provider({ name: 'DeepSeek', endpoint: url, valuePath: 'balance_infos', valueField: 'total_balance', currency: 'CNY', unit: 'CNY' }),
      kimi: provider({ name: 'Kimi', endpoint: base('kimi'), valuePath: 'data.available_balance', unit: 'USD' }),
      chatgpt: provider({ name: 'ChatGPT', endpoint: base('chatgpt'), query: 'start_time={monthStart}&end_time={now}&bucket_width=1d&limit=180', sumField: 'amount.value', unit: 'USD' }),
      claude: provider({ name: 'Claude', endpoint: base('claude'), authType: 'x-api-key', query: 'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d&limit=31', sumField: 'amount', scale: 0.01, unit: 'USD' }),
      custom: provider({ name: 'Custom', endpoint: base('custom-ok'), valuePath: 'usage.credit', unit: 'USD' })
    }
  };

  const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'src', 'plugin.js');
  console.log('target: ' + target + '\n');
  require(target);

  const keys = [
    key('deepseek', 'DeepSeek', 1),
    key('kimi', 'Kimi', 2),
    key('chatgpt', 'ChatGPT', 3),
    key('claude', 'Claude', 4),
    key('custom', 'Custom', 5),
    key('kimi', '深度额度', 6) // CJK label must degrade to ASCII
  ];

  listeners['plugin.alive'] = listeners['plugin.alive'] || [];
  for (const fn of listeners['plugin.alive']) await fn({ serialNumber: 'SN-TEST', keys });

  // rebuild uid map: drawKey does not carry uid, so re-derive by order of first draws
  const titles = draws.slice(-6).map((d) => d.title);
  check('deepseek title', titles[0], 'DeepSeek 12.34CNY');
  check('kimi title', titles[1], 'Kimi 49.59USD');
  check('chatgpt title', titles[2], 'ChatGPT 1.56USD');
  check('claude title (cents -> USD)', titles[3], 'Claude 1.3USD');
  check('custom title', titles[4], 'Custom 8.5USD');
  check('CJK label stripped', titles[5], 'Kimi 49.59USD');

  const chatgptReq = requests.find((r) => r.url.indexOf('/chatgpt') === 0);
  checkContains('chatgpt start_time is unix seconds', chatgptReq.url, 'start_time=' + String(Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) / 1000)));
  checkContains('chatgpt bucket_width', chatgptReq.url, 'bucket_width=1d');
  check('chatgpt bearer header', chatgptReq.headers.authorization, 'Bearer sk-test');

  const claudeReq = requests.find((r) => r.url.indexOf('/claude') === 0);
  check('claude x-api-key header', claudeReq.headers['x-api-key'], 'sk-test');
  check('claude anthropic-version', claudeReq.headers['anthropic-version'], '2023-06-01');
  checkContains('claude starting_at ISO', claudeReq.url, 'starting_at=' + new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString());
  check('claude has no Bearer', claudeReq.headers.authorization, undefined);
  check('claude scale applied', titles[3], 'Claude 1.3USD');

  // error paths
  draws.length = 0;
  configFixture.providers.custom.endpoint = base('custom-unauth');
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  check('401 -> E401', lastWithPrefix('Custom'), 'Custom E401');

  draws.length = 0;
  configFixture.providers.custom.endpoint = base('custom-nodata');
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  check('no numeric value -> NODATA', lastWithPrefix('Custom'), 'Custom NODATA');

  draws.length = 0;
  configFixture.providers.custom.endpoint = base('custom-plain');
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  check('non-JSON -> EBADJSON', lastWithPrefix('Custom'), 'Custom EBADJSON');

  draws.length = 0;
  configFixture.providers.kimi.apiKey = '';
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  const kimiTitles = draws.filter((d) => d.title.indexOf('Kimi') === 0).map((d) => d.title);
  check('missing key -> NOKEY', kimiTitles.includes('Kimi NOKEY'), true);

  draws.length = 0;
  configFixture.providers.kimi.apiKey = 'sk-test';
  configFixture.providers.kimi.enabled = false;
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  const kimiOff = draws.filter((d) => d.title.indexOf('Kimi') === 0).map((d) => d.title);
  check('disabled -> OFF', kimiOff.includes('Kimi OFF'), true);

  // keyless custom endpoint (authType none) must work
  draws.length = 0;
  configFixture.providers.kimi.enabled = true;
  configFixture.providers.custom.enabled = true;
  configFixture.providers.custom.apiKey = '';
  configFixture.providers.custom.authType = 'none';
  configFixture.providers.custom.endpoint = base('custom-ok');
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  check('keyless custom works', lastWithPrefix('Custom'), 'Custom 8.5USD');
  const okReq = requests.filter((r) => r.url.indexOf('/custom-ok') === 0).pop();
  check('authType none sends no auth header', okReq.headers.authorization, undefined);

  // test button round trip
  messages.length = 0;
  configFixture.providers.kimi.endpoint = base('kimi');
  configFixture.testRequest = { provider: 'kimi', nonce: Date.now() };
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  checkContains('test button reports success', messages.length ? messages[0].message : '', 'Kimi OK 49.59USD');

  messages.length = 0;
  configFixture.providers.custom.endpoint = base('custom-unauth');
  configFixture.testRequest = { provider: 'custom', nonce: Date.now() + 1 };
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  checkContains('test button reports real error', messages.length ? messages[0].message : '', 'E401');

  // 1.0.0 config migration: untouched legacy defaults are upgraded on load
  draws.length = 0;
  configFixture.providers.kimi.unit = 'CNY';
  configFixture.providers.kimi.endpoint = base('kimi');
  await listeners['plugin.config.updated'][0]({ config: configFixture });
  check('legacy kimi unit CNY migrated to USD', lastWithPrefix('Kimi'), 'Kimi 49.59USD');

  // every drawn title must be ASCII-only
  const nonAscii = draws.map((d) => d.title).filter((t) => /[^\x20-\x7E]/.test(t));
  check('all titles ASCII', nonAscii.length, 0);

  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
