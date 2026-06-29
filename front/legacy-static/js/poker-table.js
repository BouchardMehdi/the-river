import { State, setCurrentTableId } from "./core/state.js";

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

import { apiPost, apiGet } from "./core/api.js";
import { connectPokerSocket, joinChat, sendChat, onSocketEvent, getSocket } from "./core/socket.js";

const $ = (id) => document.getElementById(id);

if (!State.token) location.href = "../html/auth/login.html";
if (!State.currentTableId) location.href = "../html/poker-menu.html";

const tableId = State.currentTableId.toUpperCase();
$("tablePill").textContent = tableId;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function isBotUsername(username){
  return /-bot-/i.test(String(username || ""));
}

function addMsg(text, cls="") {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  $("chatBox").appendChild(div);
  $("chatBox").scrollTop = $("chatBox").scrollHeight;
}

function addErrorToChat(err) {
  const msg = (typeof err === "string")
    ? err
    : (err?.message ? err.message : JSON.stringify(err));
  addMsg(msg, "err");
}

/* =========================================================
   ✅ CREDITS (affichage topHeader)
========================================================= */
let lastCredits = null;

async function fetchCreditsOnce() {
  const el = document.getElementById("creditsValue");
  if (!el) return;

  const candidates = [
    "/users/me",
    "/users/profile",
    "/users/current",
    "/auth/me",
    "/me",
    "/users",
  ];

  for (const url of candidates) {
    try {
      const data = await apiGet(url);

      const credits =
        data?.credits ??
        data?.balance ??
        data?.money ??
        data?.coins ??
        data?.user?.credits ??
        data?.user?.balance ??
        data?.user?.money ??
        null;

      if (credits !== null && credits !== undefined) {
        if (credits !== lastCredits) {
          lastCredits = credits;
          el.textContent = String(credits);
        }
        return;
      }
    } catch {
      // try next
    }
  }
}

/* ========================================================= */

function cardUrl(code) {
  return `../assets/img/${code}.svg`;
}
function normalizeCardCode(c){
  if (!c) return null;
  if (typeof c === "string") return c.toUpperCase();
  const rank = String(c.rank ?? c.value ?? c.r ?? c.v ?? "").toUpperCase();
  const suitRaw = String(c.suit ?? c.s ?? "").toUpperCase();
  const suit = suitRaw.startsWith("S") ? "S"
    : suitRaw.startsWith("H") ? "H"
    : suitRaw.startsWith("D") ? "D"
    : "C";
  if (!rank) return null;
  return `${rank}${suit}`;
}

function renderCardsAnimated(containerId, codes, prevKey) {
  const host = $(containerId);
  const clean = (codes || []).map(normalizeCardCode).filter(Boolean);

  const key = clean.join("|");
  if (key === prevKey.value) return;
  prevKey.value = key;

  host.innerHTML = "";
  clean.forEach((code, i) => {
    const img = document.createElement("img");
    img.className = "cardImg";
    img.alt = code;
    img.src = cardUrl(code);
    img.onerror = () => { img.onerror = null; img.src = "../assets/img/back.svg"; };
    setTimeout(() => img.classList.add("deal-in"), 70 * i);
    host.appendChild(img);
  });
}

function getToActPlayerId(table) {
  return (
    table?.currentPlayerId ||
    table?.currentTurnPlayerId ||
    table?.toActPlayerId ||
    table?.turnPlayerId ||
    table?.activePlayerId ||
    null
  );
}

function getWinnerIds(table) {
  const lw = Array.isArray(table?.lastWinners) ? table.lastWinners : [];
  const ids = lw.map((w) => w?.winnerId).filter(Boolean);
  return Array.from(new Set(ids));
}

function getWinnerMeta(table, playerId) {
  const lw = Array.isArray(table?.lastWinners) ? table.lastWinners : [];
  const mine = lw.filter((w) => w?.winnerId === playerId);
  const total = mine.reduce((s, w) => s + Number(w?.amount ?? 0), 0);
  const desc =
    table?.lastWinnerHandDescription ??
    mine[0]?.handDescription ??
    lw[0]?.handDescription ??
    "—";
  return { totalWin: total, desc };
}

