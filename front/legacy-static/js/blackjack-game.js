import {
  $, api, requireToken, qs, setQs, normCode, cardImgSrc
} from "./blackjack-common.js";


// ------------------------
// Easter egg: popup clé débloquée
// ------------------------
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
    case "slots": return "Slots";
    case "blackjack": return "Blackjack";
    case "roulette": return "Roulette";
    case "poker": return "Poker";
    default: return "Clé";
  }
}

function showKeyToast(keyLabel) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="tTitle">🔑 Clé débloquée !</div>
    <div class="tText">Tu as trouvé une clé secrète.</div>
    <div class="tKey">${keyLabel}</div>
  `;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function handleUnlockedNow(payload) {
  const arr = payload?.unlockedNow;
  if (Array.isArray(arr) && arr.length) {
    for (const k of arr) showKeyToast(keyToLabel(k));
  }
}

const codePill = $("codePill");
const statusPill = $("statusPill");
const phasePill = $("phasePill");
const topStatus = $("topStatus");

const dealerRow = $("dealerRow");
const playersRows = $("playersRows");
const roundResultEl = $("roundResult");

const betHint = $("betHint");
const turnHint = $("turnHint");

const chatBox = $("chatBox");
const sockState = $("sockState");

const startBtn = $("startBtn");

/* ✅ balance pill */
const balancePill = $("balancePill");

/* ✅ rules UI */
const rulesBtn = $("rulesBtn");
const rulesPanel = $("rulesPanel");
const rulesBackdrop = $("rulesBackdrop");
const rulesCloseBtn = $("rulesCloseBtn");

let tableCode = normCode(qs("code"));
if (!tableCode) tableCode = "";
if (tableCode) setQs("code", tableCode);

function setStatus(msg){ topStatus.textContent = msg || ""; }
function logChat(text, cls=""){
  const d = document.createElement("div");
  d.className = "msg " + (cls || "");
  d.textContent = text;
  chatBox.appendChild(d);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function cardKey(c){ return `${c.rank}${c.suit}`; }
function cardsSignature(cards){ return (cards||[]).map(cardKey).join("|"); }

let lastDealerSig = "";
let lastPlayerSigByUserId = new Map(); // userId -> signature

function fmtCards(cards, shouldAnimateNew = false, prevSig = ""){
  const wrap = document.createElement("div");
  wrap.className = "cards";

  const prev = new Set((prevSig || "").split("|").filter(Boolean));

  for (const c of (cards || [])){
    const img = document.createElement("img");
    img.className = "cardImg";
    img.src = cardImgSrc(c);
    img.alt = cardKey(c);

    const ck = cardKey(c);
    if (shouldAnimateNew && !prev.has(ck)) {
      img.classList.add("deal-in");
    }

    wrap.appendChild(img);
  }
  return wrap;
}

function renderDealer(game){
  dealerRow.innerHTML = "";
  const d = game?.dealer;
  if (!d) return;

  const currentSig = cardsSignature(d.cards);
  const row = document.createElement("div");
  row.className = "handRow";
  row.innerHTML = `
    <div class="handLeft">
      <div class="handName">Dealer</div>
      <div class="handMeta">value: <span class="mono">${d.value ?? "?"}</span></div>
    </div>
  `;
  row.appendChild(fmtCards(d.cards, true, lastDealerSig));
  dealerRow.appendChild(row);

  lastDealerSig = currentSig;
}

function renderPlayers(game, you){
  playersRows.innerHTML = "";
  const players = game?.players || {};
  const keys = Object.keys(players);

  for (const k of keys){
    const p = players[k];
    const row = document.createElement("div");
    row.className = "handRow";

    const youTag = (you && (p.userId === you.userId)) ? " (YOU)" : "";
    row.innerHTML = `
      <div class="handLeft">
        <div class="handName">${p.username}${youTag}</div>
        <div class="handMeta">
          bet: <span class="mono">${p.bet}</span> • value: <span class="mono">${p.value}</span> • status: <span class="mono">${p.status}</span>
        </div>
      </div>
    `;

    const prevSig = lastPlayerSigByUserId.get(p.userId) || "";
    row.appendChild(fmtCards(p.cards, true, prevSig));
    playersRows.appendChild(row);

    lastPlayerSigByUserId.set(p.userId, cardsSignature(p.cards));
  }
}

function updateTop(meta){
  codePill.textContent = tableCode || "—";
  statusPill.textContent = meta?.table?.status || "—";
  phasePill.textContent = meta?.game?.phase || "—";

  // ✅ Start visible uniquement pour l’owner
  const ownerId = meta?.table?.ownerId;
  const youId = meta?.you?.userId;
  const isOwner = ownerId && youId && ownerId === youId;

  startBtn.style.display = isOwner ? "" : "none";
}

function updateRoundResult(meta){
  const rr = meta?.game?.roundResult;
  if (!rr) { roundResultEl.textContent = "—"; return; }
  roundResultEl.textContent = rr.message || JSON.stringify(rr);
}

function updateTurnUI(meta){
  const g = meta?.game;
  if (!g){ betHint.textContent=""; turnHint.textContent=""; return; }

  betHint.textContent = (g.phase === "betting")
    ? "Phase betting : tous les joueurs doivent miser."
    : "Bet fermé (pas en betting).";

  if (g.phase !== "player_turns"){
    turnHint.textContent = "Miser d'abord.";
    $("hitBtn").disabled = true;
    $("standBtn").disabled = true;
    return;
  }

  const currentId = g.turnOrder?.[g.currentTurnIndex];
  turnHint.textContent = `Tour: ${currentId ?? "?"}`;

  const youId = meta?.you?.userId;
  const isYourTurn = (youId && currentId === youId);
  $("hitBtn").disabled = !isYourTurn;
  $("standBtn").disabled = !isYourTurn;
}

/* ===================== ✅ BALANCE (throttled) ===================== */
let lastBalanceFetch = 0;

async function refreshBalance(force = false){
  if (!balancePill) return;

  const now = Date.now();
  if (!force && (now - lastBalanceFetch) < 2500) return; // throttle

  lastBalanceFetch = now;

  const res = await api("/auth/me", "GET");
  if (!res.ok) return;

  const credits = res?.data?.credits ?? res?.data?.user?.credits;
  if (credits === undefined || credits === null) return;

  balancePill.textContent = String(credits);
}

/* ===================== ✅ RULES PANEL ===================== */
function openRules(){
  if (!rulesPanel || !rulesBackdrop) return;
  rulesPanel.classList.add("open");
  rulesBackdrop.classList.add("open");
  rulesPanel.setAttribute("aria-hidden", "false");
  rulesBackdrop.setAttribute("aria-hidden", "false");
}
function closeRules(){
  if (!rulesPanel || !rulesBackdrop) return;
  rulesPanel.classList.remove("open");
  rulesBackdrop.classList.remove("open");
  rulesPanel.setAttribute("aria-hidden", "true");
  rulesBackdrop.setAttribute("aria-hidden", "true");
}

/* ---------------- Socket chat ---------------- */
let socket = null;

function ensureSocket(){
  if (socket && socket.connected) return;

  const token = requireToken();
  socket = io(window.location.origin + "/blackjack", {
    auth: { token },
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    sockState.textContent = "connected";
    logChat("✅ joined chat", "sys");
    joinChatRoom();
  });

  socket.on("disconnect", (r) => {
    sockState.textContent = "disconnected";
    logChat("déconnecté du chat: " + r, "err");
  });

  socket.on("chatSystem", (msg) => {
    logChat(`[SYSTEM] ${msg.message}`, "sys");
  });
  socket.on("chatMessage", (msg) => {
    logChat(`${msg.username}: ${msg.message}`);
  });
  socket.on("chatError", (e) => {
    logChat("chatError: " + JSON.stringify(e), "err");
  });
}

function joinChatRoom(){
  if (!socket || !socket.connected) return;
  if (!/^[A-Z]{6}$/.test(tableCode)) return;
  socket.emit("joinTableChat", { tableCode });
}

/* ---------------- API actions ---------------- */
async function refreshState(){
  if (!/^[A-Z]{6}$/.test(tableCode)){
    setStatus("Code table invalide (6 lettres).");
    return;
  }
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/state`, "GET");
  if (!res.ok){
    setStatus(`Erreur (${res.status}): ${JSON.stringify(res.data)}`);
    return;
  }
  setStatus("");
  updateTop(res.data);
  renderDealer(res.data.game);
  renderPlayers(res.data.game, res.data.you);
  updateRoundResult(res.data);
  updateTurnUI(res.data);

  // ✅ balance live (throttled)
  await refreshBalance(false);
}

