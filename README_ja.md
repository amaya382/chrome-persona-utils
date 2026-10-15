<p align="right"><a href="README.md">English</a> / <strong>日本語</strong></p>

<h1 align="center">🎭 Persona Utils Chrome Extension</h1>

<p align="center"><strong>サイトに見せるブラウザーを、Cookie まで自由に選ぶ</strong></p>

Persona Utils は plain JavaScript で書いた Manifest V3 の Chrome 拡張機能である。ビルドは不要で、リポジトリのディレクトリがそのまま拡張機能になる。

## ✨ Features

- **グローバル設定と URL ルール** — すべてのページに共通の設定と、ページの URL に正規表現でマッチさせるサイトごとのルールを持てる。層は項目単位で重なるので、グローバルの user agent とサイトごとの locale を組み合わせられる
- **User agent** — デスクトップとモバイルの Chrome、Edge、Firefox、Safari のプリセットや任意の文字列に切り替える。Client Hints と `navigator.userAgentData` も選んだブラウザーに合わせ、Chrome と Edge のプリセットは実行中の Chrome のバージョンに追従する
- **Locale** — 任意の BCP 47 タグを選ぶと、`Accept-Language` と `navigator`、`Intl` の既定 locale がそろって切り替わる
- **リクエストヘッダーとレスポンスヘッダー** — 任意のヘッダーを set、append、remove できる
- **Cookie** — ブラウザーの cookie jar には手を加えずに、サイトに送る Cookie を 1 つずつ上書きしたり外したりできる
- **JavaScript からも同じ値が見える** — リクエストヘッダーだけでなく、`navigator`、`Intl`、`document.cookie` も上書き後の値を返す
- **上書き前の値を表示する** — 各項目に、置き換える値とその出どころを表示する。popup には現在のタブで有効な値が並ぶ
- **あらゆる段階でオンとオフ** — 拡張機能全体、層、項目をそれぞれワンクリックで切り替えられる。アイコンのバッジには、そのタブで有効な層の数が出る
- **お気に入り** — よく使う user agent と locale を選択欄の先頭に並べられる

## 🚀 Quick Start

**前提**：デスクトップ版の Chrome

1. このリポジトリを clone する

   ```bash
   git clone https://github.com/amaya382/chrome-persona-utils.git
   ```

2. `chrome://extensions/` を開く
3. 「デベロッパー モード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」を押し、clone したディレクトリを選ぶ

拡張機能の popup を開き、「Global」を選んで「User agent」にチェックを入れ、「Safari / iPhone」などのプリセットを選ぶ。`https://httpbin.org/headers` を開くと、表示される `User-Agent` がプリセットの文字列になっている。

更新するときは `git pull` を実行し、`chrome://extensions/` で拡張機能のカードにある再読み込みボタンを押す。

## 🔒 Permissions

- `declarativeNetRequestWithHostAccess` — リクエストとレスポンスのヘッダーを書き換える
- `scripting` — ページ内の `navigator`、`Intl`、`document.cookie` を上書きする
- `webNavigation` — 各タブのページ URL を追跡し、遷移のたびに上書きを注入する
- `tabs` — URL ルールの判定のために各タブの URL を読む
- `cookies` — `Cookie` ヘッダーの組み立てと上書き前の値の表示のために cookie jar を読む
- `storage` — 設定を保存して同期する
- すべてのサイトへのアクセス — すべてのページで上書きを適用する

## 🔧 Troubleshooting

### `navigator` が元の値のまま

ヘッダーの変更は次のリクエストから反映されるが、JavaScript 側の上書きはページの読み込み時に入る。popup の「Reload page」を押す。

JavaScript 側の上書きは Chrome がナビゲーションを確定した時点で入るため、ページの最初のスクリプトより遅れることがある。Web Worker 内は元の値のままになる。

### Cookie の上書きがリクエストに反映されない

上書きはページと同じホストへのリクエストにだけ適用される。サブドメインを含む別ホストへのリクエストは、cookie jar の内容をそのまま送る。サーバーが Cookie を設定したときは、少し遅れて新しい jar の内容がヘッダーに反映される。

### ヘッダーの項目にエラーが出る

Chrome が `append` を受け付けるリクエストヘッダーは、`Accept`、`Accept-Language`、`Cookie` など一部に限られる。それ以外は `set` を使う。エラーのある項目は適用されない。

### ページで何も変わらない

Chrome は `chrome://` ページや Chrome ウェブストアでは拡張機能を動かさない。それ以外のページでは、「Enabled」がオンであることと、popup の「Applied on this page」でその項目に「Default」以外のラベルが付いていることを確かめる。

## 🧪 Development

テストは Node.js 18 以降で実行する。

```bash
node --test
```

編集したら、`chrome://extensions/` で拡張機能のカードにある再読み込みボタンを押し、確認に使うページも再読み込みする。
