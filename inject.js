// Runs in the page's MAIN world through chrome.scripting.executeScript, so it must not reference anything outside itself.
function applyPersona({ userAgent, languages, cookies }) {
  // Wrapping the original accessor in a Proxy keeps Function.prototype.toString reporting native code.
  const overrideGetter = (proto, prop, get) => {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.get) return;
    const getter = new Proxy(desc.get, { apply: (target, self, args) => get(() => Reflect.apply(target, self, args)) });
    Object.defineProperty(proto, prop, { ...desc, get: getter });
  };
  const wrapMethod = (owner, name, rewriteArgs) => {
    const original = owner[name];
    if (typeof original !== 'function') return;
    owner[name] = new Proxy(original, {
      apply: (target, self, args) => Reflect.apply(target, self, rewriteArgs(args)),
      construct: (target, args, newTarget) => Reflect.construct(target, rewriteArgs(args), newTarget),
    });
  };

  if (userAgent) {
    const { value, platform, clientHints } = userAgent;
    overrideGetter(Navigator.prototype, 'userAgent', () => value);
    overrideGetter(Navigator.prototype, 'appVersion', () => value.replace(/^Mozilla\//, ''));
    if (platform) overrideGetter(Navigator.prototype, 'platform', () => platform);
    let uaData;
    if (clientHints && typeof NavigatorUAData !== 'undefined') {
      const brands = () => clientHints.brands.map((b) => ({ ...b }));
      const lowEntropy = () => ({ brands: brands(), mobile: clientHints.mobile, platform: clientHints.platform });
      const highEntropy = {
        architecture: clientHints.mobile ? 'arm' : 'x86',
        bitness: '64',
        formFactors: [clientHints.mobile ? 'Mobile' : 'Desktop'],
        fullVersionList: () => clientHints.brands.map((b) => ({ brand: b.brand, version: `${b.version}.0.0.0` })),
        model: '',
        platformVersion: '',
        uaFullVersion: `${clientHints.brands[0].version}.0.0.0`,
        wow64: false,
      };
      uaData = Object.create(NavigatorUAData.prototype, {
        brands: { get: brands },
        mobile: { get: () => clientHints.mobile },
        platform: { get: () => clientHints.platform },
        getHighEntropyValues: {
          value: async (hints) => {
            const result = lowEntropy();
            for (const hint of hints) {
              if (!(hint in highEntropy)) continue;
              const v = highEntropy[hint];
              result[hint] = typeof v === 'function' ? v() : v;
            }
            return result;
          },
        },
        toJSON: { value: lowEntropy },
      });
    }
    overrideGetter(Navigator.prototype, 'userAgentData', () => uaData);
  }

  if (languages) {
    const frozen = Object.freeze([...languages]);
    overrideGetter(Navigator.prototype, 'language', () => frozen[0]);
    overrideGetter(Navigator.prototype, 'languages', () => frozen);
    const defaultLocaleAt = (index) => (args) => {
      const copy = [...args];
      if (copy[index] === undefined) copy[index] = frozen[0];
      return copy;
    };
    for (const name of ['Collator', 'DateTimeFormat', 'DisplayNames', 'DurationFormat', 'ListFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat', 'Segmenter']) {
      wrapMethod(Intl, name, defaultLocaleAt(0));
    }
    for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) wrapMethod(Date.prototype, name, defaultLocaleAt(0));
    wrapMethod(Number.prototype, 'toLocaleString', defaultLocaleAt(0));
    if (typeof BigInt !== 'undefined') wrapMethod(BigInt.prototype, 'toLocaleString', defaultLocaleAt(0));
    wrapMethod(String.prototype, 'toLocaleUpperCase', defaultLocaleAt(0));
    wrapMethod(String.prototype, 'toLocaleLowerCase', defaultLocaleAt(0));
    wrapMethod(String.prototype, 'localeCompare', defaultLocaleAt(1));
  }

  if (cookies.length) {
    // Same algorithm as PersonaCore.mergeCookies, inlined because this function cannot import it.
    const byName = new Map(cookies.map((c) => [c.name, c]));
    overrideGetter(Document.prototype, 'cookie', (original) => {
      const written = new Set();
      const result = [];
      for (const part of original().split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const i = trimmed.indexOf('=');
        const name = i === -1 ? '' : trimmed.slice(0, i);
        const override = byName.get(name);
        if (!override) {
          result.push(trimmed);
        } else if (override.action === 'override' && !written.has(name)) {
          written.add(name);
          result.push(`${name}=${override.value}`);
        }
      }
      for (const c of cookies) if (c.action === 'override' && !written.has(c.name)) result.push(`${c.name}=${c.value}`);
      return result.join('; ');
    });
  }
}