async function startGame(){
  setStatus("Start...");
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/start`, "POST");
  if (!res.ok){
    setStatus(`Start error (${res.status}): ${JSON.stringify(res.data)}`);
    return;
  }
  setStatus("Start OK");
  handleUnlockedNow(res.data);

  await refreshState();
  await refreshBalance(true);
}

async function bet(){
  const amount = Number($("betAmount").value || 0);
  if (!amount || amount <= 0){
    setStatus("Bet invalide.");
    return;
  }
  setStatus("Bet...");
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/bet`, "POST", { amount });
  if (!res.ok){
    setStatus(`Bet error (${res.status}): ${JSON.stringify(res.data)}`);
    return;
  }
  setStatus("Bet OK");
  handleUnlockedNow(res.data);

  await refreshState();
  await refreshBalance(true);
}

async function action(act){
  setStatus(act + "...");
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/action`, "POST", { action: act });
  if (!res.ok){
    setStatus(`Action error (${res.status}): ${JSON.stringify(res.data)}`);
    return;
  }
  setStatus("Action OK");
  handleUnlockedNow(res.data);

  await refreshState();
  await refreshBalance(true);
}

async function leaveAndGoLobby(){
  if (!/^[A-Z]{6}$/.test(tableCode)){
    window.location.href = "./blackjack-lobby.html";
    return;
  }

  setStatus("Leave...");
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/leave`, "POST");
  if (!res.ok) {
    setStatus(`Leave error (${res.status}) -> lobby...`);
  } else {
    setStatus("Leave OK -> lobby...");
  }

  try { if (socket) socket.disconnect(); } catch {}
  socket = null;

  window.location.href = "./blackjack-lobby.html";
}

