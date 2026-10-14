const chromeMajor = PersonaCore.chromeMajorVersion(navigator.userAgent);
const enabledInput = document.getElementById('enabled');
const rulesEl = document.getElementById('rules');
const favoritesEl = document.getElementById('favorites');
const statusEl = document.getElementById('status');

// Rules are edited without a page, so the original values shown are the browser's own.
const baseline = computeBaseline([], browserDefaults());

let state;
let editors = [];
const openRuleIds = new Set();

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

function saveOrder() {
  state.settings.ruleOrder = state.rules.map((rule) => rule.id);
  save(saveSettings(state.settings));
}

function setFavorites(favorites) {
  state.settings.favorites = favorites;
  save(saveSettings(state.settings));
  for (const editor of editors) editor.update({ favorites });
  renderFavorites();
}

async function patternProblem(pattern) {
  const error = PersonaCore.patternError(pattern);
  if (error) return error;
  const { isSupported, reason } = await chrome.declarativeNetRequest.isRegexSupported({ regex: pattern, isCaseSensitive: false });
  return isSupported ? null : `Not supported by Chrome's regex engine (${reason})`;
}

function moveRule(index, delta) {
  const [rule] = state.rules.splice(index, 1);
  state.rules.splice(index + delta, 0, rule);
  saveOrder();
  renderRules();
}

async function deleteRuleAt(index) {
  const rule = state.rules[index];
  if (!confirm(`Delete the rule "${rule.name || rule.pattern || 'Untitled'}"?`)) return;
  state.rules.splice(index, 1);
  saveOrder();
  save(removeRule(rule.id));
  renderRules();
}

function ruleCard(rule, index) {
  const patternErrorEl = h('p', { className: 'error' });
  const showPatternError = (message) => {
    patternErrorEl.textContent = message ?? '';
    patternErrorEl.hidden = !message;
  };
  showPatternError(rule.pattern ? null : 'Pattern is empty, so the rule matches nothing.');

  const editor = createProfileEditor({
    profile: rule.profile,
    favorites: state.settings.favorites,
    baseline,
    chromeMajor,
    onChange: () => save(saveRule(rule)),
    onFavoritesChange: setFavorites,
  });
  editors.push(editor);

  const details = h('details', { open: openRuleIds.has(rule.id) }, h('summary', {}, 'Overrides'), editor.element);
  details.addEventListener('toggle', () => (details.open ? openRuleIds.add(rule.id) : openRuleIds.delete(rule.id)));

  return h(
    'div',
    { className: 'card' },
    h(
      'div',
      { className: 'row rule-head' },
      h('input', {
        type: 'checkbox',
        title: 'Enabled',
        checked: rule.enabled,
        onchange: (e) => {
          rule.enabled = e.target.checked;
          save(saveRule(rule));
        },
      }),
      h('input', {
        className: 'name',
        placeholder: 'Name',
        value: rule.name,
        onchange: (e) => {
          rule.name = e.target.value.trim();
          save(saveRule(rule));
        },
      }),
      h('input', {
        spellcheck: false,
        placeholder: 'URL pattern, e.g. ^https://example\\.com/',
        value: rule.pattern,
        onchange: async (e) => {
          const pattern = e.target.value.trim();
          const problem = await patternProblem(pattern);
          showPatternError(problem);
          if (problem) return;
          rule.pattern = pattern;
          save(saveRule(rule));
        },
      }),
      h('button', { type: 'button', title: 'Move up', textContent: '↑', disabled: index === 0, onclick: () => moveRule(index, -1) }),
      h('button', { type: 'button', title: 'Move down', textContent: '↓', disabled: index === state.rules.length - 1, onclick: () => moveRule(index, 1) }),
      h('button', { type: 'button', title: 'Delete', textContent: 'Delete', onclick: () => deleteRuleAt(index) }),
    ),
    patternErrorEl,
    details,
  );
}

function renderRules() {
  editors = [];
  rulesEl.replaceChildren(...(state.rules.length ? state.rules.map(ruleCard) : [h('p', { className: 'empty' }, 'No URL rules yet.')]));
}

function renderFavorites() {
  const { userAgents, locales } = state.settings.favorites;
  const list = (items, label, remove) =>
    items.length
      ? h(
          'ul',
          {},
          items.map((item, i) =>
            h('li', {}, h('button', { type: 'button', className: 'remove', title: 'Remove', textContent: '✕', onclick: () => remove(i) }), label(item)),
          ),
        )
      : h('p', { className: 'empty' }, 'None');
  favoritesEl.replaceChildren(
    h('h3', {}, 'User agents'),
    list(userAgents, PersonaCore.userAgentLabel, (i) => setFavorites({ ...state.settings.favorites, userAgents: userAgents.filter((_, j) => j !== i) })),
    h('h3', {}, 'Locales'),
    list(locales, localeLabel, (i) => setFavorites({ ...state.settings.favorites, locales: locales.filter((_, j) => j !== i) })),
  );
}

function render() {
  enabledInput.checked = state.settings.enabled;
  renderRules();
  renderFavorites();
}

enabledInput.addEventListener('change', () => {
  state.settings.enabled = enabledInput.checked;
  save(saveSettings(state.settings));
});

document.getElementById('addRule').addEventListener('click', () => {
  const rule = { id: crypto.randomUUID(), name: '', enabled: true, pattern: '', profile: PersonaCore.defaultProfile() };
  state.rules.push(rule);
  openRuleIds.add(rule.id);
  save(saveRule(rule));
  saveOrder();
  renderRules();
});

// Changes made elsewhere (e.g. the popup) are picked up only while this page is not focused, so typing here is never interrupted.
chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'sync' || document.hasFocus()) return;
  state = await loadState();
  render();
});

loadState().then((loaded) => {
  state = loaded;
  render();
});