function renderPlayers(table, showdownHands) {
  const host = $("players");
  if (!host) return;

  const players = Array.isArray(table?.players) ? table.players : [];
  const stacks = table?.stacks || {};
  const me = State.user?.username;

  const toAct = getToActPlayerId(table);
  const winnerIds = (table?.phase === "SHOWDOWN") ? getWinnerIds(table) : [];

  host.innerHTML = "";

  if (players.length === 0) {
    host.innerHTML = `<div class="small">Aucun joueur.</div>`;
    return;
  }

  players.forEach((p) => {
    const stack = stacks?.[p] ?? "—";
    const isMe = p === me;
    const isTurn = !!toAct && p === toAct;
    const isWinner = winnerIds.includes(p);

    const winnerMeta = isWinner ? getWinnerMeta(table, p) : null;

    const node = document.createElement("div");
    node.className = "playerCard";
    if (isTurn) node.classList.add("turnPlayer");
    if (isWinner) node.classList.add("winnerPlayer");

    const sd = showdownHands?.[p];
    const showDownCards = Array.isArray(sd) && sd.length === 2;

    const mkCardHtml = (src, extraClass) =>
      `<img class="backSmall ${extraClass}" src="${src}" alt="card">`;

    let c1Class = "";
    let c2Class = "";
    if (isTurn) { c1Class += " turnCard"; c2Class += " turnCard"; }
    if (isWinner) { c1Class += " winnerCard"; c2Class += " winnerCard"; }

    let rightHtml = "";
    if (isMe) {
      rightHtml = "";
    } else if (showDownCards) {
      const c1 = normalizeCardCode(sd[0]);
      const c2 = normalizeCardCode(sd[1]);
      rightHtml = `
        ${mkCardHtml(c1 ? cardUrl(c1) : "../assets/img/back.svg", c1Class)}
        ${mkCardHtml(c2 ? cardUrl(c2) : "../assets/img/back.svg", c2Class)}
      `;
    } else {
      rightHtml = `
        ${mkCardHtml("../assets/img/back.svg", c1Class)}
        ${mkCardHtml("../assets/img/back.svg", c2Class)}
      `;
    }

    node.innerHTML = `
      <div class="playerLeft">
        <div class="playerName">${isMe ? "👤 " : ""}${p}${isTurn ? "  ⏳" : ""}${isWinner ? "  🏆" : ""}</div>
        <div class="playerMeta">
          <span class="tag">stack: ${stack}</span>
          ${isWinner && table?.phase === "SHOWDOWN" ? `<span class="tag winnerTag">+${winnerMeta?.totalWin ?? 0}</span>` : ""}
        </div>
        ${isWinner && table?.phase === "SHOWDOWN" ? `<div class="winnerText">${winnerMeta?.desc ?? "—"}</div>` : ""}
      </div>
      <div class="playerRight">
        ${rightHtml}
      </div>
    `;

    host.appendChild(node);
  });
}

function makeSnap(table) {
  const players = Array.isArray(table?.players) ? table.players : [];
  const stacks = table?.stacks || {};
  const bets = table?.bets || {};
  const folded = table?.foldedPlayers || {};
  const hasActed = table?.hasActed || {};
  const currentBet = Number(table?.currentBet ?? 0);

  const per = {};
  for (const p of players) {
    per[p] = {
      stack: Number(stacks?.[p] ?? 0),
      bet: Number(bets?.[p] ?? 0),
      folded: !!folded?.[p],
      acted: !!hasActed?.[p],
    };
  }
  return { currentBet, per };
}

