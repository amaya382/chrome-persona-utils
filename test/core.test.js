const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

const profile = (overrides) => ({ ...core.defaultProfile(), ...overrides });
const header = (name, value, operation = 'set') => ({ enabled: true, operation, name, value });

function stateWith({ global = profile(), globalEnabled = true, rules = [], enabled = true } = {}) {
  return core.normalizeState({
    settings: { enabled },
    global: { enabled: globalEnabled, profile: global },
    rules: rules.map((rule, i) => ({ id: `r${i}`, name: `rule${i}`, ...rule })),
  });
}

test('acceptLanguage and navigatorLanguages fall back to the base language', () => {
  assert.equal(core.acceptLanguage('ja-JP'), 'ja-JP,ja;q=0.9');
  assert.equal(core.acceptLanguage('en'), 'en');
  assert.deepEqual(core.navigatorLanguages('zh-Hant-TW'), ['zh-Hant-TW', 'zh']);
});

test('resolveUserAgent fills the Chrome major version into presets', () => {
  const ua = core.resolveUserAgent({ presetId: 'chrome-macos', value: '' }, '150');
  assert.match(ua.value, /Chrome\/150\.0\.0\.0/);
  assert.deepEqual(ua.clientHints.brands[0], { brand: 'Google Chrome', version: '150' });
  assert.equal(ua.platform, 'MacIntel');
  assert.deepEqual(core.resolveUserAgent({ presetId: null, value: 'custom/1.0' }, '150'), {
    value: 'custom/1.0',
    platform: null,
    clientHints: null,
  });
});

test('modifyHeadersAction sets client hints for Chromium presets and removes them otherwise', () => {
  const chrome = core.modifyHeadersAction(profile({ userAgent: { enabled: true, presetId: 'chrome-android', value: '' } }), '150');
  const byHeader = Object.fromEntries(chrome.requestHeaders.map((h) => [h.header, h]));
  assert.equal(byHeader['sec-ch-ua-mobile'].value, '?1');
  assert.equal(byHeader['sec-ch-ua-platform'].value, '"Android"');
  assert.equal(byHeader['sec-ch-ua'].value, '"Google Chrome";v="150", "Chromium";v="150", "Not?A_Brand";v="24"');

  const custom = core.modifyHeadersAction(profile({ userAgent: { enabled: true, presetId: null, value: 'custom/1.0' } }), '150');
  const ch = custom.requestHeaders.filter((h) => h.header.startsWith('sec-ch-ua'));
  assert.ok(ch.length > 0);
  assert.ok(ch.every((h) => h.operation === 'remove'));
});

test('modifyHeadersAction skips disabled and invalid entries and keeps the first entry per header', () => {
  const action = core.modifyHeadersAction(
    profile({
      locale: { enabled: true, value: 'fr-FR' },
      requestHeaders: [
        header('Accept-Language', 'de'),
        { ...header('X-Off', '1'), enabled: false },
        header('bad name', '1'),
        header('X-Custom', 'v', 'append'),
        header('X-Gone', '', 'remove'),
      ],
      responseHeaders: [header('X-Frame-Options', '', 'remove')],
    }),
    '150',
  );
  assert.deepEqual(action.requestHeaders, [
    { header: 'accept-language', operation: 'set', value: 'fr-FR,fr;q=0.9' },
    { header: 'x-gone', operation: 'remove' },
  ]);
  assert.deepEqual(action.responseHeaders, [{ header: 'x-frame-options', operation: 'remove' }]);
  assert.equal(core.modifyHeadersAction(core.defaultProfile(), '150'), null);
});

test('headerEntryError allows append only for request headers Chrome accepts', () => {
  assert.equal(core.headerEntryError(header('Accept', 'x', 'append'), 'request'), null);
  assert.ok(core.headerEntryError(header('X-Custom', 'x', 'append'), 'request'));
  assert.equal(core.headerEntryError(header('X-Custom', 'x', 'append'), 'response'), null);
});

test('activeLayers orders global first, then matching enabled rules in list order', () => {
  const state = stateWith({
    rules: [
      { pattern: '^https://example\\.com/', enabled: true },
      { pattern: 'nomatch', enabled: true },
      { pattern: 'EXAMPLE', enabled: true },
      { pattern: 'example', enabled: false },
    ],
  });
  assert.deepEqual(
    core.activeLayers(state, 'https://example.com/a').map((l) => l.source),
    ['Global', 'Rule: rule0', 'Rule: rule2'],
  );
  assert.deepEqual(core.activeLayers(stateWith({ enabled: false }), 'https://example.com/'), []);
  assert.deepEqual(core.activeLayers(stateWith({ globalEnabled: false }), 'https://example.com/'), []);
});

test('layersBelow returns the active layers ranked under the given layer', () => {
  const state = stateWith({ rules: [{ pattern: 'a' }, { pattern: 'a', enabled: false }, { pattern: 'a' }, { pattern: 'zzz' }] });
  const below = (id) => core.layersBelow(state, 'https://a.test/', id).map((l) => l.id);
  assert.deepEqual(below('global'), ['r0', 'r2']);
  assert.deepEqual(below('r1'), ['r2']);
  assert.deepEqual(below('r2'), []);
});

