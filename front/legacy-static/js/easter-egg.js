import { apiGet, apiPost } from "./core/api.js";
import { State } from "./core/state.js";

const $ = (id) => document.getElementById(id);

function setBadge(el, ok) {
  if (!el) return;
  el.textContent = ok ? "TROUVÉE" : "MANQUANTE";
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("no", !ok);
  el.classList.toggle("ko", !ok);
}

function show(el) {
  if (!el) return;
  el.classList.remove("hidden");
}
function hide(el) {
  if (!el) return;
  el.classList.add("hidden");
}

function setStatus(text) {
  const el = $("eeStatus");
  if (el) el.textContent = text;
}

/* =========================
   ✅ Animation dés
========================= */

// Défilement rapide pendant ~2.6s, puis arrêt sur les vrais dés
async function playDiceAnimation(finalD1, finalD2, durationMs = 2600) {
  const box = $("diceAnim");
  const die1 = $("die1");
  const die2 = $("die2");
  const total = $("dieTotal");

  if (!box || !die1 || !die2 || !total) return;

  show(box);

  // reset
  total.textContent = "-";
  die1.textContent = "-";
  die2.textContent = "-";

  const start = Date.now();

  // vitesse qui ralentit un peu vers la fin
  // on recalcule le delay à chaque tick
  const tick = async () => {
    const elapsed = Date.now() - start;
    const t = Math.min(1, elapsed / durationMs);

    // ease-out (ralentit à la fin)
    const eased = 1 - Math.pow(1 - t, 3);

    // delay varie de 50ms -> 140ms environ
    const delay = Math.round(50 + eased * 90);

    // nombres aléatoires
    die1.textContent = String(Math.floor(Math.random() * 6) + 1);
    die2.textContent = String(Math.floor(Math.random() * 6) + 1);

    if (elapsed < durationMs) {
      await new Promise((r) => setTimeout(r, delay));
      return tick();
    }

    // stop: valeurs finales
    die1.textContent = String(finalD1);
    die2.textContent = String(finalD2);

    // petit “clic” visuel total
    const sum = Number(finalD1) + Number(finalD2);
    total.textContent = String(sum);
  };

  await tick();
}

function renderCrapsResult(r) {
  const box = $("crapsResult");
  if (!box) return;

  const dice = Array.isArray(r?.dice) ? r.dice : [null, null];
  const total = Number(r?.total);
  const guess = Number(r?.guessTotal);
  const bet = Number(r?.bet);
  const win = !!r?.win;
  const payout = Number(r?.payout || 0);
  const net = Number(r?.net || 0);
  const credits = r?.credits;

  box.classList.remove("hidden");
  box.classList.toggle("win", win);
  box.classList.toggle("lose", !win);

  box.innerHTML = `
    <div class="crTop">
      <div class="crTitle">${win ? "✅ Gagné !" : "❌ Perdu"}</div>
      <div class="crSub">Dés: <b>${dice[0]}</b> + <b>${dice[1]}</b> = <b>${total}</b> (toi: ${guess})</div>
    </div>

    <div class="crRow">
      <div>Mise</div><div><b>${bet}</b></div>
    </div>
    <div class="crRow">
      <div>Payout</div><div><b>${payout}</b></div>
    </div>
    <div class="crRow">
      <div>Net</div><div><b>${net >= 0 ? "+" : ""}${net}</b></div>
    </div>
    ${credits != null ? `<div class="crRow"><div>Crédits</div><div><b>${credits}</b></div></div>` : ""}
  `;
}

async function loadStatus() {
  const raw = await apiGet("/easter-egg/status");

  const keys = raw?.keys || {};
  const allKeys = !!raw?.allKeys;

  document.querySelectorAll("[data-egg-key]").forEach((pill) => {
    const k = pill.getAttribute("data-egg-key");
    setBadge(pill, !!keys?.[k]);
  });

  setBadge($("kSlots"), !!keys.slots);
  setBadge($("kBlackjack"), !!keys.blackjack);
  setBadge($("kRoulette"), !!keys.roulette);
  setBadge($("kPoker"), !!keys.poker);

  if (allKeys) {
    setStatus("✅ Déverrouillé");
    hide($("eeLockedHint"));
    show($("crapsSection"));
  } else {
    setStatus("🔒 Verrouillé");
    show($("eeLockedHint"));
    hide($("crapsSection"));
  }

  return { allKeys, visited: !!raw?.visited };
}

async function onRoll() {
  const guessTotal = Number($("guessTotal")?.value || 0);
  const bet = Number($("betAmount")?.value || 0);

  const btn = $("btnRoll");
  const resBox = $("crapsResult");
  const animBox = $("diceAnim");

  if (btn) btn.disabled = true;

  // cache ancien résultat
  if (resBox) resBox.classList.add("hidden");
  if (animBox) animBox.classList.add("hidden");

  try {
    // 1) On appelle l’API tout de suite (pour obtenir les vrais dés)
    const r = await apiPost("/craps/play", { guessTotal, bet });

    // 2) On joue l’animation 2-3 sec, puis on affiche le résultat final
    const d1 = Array.isArray(r?.dice) ? Number(r.dice[0]) : null;
    const d2 = Array.isArray(r?.dice) ? Number(r.dice[1]) : null;

    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      await playDiceAnimation(d1, d2, 2600);
    }

    // 3) On affiche le résultat final
    renderCrapsResult(r);

    // refresh balance locale si utilisé ailleurs
    if (r?.credits != null && State.user) {
      State.user.credits = r.credits;
    }
  } catch (e) {
    const box = $("crapsResult");
    if (box) {
      box.classList.remove("hidden");
      box.classList.add("lose");
      box.innerHTML = `<div class="crTitle">Erreur</div><div class="crSub">${String(e?.message || e)}</div>`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onBackDashboard() {
  const btn = $("btnBackDashboard");
  if (btn) btn.disabled = true;

  try {
    await apiPost("/easter-egg/visit", {});
  } catch {
    // ignore
  }
  window.location.href = "/public/html/dashboard.html";
}

async function main() {
  if (!State?.token) {
    window.location.href = "/public/html/auth/login.html";
    return;
  }

  const btnBack = $("btnBackDashboard");
  if (btnBack) btnBack.addEventListener("click", onBackDashboard);

  const roll = $("btnRoll");
  if (roll) roll.addEventListener("click", onRoll);

  const g = $("guessTotal");
  const b = $("betAmount");
  if (g) g.addEventListener("keydown", (e) => { if (e.key === "Enter") onRoll(); });
  if (b) b.addEventListener("keydown", (e) => { if (e.key === "Enter") onRoll(); });

  setStatus("Chargement…");
  show($("eeLockedHint"));
  hide($("crapsSection"));

  try {
    await loadStatus();
  } catch (e) {
    console.error("Easter egg status error:", e);
    setStatus("Erreur chargement");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