function inferActions(prev, curr) {
  if (!prev || !curr) return [];
  const actions = [];

  for (const p of Object.keys(curr.per)) {
    const a = prev.per[p];
    const b = curr.per[p];
    if (!a || !b) continue;

    // fold
    if (!a.folded && b.folded) {
      actions.push({ player: p, action: "FOLD" });
      continue;
    }

    // check (acted, bet unchanged, bet == currentBet)
    if (!a.acted && b.acted && b.bet === a.bet && b.bet === curr.currentBet) {
      actions.push({ player: p, action: "CHECK" });
      continue;
    }

    // call/bet/raise (bet increased)
    const betDelta = b.bet - a.bet;
    if (betDelta > 0) {
      const allIn = b.stack === 0;
      if (b.bet === curr.currentBet) actions.push({ player: p, action: `CALL ${betDelta}${allIn ? " (ALL-IN)" : ""}` });
      else actions.push({ player: p, action: `BET ${betDelta}${allIn ? " (ALL-IN)" : ""}` });
      continue;
    }
  }

  // dédoublonne (au cas où)
  const seen = new Set();
  return actions.filter((x) => {
    const k = `${x.player}|${x.action}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

connectPokerSocket({
  onSystem: (m) => addMsg(m.message ?? JSON.stringify(m), "sys"),
  onChat: (m) => addMsg(`${m.username}: ${m.message}`, isBotUsername(m?.username) ? "bot" : "user"),
  onError: (e) => addErrorToChat(e),
  onJoined: () => addMsg("✅ joined chat", "sys"),
});

function tryJoinChat() {
  const ok = joinChat(tableId);
  if (!ok) addMsg("⚠️ join chat: socket pas prêt (auto au reconnect)", "sys");
}

onSocketEvent(({ type }) => {
  if (type === "connect") tryJoinChat();
});

setTimeout(() => {
  const s = getSocket?.() || null;
  if (s?.connected) tryJoinChat();
}, 0);

function sendChatFromInput() {
  const msg = $("chatInput").value.trim();
  if (!msg) return;
  sendChat(tableId, msg);
  $("chatInput").value = "";
}

$("sendChatBtn").onclick = sendChatFromInput;

$("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatFromInput();
  }
});

function isNotReadyError(err) {
  const m = (err?.message || "").toLowerCase();
  return m.includes("doit encore agir") || m.includes("mise en attente");
}

async function phase(path){
  const out = await apiPost(`/tables/${tableId}/${path}`, { playerId: State.user?.username }, true);
  // 🥚 Easter egg
  handleUnlockedNow(out);
  return out;
}

let autoRunning = false;
async function autoProgressToEndHand() {
  if (autoRunning) return;
  autoRunning = true;

  const steps = ["flop", "turn", "river", "end-hand"];

  try {
    for (const s of steps) {
      while (true) {
        try { await phase(s); break; }
        catch (e) {
          if (isNotReadyError(e)) { await sleep(800); continue; }
          addErrorToChat(e);
          return;
        }
      }
      await sleep(350);
    }
  } finally {
    autoRunning = false;
  }
}

function mapBestHandToKey(descRaw) {
  const d = String(descRaw || "").toLowerCase();

  if (d.includes("royale")) return "ROYAL_FLUSH";
  if (d.includes("quinte flush") || (d.includes("suite") && d.includes("couleur"))) return "STRAIGHT_FLUSH";
  if (d.includes("carr")) return "FOUR_KIND";
  if (d.includes("full")) return "FULL_HOUSE";
  if (d.includes("couleur")) return "FLUSH";
  if (d.includes("suite")) return "STRAIGHT";
  if (d.includes("brelan")) return "THREE_KIND";
  if (d.includes("double paire")) return "TWO_PAIR";
  if (d.includes("paire")) return "PAIR";
  if (d.includes("carte haute")) return "HIGH_CARD";

  return null;
}

function setActiveHand(key) {
  document.querySelectorAll(".handRank").forEach((el) => {
    el.classList.remove("active");
  });
  if (!key) return;
  const el = document.querySelector(`.handRank[data-hand="${key}"]`);
  if (el) el.classList.add("active");
}

function openRulesPanel() {
  $("rulesPanel").classList.add("open");
  $("rulesPanel").setAttribute("aria-hidden", "false");
  $("rulesOverlay").classList.remove("hidden");
}
function closeRulesPanel() {
  $("rulesPanel").classList.remove("open");
  $("rulesPanel").setAttribute("aria-hidden", "true");
  $("rulesOverlay").classList.add("hidden");
}

$("rulesFab").onclick = openRulesPanel;
$("rulesClose").onclick = closeRulesPanel;
$("rulesOverlay").onclick = closeRulesPanel;

const prevCommunityKey = { value: "" };
const prevHandKey = { value: "" };
let prevSnap = null;
let lastPhase = null;
let lastMyHandKey = "";
let wasInGame = false;
let endRedirectScheduled = false;

function scheduleEndRedirect() {
  if (endRedirectScheduled) return;
  endRedirectScheduled = true;
  addMsg("🏁 Partie terminée. Retour au menu dans 3 secondes…", "sys");
  setTimeout(() => {
    try { setCurrentTableId(null); } catch {}
    location.href = "../html/poker-menu.html";
  }, 3000);
}

function updateStartButtonVisibility(table) {
  const me = State.user?.username;
  const owner = table?.ownerPlayerId || table?.ownerUsername || table?.ownerId || null;

  const started = (table?.status === "IN_GAME") || (table?.phase && table.phase !== "WAITING");
  const isOwner = !!me && !!owner && me === owner;

  if (!isOwner || started) {
    $("startBtn").style.display = "none";
  } else {
    $("startBtn").style.display = "";
  }
}

async function pollEverything() {
  fetchCreditsOnce().catch(() => {});

  let t = null;

  try {
    t = await apiGet(`/tables/${tableId}`);
  } catch {
    return;
  }

  const nowInGame = (t?.status === "IN_GAME");
  if (nowInGame) wasInGame = true;

  const nowWaiting = (String(t?.phase || "").toUpperCase() === "WAITING");
  if (nowWaiting && wasInGame) {
    scheduleEndRedirect();
  }

  updateStartButtonVisibility(t);

  const curr = makeSnap(t);
  const inferred = inferActions(prevSnap, curr);
  inferred.forEach(({ player, action }) => {
    if (isBotUsername(player)) addMsg(`🤖 ${player}: ${action}`, "bot");
    else addMsg(`${player} ${action}`, "sys");
  });
  prevSnap = curr;

  renderCardsAnimated("community", t?.communityCards ?? [], prevCommunityKey);

  let handArr = [];
  try {
    handArr = await apiGet(`/tables/${tableId}/hand`);
    renderCardsAnimated("hand", handArr ?? [], prevHandKey);
  } catch {}

  const myHandKey = (handArr || []).map(normalizeCardCode).filter(Boolean).join("|");
  if (myHandKey && myHandKey !== lastMyHandKey) {
    lastMyHandKey = myHandKey;
    if (t?.phase === "PRE_FLOP") autoProgressToEndHand().catch(() => {});
  }

  try {
    const bh = await apiGet(`/tables/${tableId}/best-hand`);
    const desc = bh?.description ?? "—";
    $("bestHandLine").textContent = `Best hand: ${desc}`;

    const key = mapBestHandToKey(desc);
    setActiveHand(key);
  } catch {
    $("bestHandLine").textContent = `Best hand: —`;
    setActiveHand(null);
  }

  let showdown = {};
  if (t?.phase === "SHOWDOWN") {
    try { showdown = await apiGet(`/tables/${tableId}/showdown`); } catch {}
  }

  renderPlayers(t, showdown);

  if (t?.phase && t.phase !== lastPhase) {
    lastPhase = t.phase;
    addMsg(`Phase: ${t.phase}`, "sys");

    if (t.phase === "PRE_FLOP") autoProgressToEndHand().catch(() => {});
  }
}

function updateAmountVisibility() {
  const action = $("actionType")?.value || "";
  const amountEl = $("amount");
  if (!amountEl) return;
  const needsAmount = action === "BET" || action === "RAISE";
  amountEl.style.display = needsAmount ? "" : "none";
  amountEl.placeholder = needsAmount ? "amount" : "";
  if (!needsAmount) amountEl.value = "";
}

setInterval(pollEverything, 850);

fetchCreditsOnce().catch(() => {});

// ✅ show amount input only for BET/RAISE
$("actionType").addEventListener("change", updateAmountVisibility);
updateAmountVisibility();

$("startBtn").onclick = async () => {
  try {
    const out = await apiPost(`/tables/${tableId}/start`, null, true);
    // 🥚 Easter egg
    handleUnlockedNow(out);
    await autoProgressToEndHand();
  } catch (e) {
    addErrorToChat(e);
  }
};

$("actionBtn").onclick = async () => {
  try{
    const action = $("actionType").value;
    const needsAmount = action === "BET" || action === "RAISE";

    const amountRaw = ($("amount").value || "").trim();

    if (needsAmount && !amountRaw) {
      throw new Error("Amount requis pour BET/RAISE");
    }

    const body = amountRaw ? { action, amount: Number(amountRaw) } : { action };
    const out = await apiPost(`/tables/${tableId}/action`, body, true);
    // 🥚 Easter egg
    handleUnlockedNow(out);
  } catch(e){
    addErrorToChat(e);
  }
};

$("leaveBtn").onclick = async () => {
  try {
    const out = await apiPost(`/tables/${tableId}/leave`, { playerId: State.user?.username }, true);
    // 🥚 Easter egg
    handleUnlockedNow(out);
    setCurrentTableId(null);
    location.href = "../html/poker-menu.html";
  } catch (e) {
    addErrorToChat(e);
  }
};
