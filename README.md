<p align="right"><strong>English</strong> / <a href="README_ja.md">日本語</a></p>

<h1 align="center">🎭 Persona Utils Chrome Extension</h1>

<p align="center"><strong>Let each site see the browser you choose, down to the cookies.</strong></p>

Persona Utils is a Manifest V3 Chrome extension written in plain JavaScript. There is no build step: the repository directory is the extension.

## ✨ Features

- **Global settings and URL rules** — set a persona for every page, or per site with URL rules matched by regular expression against the page URL. Layers combine item by item, so a global user agent can sit on top of a site's locale
- **User agent** — switch among presets for Chrome, Edge, Firefox, and Safari on desktop and mobile, or any custom string. Client hints and `navigator.userAgentData` follow the chosen browser, and the Chrome and Edge presets track the running Chrome version
- **Locale** — choose any BCP 47 tag and both `Accept-Language` and the default locale of `navigator` and `Intl` follow it
- **Request and response headers** — set, append, or remove any header
- **Cookies** — override or drop individual cookies in what the site receives, without touching the browser's cookie jar
- **JavaScript sees the same persona** — `navigator`, `Intl`, and `document.cookie` report the overridden values, not just the request headers
- **Original values in view** — every item shows the value it replaces and where that value comes from, and the popup lists what is in effect on the current tab
- **On/off at every level** — switch the whole extension, a layer, or a single item with one click. The icon badge shows how many layers are active on the tab
- **Favorites** — pin frequently used user agents and locales to the top of the selectors

## 🚀 Quick Start

**Requirements:** desktop Chrome.

1. Clone this repository

   ```bash
   git clone https://github.com/amaya382/chrome-persona-utils.git
   ```

2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the cloned directory

Open the extension's popup, select "Global", check "User agent", and pick a preset such as "Safari / iPhone". Open `https://httpbin.org/headers`; the `User-Agent` it reports is the preset's string.

To update, run `git pull` and click the reload button on the extension's card in `chrome://extensions/`.

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

Chrome does not run extensions on `chrome://` pages or the Chrome Web Store. On other pages, check that "Enabled" is on and that "Applied on this page" in the popup shows the item with a label other than "Default".

## 🧪 Development

Run the tests with Node.js 18 or later:

```bash
node --test
```

After editing, click the reload button on the extension's card in `chrome://extensions/`, then reload the page you test on.
