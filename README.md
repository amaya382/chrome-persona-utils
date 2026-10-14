<p align="right"><strong>English</strong> / <a href="README_ja.md">日本語</a></p>

<h1 align="center">🎭 Persona Utils</h1>

<p align="center">
  <strong>Switch user agent, locale, headers, and cookies in Chrome.</strong><br/>
  Set them globally or per URL, and turn each one on or off with a click.
</p>

Persona Utils is a Manifest V3 Chrome extension written in plain JavaScript. There is no build step: the repository directory is the extension.

## Why Persona Utils?

- **Layered, per item** — global settings take priority over URL rules, and a higher URL rule over a lower one, item by item. Setting only the user agent globally leaves the locale from a matching URL rule in effect
- **JavaScript sees the same persona** — besides request headers, `navigator.userAgent`, `navigator.userAgentData`, `navigator.languages`, the default locale of `Intl`, and `document.cookie` report the overridden values
- **Shows what it replaced** — every item shows the value it overrides and where that value comes from: a lower URL rule, the cookie jar, or the browser default

## 🚀 Quick Start

**Requirements:** desktop Chrome.

1. Clone this repository

   ```bash
   git clone https://github.com/amaya382/chrome-persona-utils.git
   ```

2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the cloned directory

Open the extension's popup, switch to the "Global" tab, check "User agent", and pick a preset such as "Safari / iPhone". Open `https://httpbin.org/headers`; the `User-Agent` it reports is the preset's string.

To update, run `git pull` and click the reload button on the extension's card in `chrome://extensions/`.

## 📖 Usage

### Global settings and URL rules

The popup has a tab for each layer that applies to the current page: "Global", which applies to every page, and each URL rule that matches the page. The "+" tab adds a URL rule for the page's origin, such as `^https://example\.com/`, at the bottom of the list. The options page, opened from "Manage URL rules" in the popup, lists every URL rule and is where rules are reordered and deleted.

A URL rule applies when its pattern matches the URL of the page in the tab. The pattern is a regular expression matched case-insensitively, and Chrome evaluates it with its RE2 engine, so lookaheads and backreferences are rejected when saving. Requests the page makes to other hosts, such as images from a CDN, receive the same rule, since matching is done on the page URL rather than on each request.

When several layers set the same item, the global settings win, then URL rules from top to bottom. Items no layer sets keep the browser's own values.

### Items

| Item | Request headers | JavaScript |
| --- | --- | --- |
| User agent | `User-Agent`, `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` | `navigator.userAgent`, `appVersion`, `platform`, `userAgentData` |
| Locale | `Accept-Language` | `navigator.language`, `navigator.languages`, default locale of `Intl` and `toLocaleString` |
| Request headers | set, append, or remove any header | — |
| Response headers | set, append, or remove any header | — |
| Cookies | `Cookie`, with each cookie overridden or unset | `document.cookie` |

User agent presets cover Chrome, Edge, Firefox, and Safari on desktop and mobile. The Chrome and Edge presets carry the major version of the running Chrome, so they do not go stale. A preset that is not Chromium-based removes the `Sec-CH-UA` headers and makes `navigator.userAgentData` undefined, as Firefox and Safari do. "Custom…" accepts any string.

Locale presets list common BCP 47 tags, and "Custom…" accepts any valid tag. The locale `ja-JP` becomes `Accept-Language: ja-JP,ja;q=0.9`.

The ☆ next to the user agent and locale selectors adds the current choice to favorites, which appear at the top of the selectors in every editor.

Cookie overrides leave the browser's cookie jar untouched. Persona Utils reads the jar for the page, applies the overrides, and sends the result as the `Cookie` header. An override replaces the cookie's value or adds the cookie when the page has none. Unset drops the cookie from the header.

### Toggles

Each level has its own switch:

- "Enabled" at the top of the popup and the options page turns the whole extension off
- The checkbox on each layer's tab in the popup, and next to each URL rule in the options page, turns that layer off
- The checkbox on each item turns that item off

A layer can be switched from its tab's checkbox while another tab is open. The number on the extension's icon is the count of active layers on the tab.

### Original values

Under every item, "Original" shows the value the item replaces and its source. In the popup, that is the value the layers below the edited one would give on the current page, or the browser default. The options page edits rules without a page, so it shows the browser default.

The popup's "On this page" tab lists the values in effect on the current tab and the layer each comes from.

## 🔒 Permissions

- `declarativeNetRequestWithHostAccess` — rewrite request and response headers
- `scripting` — override `navigator`, `Intl`, and `document.cookie` in pages
- `webNavigation` — track the page URL of each tab and inject at each navigation
- `tabs` — read the URL of each tab to match URL rules
- `cookies` — read the cookie jar to build the `Cookie` header and show original values
- `storage` — save and sync settings
- Access to all sites — apply overrides on every page

## 🔧 Troubleshooting

### `navigator` still shows the original values

Header changes apply to the next request, but JavaScript overrides are installed when a page loads. Click "Reload page" in the popup.

Overrides in JavaScript are installed as soon as Chrome commits the navigation, which can be after the page's first script has run. Web Workers keep the original values.

### A cookie override does not reach a request

Overrides apply only to requests to the same host as the page; requests to other hosts, including subdomains, send the cookie jar unchanged. When the server sets a cookie, the header follows the new jar after a short delay.

### A header entry shows an error

Chrome accepts `append` only for some request headers, such as `Accept`, `Accept-Language`, and `Cookie`. Use `set` for other headers. Entries with an error are not applied.

### Nothing changes on a page

Chrome does not run extensions on `chrome://` pages or the Chrome Web Store. On other pages, check that "Enabled" is on and that the popup's "On this page" tab lists the item.

## 🧪 Development

| File | Role |
| --- | --- |
| `manifest.json` | Extension manifest |
| `presets.js` | User agent and locale presets |
| `core.js` | Layer resolution, header rules, and cookie merging. Shared by the background, the UI, and the tests |
| `storage.js` | Settings storage helpers |
| `background.js` | Rebuilds header rules and injects JavaScript overrides into pages |
| `inject.js` | The function injected into pages |
| `profile-editor.js` | Editor shared by the popup and the options page |
| `popup.html` / `popup.js` | Popup |
| `options.html` / `options.js` | Options page |
| `ui.css` | Styles shared by the popup and the options page |
| `icons/` | Extension icons |
| `test/` | Unit tests for `core.js` |

Run the tests with Node.js 18 or later:

```bash
node --test
```

After editing, click the reload button on the extension's card in `chrome://extensions/`, then reload the page you test on.

## 📄 License

[MIT](LICENSE)
