const chromeMajor = PersonaCore.chromeMajorVersion(navigator.userAgent);
const enabledInput = document.getElementById('enabled');
const tabsEl = document.getElementById('tabs');
const panelEl = document.getElementById('panel');
const statusEl = document.getElementById('status');

let state;
let tab;
let jar;
let editor = null;
let active = 'page';
// Rules shown as tabs: those matching the page when the popup opened, plus rules added here, kept even if edited to no longer match.
const shownRuleIds = new Set();

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

function layerOf(id) {
  return id === 'global' ? state.global : state.rules.find((rule) => rule.id === id);
}

function saveLayer(id) {
  return id === 'global' ? saveGlobal(state.global) : saveRule(layerOf(id));
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

function baselineFor(id) {
  return computeBaseline(PersonaCore.layersBelow(state, tab.url, id), browserDefaults(jar));
}

function select(id) {
  active = id;
  renderTabs();
  renderPanel();
}

function addRuleForSite() {
  const origin = pageOrigin();
  if (!origin) return;
  const pattern = `^${PersonaCore.escapeRegExp(origin)}/`;
  const existing = state.rules.find((rule) => rule.pattern === pattern);
  if (existing) {
    shownRuleIds.add(existing.id);
    select(existing.id);
    return;
  }
  const rule = { id: crypto.randomUUID(), name: new URL(origin).host, enabled: true, pattern, profile: PersonaCore.defaultProfile() };
  state.rules.push(rule);
  state.settings.ruleOrder = state.rules.map((r) => r.id);
  save(saveRule(rule).then(() => saveSettings(state.settings)));
  shownRuleIds.add(rule.id);
  select(rule.id);
}

function renderTabs() {
  const layerTab = (id, label) => {
    const layer = layerOf(id);
    return h(
      'div',
      { className: `tab${active === id ? ' active' : ''}${layer.enabled ? '' : ' off'}`, role: 'tab', title: label, onclick: () => select(id) },
      h('input', {
        type: 'checkbox',
        title: 'Enabled',
        checked: layer.enabled,
        onclick: (e) => e.stopPropagation(),
        onchange: (e) => {
          layer.enabled = e.target.checked;
          save(saveLayer(id));
          renderTabs();
          refreshPanel();
        },
      }),
      h('span', {}, label),
    );
  };
  const origin = pageOrigin();
  tabsEl.replaceChildren(
    h('div', { className: `tab${active === 'page' ? ' active' : ''}`, role: 'tab', onclick: () => select('page') }, h('span', {}, 'On this page')),
    layerTab('global', 'Global'),
    ...state.rules.filter((rule) => shownRuleIds.has(rule.id)).map((rule) => layerTab(rule.id, rule.name || rule.pattern || 'Untitled')),
    h('div', {
      className: 'tab add',
      role: 'tab',
      title: origin ? `Add a URL rule for ${origin}` : 'URL rules can be added only on http and https pages',
      'aria-disabled': !origin,
      textContent: '+',
      onclick: addRuleForSite,
    }),
  );
}

function effectivePanel() {
  const resolved = PersonaCore.resolveLayers(PersonaCore.activeLayers(state, tab.url));
  const items = [];
  if (resolved.userAgent) items.push(['User agent', PersonaCore.userAgentLabel(resolved.userAgent), resolved.userAgent.source]);
  if (resolved.locale) items.push(['Locale', resolved.locale.value, resolved.locale.source]);
  const describe = (e) => (e.operation === 'remove' ? `${e.name} (remove)` : `${e.name}: ${e.value}${e.operation === 'append' ? ' (append)' : ''}`);
  for (const e of resolved.requestHeaders) items.push(['Request', describe(e), e.source]);
  for (const e of resolved.responseHeaders) items.push(['Response', describe(e), e.source]);
  for (const c of resolved.cookies) items.push(['Cookie', c.action === 'unset' ? `${c.name} (unset)` : `${c.name}=${c.value}`, c.source]);
  const list = items.length
    ? h('dl', {}, items.flatMap(([label, value, source]) => [h('dt', {}, label), h('dd', {}, value, ' ', h('span', { className: 'source' }, `— ${source}`))]))
    : h('p', { className: 'empty' }, 'No overrides on this page.');
  return [
    list,
    h('p', { className: 'note' }, 'Header changes apply to the next request. User agent, locale, and cookie overrides in JavaScript apply after a reload.'),
  ];
}

function ruleFields(rule) {
  const errorEl = h('p', { className: 'error', hidden: true });
  const mismatch = !PersonaCore.ruleMatches(rule, tab.url) && h('p', { className: 'note' }, 'This pattern does not match the current page.');
  return [
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
          renderTabs();
        },
      }),
      'Pattern',
      h('input', {
        spellcheck: false,
        value: rule.pattern,
        onchange: async (e) => {
          const pattern = e.target.value.trim();
          const problem = await patternProblem(pattern);
          errorEl.textContent = problem ?? '';
          errorEl.hidden = !problem;
          if (problem) return;
          rule.pattern = pattern;
          save(saveRule(rule));
          renderTabs();
          renderPanel();
        },
      }),
    ),
    errorEl,
    mismatch,
  ];
}

function renderPanel() {
  editor = null;
  if (active === 'page') {
    panelEl.replaceChildren(...effectivePanel());
    return;
  }
  const id = active;
  editor = createProfileEditor({
    profile: layerOf(id).profile,
    favorites: state.settings.favorites,
    baseline: baselineFor(id),
    chromeMajor,
    onChange: () => save(saveLayer(id)),
    onFavoritesChange: (favorites) => {
      state.settings.favorites = favorites;
      save(saveSettings(state.settings));
      editor.update({ favorites });
    },
  });
  const intro =
    id === 'global'
      ? h('p', { className: 'note' }, 'Applies to every page and takes priority over URL rules.')
      : ruleFields(layerOf(id));
  panelEl.replaceChildren(...[intro].flat().filter(Boolean), editor.element);
}

function refreshPanel() {
  if (editor) editor.update({ baseline: baselineFor(active) });
  else renderPanel();
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  [state, jar] = await Promise.all([loadState(), readCookieJar(tab.url)]);
  for (const rule of state.rules) if (PersonaCore.ruleMatches(rule, tab.url)) shownRuleIds.add(rule.id);

  enabledInput.checked = state.settings.enabled;
  enabledInput.addEventListener('change', () => {
    state.settings.enabled = enabledInput.checked;
    save(saveSettings(state.settings));
    refreshPanel();
  });

  renderTabs();
  renderPanel();
}

document.getElementById('reload').addEventListener('click', () => {
  chrome.tabs.reload(tab.id);
  window.close();
});

document.getElementById('openOptions').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
