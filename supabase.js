const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

function makeHeaders(key) {
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function createClient(url = SUPABASE_URL, key = SUPABASE_ANON_KEY) {
  const headers = makeHeaders(key);

  return {
    url,
    key,

    async fetchRecipes() {
      const res = await fetch(
        `${url}/rest/v1/recipes?select=*&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(`取得失敗: ${res.status} ${res.statusText}`);
      return res.json();
    },

    async insertRecipe(recipe) {
      const res = await fetch(`${url}/rest/v1/recipes`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`保存失敗: ${res.status} ${body}`);
      }
      return res.json();
    },

    async deleteRecipe(id) {
      const res = await fetch(`${url}/rest/v1/recipes?id=eq.${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error(`削除失敗: ${res.status}`);
    },

    // 画像アップロード（Supabase Storage）
    async uploadImage(file) {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const res = await fetch(
        `${url}/storage/v1/object/recipe-images/${fileName}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": file.type,
          },
          body: file,
        }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`画像アップロード失敗: ${res.status} ${body}`);
      }
      // 公開URLを返す
      return `${url}/storage/v1/object/public/recipe-images/${fileName}`;
    },
  };
}

export async function runConnectionTest(url, key) {
  const endpoint = `${url}/rest/v1/recipes?select=*&limit=1&order=created_at.desc`;
  const log = {
    testedUrl: endpoint,
    status: null,
    statusText: null,
    responseBody: null,
    fetchError: null,
    isCors: false,
    corsHint: null,
    success: false,
  };
  try {
    const res = await fetch(endpoint, { method: "GET", headers: makeHeaders(key) });
    log.status = res.status;
    log.statusText = res.statusText;
    try { log.responseBody = await res.text(); } catch { log.responseBody = "(本文取得不可)"; }
    if (res.ok) log.success = true;
  } catch (e) {
    log.fetchError = e.message || String(e);
    const msg = (e.message || "").toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed") || msg.includes("cors") || msg.includes("network request failed")) {
      log.isCors = true;
      log.corsHint = "「Failed to fetch」はCORS制限の典型症状です。\nNetlify/Vercelにデプロイ後は通常解消されます。";
    }
  }
  return log;
}