async function leaveAndGoDashboard(){
  if (!/^[A-Z]{6}$/.test(tableCode)){
    window.location.href = "./dashboard.html";
    return;
  }
    setStatus("Leave...");
  const res = await api(`/blackjack/tables/${encodeURIComponent(tableCode)}/leave`, "POST");
  if (!res.ok) {
    setStatus(`Leave error (${res.status}) -> dashboard...`);
  } else {
    setStatus("Leave OK -> dashboard...");
  }

  try { if (socket) socket.disconnect(); } catch {}
  socket = null;

  window.location.href = "./dashboard.html";
}

/* ---------------- UI wiring ---------------- */
$("leaveBtn").addEventListener("click", leaveAndGoLobby);
$("backDashboardBtn").addEventListener("click", leaveAndGoDashboard);

startBtn.addEventListener("click", startGame);
$("betBtn").addEventListener("click", bet);

$("hitBtn").addEventListener("click", () => action("hit"));
$("standBtn").addEventListener("click", () => action("stand"));

$("sendChatBtn").addEventListener("click", () => {
  const msg = $("chatMsg").value.trim();
  if (!msg) return;

  ensureSocket();
  joinChatRoom();

  socket.emit("sendMessage", { tableCode, message: msg });
  $("chatMsg").value = "";
});

$("chatMsg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("sendChatBtn").click();
  }
});

/* ✅ rules events */
if (rulesBtn) rulesBtn.addEventListener("click", openRules);
if (rulesCloseBtn) rulesCloseBtn.addEventListener("click", closeRules);
if (rulesBackdrop) rulesBackdrop.addEventListener("click", closeRules);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeRules();
});

// ✅ refresh auto (remplace le bouton "voir cartes")
let refreshTimer = null;

// Init
requireToken();
if (!tableCode){
  setStatus("Aucun code en URL. Retourne au lobby.");
} else {
  codePill.textContent = tableCode;
  ensureSocket();
  joinChatRoom();

  await refreshState();
  await refreshBalance(true);

  // refresh toutes les 1s (change si tu veux)
  refreshTimer = setInterval(() => {
    refreshState().catch(() => {});
  }, 1000);
}

$("leaveBtn").addEventListener("click", () => {
  location.href = "../html/blackjack-lobby.html";
});