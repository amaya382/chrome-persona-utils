const chromeMajor = PersonaCore.chromeMajorVersion(navigator.userAgent);
const enabledInput = document.getElementById('enabled');
const summaryEl = document.getElementById('summary');
const segmentsEl = document.getElementById('segments');
const layerEl = document.getElementById('layer');
const statusEl = document.getElementById('status');

let state;
let tab;
let jar;
let editor = null;
let segment = 'global';
let selectedRuleId = null;
let pendingDeleteId = null;

function save(promise) {
  promise.then(
    () => {
      statusEl.hidden = true;
    },
    (error) => {
      statusEl.textContent = `Failed to save: ${error.message}`;
      statusEl.hidden = false;
    },
  );
}

function pageOrigin() {
  try {
    const { protocol, origin } = new URL(tab.url);
    return /^https?:$/.test(protocol) ? origin : null;
  } catch {
    return null;
  }
}

async function readCookieJar(url) {
  if (!/^https?:/.test(url ?? '')) return null;
  const cookies = await chrome.cookies.getAll({ url });
  cookies.sort((a, b) => b.path.length - a.path.length);
  return cookies.map(({ name, value }) => ({ name, value }));
}

function selectedRule() {
  return state.rules.find((rule) => rule.id === selectedRuleId) ?? null;
}

// Why a layer does not take part on the current page, or null when it does.
function inactiveReason(layer, isRule) {
  if (!state.settings.enabled) return 'Persona Utils is turned off.';
  if (!layer.enabled) return 'This layer is turned off.';
  if (isRule && !PersonaCore.ruleMatches(layer, tab.url)) return 'Not applied on this page: the pattern does not match its URL.';
  return null;
}

function chip(source) {
  if (!source) return h('span', { className: 'chip default' }, 'Default');
  const isRule = source.startsWith('Rule: ');
  return h('span', { className: `chip ${isRule ? 'rule' : 'global'}`, title: source }, isRule ? source.slice(6) : source);
}

function renderSummary() {
  const resolved = PersonaCore.resolveLayers(PersonaCore.activeLayers(state, tab.url));
  const rows = [];
  const row = (label, value, source, title = value) => rows.push([label, value, source, title]);
  if (resolved.userAgent) {
    const ua = PersonaCore.resolveUserAgent(resolved.userAgent, chromeMajor).value;
    row('User agent', PersonaCore.userAgentLabel(resolved.userAgent), resolved.userAgent.source, ua);
  } else {
    row('User agent', navigator.userAgent, null);
  }
  if (resolved.locale) row('Locale', resolved.locale.value, resolved.locale.source);
  else row('Locale', navigator.languages.join(', '), null);
  const describe = (e) => (e.operation === 'remove' ? `${e.name} (removed)` : `${e.name}: ${e.value}${e.operation === 'append' ? ' (appended)' : ''}`);
  if (resolved.requestHeaders.length) for (const e of resolved.requestHeaders) row('Request', describe(e), e.source);
  else row('Request', 'Sent as the browser builds them', null);
  if (resolved.responseHeaders.length) for (const e of resolved.responseHeaders) row('Response', describe(e), e.source);
  else row('Response', 'Received as the server sends them', null);
  if (resolved.cookies.length) {
    for (const c of resolved.cookies) row('Cookie', c.action === 'unset' ? `${c.name} (unset)` : `${c.name}=${c.value}`, c.source);
  } else {
    row('Cookies', jar ? `Cookie jar as is (${jar.length})` : 'Cookie jar as is', null);
  }
  summaryEl.replaceChildren(
    ...rows.flatMap(([label, value, source, title]) => [
      h('dt', {}, label),
      h('dd', { className: `value${source ? '' : ' default'}`, title }, value),
      h('dd', {}, chip(source)),
    ]),
  );
}

function renderSegments() {
  const applied = state.rules.filter((rule) => rule.enabled && PersonaCore.ruleMatches(rule, tab.url)).length;
  const button = (id, label) =>
    h('button', {
      type: 'button',
      className: `${id}${segment === id ? ' active' : ''}`,
      textContent: label,
      onclick: () => {
        segment = id;
        render();
      },
    });
  segmentsEl.replaceChildren(button('global', 'Global'), button('rules', `URL rules (${applied}/${state.rules.length} applied)`));
}

function editorFor(id, profile, onChange) {
  editor = createProfileEditor({
    profile,
    favorites: state.settings.favorites,
    baseline: computeBaseline(PersonaCore.layersBelow(state, tab.url, id), browserDefaults(jar)),
    chromeMajor,
    onChange: () => {
      onChange();
      renderSummary();
    },
    onFavoritesChange: (favorites) => {
      state.settings.favorites = favorites;
      save(saveSettings(state.settings));
      editor.update({ favorites });
    },
  });
  return editor.element;
}

function layerCard(kind, reason, children) {
  return h('section', { className: `card layer-card ${kind}${reason ? ' inactive' : ''}` }, reason && h('p', { className: 'banner' }, reason), children);
}

function renderGlobal() {
  const toggle = h('input', {
    type: 'checkbox',
    checked: state.global.enabled,
    onchange: (e) => {
      state.global.enabled = e.target.checked;
      save(saveGlobal(state.global));
      render();
    },
  });
  layerEl.replaceChildren(
    layerCard('global', inactiveReason(state.global, false), [
      h('label', { className: 'field-title' }, toggle, 'Global'),
      h('p', { className: 'note' }, 'Applies to every page and wins over every URL rule.'),
      editorFor('global', state.global.profile, () => save(saveGlobal(state.global))),
    ]),
  );
}

