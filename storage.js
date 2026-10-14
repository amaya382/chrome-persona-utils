// Each rule lives under its own key so that no single item hits the chrome.storage.sync per-item quota.
const ruleKey = (id) => `rule:${id}`;

async function loadState() {
  const stored = await chrome.storage.sync.get(null);
  const order = stored.settings?.ruleOrder ?? [];
  const rules = order.filter((id) => stored[ruleKey(id)]).map((id) => ({ id, ...stored[ruleKey(id)] }));
  return PersonaCore.normalizeState({ settings: stored.settings, global: stored.global, rules });
}

function saveSettings(settings) {
  return chrome.storage.sync.set({ settings });
}

function saveGlobal(global) {
  return chrome.storage.sync.set({ global });
}

function saveRule({ id, ...rule }) {
  return chrome.storage.sync.set({ [ruleKey(id)]: rule });
}

function removeRule(id) {
  return chrome.storage.sync.remove(ruleKey(id));
}
