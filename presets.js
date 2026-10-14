(function (root) {
  // `{major}` is replaced with the running Chrome's major version so Chromium presets stay current.
  const CHROMIUM_BRANDS = [
    { brand: 'Google Chrome', version: '{major}' },
    { brand: 'Chromium', version: '{major}' },
    { brand: 'Not?A_Brand', version: '24' },
  ];
  const EDGE_BRANDS = [
    { brand: 'Microsoft Edge', version: '{major}' },
    { brand: 'Chromium', version: '{major}' },
    { brand: 'Not?A_Brand', version: '24' },
  ];

  const USER_AGENT_PRESETS = [
    {
      id: 'chrome-windows',
      label: 'Chrome / Windows',
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36',
      platform: 'Win32',
      clientHints: { brands: CHROMIUM_BRANDS, mobile: false, platform: 'Windows' },
    },
    {
      id: 'chrome-macos',
      label: 'Chrome / macOS',
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      clientHints: { brands: CHROMIUM_BRANDS, mobile: false, platform: 'macOS' },
    },
    {
      id: 'chrome-linux',
      label: 'Chrome / Linux',
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36',
      platform: 'Linux x86_64',
      clientHints: { brands: CHROMIUM_BRANDS, mobile: false, platform: 'Linux' },
    },
    {
      id: 'chrome-android',
      label: 'Chrome / Android',
      value: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv81',
      clientHints: { brands: CHROMIUM_BRANDS, mobile: true, platform: 'Android' },
    },
    {
      id: 'edge-windows',
      label: 'Edge / Windows',
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0',
      platform: 'Win32',
      clientHints: { brands: EDGE_BRANDS, mobile: false, platform: 'Windows' },
    },
    {
      id: 'firefox-windows',
      label: 'Firefox / Windows',
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
      platform: 'Win32',
      clientHints: null,
    },
    {
      id: 'firefox-macos',
      label: 'Firefox / macOS',
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
      platform: 'MacIntel',
      clientHints: null,
    },
    {
      id: 'safari-macos',
      label: 'Safari / macOS',
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      platform: 'MacIntel',
      clientHints: null,
    },
    {
      id: 'safari-iphone',
      label: 'Safari / iPhone',
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      clientHints: null,
    },
    {
      id: 'safari-ipad',
      label: 'Safari / iPad',
      value: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      platform: 'iPad',
      clientHints: null,
    },
  ];

  const LOCALE_PRESETS = [
    'en-US',
    'en-GB',
    'ja-JP',
    'zh-CN',
    'zh-TW',
    'ko-KR',
    'fr-FR',
    'de-DE',
    'es-ES',
    'it-IT',
    'pt-BR',
    'ru-RU',
    'nl-NL',
    'pl-PL',
    'tr-TR',
    'ar-SA',
    'hi-IN',
    'id-ID',
    'th-TH',
    'vi-VN',
  ];

  const api = { USER_AGENT_PRESETS, LOCALE_PRESETS };
  root.PersonaPresets = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
