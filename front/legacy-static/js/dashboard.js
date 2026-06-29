import { State, setAuth } from "./core/state.js";
import { apiGet, apiPost } from "./core/api.js";
import { logout } from "./core/auth.js";

const $ = (id) => document.getElementById(id);

if (!State.token) location.href = "/public/html/auth/login.html";

const LS = {
  lbEnabled: "dash_lb_enabled",
  lbMetric: "dash_lb_metric",
  lbPeriod: "dash_lb_period",
  lbGame: "dash_lb_game",
  lbOrder: "dash_lb_order",
  chartFilters: "dash_chart_filters",
};

const COLORS = {
  POKER: "var(--green)",
  BLACKJACK: "#b07cff",
  ROULETTE: "var(--red)",
  SLOTS: "var(--gold)",
  POINTS: "#5dd6ff",
};

const SERIES_LABELS = {
  POKER: "Poker",
  BLACKJACK: "Blackjack",
  ROULETTE: "Roulette",
  SLOTS: "Slots",
  POINTS: "Points",
};

const state = {
  lbEnabled: localStorage.getItem(LS.lbEnabled) !== "0",
  lbMetric: localStorage.getItem(LS.lbMetric) || "credits",
  lbPeriod: localStorage.getItem(LS.lbPeriod) || "week",
  lbGame: localStorage.getItem(LS.lbGame) || "GLOBAL",
  lbOrder: localStorage.getItem(LS.lbOrder) || "desc",
  filters: (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS.chartFilters) || "null");
      if (raw && typeof raw === "object") return raw;
    } catch {}
    return { POKER: true, BLACKJACK: true, ROULETTE: true, SLOTS: true, POINTS: true };
  })(),
  perf: null,

  questsOpen: false,
  quests: null,

  lastBadgeRefreshMs: 0,
};

/* =========================
   Chart hover (tooltip)
========================= */
const chartHover = {
  active: false,
  cx: 0,
  cy: 0,
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function initChartHover() {
  const canvas = $("perfChart");
  const tip = document.getElementById("chartTip");
  if (!canvas) return;

  canvas.addEventListener("mousemove", (ev) => {
    const r = canvas.getBoundingClientRect();
    chartHover.active = true;

    // coords in canvas space
    chartHover.cx = (ev.clientX - r.left) * (canvas.width / r.width);
    chartHover.cy = (ev.clientY - r.top) * (canvas.height / r.height);

    renderChart();
  });

  canvas.addEventListener("mouseleave", () => {
    chartHover.active = false;
    if (tip) tip.classList.add("hidden");
    renderChart();
  });
}

function setStatus(text) {
  const el = $("statusPill");
  if (!el) return;
  el.style.display = "inline-flex";
  el.textContent = text;
}

function fmtSigned(n) {
  const x = Number(n) || 0;
  return `${x >= 0 ? "+" : ""}${x}`;
}

function fmtPlain(n) {
  const x = Number(n) || 0;
  return x.toLocaleString("fr-FR");
}

function fmtCompact(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (Math.abs(x) >= 1_000) return `${(x / 1_000).toFixed(1)}k`;
  return String(Math.round(x));
}

function cssVar(v) {
  const s = String(v || "");
  if (!s.startsWith("var(")) return s;
  const name = s.slice(4, -1).trim();
  const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return computed || s;
}

// Badge quests
function setQuestsBadge(count) {
  const badge = $("questsBadge");
  if (!badge) return;
  const n = Number(count || 0);
  if (n > 0) {
    badge.textContent = String(n);
    badge.classList.remove("hidden");
    badge.setAttribute("aria-hidden", "false");
  } else {
    badge.textContent = "0";
    badge.classList.add("hidden");
    badge.setAttribute("aria-hidden", "true");
  }
}

/* ✅ NEW: affiche la tuile Easter Egg seulement si la quête secret_easter_egg a été CLAIM */
function updateEasterEggTileFromQuests(questsArr) {
  const tile = document.getElementById("easterEggTile");
  if (!tile) return;

  const q = (Array.isArray(questsArr) ? questsArr : []).find((x) => x?.key === "secret_easter_egg");
  const claimed = !!q?.lastClaimedAt; // visible uniquement après claim (1 fois par compte)
  tile.classList.toggle("hidden", !claimed);
}

/* ---------- UI init ---------- */
const logoutBtn = $("logoutBtn");
if (logoutBtn) logoutBtn.onclick = () => logout();

const refreshBtn = $("refreshBtn");
if (refreshBtn) refreshBtn.onclick = () => refreshAll(true);

const questsBtn = $("questsBtn");
if (questsBtn) questsBtn.onclick = () => openQuestsPanel();

const questsClose = $("questsClose");
if (questsClose) questsClose.onclick = () => closeQuestsPanel();

const questsOverlay = $("questsOverlay");
if (questsOverlay) questsOverlay.onclick = () => closeQuestsPanel();

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.questsOpen) closeQuestsPanel();
});

