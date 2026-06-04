import { useState } from "react";
import { runConnectionTest } from "./supabase.js";

export default function SetupScreen({ onConnect }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [debugLog, setDebugLog] = useState(null);
  const [showKey, setShowKey] = useState(false);

  const handleTest = async () => {
    const u = url.trim();
    const k = key.trim();
    if (!u || !k) {
      setDebugLog({ fetchError: "URLとAPIキーを両方入力してください" });
      return;
    }
    setTesting(true);
    setDebugLog(null);
    const result = await runConnectionTest(u, k);
    setDebugLog(result);
    setTesting(false);
    if (result.success) onConnect(u, k);
  };

  const monoStyle = {
    fontFamily: "monospace",
    fontSize: 12,
    background: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: 8,
    padding: "10px 14px",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    marginTop: 6,
  };
  const miniLabel = {
    fontSize: 11,
    fontWeight: 700,
    color: "#8a6a44",
    marginBottom: 4,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: ".06em",
  };
  const infoBox = (bg, border) => ({
    background: bg,
    border: `1.5px solid ${border}`,
    borderRadius: 10,
    padding: 14,
    fontSize: 12,
    fontFamily: "'Zen Kaku Gothic New', sans-serif",
    lineHeight: 1.8,
  });
  const pill = (ok) => ({
    flexShrink: 0,
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    background: ok ? "#e8f5e9" : "#fde8e8",
    color: ok ? "#2e7d32" : "#c62828",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fdf8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 60px",
        fontFamily: "'Zen Kaku Gothic New', sans-serif",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 8 }}>🌀</div>
      <h1
        style={{
          fontFamily: "'Noto Serif JP', serif",
          fontSize: 20,
          color: "#c0541a",
          marginBottom: 4,
          textAlign: "center",
        }}
      >
        ノンフライヤーレシピ集
      </h1>
      <p
        style={{
          color: "#8a6a44",
          fontSize: 12,
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        Supabase接続設定
      </p>

      <div
        style={{
          background: "#fff",
          border: "1.5px solid #f0e4cc",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 説明 */}
        <div style={infoBox("#fff8f0", "#f0e4cc")}>
          <strong style={{ color: "#c0541a" }}>環境変数が設定されていない場合：</strong>
          <br />
          Supabase の Project URL と anon key を入力してください。
          <br />
          <strong style={{ color: "#c0541a" }}>Vercelデプロイ後は不要：</strong>
          <br />
          <code>.env</code> に設定すれば自動接続されます。
        </div>

        {/* URL */}
        <div>
          <span style={miniLabel}>Project URL</span>
          <input
            placeholder="https://xxxxxxxxxx.supabase.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        {/* anon key */}
        <div>
          <span style={miniLabel}>anon public key</span>
          <div style={{ position: "relative" }}>
            <input
              style={{ fontFamily: "monospace", fontSize: 12, paddingRight: 44 }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type={showKey ? "text" : "password"}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "#8a6a44",
              }}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        {/* テストボタン */}
        <button className="btn-primary" onClick={handleTest} disabled={testing}>
          {testing ? "⏳ テスト中…" : "🔍 接続テスト＆デバッグ"}
        </button>

        {/* ── デバッグ結果 ── */}
        {debugLog && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 総合判定 */}
            <div
              style={infoBox(
                debugLog.success ? "#f0fff4" : debugLog.isCors ? "#fff8e1" : "#fff0f0",
                debugLog.success ? "#a5d6a7" : debugLog.isCors ? "#ffe082" : "#ffcdd2"
              )}
            >
              <strong
                style={{
                  fontSize: 14,
                  color: debugLog.success
                    ? "#2e7d32"
                    : debugLog.isCors
                    ? "#e65100"
                    : "#c62828",
                }}
              >
                {debugLog.success
                  ? "✅ 接続成功！アプリを起動します…"
                  : debugLog.isCors
                  ? "⚠️ CORSエラーの可能性"
                  : "❌ 接続失敗"}
              </strong>
            </div>

            {/* テストURL */}
            {debugLog.testedUrl && (
              <div>
                <span style={miniLabel}>📡 テストしたURL</span>
                <div style={monoStyle}>{debugLog.testedUrl}</div>
              </div>
            )}

            {/* HTTPステータス */}
            {debugLog.status != null && (
              <div>
                <span style={miniLabel}>🔢 HTTPステータス</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span
                    style={pill(debugLog.status >= 200 && debugLog.status < 300)}
                  >
                    {debugLog.status} {debugLog.statusText}
                  </span>
                  <span style={{ fontSize: 12, color: "#8a6a44" }}>
                    {debugLog.status === 200 && "✓ 正常"}
                    {debugLog.status === 401 && "→ APIキーが無効"}
                    {debugLog.status === 403 && "→ RLSポリシーが未設定"}
                    {debugLog.status === 404 && "→ テーブルが存在しないかURLが違う"}
                  </span>
                </div>
              </div>
            )}

            {/* レスポンス本文 */}
            {debugLog.responseBody != null && (
              <div>
                <span style={miniLabel}>📄 レスポンス本文</span>
                <div style={monoStyle}>{debugLog.responseBody || "(空)"}</div>
              </div>
            )}

            {/* fetchエラー */}
            {debugLog.fetchError && (
              <div>
                <span style={miniLabel}>💥 fetchエラー内容</span>
                <div style={{ ...monoStyle, background: "#2d1b1b", color: "#ff8a80" }}>
                  {debugLog.fetchError}
                </div>
              </div>
            )}

            {/* CORSヒント */}
            {debugLog.isCors && debugLog.corsHint && (
              <div style={infoBox("#fff8e1", "#ffe082")}>
                <strong style={{ color: "#e65100", fontSize: 12 }}>
                  🌐 CORS / 接続制限について
                </strong>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "#5d4037",
                    whiteSpace: "pre-line",
                  }}
                >
                  {debugLog.corsHint}
                </div>
              </div>
            )}

            {/* ステータス別ヒント */}
            {!debugLog.isCors && !debugLog.success && debugLog.status && (
              <div style={infoBox("#fff8f0", "#f0e4cc")}>
                <strong style={{ color: "#c0541a", fontSize: 12 }}>💡 対処のヒント</strong>
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b4c2a" }}>
                  {debugLog.status === 401 &&
                    "anon keyが正しくありません。Supabase → Settings → API → anon public key を再確認してください。"}
                  {debugLog.status === 404 &&
                    "URLが正しくないか、recipesテーブルが作成されていません。SQL Editorでテーブル作成SQLを実行してください。"}
                  {debugLog.status === 403 &&
                    "RLSポリシーが設定されていません。SQL EditorでSELECT用のpolicyを追加してください。"}
                  {![401, 404, 403].includes(debugLog.status) &&
                    "予期しないエラーです。レスポンス本文の内容をご確認ください。"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
