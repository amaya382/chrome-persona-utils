importScripts('presets.js', 'core.js', 'storage.js', 'inject.js');

const { activeLayers, resolveLayers, resolveUserAgent, navigatorLanguages, chromeMajorVersion } = PersonaCore;
const { parseCookieHeader, serializeCookies, mergeCookies, buildDnrRules } = PersonaCore;

const chromeMajor = chromeMajorVersion(navigator.userAgent);

// Cached so that injection on navigation does not wait for a storage read.
let statePromise = loadState();

// URLs a tab is navigating to, so the Cookie header for the next page can be prepared before it commits.
const pendingUrls = new Map();

// Hosts that currently get a synthesized Cookie header, so unrelated cookie changes do not trigger a sync.
let cookieHosts = new Set();

function hostOf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return /^(https?|wss?):$/.test(protocol) ? hostname : null;
  } catch {
    return null;
  }
}

async function cookieHeaderFor(url, overrides) {
  const host = hostOf(url);
  if (!host || overrides.length === 0) return null;
  const jar = await chrome.cookies.getAll({ url });
  // Chrome sends cookies with longer paths first.
  jar.sort((a, b) => b.path.length - a.path.length);
  const merged = mergeCookies(jar.map(({ name, value }) => ({ name, value })), overrides);
  return { host, value: serializeCookies(merged) };
}

async function sync() {
  const state = await statePromise;
  const tabs = await chrome.tabs.query({});
  const entries = await Promise.all(
    tabs.map(async (tab) => {
      const layers = activeLayers(state, tab.url);
      const cookieUrl = pendingUrls.get(tab.id) ?? tab.url;
      const { cookies } = resolveLayers(activeLayers(state, cookieUrl));
      const cookie = await cookieHeaderFor(cookieUrl, cookies).catch(() => null);
      chrome.action.setBadgeText({ tabId: tab.id, text: layers.length ? String(layers.length) : '' }).catch(() => {});
      return { tabId: tab.id, url: tab.url, cookie };
    }),
  );
  cookieHosts = new Set(entries.filter((e) => e.cookie).map((e) => e.cookie.host));
  const addRules = buildDnrRules(state, entries, chromeMajor);
  const removeRuleIds = (await chrome.declarativeNetRequest.getSessionRules()).map((rule) => rule.id);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
  } catch (error) {
    // The update is atomic, so fall back to adding rules one by one to keep every valid rule.
    console.warn('Persona Utils: bulk rule update failed', error);
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
    for (const rule of addRules) {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] }).catch((e) => console.warn('Persona Utils: rule rejected', rule, e));
    }
  }
}

let syncQueue = Promise.resolve();
let syncTimer;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncQueue = syncQueue.then(sync).catch((error) => console.error('Persona Utils: sync failed', error));
  }, 50);
}

async function injectionConfig(pageUrl, frameUrl) {
  const state = await statePromise;
  const effective = resolveLayers(activeLayers(state, pageUrl));
  const frameHost = hostOf(frameUrl);
  const config = {
    userAgent: effective.userAgent && resolveUserAgent(effective.userAgent, chromeMajor),
    languages: effective.locale && navigatorLanguages(effective.locale.value),
    cookies: frameHost && frameHost === hostOf(pageUrl) ? effective.cookies.map(({ name, action, value }) => ({ name, action, value })) : [],
  };
  return config.userAgent || config.languages || config.cookies.length ? config : null;
}

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  pendingUrls.set(tabId, url);
  scheduleSync();
});

chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId === 0) {
    pendingUrls.delete(tabId);
    scheduleSync();
  }
  const pageUrl = frameId === 0 ? url : (await chrome.tabs.get(tabId).catch(() => null))?.url;
  const config = pageUrl && (await injectionConfig(pageUrl, url));
  if (!config) return;
  chrome.scripting
    .executeScript({ target: { tabId, frameIds: [frameId] }, world: 'MAIN', injectImmediately: true, func: applyPersona, args: [config] })
    .catch(() => {});
});

chrome.webNavigation.onErrorOccurred.addListener(({ tabId, frameId }) => {
  if (frameId === 0 && pendingUrls.delete(tabId)) scheduleSync();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingUrls.delete(tabId);
  scheduleSync();
});

chrome.webNavigation.onHistoryStateUpdated.addListener(({ frameId }) => {
  if (frameId === 0) scheduleSync();
});

chrome.cookies.onChanged.addListener(({ cookie }) => {
  const domain = cookie.domain.replace(/^\./, '');
  if ([...cookieHosts].some((host) => host === domain || host.endsWith(`.${domain}`))) scheduleSync();
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  statePromise = loadState();
  scheduleSync();
});

chrome.runtime.onStartup.addListener(scheduleSync);
chrome.runtime.onInstalled.addListener(scheduleSync);
