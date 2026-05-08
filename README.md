# 💪 ジム記録 (Gym Tracker)

スマホで使えるシンプルな筋トレ記録アプリ。サーバ不要、データはブラウザのlocalStorageに保存されます。

## 使い方

`index.html` をブラウザで開くだけ。

### スマホで使う

1. このリポジトリを GitHub Pages・Netlify・Vercel・Cloudflare Pages などに公開
2. スマホでURLを開く
3. ホーム画面に追加（PWA対応：オフラインでも動作）

### ローカル確認

```bash
# どれでもOK
python3 -m http.server 8080
# → http://localhost:8080
```

## 機能

- **記録タブ**: 日付・種目を選んで、重量・回数を＋−ボタンで素早く入力。前回の記録を自動で表示。
- **履歴タブ**: 過去のセッション一覧、総ボリューム、連続日数。週／月でフィルタ可能。
- **種目タブ**: チョコザップの標準機材（チェストプレス／ショルダープレス／ラットプルダウン等17種）をプリセット。自由に追加・削除可能。
- **設定タブ**:
  - **GitHub自動保存**: Personal Access Token を設定すると、記録が自動でこのリポジトリの `data.json` に保存され、別端末でも同じデータが使える。
  - 手動JSONエクスポート／インポート、全データ削除。

## GitHub自動保存の設定

1. 設定タブを開き、案内に従って [Fine-grained PAT](https://github.com/settings/personal-access-tokens/new) を作成
   - Repository access: **Only select repositories** → このリポジトリ
   - Permissions: **Contents** → **Read and write**
2. トークンを貼り付け→「保存して同期」
3. 以降、記録の追加・編集が自動で `data.json` にコミットされます（2.5秒デバウンス）
4. 別端末でアプリを開いてトークンを入れれば、自動でリモートのデータが読み込まれます

⚠️ Public リポジトリのままだと記録は誰でも閲覧可能です。非公開にしたい場合は GitHub の Settings → General → Change visibility → Private に変更してください。

## 技術スタック

単一HTMLファイル + Service Worker（PWA）。フレームワーク・ビルド・依存パッケージなし。

- `index.html` — アプリ本体
- `manifest.webmanifest` — PWAマニフェスト
- `sw.js` — オフライン用キャッシュ
