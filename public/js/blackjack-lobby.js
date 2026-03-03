import { $, api, apiBase, requireToken, normCode } from "./blackjack-common.js";

const tableList = $("tableList");
const listStatus = $("listStatus");
const createStatus = $("createStatus");
const joinStatus = $("joinStatus");

const searchBtn = $("searchBtn");
const searchWrap = $("searchWrap");
const searchInput = $("searchInput");

refreshCredits();
setInterval(refreshCredits, 3000); // auto-refresh balance every 3s

function setStatus(el, msg){
  if (el) el.textContent = msg || "";
}

function gotoGame(code){
  const c = normCode(code);
  window.location.href = `./blackjack-game.html?code=${encodeURIComponent(c)}`;
}

let allTables = [];
let currentQuery = "";
let searchOpen = false;

/* ================= Auth & Balance ================= */

async function refreshCredits() {
  try {
    const res = await fetch('/auth/me', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!res.ok) return;

    const me = await res.json();
    const el = document.getElementById('balancePill');
    if (el) el.textContent = me.credits;
  } catch {
    // on ignore les erreurs
  }
}

/* ================= Leave ================= */

const btnDashboard = document.getElementById('backDashboardBtn');

if (btnDashboard) {
  btnDashboard.addEventListener('click', () => {
    window.location.href = './dashboard.html';
  });
}

/* ================= Recherche ================= */

function openSearch(){
  searchOpen = true;
  searchWrap.classList.add("open");
  searchInput.focus();
  searchInput.select();
}

function closeSearch(){
  searchOpen = false;
  searchWrap.classList.remove("open");

  // reset filtre
  currentQuery = "";
  searchInput.value = "";
  renderWithCurrentFilter();
}

searchBtn.addEventListener("click", () => {
  if (searchOpen) closeSearch();
  else openSearch();
});

searchInput.addEventListener("input", () => {
  currentQuery = searchInput.value || "";
  renderWithCurrentFilter();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchOpen) {
    closeSearch();
  }
});

/* ================= Tables ================= */

function matchesQuery(tb, q){
  if (!q) return true;
  const name = String(tb?.name ?? "").toLowerCase();
  const code = String(tb?.code ?? tb?.tableCode ?? "").toLowerCase();
  return name.includes(q) || code.includes(q);
}

function getFilteredTables(){
  const q = currentQuery.trim().toLowerCase();
  return allTables.filter(tb => matchesQuery(tb, q));
}

function renderTables(tables){
  tableList.innerHTML = "";

  if (!tables.length){
    tableList.innerHTML = `<div class="small">Aucune table.</div>`;
    return;
  }

  for (const tb of tables){
    const code = tb.code || tb.tableCode || "";
    const name = tb.name || "Table";
    const status = tb.status || "—";
    const players = (tb.players || []).length;

    const div = document.createElement("div");
    div.className = "tableItem";
    div.innerHTML = `
      <div class="tableMeta">
        <div class="tableTitle">${name} <span class="pill mono">${code}</span></div>
        <div class="tableSub">
          status: <span class="mono">${status}</span> • joueurs: <span class="mono">${players}</span>
        </div>
      </div>
      <div class="buttons" style="margin:0">
        <button type="button" class="primary">Rejoindre</button>
      </div>
    `;

    div.querySelector("button").addEventListener("click", async () => {
      const res = await api(`/blackjack/tables/${encodeURIComponent(code)}/join`, "POST");
      if (!res.ok){
        setStatus(joinStatus, `Join error (${res.status})`);
        return;
      }
      gotoGame(code);
    });

    tableList.appendChild(div);
  }
}

function renderWithCurrentFilter(){
  const filtered = getFilteredTables();
  renderTables(filtered);

  if (currentQuery){
    setStatus(listStatus, `${filtered.length} table(s) trouvée(s)`);
  } else {
    setStatus(listStatus, "");
  }
}

async function refresh(){
  setStatus(listStatus, "Chargement...");
  const res = await api("/blackjack/tables", "GET");

  if (!res.ok){
    setStatus(listStatus, "Erreur chargement tables");
    return;
  }

  allTables = Array.isArray(res.data) ? res.data : [];
  renderWithCurrentFilter();
}

/* ================= Create / Join ================= */

$("refreshBtn").addEventListener("click", refresh);

$("createBtn").addEventListener("click", async () => {
  setStatus(createStatus, "Création...");
  const body = {
    name: $("name").value.trim() || "BJ Table",
    minBet: Number($("minBet").value || 10),
    maxPlayers: Number($("maxPlayers").value || 6),
  };

  const maxBetRaw = $("tableMaxBet").value.trim();
  if (maxBetRaw) body.tableMaxBet = Number(maxBetRaw);

  const res = await api("/blackjack/tables", "POST", body);
  if (!res.ok){
    setStatus(createStatus, "Erreur création");
    return;
  }

  const code = res.data.code || res.data.tableCode;
  gotoGame(code);
});

$("joinBtn").addEventListener("click", async () => {
  const code = normCode($("joinCode").value);
  if (!/^[A-Z]{6}$/.test(code)){
    setStatus(joinStatus, "Code invalide");
    return;
  }

  const res = await api(`/blackjack/tables/${code}/join`, "POST");
  if (!res.ok){
    setStatus(joinStatus, "Erreur join");
    return;
  }
  gotoGame(code);
});

await refresh();
