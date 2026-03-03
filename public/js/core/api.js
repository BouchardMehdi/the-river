import { State } from "./state.js";

function getApiBase() {
  // ✅ Pas d'input visible, mais on garde la possibilité de override via localStorage si besoin
  // (utile en dev / tests). En prod (reverse proxy / même domaine), on utilisera same-origin.
  const override =
    localStorage.getItem("API_BASE") ||
    localStorage.getItem("apiBase") ||
    localStorage.getItem("api_base");

  if (override && typeof override === "string") {
    return override.replace(/\/+$/, ""); // trim trailing /
  }

  // si le front tourne directement sur 3000, on est déjà "sur l'API"
  if (location.port === "3000") return "";

  // fallback dev classique
  return "http://127.0.0.1:3000";
}

const API_BASE = getApiBase();

function resolveUrl(path) {
  if (!path) return API_BASE || "/";
  if (/^https?:\/\//i.test(path)) return path;

  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

// =====================
// Toast (Easter Egg keys)
// =====================
function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

function keyToLabel(key) {
  switch (String(key)) {
    case "slots":
      return "Slots";
    case "blackjack":
      return "Blackjack";
    case "roulette":
      return "Roulette";
    case "poker":
      return "Poker";
    default:
      return "Clé";
  }
}

export function showKeyUnlockedToast(keys) {
  const arr = Array.isArray(keys) ? keys : [];
  if (!arr.length) return;

  const host = ensureToastHost();
  for (const k of arr) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div class="tTitle">🔑 Clé débloquée !</div>
      <div class="tText">Tu as trouvé une clé secrète.</div>
      <div class="tKey">${keyToLabel(k)}</div>
    `;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
}

function handleUnlockedNowFromPayload(data) {
  const keys = data?.unlockedNow;
  if (Array.isArray(keys) && keys.length) showKeyUnlockedToast(keys);
}

export async function apiGet(path) {
  const headers = {};
  if (State.token) headers.Authorization = `Bearer ${State.token}`;

  const res = await fetch(resolveUrl(path), { method: "GET", headers });
  const data = await parseJsonSafe(res);

  if (!res.ok) {
    const msg =
      typeof data === "string"
        ? data
        : (data && data.message) || JSON.stringify(data);
    throw new Error(msg);
  }

  handleUnlockedNowFromPayload(data);
  return data;
}

export async function apiPost(path, body, useAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (useAuth && State.token) headers.Authorization = `Bearer ${State.token}`;

  const res = await fetch(resolveUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const data = await parseJsonSafe(res);

  if (!res.ok) {
    const msg =
      typeof data === "string"
        ? data
        : (data && data.message) || JSON.stringify(data);
    throw new Error(msg);
  }

  handleUnlockedNowFromPayload(data);
  return data;
}