function applyLeaderboardVisibility() {
  const panel = $("leaderboardPanel");
  const btn = $("toggleLbBtn");
  if (!panel || !btn) return;

  if (state.lbEnabled) {
    panel.classList.remove("hidden");
    btn.textContent = "Leaderboard: ON";
  } else {
    panel.classList.add("hidden");
    btn.textContent = "Leaderboard: OFF";
  }
  localStorage.setItem(LS.lbEnabled, state.lbEnabled ? "1" : "0");
}

const toggleLbBtn = $("toggleLbBtn");
if (toggleLbBtn) {
  toggleLbBtn.onclick = () => {
    state.lbEnabled = !state.lbEnabled;
    applyLeaderboardVisibility();
  };
}
applyLeaderboardVisibility();

const metricSelect = $("metricSelect");
const periodSelect = $("periodSelect");
const gameSelect = $("gameSelect");
const orderSelect = $("orderSelect");

const periodWrap = $("periodWrap");
const gameWrap = $("gameWrap");
const orderWrap = $("orderWrap");
const lbControls = $("lbControls");

if (metricSelect) metricSelect.value = state.lbMetric;
if (periodSelect) periodSelect.value = state.lbPeriod;
if (gameSelect) gameSelect.value = state.lbGame;
if (orderSelect) orderSelect.value = state.lbOrder;

function applyLeaderboardModeUI() {
  const isBalance = state.lbMetric === "balance";

  if (periodWrap) periodWrap.classList.toggle("hidden", isBalance);
  if (gameWrap) gameWrap.classList.toggle("hidden", isBalance);
  if (orderWrap) orderWrap.classList.toggle("hidden", !isBalance);

  if (lbControls) lbControls.classList.toggle("balanceMode", isBalance);
}

applyLeaderboardModeUI();

if (metricSelect) {
  metricSelect.onchange = () => {
    state.lbMetric = metricSelect.value;
    localStorage.setItem(LS.lbMetric, state.lbMetric);
    applyLeaderboardModeUI();
    loadLeaderboard();
  };
}
if (periodSelect) {
  periodSelect.onchange = () => {
    state.lbPeriod = periodSelect.value;
    localStorage.setItem(LS.lbPeriod, state.lbPeriod);
    loadLeaderboard();
  };
}
if (gameSelect) {
  gameSelect.onchange = () => {
    state.lbGame = gameSelect.value;
    localStorage.setItem(LS.lbGame, state.lbGame);
    loadLeaderboard();
  };
}
if (orderSelect) {
  orderSelect.onchange = () => {
    state.lbOrder = orderSelect.value;
    localStorage.setItem(LS.lbOrder, state.lbOrder);
    loadLeaderboard();
  };
}

const filtersEl = $("filters");
if (filtersEl) {
  for (const cb of filtersEl.querySelectorAll("input[type=checkbox]")) {
    const key = cb.dataset.series;
    cb.checked = !!state.filters[key];
    cb.addEventListener("change", () => {
      state.filters[key] = cb.checked;
      localStorage.setItem(LS.chartFilters, JSON.stringify(state.filters));
      renderChart();
    });
  }
}

/* ---------- Topbar ---------- */
function setTopbar(user) {
  const u = $("username");
  const c = $("creditsPill");
  const p = $("pointsPill");
  if (u) u.textContent = user?.username ? `${user.username}` : "—";
  if (c) c.textContent = `Crédits: ${user?.credits ?? "—"}`;
  if (p) p.textContent = `Points: ${user?.points ?? 0}`;
}

