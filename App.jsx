import { useState, useEffect } from "react";
import { createClient, isConfigured } from "./supabase.js";
import { MODES, TEMPS, TIMES, MAIN_PROTEINS, PROTEIN_EMOJI, MODE_EMOJI } from "./constants.js";
import { normalizeToProtein, getRecipeProteins, collectOtherIngredients } from "./utils.js";
import SetupScreen from "./SetupScreen.jsx";

export default function App() {
  const [client, setClient] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list"); // list | detail | add | search
  const [selected, setSelected] = useState(null);
  const [selectedProteins, setSelectedProteins] = useState([]);
  const [selectedOther, setSelectedOther] = useState([]);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("ok");
  const [form, setForm] = useState({
    name: "", mode: "グリル", temp: "180°C", time: "15分",
    ingredients: "", steps: "", author: "",
  });

  // 環境変数から自動接続
  useEffect(() => {
    if (isConfigured()) {
      const c = createClient();
      setClient(c);
      loadRecipes(c);
    }
  }, []);

  const showToast = (msg, type = "ok") => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(""), 2500);
  };

  const loadRecipes = async (c) => {
    setLoading(true);
    try {
      const data = await (c || client).fetchRecipes();
      setRecipes(data);
    } catch (e) {
      showToast("データ取得失敗: " + e.message, "err");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (url, key) => {
    const c = createClient(url, key);
    setClient(c);
    loadRecipes(c);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { showToast("レシピ名を入力してください", "err"); return; }
    const newRecipe = {
      name: form.name.trim(),
      mode: form.mode,
      temp: form.temp,
      time: form.time,
      ingredients: form.ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
      steps: form.steps,
      author: form.author.trim() || "匿名",
    };
    setLoading(true);
    try {
      const inserted = await client.insertRecipe(newRecipe);
      setRecipes((prev) => [inserted[0], ...prev]);
      setForm({ name: "", mode: "グリル", temp: "180°C", time: "15分", ingredients: "", steps: "", author: "" });
      showToast("レシピを投稿しました！みんなに共有されます 🎉");
      setView("list");
    } catch (e) {
      showToast("投稿失敗: " + e.message, "err");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("このレシピを削除しますか？")) return;
    setLoading(true);
    try {
      await client.deleteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      setView("list");
      setSelected(null);
      showToast("削除しました");
    } catch (e) {
      showToast("削除失敗: " + e.message, "err");
    } finally {
      setLoading(false);
    }
  };

  const toggleProtein = (p) => {
    setSelectedProteins((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
    setSelectedOther([]);
  };
  const toggleOther = (o) => {
    setSelectedOther((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]
    );
  };
  const clearSearch = () => { setSelectedProteins([]); setSelectedOther([]); };

  const searchResults = (() => {
    if (selectedProteins.length === 0 && selectedOther.length === 0) return [];
    return recipes.filter((r) => {
      const rProteins = getRecipeProteins(r);
      const proteinOk =
        selectedProteins.length === 0 ||
        selectedProteins.every((p) => rProteins.includes(p));
      const otherOk =
        selectedOther.length === 0 ||
        selectedOther.every((o) => r.ingredients.some((ing) => ing.includes(o)));
      return proteinOk && otherOk;
    });
  })();

  const otherIngredients = collectOtherIngredients(recipes);
  const isSearching = selectedProteins.length > 0 || selectedOther.length > 0;

  if (!client) return <SetupScreen onConnect={handleConnect} />;

  /* ── Recipe card ─────────────────────────────────────── */
  const RecipeCard = ({ r, onClick, highlightProteins = [], highlightOther = [] }) => {
    const proteins = getRecipeProteins(r);
    return (
      <div className="recipe-card" onClick={onClick}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
          <span style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 16, flex: 1, marginRight: 8 }}>{r.name}</span>
          <span className="tag">{MODE_EMOJI[r.mode]} {r.mode}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 14px", fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, color: "#8a6a44", marginBottom: 8 }}>
          <span>🌡 {r.temp}</span>
          <span>⏱ {r.time}</span>
          <span>👤 {r.author || "匿名"}</span>
          {proteins.map((p) => <span key={p}>{PROTEIN_EMOJI[p]} {p}</span>)}
        </div>
        <div>
          {r.ingredients.slice(0, 4).map((ing, i) => {
            const name = ing.split(/[\s　]/)[0];
            const p = normalizeToProtein(ing);
            const hit = (p && highlightProteins.includes(p)) || highlightOther.includes(name);
            return (
              <span key={i} className={`ingredient-chip${hit ? " hit" : ""}`}>{name}</span>
            );
          })}
          {r.ingredients.length > 4 && (
            <span className="ingredient-chip">+{r.ingredients.length - 4}</span>
          )}
        </div>
      </div>
    );
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "#fdf8f0", color: "#2d2013" }}>

      {/* ── Header ── */}
      <header style={{ background: "#fff", borderBottom: "1.5px solid #f0e4cc", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🌀</span>
            <div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 15, color: "#c0541a" }}>
                ノンフライヤーレシピ集
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="shared-badge">🌐 みんなで共有</span>
                <span style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44" }}>
                  {recipes.length}品
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: "7px 12px" }}
              onClick={() => loadRecipes()}
              disabled={loading}
            >
              {loading ? "⏳" : "🔄"}
            </button>
            <button
              className="btn-primary"
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() => setView("add")}
            >
              ＋ 投稿
            </button>
          </div>
        </div>
        <nav style={{ maxWidth: 600, margin: "0 auto", padding: "0 4px", display: "flex", borderTop: "1px solid #f5eada", overflowX: "auto" }}>
          {[["list", "📋 みんなのレシピ"], ["search", "🔍 材料から検索"]].map(([v, label]) => (
            <button
              key={v}
              className={`nav-tab${view === v || (view === "detail" && v === "list") ? " active" : ""}`}
              onClick={() => { setView(v); setSelected(null); }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "20px 14px 80px" }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif", color: "#8a6a44" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>読み込み中…
          </div>
        )}

        {/* ── LIST ── */}
        {!loading && view === "list" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18 }}>
                みんなのレシピ <span style={{ color: "#c0541a" }}>{recipes.length}</span>
              </h2>
            </div>
            {recipes.length === 0 && (
              <div style={{ textAlign: "center", color: "#b0906a", padding: "60px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
                <div>まだレシピがありません。最初の一品を投稿しましょう！</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recipes.map((r) => (
                <RecipeCard key={r.id} r={r} onClick={() => { setSelected(r); setView("detail"); }} />
              ))}
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {!loading && view === "detail" && selected && (
          <div>
            <button className="btn-ghost" style={{ marginBottom: 16, fontSize: 13 }}
              onClick={() => { setView("list"); setSelected(null); }}>← 一覧へ戻る</button>
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 20, lineHeight: 1.4, flex: 1, marginRight: 10 }}>{selected.name}</h2>
                <span className="tag">{MODE_EMOJI[selected.mode]} {selected.mode}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, color: "#8a6a44" }}>
                <span>👤 {selected.author || "匿名"}</span>
                {selected.created_at && (
                  <span>📅 {new Date(selected.created_at).toLocaleDateString("ja-JP")}</span>
                )}
                <span className="shared-badge">🌐 共有済み</span>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                {[["🌡 温度", selected.temp], ["⏱ 時間", selected.time]].map(([l, v]) => (
                  <div key={l} className="stat-box" style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44", marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 18, color: "#c0541a" }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#6b4c2a" }}>🥣 材料</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {selected.ingredients.map((ing, i) => (
                    <span key={i} className="ingredient-chip" style={{ fontSize: 13, padding: "5px 12px" }}>{ing}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#6b4c2a" }}>📝 作り方</div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 14, lineHeight: 1.9, background: "#fffdf9", borderRadius: 12, padding: 16, border: "1px solid #f0e4cc", whiteSpace: "pre-line" }}>
                  {selected.steps}
                </div>
              </div>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>このレシピを削除</button>
            </div>
          </div>
        )}

        {/* ── ADD ── */}
        {!loading && view === "add" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <button className="btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => setView("list")}>← 戻る</button>
              <div>
                <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18 }}>レシピを投稿</h2>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44" }}>投稿するとみんなに共有されます</div>
              </div>
            </div>
            <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 15 }}>
              <div>
                <label>投稿者名（任意）</label>
                <input placeholder="例：料理好きのAさん（省略すると匿名）"
                  value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} />
              </div>
              <div>
                <label>【レシピ名】*</label>
                <input placeholder="例：カリカリ唐揚げ"
                  value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label>モード</label>
                <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
                  {MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label>温度</label>
                  <select value={form.temp} onChange={(e) => setForm((f) => ({ ...f, temp: e.target.value }))}>
                    {TEMPS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>時間</label>
                  <select value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label>材料（1行に1つ）</label>
                <textarea rows={5} placeholder={"鶏もも肉 300g\n醤油 大さじ2\nにんにく 1片"}
                  value={form.ingredients} onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))} />
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#b0906a", marginTop: 4 }}>
                  ※ 鶏肉・豚肉・牛肉などのメイン食材が自動でカテゴリ分類されます
                </div>
              </div>
              <div>
                <label>作り方</label>
                <textarea rows={6} placeholder={"1. 鶏肉を一口大に切る。\n2. 調味料で漬け込む。\n3. ノンフライヤーで調理する。"}
                  value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} />
              </div>
              <button className="btn-primary" onClick={handleAdd} style={{ width: "100%", padding: 14, fontSize: 16 }}>
                🌐 みんなに投稿する
              </button>
            </div>
          </div>
        )}

        {/* ── SEARCH ── */}
        {!loading && view === "search" && (
          <div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, marginBottom: 16 }}>🔍 材料から検索</h2>

            {/* メイン食材チェック */}
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="section-label">🥩 メイン食材（複数選択可）</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {MAIN_PROTEINS.map((p) => (
                  <button key={p} className={`protein-btn${selectedProteins.includes(p) ? " checked" : ""}`}
                    onClick={() => toggleProtein(p)}>
                    <span style={{ fontSize: 20 }}>{PROTEIN_EMOJI[p]}</span>
                    <span style={{ textAlign: "center", lineHeight: 1.3 }}>{p}</span>
                    {selectedProteins.includes(p) && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* その他食材 */}
            {otherIngredients.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                <div className="section-label">🥦 その他食材で絞り込む</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {otherIngredients.map((o) => (
                    <span key={o} className={`other-chip${selectedOther.includes(o) ? " checked" : ""}`}
                      onClick={() => toggleOther(o)}>{o}</span>
                  ))}
                </div>
              </div>
            )}

            {isSearching && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44" }}>
                  検索結果：<strong style={{ color: "#c0541a" }}>{searchResults.length}件</strong>
                </div>
                <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }} onClick={clearSearch}>✕ クリア</button>
              </div>
            )}
            {isSearching && searchResults.length === 0 && (
              <div style={{ textAlign: "center", color: "#b0906a", padding: "40px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>😔</div>該当するレシピが見つかりませんでした
              </div>
            )}
            {!isSearching && (
              <div style={{ textAlign: "center", color: "#b0906a", padding: "40px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🥕</div>上の食材を選んで検索してみましょう
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {searchResults.map((r) => (
                <RecipeCard key={r.id} r={r}
                  onClick={() => { setSelected(r); setView("detail"); }}
                  highlightProteins={selectedProteins}
                  highlightOther={selectedOther}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {toast && <div className={`toast ${toastType}`}>{toast}</div>}
    </div>
  );
}