function saveOrder() {
  state.settings.ruleOrder = state.rules.map((rule) => rule.id);
  save(saveSettings(state.settings));
}

function addRule(pattern, name) {
  const existing = pattern && state.rules.find((rule) => rule.pattern === pattern);
  if (existing) {
    selectedRuleId = existing.id;
    render();
    return;
  }
  const rule = { id: crypto.randomUUID(), name, enabled: true, pattern, profile: PersonaCore.defaultProfile() };
  state.rules.push(rule);
  save(saveRule(rule));
  saveOrder();
  selectedRuleId = rule.id;
  render();
}

function moveRule(index, delta) {
  const [rule] = state.rules.splice(index, 1);
  state.rules.splice(index + delta, 0, rule);
  saveOrder();
  render();
}

function deleteRule(index) {
  const [rule] = state.rules.splice(index, 1);
  saveOrder();
  save(removeRule(rule.id));
  if (selectedRuleId === rule.id) selectedRuleId = state.rules[Math.min(index, state.rules.length - 1)]?.id ?? null;
  pendingDeleteId = null;
  render();
}

function ruleListItem(rule, index) {
  const applied = rule.enabled && state.settings.enabled && PersonaCore.ruleMatches(rule, tab.url);
  const matches = PersonaCore.ruleMatches(rule, tab.url);
  const stop = (handler) => (e) => {
    e.stopPropagation();
    handler(e);
  };
  return h(
    'li',
    {
      className: `${rule.id === selectedRuleId ? 'selected' : ''}${applied ? '' : ' not-applied'}`,
      onclick: () => {
        selectedRuleId = rule.id;
        pendingDeleteId = null;
        render();
      },
    },
    h('input', {
      type: 'checkbox',
      title: 'Enabled',
      checked: rule.enabled,
      onclick: (e) => e.stopPropagation(),
      onchange: (e) => {
        rule.enabled = e.target.checked;
        save(saveRule(rule));
        render();
      },
    }),
    h('span', { className: 'name', title: rule.pattern }, rule.name || rule.pattern || 'Untitled'),
    h('span', { className: `state ${applied ? 'applied' : 'not-applied'}` }, applied ? '● Applied' : matches ? '○ Off' : '○ Not on this page'),
    h('button', { type: 'button', title: 'Move up', textContent: '↑', disabled: index === 0, onclick: stop(() => moveRule(index, -1)) }),
    h('button', { type: 'button', title: 'Move down', textContent: '↓', disabled: index === state.rules.length - 1, onclick: stop(() => moveRule(index, 1)) }),
    pendingDeleteId === rule.id
      ? h('button', { type: 'button', className: 'danger', textContent: 'Delete?', onclick: stop(() => deleteRule(index)) })
      : h('button', {
          type: 'button',
          title: 'Delete',
          textContent: '🗑',
          onclick: stop(() => {
            pendingDeleteId = rule.id;
            render();
          }),
        }),
  );
}

function ruleEditor(rule) {
  const errorEl = h('p', { className: 'error', hidden: true });
  return layerCard('rule', inactiveReason(rule, true), [
    h(
      'div',
      { className: 'rule-fields' },
      'Name',
      h('input', {
        value: rule.name,
        placeholder: 'Name',
        onchange: (e) => {
          rule.name = e.target.value.trim();
          save(saveRule(rule));
          render();
        },
      }),
      'Pattern',
      h('input', {
        spellcheck: false,
        value: rule.pattern,
        placeholder: 'Regular expression, e.g. ^https://example\\.com/',
        onchange: async (e) => {
          const pattern = e.target.value.trim();
          const problem = await patternProblem(pattern);
          errorEl.textContent = problem ?? '';
          errorEl.hidden = !problem;
          if (problem) return;
          rule.pattern = pattern;
          save(saveRule(rule));
          render();
        },
      }),
    ),
    errorEl,
    editorFor(rule.id, rule.profile, () => save(saveRule(rule))),
  ]);
}

function renderRules() {
  const origin = pageOrigin();
  const rule = selectedRule();
  layerEl.replaceChildren(
    h('p', { className: 'note' }, 'Patterns are case-insensitive regular expressions matched against the page URL. Higher rows win; Global wins over every rule.'),
    state.rules.length ? h('ul', { className: 'rule-list' }, state.rules.map(ruleListItem)) : h('p', { className: 'empty' }, 'No URL rules yet.'),
    h(
      'div',
      { className: 'actions' },
      h('button', {
        type: 'button',
        textContent: '+ Rule for this site',
        title: origin ? `Matches pages under ${origin}` : 'Available on http and https pages',
        disabled: !origin,
        onclick: () => addRule(`^${PersonaCore.escapeRegExp(origin)}/`, new URL(origin).host),
      }),
      h('button', { type: 'button', textContent: '+ Empty rule', onclick: () => addRule('', '') }),
    ),
    rule && ruleEditor(rule),
  );
}

function render() {
  editor = null;
  enabledInput.checked = state.settings.enabled;
  renderSummary();
  renderSegments();
  if (segment === 'global') renderGlobal();
  else renderRules();
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  [state, jar] = await Promise.all([loadState(), readCookieJar(tab.url)]);
  const firstMatch = state.rules.find((rule) => PersonaCore.ruleMatches(rule, tab.url));
  selectedRuleId = (firstMatch ?? state.rules[0])?.id ?? null;
  if (firstMatch) segment = 'rules';

  enabledInput.addEventListener('change', () => {
    state.settings.enabled = enabledInput.checked;
    save(saveSettings(state.settings));
    render();
  });
  render();
}

document.getElementById('reload').addEventListener('click', () => {
  chrome.tabs.reload(tab.id);
  window.close();
});

init();