async function refreshUser() {
  const candidates = ["/auth/me", "/users/me", "/users/profile", "/users/current", "/me"];
  for (const url of candidates) {
    try {
      const me = await apiGet(url);
      if (me && (me.username || me.userId || me.id)) {
        const merged = {
          userId: me.userId ?? me.id ?? State.user?.userId,
          username: me.username ?? State.user?.username,
          credits: me.credits ?? me.balance ?? me.money ?? State.user?.credits,
          points: me.points ?? State.user?.points ?? 0,
        };
        setAuth(State.token, merged);
        setTopbar(merged);
        return;
      }
    } catch {}
  }
  setTopbar(State.user);
}

/* ---------- Chart ---------- */
function computeCumulative(perf) {
  const labels = perf?.labels || [];
  const series = perf?.series || {};
  const values = {};
  const deltas = {};

  for (const key of Object.keys(SERIES_LABELS)) {
    const rows = series[key] || [];
    let acc = 0;

    deltas[key] = labels.map((_, i) => {
      const r = rows[i] || {};
      return key === "POINTS" ? Number(r.deltaPoints || 0) : Number(r.deltaCredits || 0);
    });

    values[key] = deltas[key].map((d) => {
      acc += Number(d || 0);
      return acc;
    });
  }

  return { labels, values, deltas };
}

function renderLegend(perfCum) {
  const el = $("legend");
  if (!el) return;
  el.innerHTML = "";

  for (const key of Object.keys(SERIES_LABELS)) {
    if (!state.filters[key]) continue;
    const arr = perfCum?.values?.[key] || [];
    const last = arr.length ? arr[arr.length - 1] : 0;
    const dotColor = cssVar(COLORS[key]);

    const item = document.createElement("div");
    item.className = "legendItem";
    item.innerHTML = `
      <span class="legendDot" style="background:${dotColor}"></span>
      <span>${SERIES_LABELS[key]}: <b>${fmtSigned(last)}</b>${key === "POINTS" ? " pts" : ""}</span>
    `;
    el.appendChild(item);
  }
}