test('resolveLayers takes each field from the highest layer that sets it', () => {
  const state = stateWith({
    global: profile({ userAgent: { enabled: true, presetId: 'firefox-windows', value: '' }, cookies: [{ enabled: true, name: 'a', action: 'unset' }] }),
    rules: [
      {
        pattern: 'example',
        profile: profile({
          userAgent: { enabled: true, presetId: 'safari-iphone', value: '' },
          locale: { enabled: true, value: 'ja-JP' },
          requestHeaders: [header('X-A', '1')],
          cookies: [{ enabled: true, name: 'a', action: 'override', value: 'x' }],
        }),
      },
      { pattern: 'example', profile: profile({ requestHeaders: [header('x-a', '2'), header('X-B', '3')] }) },
    ],
  });
  const resolved = core.resolveLayers(core.activeLayers(state, 'https://example.com/'));
  assert.equal(resolved.userAgent.presetId, 'firefox-windows');
  assert.equal(resolved.userAgent.source, 'Global');
  assert.equal(resolved.locale.value, 'ja-JP');
  assert.equal(resolved.locale.source, 'Rule: rule0');
  assert.deepEqual(
    resolved.requestHeaders.map((h) => [h.name, h.value, h.source]),
    [
      ['X-A', '1', 'Rule: rule0'],
      ['X-B', '3', 'Rule: rule1'],
    ],
  );
  assert.deepEqual(resolved.cookies.map((c) => [c.name, c.action, c.source]), [['a', 'unset', 'Global']]);
});

test('mergeCookies overrides in place, unsets, and appends new cookies', () => {
  const pairs = core.parseCookieHeader('a=1; b=2; a=3; c=4');
  const merged = core.mergeCookies(pairs, [
    { name: 'a', action: 'override', value: 'x' },
    { name: 'c', action: 'unset' },
    { name: 'd', action: 'override', value: 'y' },
  ]);
  assert.equal(core.serializeCookies(merged), 'a=x; b=2; d=y');
  assert.equal(core.serializeCookies(core.mergeCookies(core.parseCookieHeader('a=1'), [{ name: 'a', action: 'unset' }])), '');
});

test('buildDnrRules ranks global over rules and rules by list order', () => {
  const state = stateWith({
    global: profile({ locale: { enabled: true, value: 'en-US' } }),
    rules: [
      { pattern: '^https://a\\.test/', profile: profile({ requestHeaders: [header('X-A', '1')] }) },
      { pattern: '^https://b\\.test/', profile: profile({ requestHeaders: [header('X-B', '1')] }) },
      { pattern: '(', profile: profile({ requestHeaders: [header('X-Bad', '1')] }) },
      { pattern: 'test', profile: core.defaultProfile() },
    ],
  });
  const tabs = [
    { tabId: 1, url: 'https://a.test/page', cookie: null },
    { tabId: 2, url: 'https://b.test/page', cookie: null },
    { tabId: 3, url: 'https://a.test/other', cookie: { host: 'a.test', value: 'k=v' } },
    { tabId: 4, url: 'https://c.test/', cookie: { host: 'c.test', value: '' } },
  ];
  const rules = core.buildDnrRules(state, tabs, '150');

  assert.deepEqual(
    rules.map((r) => r.id),
    rules.map((_, i) => i + 1),
  );
  const [global, aMain, aTabs, bMain, bTabs, cookie3, cookie4] = rules;
  assert.equal(rules.length, 7);
  assert.deepEqual(global.condition.resourceTypes.includes('main_frame'), true);
  assert.ok(global.priority > aMain.priority && aMain.priority > bMain.priority);
  assert.equal(aMain.priority, aTabs.priority);
  assert.deepEqual(aMain.condition, { regexFilter: '^https://a\\.test/', resourceTypes: ['main_frame'] });
  assert.deepEqual(aTabs.condition, { tabIds: [1, 3], excludedResourceTypes: ['main_frame'] });
  assert.deepEqual(bTabs.condition.tabIds, [2]);
  assert.ok(cookie3.priority > global.priority);
  assert.deepEqual(cookie3.condition.tabIds, [3]);
  assert.equal(cookie3.condition.regexFilter, '^[a-z]+://a\\.test(:\\d+)?/');
  assert.deepEqual(cookie3.action.requestHeaders, [{ header: 'cookie', operation: 'set', value: 'k=v' }]);
  assert.deepEqual(cookie4.action.requestHeaders, [{ header: 'cookie', operation: 'remove' }]);
  assert.ok(new RegExp(cookie3.condition.regexFilter).test('https://a.test:8443/x'));
  assert.ok(!new RegExp(cookie3.condition.regexFilter).test('https://cdn.a.test/x'));

  assert.deepEqual(core.buildDnrRules({ ...state, settings: { ...state.settings, enabled: false } }, tabs, '150'), []);
});

test('patternError rejects empty and invalid patterns', () => {
  assert.equal(core.patternError('^https://'), null);
  assert.ok(core.patternError(''));
  assert.ok(core.patternError('('));
});
