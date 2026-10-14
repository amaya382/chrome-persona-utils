const chromeMajor = PersonaCore.chromeMajorVersion(navigator.userAgent);
const enabledInput = document.getElementById('enabled');
const globalEnabledInput = document.getElementById('globalEnabled');
const effectiveEl = document.getElementById('effective');
const rulesEl = document.getElementById('rules');
const statusEl = document.getElementById('status');

let state;
let tab;
let jar;
let editor;

function showError(error) {
  statusEl.textContent = `Failed to save: ${error.message}`;
  statusEl.hidden = false;
}

async function readCookieJar(url) {
  if (!/^https?:/.test(url ?? '')) return null;
  const cookies = await chrome.cookies.getAll({ url });
  cookies.sort((a, b) => b.path.length - a.path.length);
  return cookies.map(({ name, value }) => ({ name, value }));
}

function globalBaseline() {
  const withoutGlobal = { ...state, global: { ...state.global, enabled: false } };
  return computeBaseline(PersonaCore.activeLayers(withoutGlobal, tab.url), browserDefaults(jar));
}

function renderEffective() {
  const resolved = PersonaCore.resolveLayers(PersonaCore.activeLayers(state, tab.url));
  const items = [];
  if (resolved.userAgent) items.push(['User agent', PersonaCore.userAgentLabel(resolved.userAgent), resolved.userAgent.source]);
  if (resolved.locale) items.push(['Locale', resolved.locale.value, resolved.locale.source]);
  const describe = (e) => (e.operation === 'remove' ? `${e.name} (remove)` : `${e.name}: ${e.value}${e.operation === 'append' ? ' (append)' : ''}`);
  for (const e of resolved.requestHeaders) items.push(['Request', describe(e), e.source]);
  for (const e of resolved.responseHeaders) items.push(['Response', describe(e), e.source]);
  for (const c of resolved.cookies) items.push(['Cookie', c.action === 'unset' ? `${c.name} (unset)` : `${c.name}=${c.value}`, c.source]);
  if (items.length === 0) {
    effectiveEl.replaceChildren(h('dd', { className: 'empty' }, 'No overrides'));
    return;
  }
  effectiveEl.replaceChildren(...items.flatMap(([label, value, source]) => [h('dt', {}, label), h('dd', {}, value, ' ', h('span', { className: 'source' }, `— ${source}`))]));
}

function renderRules() {
  const matching = state.rules.filter((rule) => PersonaCore.ruleMatches(rule, tab.url));
  if (matching.length === 0) {
    rulesEl.replaceChildren(h('li', { className: 'empty' }, 'No URL rules match this page.'));
    return;
  }
  rulesEl.replaceChildren(
    ...matching.map((rule) =>
      h(
        'li',
        {},
        h(
          'label',
          {},
          h('input', {
            type: 'checkbox',
            checked: rule.enabled,
            onchange: (e) => {
              rule.enabled = e.target.checked;
              saveRule(rule).catch(showError);
              renderEffective();
              editor.update({ baseline: globalBaseline() });
            },
          }),
          rule.name || rule.pattern,
        ),
      ),
    ),
  );
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  [state, jar] = await Promise.all([loadState(), readCookieJar(tab.url)]);

  enabledInput.checked = state.settings.enabled;
  enabledInput.addEventListener('change', () => {
    state.settings.enabled = enabledInput.checked;
    saveSettings(state.settings).catch(showError);
    renderEffective();
    editor.update({ baseline: globalBaseline() });
  });
  globalEnabledInput.checked = state.global.enabled;
  globalEnabledInput.addEventListener('change', () => {
    state.global.enabled = globalEnabledInput.checked;
    saveGlobal(state.global).catch(showError);
    renderEffective();
  });

  editor = createProfileEditor({
    profile: state.global.profile,
    favorites: state.settings.favorites,
    baseline: globalBaseline(),
    chromeMajor,
    onChange: () => {
      saveGlobal(state.global).catch(showError);
      renderEffective();
    },
    onFavoritesChange: (favorites) => {
      state.settings.favorites = favorites;
      saveSettings(state.settings).catch(showError);
      editor.update({ favorites });
    },
  });
  document.getElementById('globalEditor').append(editor.element);

  renderEffective();
  renderRules();
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