function drawChart(perfCum) {
  const canvas = $("perfChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const tip = $("chartTip");
  const wrap = $("chartWrap");

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.10)";
  ctx.fillRect(0, 0, w, h);

  const padL = 42, padR = 12, padT = 16, padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const labels = perfCum.labels || [];
  const activeKeys = Object.keys(SERIES_LABELS).filter((k) => state.filters[k]);

  if (!labels.length || !activeKeys.length) {
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "14px system-ui";
    ctx.fillText("Aucune donnée (ou filtres désactivés).", padL, padT + 20);
    if (tip) tip.classList.add("hidden");
    return;
  }

  let minY = Infinity, maxY = -Infinity;
  for (const k of activeKeys) {
    const arr = perfCum.values?.[k] || [];
    for (const v of arr) {
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) { minY = -1; maxY = 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }

  const range = maxY - minY;
  minY -= range * 0.08;
  maxY += range * 0.08;

  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "11px system-ui";
  for (let i = 0; i <= gridLines; i++) {
    const t = 1 - i / gridLines;
    const val = minY + t * (maxY - minY);
    const y = padT + (plotH * i) / gridLines;
    ctx.fillText(fmtCompact(val), 6, y + 4);
  }

  ctx.fillText(labels[0] ?? "", padL, h - 10);
  const lastLabel = labels[labels.length - 1] ?? "";
  const lastW = ctx.measureText(lastLabel).width;
  ctx.fillText(lastLabel, padL + plotW - lastW, h - 10);

  const xFor = (i) => padL + (plotW * i) / Math.max(1, labels.length - 1);
  const yFor = (v) => padT + ((maxY - v) * plotH) / (maxY - minY);

  for (const k of activeKeys) {
    const arr = perfCum.values?.[k] || [];
    if (!arr.length) continue;

    ctx.strokeStyle = cssVar(COLORS[k]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = xFor(i);
      const y = yFor(arr[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (!chartHover.active) {
    if (tip) tip.classList.add("hidden");
    return;
  }

  const mx = chartHover.cx;
  const my = chartHover.cy;

  if (mx < padL || mx > padL + plotW || my < padT || my > padT + plotH) {
    if (tip) tip.classList.add("hidden");
    return;
  }

  const idx = clamp(
    Math.round(((mx - padL) / plotW) * (labels.length - 1)),
    0,
    labels.length - 1
  );

  const x = xFor(idx);

  let bestKey = null;
  let bestDist = Infinity;
  let bestY = 0;

  for (const k of activeKeys) {
    const arr = perfCum.values?.[k] || [];
    if (!arr.length) continue;

    const vCum = Number(arr[idx] ?? 0);
    const y = yFor(vCum);
    const d = Math.abs(my - y);
    if (d < bestDist) {
      bestDist = d;
      bestKey = k;
      bestY = y;
    }
  }

  if (!bestKey) {
    if (tip) tip.classList.add("hidden");
    return;
  }

  const bestDelta = Number((perfCum.deltas?.[bestKey] || [])[idx] ?? 0);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, padT);
  ctx.lineTo(x, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.beginPath();
  ctx.arc(x, bestY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = cssVar(COLORS[bestKey]);
  ctx.beginPath();
  ctx.arc(x, bestY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!tip || !wrap) return;

  const title = labels[idx] ?? `Point ${idx + 1}`;
  const dot = cssVar(COLORS[bestKey]);

  tip.innerHTML = `
    <div class="tipTop">
      <span class="tipDot" style="background:${dot}"></span>
      <span class="tipLabel">${SERIES_LABELS[bestKey]} • ${title} (n°${idx + 1})</span>
    </div>
    <div class="tipVal">${fmtSigned(bestDelta)}${bestKey === "POINTS" ? " pts" : ""}</div>
  `;
  tip.classList.remove("hidden");

  const GAP = 10;
  const canvasX = canvas.offsetLeft;
  const canvasY = canvas.offsetTop;

  const pointRelX = canvasX + (x / canvas.width) * canvas.clientWidth;
  const pointRelY = canvasY + (bestY / canvas.height) * canvas.clientHeight;

  tip.style.left = `${pointRelX}px`;
  tip.style.top = `${pointRelY}px`;

  let transformX = `calc(-100% - ${GAP}px)`;
  let transformY = `calc(-100% - ${GAP}px)`;
  tip.style.transform = `translate(${transformX}, ${transformY})`;

  const tipW = tip.offsetWidth || 220;
  const tipH = tip.offsetHeight || 70;

  let projLeft = pointRelX - tipW - GAP;
  let projTop = pointRelY - tipH - GAP;

  if (projLeft < 8) {
    transformX = `${GAP}px`;
    tip.style.transform = `translate(${transformX}, ${transformY})`;
    projLeft = pointRelX + GAP;
  }

  if (projTop < 8) {
    transformY = `${GAP}px`;
    tip.style.transform = `translate(${transformX}, ${transformY})`;
    projTop = pointRelY + GAP;
  }

  if (projLeft + tipW > wrap.clientWidth - 8) {
    transformX = `calc(-100% - ${GAP}px)`;
    tip.style.transform = `translate(${transformX}, ${transformY})`;
    projLeft = pointRelX - tipW - GAP;
  }

  if (projTop + tipH > wrap.clientHeight - 8) {
    transformY = `calc(-100% - ${GAP}px)`;
    tip.style.transform = `translate(${transformX}, ${transformY})`;
    projTop = pointRelY - tipH - GAP;
    if (projTop < 8) {
      tip.style.transform = `translate(${transformX}, ${GAP}px)`;
    }
  }
}

function renderChart() {
  if (!state.perf) {
    drawChart({ labels: [], values: {}, deltas: {} });
    const legend = $("legend");
    if (legend) legend.innerHTML = "";
    return;
  }
  const perfCum = computeCumulative(state.perf);
  drawChart(perfCum);
  renderLegend(perfCum);
}

async function loadPerf() {
  try {
    const perf = await apiGet("/dashboard/perf?limit=10");
    state.perf = perf;
    renderChart();
  } catch (e) {
    state.perf = null;
    renderChart();
    setStatus(`Graph: ${String(e.message || e)}`);
  }
}

/* ---------- Leaderboard ---------- */
function rowHtml(rank, username, value, isSelf) {
  const cls = `lbRow${isSelf ? " self" : ""}`;
  const displayName = isSelf ? "YOU" : (username ?? "—");

  const isBalance = state.lbMetric === "balance";
  const isPoints = state.lbMetric === "points";

  const valueText = isBalance
    ? fmtPlain(value ?? 0)
    : `${fmtSigned(value ?? 0)}${isPoints ? " pts" : ""}`;

  return `
    <div class="${cls}">
      <div class="lbRowTop">
        <div>
          <span class="lbRank">#${rank}</span>
          <span class="lbName${isSelf ? " youName" : ""}"> ${displayName}</span>
        </div>
        <div class="lbVal">${valueText}</div>
      </div>
    </div>
  `;
}

async function loadLeaderboard() {
  if (!state.lbEnabled) return;

  const lbStatus = $("lbStatus");
  const lbList = $("lbList");
  if (!lbStatus || !lbList) return;

  lbStatus.textContent = "Chargement…";
  lbList.innerHTML = "";

  try {
    const me = State.user?.username ? String(State.user.username) : null;

    let rows;
    if (state.lbMetric === "balance") {
      const q = new URLSearchParams({
        order: state.lbOrder || "desc",
        limit: "200",
      }).toString();
      rows = await apiGet(`/dashboard/balance-leaderboard?${q}`);
    } else {
      const q = new URLSearchParams({
        metric: state.lbMetric,
        period: state.lbPeriod,
        game: state.lbGame,
        limit: "200",
      }).toString();
      rows = await apiGet(`/dashboard/leaderboard?${q}`);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      lbStatus.textContent = `Aucune donnée • Total: 0 joueur`;
      lbList.innerHTML = `<div class="sub">Aucune donnée.</div>`;
      return;
    }

    const totalPlayers = rows.length;

    if (state.lbMetric === "balance") {
      const triTxt = (state.lbOrder === "asc") ? "croissant" : "décroissant";
      lbStatus.textContent = `Top 10 • balance (global) • tri ${triTxt} • Total: ${totalPlayers} joueurs`;
    } else {
      lbStatus.textContent =
        `Top 10 • ${state.lbMetric} • ${state.lbPeriod} • ${state.lbGame} • Total: ${totalPlayers} joueurs`;
    }

    const top10 = rows.slice(0, 10);
    let html = "";

    top10.forEach((r, i) => {
      const isSelf = me && r.username === me;
      html += rowHtml(i + 1, r.username, r.value, isSelf);
    });

    if (me) {
      const myIndex = rows.findIndex((r) => r.username === me);
      if (myIndex >= 10) {
        html += `<div class="lbSep">···</div>`;
        const mine = rows[myIndex];
        html += rowHtml(myIndex + 1, mine.username, mine.value, true);
      }
    }

    lbList.innerHTML = html;
  } catch (e) {
    lbStatus.textContent = `Erreur: ${String(e.message || e)}`;
  }
}

/* =========================
   Quests
========================= */
function openQuestsPanel() {
  state.questsOpen = true;
  const panel = $("questsPanel");
  const overlay = $("questsOverlay");
  if (!panel || !overlay) return;

  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  loadQuests(true);
}

function closeQuestsPanel() {
  state.questsOpen = false;
  const panel = $("questsPanel");
  const overlay = $("questsOverlay");
  if (!panel || !overlay) return;

  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}

function formatTimeLeft(iso) {
  if (!iso) return "disponible";
  const t = new Date(iso).getTime();
  const ms = t - Date.now();
  if (ms <= 0) return "disponible";

  const totalMins = Math.ceil(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 60 * 24) / 60);
  const mins = totalMins - days * 60 * 24 - hours * 60;

  if (days >= 1) return `${days}d ${hours}h ${mins}m`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function questCardHtml(q) {
  const progress = Number(q.progress || 0);
  const goal = Math.max(1, Number(q.goal || 1));
  const pct = Math.max(0, Math.min(100, Math.round((progress / goal) * 100)));

  const cooldownText = q.nextAvailableAt ? formatTimeLeft(q.nextAvailableAt) : "disponible";
  const cooldownReady = cooldownText === "disponible";
  const cooldownClass = cooldownReady ? "qBadge good" : "qBadge warn";
  const canClaim = !!q.canClaim;

  return `
    <div class="questCard ${canClaim ? "claimable" : ""}">
      <div class="questTop">
        <div>
          <div class="questName">${q.title ?? q.key}</div>
          <div class="questDesc">${q.description ?? ""}</div>
        </div>
        <div class="qBadge good">+${Number(q.rewardCredits || 0)} crédits</div>
      </div>

      <div class="qBadges">
        <span class="${cooldownClass}">cooldown: ${cooldownText}</span>
        <span class="qBadge">progress: ${progress}/${goal}</span>
      </div>

      <div class="qProgress">
        <div class="qBar">
          <div class="qFill" data-pct="${pct}" style="width:0%"></div>
        </div>
      </div>

      <div class="qActions">
        <div class="sub">recharge: ${Number(q.cooldownHours || 0)}h</div>
        <button class="qClaimBtn" ${canClaim ? "" : "disabled"} data-quest-claim="${q.key}">
          ${canClaim ? "Réclamer" : "Indisponible"}
        </button>
      </div>
    </div>
  `;
}

function animateQuestBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".qFill[data-pct]").forEach((el) => {
      const pct = Number(el.getAttribute("data-pct") || "0");
      el.style.width = `${pct}%`;
    });
  });
}

async function claimQuest(key) {
  try {
    const qs = $("questsStatus");
    if (qs) qs.textContent = "Réclamation…";

    await apiPost(`/quests/${encodeURIComponent(key)}/claim`, {}, true);
    await refreshUser();
    await loadQuests(true);

    if (qs) {
      qs.textContent = "✅ Réclamé !";
      setTimeout(() => {
        if (state.questsOpen) qs.textContent = "—";
      }, 1200);
    }
  } catch (e) {
    const qs = $("questsStatus");
    if (qs) qs.textContent = `Erreur: ${String(e.message || e)}`;
  }
}

function sortQuests(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  const toMs = (iso) => (iso ? new Date(iso).getTime() : 0);

  arr.sort((a, b) => {
    const ac = a.canClaim ? 0 : 1;
    const bc = b.canClaim ? 0 : 1;
    if (ac !== bc) return ac - bc;

    const an = a.nextAvailableAt ? toMs(a.nextAvailableAt) : 0;
    const bn = b.nextAvailableAt ? toMs(b.nextAvailableAt) : 0;
    return an - bn;
  });

  return arr;
}

async function loadQuests(showStatus) {
  const qsEl = $("questsStatus");
  const listEl = $("questsList");
  if (showStatus && qsEl) qsEl.textContent = "Chargement…";

  try {
    const qs = await apiGet("/quests");
    const raw = Array.isArray(qs) ? qs : [];

    state.quests = sortQuests(raw);
    const claimable = state.quests.filter((q) => !!q.canClaim).length;
    setQuestsBadge(claimable);

    // ✅ NEW
    updateEasterEggTileFromQuests(state.quests);

    if (listEl) {
      listEl.innerHTML = state.quests.length
        ? state.quests.map(questCardHtml).join("")
        : `<div class="sub">Aucune quête.</div>`;
    }

    document.querySelectorAll("[data-quest-claim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.getAttribute("data-quest-claim");
        if (k) claimQuest(k);
      });
    });

    animateQuestBars();
    if (showStatus && qsEl) qsEl.textContent = "OK";
  } catch (e) {
    if (showStatus && qsEl) qsEl.textContent = `Erreur`;
  }
}

