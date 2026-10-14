(function (root) {
  const { USER_AGENT_PRESETS, LOCALE_PRESETS } = root.PersonaPresets ?? require('./presets.js');

  // Listing every type is required: a DNR condition without resource types skips main_frame.
  const ALL_RESOURCE_TYPES = [
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'webtransport',
    'webbundle',
    'other',
  ];

  // Request headers DNR accepts the `append` operation for.
  const APPENDABLE_REQUEST_HEADERS = new Set([
    'accept',
    'accept-encoding',
    'accept-language',
    'access-control-request-headers',
    'cache-control',
    'connection',
    'content-language',
    'cookie',
    'forwarded',
    'if-match',
    'if-none-match',
    'keep-alive',
    'range',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'user-agent',
    'via',
    'want-digest',
    'x-forwarded-for',
  ]);

  const HIGH_ENTROPY_CLIENT_HINTS = [
    'sec-ch-ua-arch',
    'sec-ch-ua-bitness',
    'sec-ch-ua-form-factors',
    'sec-ch-ua-full-version',
    'sec-ch-ua-full-version-list',
    'sec-ch-ua-model',
    'sec-ch-ua-platform-version',
    'sec-ch-ua-wow64',
  ];

  const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

  function defaultProfile() {
    return {
      userAgent: { enabled: false, presetId: USER_AGENT_PRESETS[0].id, value: '' },
      locale: { enabled: false, value: LOCALE_PRESETS[0] },
      requestHeaders: [],
      responseHeaders: [],
      cookies: [],
    };
  }

  function normalizeProfile(stored) {
    const base = defaultProfile();
    return {
      userAgent: { ...base.userAgent, ...stored?.userAgent },
      locale: { ...base.locale, ...stored?.locale },
      requestHeaders: stored?.requestHeaders ?? [],
      responseHeaders: stored?.responseHeaders ?? [],
      cookies: stored?.cookies ?? [],
    };
  }

  function normalizeState({ settings, global, rules } = {}) {
    return {
      settings: {
        enabled: settings?.enabled ?? true,
        favorites: { userAgents: [], locales: [], ...settings?.favorites },
        ruleOrder: settings?.ruleOrder ?? [],
      },
      global: { enabled: global?.enabled ?? true, profile: normalizeProfile(global?.profile) },
      rules: (rules ?? []).map((rule) => ({
        id: rule.id,
        name: rule.name ?? '',
        enabled: rule.enabled ?? true,
        pattern: rule.pattern ?? '',
        profile: normalizeProfile(rule.profile),
      })),
    };
  }

  function chromeMajorVersion(userAgent) {
    return userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '0';
  }

  function resolveUserAgent(field, chromeMajor) {
    const preset = field.presetId && USER_AGENT_PRESETS.find((p) => p.id === field.presetId);
    if (!preset) return { value: field.value, platform: null, clientHints: null };
    const fill = (s) => s.replaceAll('{major}', chromeMajor);
    return {
      value: fill(preset.value),
      platform: preset.platform,
      clientHints: preset.clientHints && {
        ...preset.clientHints,
        brands: preset.clientHints.brands.map((b) => ({ brand: b.brand, version: fill(b.version) })),
      },
    };
  }

  function userAgentLabel(field) {
    const preset = field.presetId && USER_AGENT_PRESETS.find((p) => p.id === field.presetId);
    return preset ? preset.label : field.value;
  }

  function sameUserAgentChoice(a, b) {
    return a.presetId || b.presetId ? a.presetId === b.presetId : a.value === b.value;
  }

  function isValidLocale(locale) {
    try {
      return Intl.getCanonicalLocales(locale).length === 1;
    } catch {
      return false;
    }
  }

  function navigatorLanguages(locale) {
    const language = locale.split('-')[0];
    return language === locale ? [locale] : [locale, language];
  }

  function acceptLanguage(locale) {
    return navigatorLanguages(locale)
      .map((tag, i) => (i === 0 ? tag : `${tag};q=0.9`))
      .join(',');
  }

  function headerEntryError(entry, direction) {
    if (!TOKEN.test(entry.name)) return 'Invalid header name';
    if (direction === 'request' && entry.operation === 'append' && !APPENDABLE_REQUEST_HEADERS.has(entry.name.toLowerCase())) {
      return 'Chrome cannot append to this request header';
    }
    if (entry.operation !== 'remove' && /[\r\n]/.test(entry.value)) return 'Value contains a line break';
    return null;
  }

  function cookieEntryError(entry) {
    if (!TOKEN.test(entry.name)) return 'Invalid cookie name';
    if (entry.action === 'override' && /[;\r\n]/.test(entry.value)) return 'Value contains ";" or a line break';
    return null;
  }

  // Patterns are matched case-insensitively, the same way DNR evaluates regexFilter by default.
  const compiled = new Map();
  function compilePattern(pattern) {
    if (!compiled.has(pattern)) {
      let regex = null;
      try {
        if (pattern) regex = new RegExp(pattern, 'i');
      } catch {}
      compiled.set(pattern, regex);
    }
    return compiled.get(pattern);
  }

  function patternError(pattern) {
    if (!pattern) return 'Pattern is empty';
    try {
      new RegExp(pattern, 'i');
      return null;
    } catch (e) {
      return e.message;
    }
  }

  function ruleMatches(rule, url) {
    return Boolean(url) && compilePattern(rule.pattern)?.test(url) === true;
  }

  // Layers are ordered from the highest priority: the global layer, then matching rules in list order.
  function activeLayers(state, pageUrl) {
    if (!state.settings.enabled) return [];
    const layers = [];
    if (state.global.enabled) layers.push({ source: 'Global', profile: state.global.profile });
    for (const rule of state.rules) {
      if (rule.enabled && ruleMatches(rule, pageUrl)) layers.push({ source: `Rule: ${rule.name || rule.pattern}`, profile: rule.profile });
    }
    return layers;
  }

  // Resolves each field to the value of the highest layer that sets it, tagged with that layer's source.
  function resolveLayers(layers) {
    const result = { userAgent: null, locale: null, requestHeaders: [], responseHeaders: [], cookies: [] };
    const firstByName = (list, entry, key, source) => {
      if (!list.some((e) => key(e) === key(entry))) list.push({ ...entry, source });
    };
    for (const { source, profile } of layers) {
      const { userAgent, locale } = profile;
      if (!result.userAgent && userAgent.enabled && (userAgent.presetId || userAgent.value)) {
        result.userAgent = { ...userAgent, source };
      }
      if (!result.locale && locale.enabled && isValidLocale(locale.value)) result.locale = { ...locale, source };
      for (const e of profile.requestHeaders) {
        if (e.enabled && !headerEntryError(e, 'request')) firstByName(result.requestHeaders, e, (h) => h.name.toLowerCase(), source);
      }
      for (const e of profile.responseHeaders) {
        if (e.enabled && !headerEntryError(e, 'response')) firstByName(result.responseHeaders, e, (h) => h.name.toLowerCase(), source);
      }
      for (const e of profile.cookies) {
        if (e.enabled && !cookieEntryError(e)) firstByName(result.cookies, e, (c) => c.name, source);
      }
    }
    return result;
  }

  function clientHintHeaders(clientHints) {
    const remove = (header) => ({ header, operation: 'remove' });
    if (!clientHints) return ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', ...HIGH_ENTROPY_CLIENT_HINTS].map(remove);
    return [
      { header: 'sec-ch-ua', operation: 'set', value: clientHints.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ') },
      { header: 'sec-ch-ua-mobile', operation: 'set', value: clientHints.mobile ? '?1' : '?0' },
      { header: 'sec-ch-ua-platform', operation: 'set', value: `"${clientHints.platform}"` },
      ...HIGH_ENTROPY_CLIENT_HINTS.map(remove),
    ];
  }

  function headerInfo(entry) {
    const info = { header: entry.name.toLowerCase(), operation: entry.operation };
    if (entry.operation !== 'remove') info.value = entry.value;
    return info;
  }

  function modifyHeadersAction(profile, chromeMajor) {
    const requestHeaders = [];
    const responseHeaders = [];
    if (profile.userAgent.enabled && (profile.userAgent.presetId || profile.userAgent.value)) {
      const ua = resolveUserAgent(profile.userAgent, chromeMajor);
      requestHeaders.push({ header: 'user-agent', operation: 'set', value: ua.value }, ...clientHintHeaders(ua.clientHints));
    }
    if (profile.locale.enabled && isValidLocale(profile.locale.value)) {
      requestHeaders.push({ header: 'accept-language', operation: 'set', value: acceptLanguage(profile.locale.value) });
    }
    for (const e of profile.requestHeaders) if (e.enabled && !headerEntryError(e, 'request')) requestHeaders.push(headerInfo(e));
    for (const e of profile.responseHeaders) if (e.enabled && !headerEntryError(e, 'response')) responseHeaders.push(headerInfo(e));
    // DNR rejects a rule that modifies the same header twice, so the first entry for a header wins.
    const dedupe = (list) => list.filter((h, i) => list.findIndex((o) => o.header === h.header) === i);
    const action = { type: 'modifyHeaders' };
    if (requestHeaders.length) action.requestHeaders = dedupe(requestHeaders);
    if (responseHeaders.length) action.responseHeaders = dedupe(responseHeaders);
    return requestHeaders.length || responseHeaders.length ? action : null;
  }

  function parseCookieHeader(header) {
    return header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf('=');
        return i === -1 ? { name: '', value: part } : { name: part.slice(0, i), value: part.slice(i + 1) };
      });
  }

  function serializeCookies(pairs) {
    return pairs.map((p) => (p.name ? `${p.name}=${p.value}` : p.value)).join('; ');
  }

  // Overridden cookies keep their original position; overrides for cookies the page does not have go last.
  function mergeCookies(pairs, overrides) {
    const byName = new Map(overrides.map((o) => [o.name, o]));
    const written = new Set();
    const result = [];
    for (const pair of pairs) {
      const override = byName.get(pair.name);
      if (!override) {
        result.push(pair);
      } else if (override.action === 'override' && !written.has(pair.name)) {
        written.add(pair.name);
        result.push({ name: pair.name, value: override.value });
      }
    }
    for (const o of overrides) {
      if (o.action === 'override' && !written.has(o.name)) result.push({ name: o.name, value: o.value });
    }
    return result;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // `tabs` lists the page URL of every tab and, for tabs with cookie overrides, the synthesized Cookie header.
  function buildDnrRules(state, tabs, chromeMajor) {
    if (!state.settings.enabled) return [];
    const result = [];
    const add = (priority, condition, action) => result.push({ id: result.length + 1, priority, condition, action });
    const rules = state.rules.filter((rule) => rule.enabled && !patternError(rule.pattern));
    const globalPriority = rules.length + 1;

    const globalAction = state.global.enabled && modifyHeadersAction(state.global.profile, chromeMajor);
    if (globalAction) add(globalPriority, { resourceTypes: ALL_RESOURCE_TYPES }, globalAction);

    rules.forEach((rule, i) => {
      const action = modifyHeadersAction(rule.profile, chromeMajor);
      if (!action) return;
      const priority = rules.length - i;
      add(priority, { regexFilter: rule.pattern, resourceTypes: ['main_frame'] }, action);
      const tabIds = tabs.filter((tab) => ruleMatches(rule, tab.url)).map((tab) => tab.tabId);
      if (tabIds.length) add(priority, { tabIds, excludedResourceTypes: ['main_frame'] }, action);
    });

    for (const tab of tabs) {
      if (!tab.cookie) continue;
      const header = tab.cookie.value
        ? { header: 'cookie', operation: 'set', value: tab.cookie.value }
        : { header: 'cookie', operation: 'remove' };
      add(
        globalPriority + 1,
        { tabIds: [tab.tabId], regexFilter: `^[a-z]+://${escapeRegExp(tab.cookie.host)}(:\\d+)?/`, resourceTypes: ALL_RESOURCE_TYPES },
        { type: 'modifyHeaders', requestHeaders: [header] },
      );
    }
    return result;
  }

  const api = {
    defaultProfile,
    normalizeProfile,
    normalizeState,
    chromeMajorVersion,
    resolveUserAgent,
    userAgentLabel,
    sameUserAgentChoice,
    isValidLocale,
    navigatorLanguages,
    acceptLanguage,
    headerEntryError,
    cookieEntryError,
    patternError,
    ruleMatches,
    activeLayers,
    resolveLayers,
    modifyHeadersAction,
    parseCookieHeader,
    serializeCookies,
    mergeCookies,
    buildDnrRules,
  };
  root.PersonaCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
