# 🌀 ノンフライヤーレシピ集

みんなでシェアするノンフライヤーレシピアプリ。

## 技術スタック

- React 18 + Vite
- Supabase（データベース・API）
- Vercel（ホスティング）

---

## ローカル開発

```bash
# 1. 依存パッケージをインストール
npm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集して VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を入力

# 3. 開発サーバーを起動
npm run dev
```

---

## Supabase セットアップ

[supabase.com](https://supabase.com) でプロジェクトを作成し、
SQL Editor で以下を実行してください：

```sql
create table recipes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  mode text not null,
  temp text not null,
  time text not null,
  ingredients text[] not null,
  steps text not null,
  author text default '匿名',
  created_at timestamptz default now()
);

alter table recipes enable row level security;

create policy "誰でも閲覧可能" on recipes for select using (true);
create policy "誰でも投稿可能" on recipes for insert with check (true);
create policy "誰でも削除可能" on recipes for delete using (true);
```

その後 **Settings → API** から Project URL と anon public key を取得して
`.env` に設定します。

---

## Vercel へのデプロイ

### 方法①：Vercel CLI

```bash
npm install -g vercel
vercel
```

デプロイ時に以下の環境変数を設定してください：

| 変数名 | 値 |
|--------|-----|
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` |

### 方法②：GitHub 連携

1. このフォルダを GitHub リポジトリにプッシュ
2. [vercel.com](https://vercel.com) で「New Project」→ リポジトリを選択
3. **Environment Variables** に上記2つを追加
4. Deploy ボタンをクリック

### ビルド設定（自動検出されますが念のため）

| 項目 | 値 |
|------|-----|
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

---

## ファイル構成

```
airfryer-app/
├── index.html          # エントリーポイント
├── vite.config.js      # Vite 設定
├── package.json
├── .env.example        # 環境変数テンプレート
├── .gitignore
└── src/
    ├── main.jsx        # React マウント
    ├── App.jsx         # メインアプリ
    ├── SetupScreen.jsx # 接続設定・デバッグ画面
    ├── supabase.js     # Supabase クライアント
    ├── constants.js    # 定数（食材・モード等）
    ├── utils.js        # ユーティリティ関数
    └── index.css       # グローバルスタイル
```