async function refreshQuestsBadgeOnly() {
  const now = Date.now();
  if (now - state.lastBadgeRefreshMs < 15000) return;
  state.lastBadgeRefreshMs = now;

  try {
    const qs = await apiGet("/quests");
    const arr = Array.isArray(qs) ? qs : [];
    const claimable = arr.filter((q) => !!q.canClaim).length;
    setQuestsBadge(claimable);

    // ✅ NEW (utile même si le panel n’est pas ouvert)
    updateEasterEggTileFromQuests(arr);
  } catch {}
}

/* ---------- Global refresh ---------- */
let refreshLock = false;

async function refreshAll(showStatus) {
  if (refreshLock) return;
  refreshLock = true;

  if (showStatus) setStatus("Refresh…");

  try {
    await refreshUser();
    await loadPerf();
    await loadLeaderboard();

    if (state.questsOpen) await loadQuests(false);
    else await refreshQuestsBadgeOnly();

    if (showStatus) setStatus("OK");
  } catch (e) {
    if (showStatus) setStatus(String(e.message || e));
  } finally {
    refreshLock = false;
  }
}

/* ---------- init ---------- */
setTopbar(State.user);
initChartHover();
refreshAll(true);
setInterval(() => refreshAll(false), 6000);

window.addEventListener("resize", () => {
  renderChart();
});
