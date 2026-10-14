const { USER_AGENT_PRESETS, LOCALE_PRESETS } = PersonaPresets;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const BROWSER_DEFAULT = 'Browser default';

function browserDefaults(cookies = null) {
  return { userAgent: navigator.userAgent, languages: [...navigator.languages], cookies };
}

// Values each field would take without the edited layer: the highest of `lowerLayers`, else the browser's own.
function computeBaseline(lowerLayers, browser) {
  const resolved = PersonaCore.resolveLayers(lowerLayers);
  const describe = (e) => (e.operation === 'remove' ? 'removed' : `${e.operation}: ${e.value}`);
  const cookies = new Map((browser.cookies ?? []).map((c) => [c.name, { label: c.value, source: 'Cookie jar' }]));
  for (const c of resolved.cookies) cookies.set(c.name, { label: c.action === 'unset' ? 'unset' : c.value, source: c.source });
  return {
    userAgent: resolved.userAgent
      ? { label: PersonaCore.userAgentLabel(resolved.userAgent), source: resolved.userAgent.source }
      : { label: browser.userAgent, source: BROWSER_DEFAULT },
    locale: resolved.locale
      ? { label: resolved.locale.value, source: resolved.locale.source }
      : { label: browser.languages.join(', '), source: BROWSER_DEFAULT },
    requestHeaders: new Map(resolved.requestHeaders.map((e) => [e.name.toLowerCase(), { label: describe(e), source: e.source }])),
    responseHeaders: new Map(resolved.responseHeaders.map((e) => [e.name.toLowerCase(), { label: describe(e), source: e.source }])),
    cookies,
    hasCookieJar: browser.cookies !== null,
  };
}

function originalLine(original) {
  return h('p', { className: 'original', title: original.label }, 'Original: ', h('span', { className: 'value' }, original.label), ` — ${original.source}`);
}

function localeLabel(locale) {
  try {
    return `${locale} — ${new Intl.DisplayNames([locale], { type: 'language' }).of(locale)}`;
  } catch {
    return locale;
  }
}

