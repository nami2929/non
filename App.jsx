import { useState, useEffect, useRef } from "react";
import { createClient, isConfigured } from "./supabase.js";
import { MODES, TEMPS, TIMES, MAIN_PROTEINS, PROTEIN_EMOJI, MODE_EMOJI } from "./constants.js";
import { normalizeToProtein, getRecipeProteins, collectOtherIngredients } from "./utils.js";
import SetupScreen from "./SetupScreen.jsx";

// ── CSV/JSONエクスポート ──────────────────────────────────────
function exportCSV(recipes) {
  const header = ["レシピ名","モード","温度","時間","Cosori6L温度","Cosori6L時間","Cosori4.7L温度","Cosori4.7L時間","材料","作り方","投稿者","投稿日"];
  const rows = recipes.map(r => [
    r.name,
    r.mode,
    r.temp,
    r.time,
    r.cosori6l_temp || "",
    r.cosori6l_time || "",
    r.cosori47l_temp || "",
    r.cosori47l_time || "",
    (r.ingredients || []).join("／"),
    r.steps,
    r.author || "匿名",
    r.created_at ? new Date(r.created_at).toLocaleDateString("ja-JP") : "",
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const bom = "\uFEFF"; // Excel文字化け対策
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `nonfryer_recipes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportJSON(recipes) {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `nonfryer_recipes_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ── CSVインポート ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("データが見つかりません");
  // ヘッダー行をスキップ
  const rows = lines.slice(1);
  return rows.map((line, i) => {
    // 簡易CSVパース（ダブルクォート対応）
    const cols = [];
    let cur = ""; let inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    const name = cols[0];
    if (!name) throw new Error(`${i+2}行目: レシピ名が空です`);
    return {
      name,
      mode: cols[1] || "グリル",
      temp: cols[2] || "180°C",
      time: cols[3] || "15分",
      cosori6l_temp: cols[4] || null,
      cosori6l_time: cols[5] || null,
      cosori47l_temp: cols[6] || null,
      cosori47l_time: cols[7] || null,
      ingredients: cols[8] ? cols[8].split(/[／/]/).map(s => s.trim()).filter(Boolean) : [],
      steps: cols[9] || "",
      author: cols[10] || "匿名",
    };
  }).filter(r => r.name);
}

const EMPTY_FORM = {
  name: "", mode: "グリル", temp: "180°C", time: "15分",
  cosori6l_temp: "", cosori6l_time: "",
  cosori47l_temp: "", cosori47l_time: "",
  ingredients: "", steps: "", author: "",
};

export default function App() {
  const [client, setClient] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [selectedProteins, setSelectedProteins] = useState([]);
  const [selectedOther, setSelectedOther] = useState([]);
  const [toast, setToast] = useState(""); const [toastType, setToastType] = useState("ok");
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);

  useEffect(() => {
    if (isConfigured()) { const c = createClient(); setClient(c); loadRecipes(c); }
  }, []);

  const showToast = (msg, type = "ok") => { setToast(msg); setToastType(type); setTimeout(() => setToast(""), 2500); };
  const loadRecipes = async (c) => {
    setLoading(true);
    try { const data = await (c || client).fetchRecipes(); setRecipes(data); }
    catch (e) { showToast("データ取得失敗: " + e.message, "err"); }
    finally { setLoading(false); }
  };
  const handleConnect = (url, key) => { const c = createClient(url, key); setClient(c); loadRecipes(c); };

  const handleImageChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("画像は5MB以下にしてください", "err"); return; }
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { showToast("レシピ名を入力してください", "err"); return; }
    setUploading(true);
    try {
      let image_url = null;
      if (imageFile) image_url = await client.uploadImage(imageFile);
      const newRecipe = {
        name: form.name.trim(), mode: form.mode, temp: form.temp, time: form.time,
        cosori6l_temp: form.cosori6l_temp || null,
        cosori6l_time: form.cosori6l_time || null,
        cosori47l_temp: form.cosori47l_temp || null,
        cosori47l_time: form.cosori47l_time || null,
        ingredients: form.ingredients.split("\n").map(s => s.trim()).filter(Boolean),
        steps: form.steps, author: form.author.trim() || "匿名", image_url,
      };
      const inserted = await client.insertRecipe(newRecipe);
      setRecipes(prev => [inserted[0], ...prev]);
      setForm(EMPTY_FORM); setImageFile(null); setImagePreview(null);
      showToast("レシピを投稿しました！🎉"); setView("list");
    } catch (e) { showToast("投稿失敗: " + e.message, "err"); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("このレシピを削除しますか？")) return;
    setLoading(true);
    try {
      await client.deleteRecipe(id);
      setRecipes(prev => prev.filter(r => r.id !== id));
      setView("list"); setSelected(null); showToast("削除しました");
    } catch (e) { showToast("削除失敗: " + e.message, "err"); }
    finally { setLoading(false); }
  };

  // ── CSVインポート処理 ─────────────────────────
  const handleCSVSelect = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        setImportPreview(parsed);
      } catch (err) { showToast("CSV読み込みエラー: " + err.message, "err"); setImportPreview([]); }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    let success = 0; let fail = 0;
    for (const recipe of importPreview) {
      try { await client.insertRecipe(recipe); success++; }
      catch { fail++; }
    }
    await loadRecipes();
    setImportPreview([]); setImportFile(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
    showToast(`${success}件インポート完了！${fail > 0 ? `（${fail}件失敗）` : ""}`, fail > 0 ? "err" : "ok");
    setView("list");
    setImporting(false);
  };

  const toggleProtein = (p) => { setSelectedProteins(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]); setSelectedOther([]); };
  const toggleOther = (o) => { setSelectedOther(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o]); };
  const clearSearch = () => { setSelectedProteins([]); setSelectedOther([]); };

  const searchResults = (() => {
    if (selectedProteins.length === 0 && selectedOther.length === 0) return [];
    return recipes.filter(r => {
      const rProteins = getRecipeProteins(r);
      const proteinOk = selectedProteins.length === 0 || selectedProteins.every(p => rProteins.includes(p));
      const otherOk = selectedOther.length === 0 || selectedOther.every(o => r.ingredients.some(ing => ing.includes(o)));
      return proteinOk && otherOk;
    });
  })();

  const otherIngredients = collectOtherIngredients(recipes);
  const isSearching = selectedProteins.length > 0 || selectedOther.length > 0;

  if (!client) return <SetupScreen onConnect={handleConnect} />;

  const CosoriBox = ({ label, tempVal, timeVal, onTempChange, onTimeChange }) => (
    <div style={{ background: "#f5f0ff", border: "1.5px solid #d4b8ff", borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, fontWeight: 700, color: "#6b44a8", marginBottom: 10 }}>
        🔵 {label}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ color: "#6b44a8" }}>温度</label>
          <select value={tempVal} onChange={e => onTempChange(e.target.value)}
            style={{ borderColor: "#d4b8ff" }}>
            <option value="">－</option>
            {TEMPS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ color: "#6b44a8" }}>時間</label>
          <select value={timeVal} onChange={e => onTimeChange(e.target.value)}
            style={{ borderColor: "#d4b8ff" }}>
            <option value="">－</option>
            {TIMES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  const CosoriDetail = ({ r }) => {
    const has6l = r.cosori6l_temp || r.cosori6l_time;
    const has47l = r.cosori47l_temp || r.cosori47l_time;
    if (!has6l && !has47l) return null;
    return (
      <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14, color: "#6b4c2a" }}>🔵 Cosori設定</div>
        {has6l && (
          <div style={{ background: "#f5f0ff", border: "1.5px solid #d4b8ff", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 20, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13 }}>
            <strong style={{ color: "#6b44a8", minWidth: 70 }}>6L</strong>
            {r.cosori6l_temp && <span>🌡 {r.cosori6l_temp}</span>}
            {r.cosori6l_time && <span>⏱ {r.cosori6l_time}</span>}
          </div>
        )}
        {has47l && (
          <div style={{ background: "#f5f0ff", border: "1.5px solid #d4b8ff", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 20, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13 }}>
            <strong style={{ color: "#6b44a8", minWidth: 70 }}>4.7L</strong>
            {r.cosori47l_temp && <span>🌡 {r.cosori47l_temp}</span>}
            {r.cosori47l_time && <span>⏱ {r.cosori47l_time}</span>}
          </div>
        )}
      </div>
    );
  };

  const RecipeCard = ({ r, onClick, highlightProteins = [], highlightOther = [] }) => {
    const proteins = getRecipeProteins(r);
    const has6l = r.cosori6l_temp || r.cosori6l_time;
    const has47l = r.cosori47l_temp || r.cosori47l_time;
    return (
      <div className="recipe-card" onClick={onClick}>
        {r.image_url && (
          <div style={{ marginBottom: 10, borderRadius: 10, overflow: "hidden", height: 160 }}>
            <img src={r.image_url} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
          <span style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 16, flex: 1, marginRight: 8 }}>{r.name}</span>
          <span className="tag">{MODE_EMOJI[r.mode]} {r.mode}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 14px", fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, color: "#8a6a44", marginBottom: 8 }}>
          <span>🌡 {r.temp}</span><span>⏱ {r.time}</span>
          <span>👤 {r.author || "匿名"}</span>
          {proteins.map(p => <span key={p}>{PROTEIN_EMOJI[p]} {p}</span>)}
        </div>
        {(has6l || has47l) && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {has6l && <span style={{ background: "#f5f0ff", color: "#6b44a8", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontWeight: 700 }}>🔵 6L: {r.cosori6l_temp} {r.cosori6l_time}</span>}
            {has47l && <span style={{ background: "#f5f0ff", color: "#6b44a8", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontWeight: 700 }}>🔵 4.7L: {r.cosori47l_temp} {r.cosori47l_time}</span>}
          </div>
        )}
        <div>
          {r.ingredients.slice(0, 4).map((ing, i) => {
            const name = ing.split(/[\s　]/)[0];
            const p = normalizeToProtein(ing);
            const hit = (p && highlightProteins.includes(p)) || highlightOther.includes(name);
            return <span key={i} className={`ingredient-chip${hit ? " hit" : ""}`}>{name}</span>;
          })}
          {r.ingredients.length > 4 && <span className="ingredient-chip">+{r.ingredients.length - 4}</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fdf8f0", color: "#2d2013" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1.5px solid #f0e4cc", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🌀</span>
            <div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 15, color: "#c0541a" }}>ノンフライヤーレシピ集</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="shared-badge">🌐 みんなで共有</span>
                <span style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44" }}>{recipes.length}品</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "7px 10px" }} onClick={() => loadRecipes()} disabled={loading}>{loading ? "⏳" : "🔄"}</button>
            <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => setView("add")}>＋ 投稿</button>
          </div>
        </div>
        <nav style={{ maxWidth: 600, margin: "0 auto", padding: "0 4px", display: "flex", borderTop: "1px solid #f5eada", overflowX: "auto" }}>
          {[["list","📋 レシピ一覧"],["search","🔍 材料検索"],["import","📥 インポート"],["export","📤 エクスポート"]].map(([v,label]) => (
            <button key={v} className={`nav-tab${view===v||(view==="detail"&&v==="list")?" active":""}`}
              onClick={() => { setView(v); setSelected(null); }}>{label}</button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "20px 14px 80px" }}>
        {loading && <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif", color: "#8a6a44" }}><div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>読み込み中…</div>}

        {/* LIST */}
        {!loading && view === "list" && (
          <div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, marginBottom: 14 }}>みんなのレシピ <span style={{ color: "#c0541a" }}>{recipes.length}</span></h2>
            {recipes.length === 0 && <div style={{ textAlign: "center", color: "#b0906a", padding: "60px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}><div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div><div>まだレシピがありません</div></div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recipes.map(r => <RecipeCard key={r.id} r={r} onClick={() => { setSelected(r); setView("detail"); }} />)}
            </div>
          </div>
        )}

        {/* DETAIL */}
        {!loading && view === "detail" && selected && (
          <div>
            <button className="btn-ghost" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => { setView("list"); setSelected(null); }}>← 一覧へ戻る</button>
            <div className="card" style={{ padding: 22 }}>
              {selected.image_url && <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", maxHeight: 280 }}><img src={selected.image_url} alt={selected.name} style={{ width: "100%", objectFit: "cover" }} /></div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 20, lineHeight: 1.4, flex: 1, marginRight: 10 }}>{selected.name}</h2>
                <span className="tag">{MODE_EMOJI[selected.mode]} {selected.mode}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, color: "#8a6a44" }}>
                <span>👤 {selected.author || "匿名"}</span>
                {selected.created_at && <span>📅 {new Date(selected.created_at).toLocaleDateString("ja-JP")}</span>}
                <span className="shared-badge">🌐 共有済み</span>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                {[["🌡 温度", selected.temp],["⏱ 時間", selected.time]].map(([l,v]) => (
                  <div key={l} className="stat-box" style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44", marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 18, color: "#c0541a" }}>{v}</div>
                  </div>
                ))}
              </div>
              <CosoriDetail r={selected} />
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#6b4c2a" }}>🥣 材料</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>{selected.ingredients.map((ing,i) => <span key={i} className="ingredient-chip" style={{ fontSize: 13, padding: "5px 12px" }}>{ing}</span>)}</div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#6b4c2a" }}>📝 作り方</div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 14, lineHeight: 1.9, background: "#fffdf9", borderRadius: 12, padding: 16, border: "1px solid #f0e4cc", whiteSpace: "pre-line" }}>{selected.steps}</div>
              </div>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>このレシピを削除</button>
            </div>
          </div>
        )}

        {/* ADD */}
        {!loading && view === "add" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <button className="btn-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => { setView("list"); setImageFile(null); setImagePreview(null); }}>← 戻る</button>
              <div><h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18 }}>レシピを投稿</h2><div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 11, color: "#8a6a44" }}>投稿するとみんなに共有されます</div></div>
            </div>
            <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 15 }}>
              {/* 写真 */}
              <div>
                <label>📷 写真（任意・5MBまで）</label>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
                {imagePreview ? (
                  <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
                    <img src={imagePreview} alt="プレビュー" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
                    <button onClick={() => { setImageFile(null); setImagePreview(null); fileInputRef.current.value = ""; }}
                      style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current.click()}
                    style={{ width: "100%", padding: "20px", border: "2px dashed #e5d5bb", borderRadius: 12, background: "#fffdf9", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 14, color: "#8a6a44", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 32 }}>📷</span><span>タップして写真を選ぶ</span>
                  </button>
                )}
              </div>
              <div><label>投稿者名（任意）</label><input placeholder="省略すると匿名" value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} /></div>
              <div><label>【レシピ名】*</label><input placeholder="例：カリカリ唐揚げ" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label>モード</label><select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>{MODES.map(m => <option key={m}>{m}</option>)}</select></div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><label>温度（基本）</label><select value={form.temp} onChange={e => setForm(f => ({ ...f, temp: e.target.value }))}>{TEMPS.map(t => <option key={t}>{t}</option>)}</select></div>
                <div style={{ flex: 1 }}><label>時間（基本）</label><select value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}>{TIMES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              {/* Cosori設定 */}
              <CosoriBox label="Cosori 6L（任意）"
                tempVal={form.cosori6l_temp} timeVal={form.cosori6l_time}
                onTempChange={v => setForm(f => ({ ...f, cosori6l_temp: v }))}
                onTimeChange={v => setForm(f => ({ ...f, cosori6l_time: v }))} />
              <CosoriBox label="Cosori 4.7L（任意）"
                tempVal={form.cosori47l_temp} timeVal={form.cosori47l_time}
                onTempChange={v => setForm(f => ({ ...f, cosori47l_temp: v }))}
                onTimeChange={v => setForm(f => ({ ...f, cosori47l_time: v }))} />
              <div>
                <label>材料（1行に1つ）</label>
                <textarea rows={5} placeholder={"鶏もも肉 300g\n醤油 大さじ2\nにんにく 1片"} value={form.ingredients} onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))} />
              </div>
              <div><label>作り方</label><textarea rows={6} placeholder={"1. 鶏肉を一口大に切る。\n2. 調味料で漬け込む。\n3. ノンフライヤーで調理する。"} value={form.steps} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} /></div>
              <button className="btn-primary" onClick={handleAdd} disabled={uploading} style={{ width: "100%", padding: 14, fontSize: 16 }}>
                {uploading ? "⏳ アップロード中…" : "🌐 みんなに投稿する"}
              </button>
            </div>
          </div>
        )}

        {/* SEARCH */}
        {!loading && view === "search" && (
          <div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, marginBottom: 16 }}>🔍 材料から検索</h2>
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="section-label">🥩 メイン食材（複数選択可）</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {MAIN_PROTEINS.map(p => (
                  <button key={p} className={`protein-btn${selectedProteins.includes(p) ? " checked" : ""}`} onClick={() => toggleProtein(p)}>
                    <span style={{ fontSize: 20 }}>{PROTEIN_EMOJI[p]}</span>
                    <span style={{ textAlign: "center", lineHeight: 1.3 }}>{p}</span>
                    {selectedProteins.includes(p) && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>
            {otherIngredients.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                <div className="section-label">🥦 その他食材で絞り込む</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>{otherIngredients.map(o => <span key={o} className={`other-chip${selectedOther.includes(o) ? " checked" : ""}`} onClick={() => toggleOther(o)}>{o}</span>)}</div>
              </div>
            )}
            {isSearching && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44" }}>検索結果：<strong style={{ color: "#c0541a" }}>{searchResults.length}件</strong></div><button className="btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }} onClick={clearSearch}>✕ クリア</button></div>}
            {isSearching && searchResults.length === 0 && <div style={{ textAlign: "center", color: "#b0906a", padding: "40px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}><div style={{ fontSize: 40, marginBottom: 10 }}>😔</div>該当するレシピが見つかりませんでした</div>}
            {!isSearching && <div style={{ textAlign: "center", color: "#b0906a", padding: "40px 0", fontFamily: "'Zen Kaku Gothic New', sans-serif" }}><div style={{ fontSize: 48, marginBottom: 12 }}>🥕</div>上の食材を選んで検索してみましょう</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{searchResults.map(r => <RecipeCard key={r.id} r={r} onClick={() => { setSelected(r); setView("detail"); }} highlightProteins={selectedProteins} highlightOther={selectedOther} />)}</div>
          </div>
        )}

        {/* IMPORT */}
        {!loading && view === "import" && (
          <div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, marginBottom: 16 }}>📥 CSVインポート</h2>
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#6b4c2a", lineHeight: 1.8, marginBottom: 14 }}>
                <strong>CSVの列の順番（1行目はヘッダー）</strong><br />
                レシピ名, モード, 温度, 時間, Cosori6L温度, Cosori6L時間, Cosori4.7L温度, Cosori4.7L時間, 材料, 作り方, 投稿者<br /><br />
                <strong>材料は「／」区切りで1セルに入力</strong><br />
                例：鶏肉 300g／醤油 大さじ2／にんにく 1片
              </div>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCSVSelect} />
              <button className="btn-primary" style={{ width: "100%", padding: 14 }} onClick={() => csvInputRef.current.click()}>
                📂 CSVファイルを選ぶ
              </button>
            </div>

            {importPreview.length > 0 && (
              <div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44", marginBottom: 10 }}>
                  <strong style={{ color: "#c0541a" }}>{importPreview.length}件</strong> のレシピが見つかりました。内容を確認して登録してください。
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {importPreview.map((r, i) => (
                    <div key={i} style={{ background: "#fff", border: "1.5px solid #f0e4cc", borderRadius: 12, padding: "12px 16px" }}>
                      <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{r.name}</div>
                      <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 12, color: "#8a6a44", display: "flex", flexWrap: "wrap", gap: "0 14px" }}>
                        <span>{MODE_EMOJI[r.mode] || "⚙️"} {r.mode}</span>
                        <span>🌡 {r.temp}</span><span>⏱ {r.time}</span>
                        {r.cosori6l_temp && <span>🔵 6L: {r.cosori6l_temp} {r.cosori6l_time}</span>}
                        {r.cosori47l_temp && <span>🔵 4.7L: {r.cosori47l_temp} {r.cosori47l_time}</span>}
                        <span>🥣 {r.ingredients.length}品</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn-primary" onClick={handleImport} disabled={importing} style={{ width: "100%", padding: 14, fontSize: 16 }}>
                  {importing ? "⏳ 登録中…" : `✅ ${importPreview.length}件をまとめて登録する`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* EXPORT */}
        {!loading && view === "export" && (
          <div>
            <h2 style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, marginBottom: 16 }}>📤 エクスポート</h2>
            <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44", marginBottom: 16 }}>
              現在 <strong style={{ color: "#c0541a" }}>{recipes.length}件</strong> のレシピが保存されています
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* CSV */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>📊 CSV形式</div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44", marginBottom: 14, lineHeight: 1.7 }}>
                  ExcelやGoogleスプレッドシートで開けます。<br />
                  Cosori 6L / 4.7L の設定も含まれます。
                </div>
                <button className="btn-primary" style={{ width: "100%", padding: 13 }} onClick={() => exportCSV(recipes)} disabled={recipes.length === 0}>
                  ⬇️ CSVダウンロード
                </button>
              </div>
              {/* JSON */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>💾 JSON形式</div>
                <div style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", fontSize: 13, color: "#8a6a44", marginBottom: 14, lineHeight: 1.7 }}>
                  完全バックアップ用。写真URLも含む全データを保存します。
                </div>
                <button className="btn-ghost" style={{ width: "100%", padding: 13 }} onClick={() => exportJSON(recipes)} disabled={recipes.length === 0}>
                  ⬇️ JSONダウンロード
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {toast && <div className={`toast ${toastType}`}>{toast}</div>}
    </div>
  );
}
