<p align="right"><a href="README.md">English</a> / <strong>日本語</strong></p>

<h1 align="center">🎭 Persona Utils</h1>

<p align="center">
  <strong>Chrome の user agent、locale、ヘッダー、Cookie を切り替える</strong><br/>
  全体または URL ごとに設定し、項目ごとにワンクリックでオンとオフを切り替えられる。
</p>

Persona Utils は plain JavaScript で書いた Manifest V3 の Chrome 拡張機能である。ビルドは不要で、リポジトリのディレクトリがそのまま拡張機能になる。

## Why Persona Utils?

- **層と項目単位の優先度** — グローバル設定は URL ルールより、上の URL ルールは下のものより、項目ごとに優先される。グローバルで user agent だけを設定すれば、locale はマッチした URL ルールのものが残る
- **JavaScript からも同じ値が見える** — リクエストヘッダーに加えて、`navigator.userAgent`、`navigator.userAgentData`、`navigator.languages`、`Intl` の既定 locale、`document.cookie` も上書き後の値を返す
- **上書き前の値を表示する** — 各項目に、上書きされる値とその出どころ (下位の URL ルール、cookie jar、ブラウザ既定) を表示する

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

## 📖 Usage

### グローバル設定と URL ルール

すべての設定は popup で編集する。popup の下半分では、すべてのページに適用される「Global」と「URL rules」の 2 つの層を切り替える。URL rules には、現在のページにマッチしないものも含めてすべてのルールが優先順に並ぶ。各行にはスイッチ、上下の移動ボタン、削除ボタン (2 回押すと削除) がある。行を選ぶと、リストの下でそのルールを編集できる。「+ Rule for this site」はページの origin に対するルール (`^https://example\.com/` など) をリストの末尾に追加し、「+ Empty rule」はパターンが空のルールを追加する。

URL ルールは、タブで開いているページの URL にパターンがマッチしたときに適用される。現在のページに適用されないルールは、リストで「Not on this page」と表示される。その編集欄は破線と斜線の背景で描かれ、適用されない理由が上部に出る。パターンは大文字と小文字を区別しない正規表現である。Chrome は RE2 エンジンで評価するため、先読みや後方参照を含むパターンは保存時に拒否される。マッチングはリクエストごとではなくページの URL に対して行うので、ページが別ホストへ送るリクエスト (CDN からの画像など) にも同じルールが適用される。

複数の層が同じ項目を設定しているときは、グローバル設定が勝ち、次に URL ルールが上から順に勝つ。どの層も設定していない項目はブラウザ本来の値のままになる。

### 項目

| 項目 | リクエストヘッダー | JavaScript |
| --- | --- | --- |
| User agent | `User-Agent`、`Sec-CH-UA`、`Sec-CH-UA-Mobile`、`Sec-CH-UA-Platform` | `navigator.userAgent`、`appVersion`、`platform`、`userAgentData` |
| Locale | `Accept-Language` | `navigator.language`、`navigator.languages`、`Intl` と `toLocaleString` の既定 locale |
| Request headers | 任意のヘッダーを set、append、remove | — |
| Response headers | 任意のヘッダーを set、append、remove | — |
| Cookies | `Cookie` の各 Cookie を override または unset | `document.cookie` |

user agent のプリセットは、デスクトップとモバイルの Chrome、Edge、Firefox、Safari を揃えている。Chrome と Edge のプリセットは実行中の Chrome のメジャーバージョンを使うので、古くならない。Chromium 系でないプリセットを選ぶと、Firefox や Safari と同じく `Sec-CH-UA` ヘッダーを削除し、`navigator.userAgentData` を undefined にする。「Custom…」では任意の文字列を指定できる。

locale のプリセットは主要な BCP 47 タグを揃えており、「Custom…」では妥当なタグなら何でも指定できる。locale を `ja-JP` にすると `Accept-Language: ja-JP,ja;q=0.9` を送る。

user agent と locale の選択欄の横にある ☆ を押すと、選んでいる値がお気に入りに入る。お気に入りはどの編集画面でも選択欄の先頭に並ぶ。塗りつぶされた ★ を押すとお気に入りから外れる。

Cookie の上書きはブラウザの cookie jar を変更しない。Persona Utils はページの jar を読み、上書きを反映した結果を `Cookie` ヘッダーとして送る。override は Cookie の値を置き換え、ページにその Cookie がなければ追加する。unset はその Cookie をヘッダーから外す。

### オンとオフ

3 段階のスイッチがある。

- popup 上部の「Enabled」は拡張機能全体を止める
- 「Global」の横と URL rules の各行にあるチェックボックスは、その層を止める
- 各項目のチェックボックスは、その項目を止める

リストのスイッチは、別のルールを編集している間も切り替えられる。拡張機能アイコンの数字は、そのタブで有効な層の数である。

### 上書き前の値

各項目の下の「Original」に、その項目が置き換える値と出どころを表示する。これは、編集中の層より下の層が現在のページで与える値か、ブラウザ既定の値である。

popup 上部の「Applied on this page」には、現在のタブで有効な値が常に並ぶ。各値には出どころのラベルが付く。「Global」、URL ルールの名前、またはブラウザ本来の値 (実際の user agent や、手を加えていない cookie jar など) を示す「Default」のいずれかである。

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

| ファイル | 役割 |
| --- | --- |
| `manifest.json` | 拡張機能のマニフェスト |
| `presets.js` | user agent と locale のプリセット |
| `core.js` | 層の解決、ヘッダールールの生成、Cookie のマージ。background、UI、テストで共有する |
| `storage.js` | 設定の保存と読み込み |
| `background.js` | ヘッダールールの再構築と、ページへの JavaScript 上書きの注入 |
| `inject.js` | ページに注入する関数 |
| `profile-editor.js` | 1 つの層の項目を編集する UI |
| `popup.html` / `popup.js` | popup |
| `ui.css` | 共通のスタイル |
| `icons/` | 拡張機能のアイコン |
| `test/` | `core.js` の単体テスト |

テストは Node.js 18 以降で実行する。

```bash
node --test
```

編集したら、`chrome://extensions/` で拡張機能のカードにある再読み込みボタンを押し、確認に使うページも再読み込みする。

## 📄 License

[MIT](LICENSE)