// Edits `profile` in place and reports every change through `onChange`.
function createProfileEditor({ profile, favorites, baseline, chromeMajor, onChange, onFavoritesChange }) {
  const element = h('div', { className: 'editor' });
  let localeCustom = false;
  const changed = () => onChange(profile);

  function fieldSection(title, field, body) {
    const toggle = h('input', {
      type: 'checkbox',
      checked: field.enabled,
      onchange: (e) => {
        field.enabled = e.target.checked;
        section.classList.toggle('disabled', !field.enabled);
        changed();
      },
    });
    const section = h('section', { className: `field${field.enabled ? '' : ' disabled'}` }, h('label', { className: 'field-title' }, toggle, title), body);
    return section;
  }

  function starButton(isFavorite, toggle, disabled) {
    return h('button', {
      type: 'button',
      className: 'star',
      title: isFavorite ? 'Remove from favorites' : 'Add to favorites',
      textContent: isFavorite ? '★' : '☆',
      disabled,
      onclick: toggle,
    });
  }

  function userAgentSection() {
    const field = profile.userAgent;
    const favIndex = favorites.userAgents.findIndex((f) => PersonaCore.sameUserAgentChoice(f, field));
    const customFavIndex = field.presetId ? -1 : favorites.userAgents.findIndex((f) => !f.presetId && f.value === field.value);
    const selected = field.presetId ? `preset:${field.presetId}` : customFavIndex !== -1 ? `fav:${customFavIndex}` : 'custom';
    const favOptions = favorites.userAgents.map((f, i) =>
      h('option', { value: f.presetId ? `preset:${f.presetId}` : `fav:${i}`, textContent: PersonaCore.userAgentLabel(f) }),
    );
    const select = h(
      'select',
      {
        onchange: (e) => {
          const [kind, key] = e.target.value.split(/:(.*)/s);
          if (kind === 'preset') Object.assign(field, { presetId: key, value: '' });
          else if (kind === 'fav') Object.assign(field, { presetId: null, value: favorites.userAgents[Number(key)].value });
          else if (field.presetId) Object.assign(field, { presetId: null, value: PersonaCore.resolveUserAgent(field, chromeMajor).value });
          changed();
          render();
        },
      },
      favOptions.length > 0 && h('optgroup', { label: 'Favorites' }, favOptions),
      h('optgroup', { label: 'Presets' }, USER_AGENT_PRESETS.map((p) => h('option', { value: `preset:${p.id}`, textContent: p.label }))),
      h('option', { value: 'custom', textContent: 'Custom…' }),
    );
    select.value = selected;
    const star = starButton(
      favIndex !== -1,
      () => {
        const next = favorites.userAgents.filter((_, i) => i !== favIndex);
        if (favIndex === -1) next.push({ presetId: field.presetId, value: field.presetId ? '' : field.value });
        onFavoritesChange({ ...favorites, userAgents: next });
      },
      !field.presetId && !field.value,
    );
    const custom =
      !field.presetId &&
      h('textarea', {
        rows: 3,
        spellcheck: false,
        value: field.value,
        placeholder: 'User agent string',
        onchange: (e) => {
          field.value = e.target.value.trim();
          changed();
          render();
        },
      });
    const preview = field.presetId && h('p', { className: 'preview' }, PersonaCore.resolveUserAgent(field, chromeMajor).value);
    return fieldSection('User agent', field, [h('div', { className: 'row' }, select, star), custom, preview, originalLine(baseline.userAgent)]);
  }

  function localeSection() {
    const field = profile.locale;
    const known = [...favorites.locales, ...LOCALE_PRESETS];
    const favIndex = favorites.locales.indexOf(field.value);
    const select = h(
      'select',
      {
        onchange: (e) => {
          localeCustom = e.target.value === 'custom';
          if (!localeCustom) field.value = e.target.value;
          changed();
          render();
          if (localeCustom) element.querySelector('.locale-custom')?.focus();
        },
      },
      favorites.locales.length > 0 && h('optgroup', { label: 'Favorites' }, favorites.locales.map((l) => h('option', { value: l, textContent: localeLabel(l) }))),
      h('optgroup', { label: 'Presets' }, LOCALE_PRESETS.map((l) => h('option', { value: l, textContent: localeLabel(l) }))),
      h('option', { value: 'custom', textContent: 'Custom…' }),
    );
    select.value = localeCustom || !known.includes(field.value) ? 'custom' : field.value;
    const valid = PersonaCore.isValidLocale(field.value);
    const star = starButton(
      favIndex !== -1,
      () => {
        const next = favIndex === -1 ? [...favorites.locales, field.value] : favorites.locales.filter((l) => l !== field.value);
        onFavoritesChange({ ...favorites, locales: next });
      },
      !valid,
    );
    const custom =
      select.value === 'custom' &&
      h('input', {
        className: 'locale-custom',
        spellcheck: false,
        value: field.value,
        placeholder: 'BCP 47 tag, e.g. ja-JP',
        onchange: (e) => {
          field.value = e.target.value.trim();
          changed();
          render();
        },
      });
    const error = !valid && h('p', { className: 'error' }, 'Invalid locale tag');
    return fieldSection('Locale', field, [h('div', { className: 'row' }, select, star, custom), error, originalLine(baseline.locale)]);
  }

  function listSection(title, list, makeEntry, renderRow) {
    return h(
      'section',
      { className: 'field' },
      h('div', { className: 'field-title' }, title),
      list.map((entry, i) =>
        renderRow(entry, () => {
          list.splice(i, 1);
          changed();
          render();
        }),
      ),
      h('button', {
        type: 'button',
        className: 'add',
        textContent: '+ Add',
        onclick: () => {
          list.push(makeEntry());
          render();
        },
      }),
    );
  }

  function entryRow(entry, remove, { kindKey, kinds, valueless, error, original }) {
    const errorEl = h('p', { className: 'error' });
    const originalEl = h('div');
    const refresh = () => {
      const message = entry.name ? error(entry) : null;
      errorEl.textContent = message ?? '';
      errorEl.hidden = !message;
      originalEl.replaceChildren(entry.name ? originalLine(original(entry)) : '');
    };
    const value = h('input', {
      className: 'value-input',
      spellcheck: false,
      placeholder: 'Value',
      value: entry.value ?? '',
      hidden: entry[kindKey] === valueless,
      onchange: (e) => {
        entry.value = e.target.value;
        changed();
        refresh();
      },
    });
    const kindSelect = h(
      'select',
      {
        onchange: (e) => {
          entry[kindKey] = e.target.value;
          value.hidden = entry[kindKey] === valueless;
          changed();
          refresh();
        },
      },
      kinds.map((k) => h('option', { value: k, textContent: k })),
    );
    kindSelect.value = entry[kindKey];
    const row = h(
      'div',
      { className: `entry${entry.enabled ? '' : ' disabled'}` },
      h(
        'div',
        { className: 'row' },
        h('input', {
          type: 'checkbox',
          checked: entry.enabled,
          onchange: (e) => {
            entry.enabled = e.target.checked;
            row.classList.toggle('disabled', !entry.enabled);
            changed();
          },
        }),
        kindSelect,
        h('input', {
          className: 'name-input',
          spellcheck: false,
          placeholder: 'Name',
          value: entry.name,
          onchange: (e) => {
            entry.name = e.target.value.trim();
            changed();
            refresh();
          },
        }),
        value,
        h('button', { type: 'button', className: 'remove', title: 'Remove', textContent: '✕', onclick: remove }),
      ),
      errorEl,
      originalEl,
    );
    refresh();
    return row;
  }

  function headerSection(title, key, direction) {
    const notModified = { label: 'not modified', source: BROWSER_DEFAULT };
    return listSection(
      title,
      profile[key],
      () => ({ enabled: true, operation: 'set', name: '', value: '' }),
      (entry, remove) =>
        entryRow(entry, remove, {
          kindKey: 'operation',
          kinds: ['set', 'append', 'remove'],
          valueless: 'remove',
          error: (e) => PersonaCore.headerEntryError(e, direction),
          original: (e) => baseline[key].get(e.name.toLowerCase()) ?? notModified,
        }),
    );
  }

  function cookieSection() {
    const missing = baseline.hasCookieJar ? { label: 'not set', source: 'Cookie jar' } : { label: 'depends on the page', source: 'Cookie jar' };
    return listSection(
      'Cookies',
      profile.cookies,
      () => ({ enabled: true, action: 'override', name: '', value: '' }),
      (entry, remove) =>
        entryRow(entry, remove, {
          kindKey: 'action',
          kinds: ['override', 'unset'],
          valueless: 'unset',
          error: PersonaCore.cookieEntryError,
          original: (e) => baseline.cookies.get(e.name) ?? missing,
        }),
    );
  }

  function render() {
    element.replaceChildren(
      userAgentSection(),
      localeSection(),
      headerSection('Request headers', 'requestHeaders', 'request'),
      headerSection('Response headers', 'responseHeaders', 'response'),
      cookieSection(),
    );
  }

  render();
  return {
    element,
    update(next) {
      if (next.favorites) favorites = next.favorites;
      if (next.baseline) baseline = next.baseline;
      render();
    },
  };
}
