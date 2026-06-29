import { State, setCurrentTableId } from "./core/state.js";
import { apiGet, apiPost } from "./core/api.js";

const $ = (id) => document.getElementById(id);
refreshCredits();
setInterval(refreshCredits, 3000); // auto-refresh balance every 3s

if (!State.token) location.href = "../html/auth/login.html";
$("userPill").textContent = `@${State.user?.username ?? "?"}`;

function num(id){ return Number($(id).value); }
function boolSelect(id){ return $(id).value === "true"; }

/* ================= Leave ================= */

const btnDashboard = document.getElementById('backDashboardBtn');

if (btnDashboard) {
  btnDashboard.addEventListener('click', () => {
    window.location.href = './dashboard.html';
  });
}

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

async function refreshPublic() {
  $("publicList").textContent = "Loading…";
  try {
    const tables = await apiGet("/tables/public");

    $("publicList").innerHTML = tables.map((t) => {
      const id = t.id || t.tableId || t.name;
      const mode = t.mode ?? "CASUAL";
      const vis = t.visibility ?? "PUBLIC";
      const players = Array.isArray(t.players) ? t.players.length : (t.playersCount ?? "?");

      return `
        <div class="tableItem">
          <div class="tableMeta">
            <div class="tableTitle">${id}
              <span class="pill">${mode}</span>
              <span class="pill">${vis}</span>
            </div>
            <div class="tableSub">
              players: ${players} • blinds: ${t.smallBlindAmount}/${t.bigBlindAmount} • buy-in: ${t.buyInAmount}
            </div>
          </div>
          <div class="buttons" style="justify-content:flex-end;">
            <button data-join="${id}" class="primary">Join</button>
          </div>
        </div>`;
    }).join("") || `<div class="small">Aucune table publique.</div>`;

    [...$("publicList").querySelectorAll("button[data-join]")].forEach((btn) => {
      btn.onclick = async () => {
        const tableId = btn.getAttribute("data-join");
        try {
          await apiPost("/tables/join-public", { tableId }, true);
          setCurrentTableId(tableId);

          // ✅ CHEMIN CORRECT
          location.href = "../html/poker-table.html";
        } catch (e) {
          $("status").textContent = String(e.message || e);
        }
      };
    });
  } catch (e) {
    $("publicList").textContent = String(e.message || e);
  }
}


$("refreshBtn").onclick = refreshPublic;

$("createBtn").onclick = async () => {
  $("status").textContent = "";
  try {
    const res = await apiPost("/tables/create", {
      buyInAmount: num("buyIn"),
      smallBlindAmount: num("sb"),
      bigBlindAmount: num("bb"),
      maxPlayers: num("maxPlayers"),
      fillWithBots: boolSelect("fillBots"),
      visibility: $("visibility").value,
    }, true);

    const tableId = (res?.tableId || res?.id || res?.code || res?.table?.id);
    if (!tableId) throw new Error("Réponse create: pas de tableId");

    setCurrentTableId(String(tableId).toUpperCase());

    // ✅ CHEMIN CORRECT
    location.href = "../html/poker-table.html";
  } catch (e) {
    $("status").textContent = String(e.message || e);
  }
};

$("createCompBtn").onclick = async () => {
  $("status").textContent = "";
  try {
    const res = await apiPost("/tables/create-competition", {
      buyInAmount: num("buyIn"),
      smallBlindAmount: num("sb"),
      bigBlindAmount: num("bb"),
      maxPlayers: num("maxPlayers"),
    }, true);

    const tableId = (res?.tableId || res?.id || res?.code || res?.table?.id);
    if (!tableId) throw new Error("Réponse create-competition: pas de tableId");

    setCurrentTableId(String(tableId).toUpperCase());

    // ✅ CHEMIN CORRECT
    location.href = "../html/poker-table.html";
  } catch (e) {
    $("status").textContent = String(e.message || e);
  }
};

$("joinPrivateBtn").onclick = async () => {
  $("status").textContent = "";
  try {
    const code = $("joinCode").value.trim().toUpperCase();
    await apiPost("/tables/join", { code }, true);
    setCurrentTableId(code);

    // ✅ CHEMIN CORRECT
    location.href = "../html/poker-table.html";
  } catch (e) {
    $("status").textContent = String(e.message || e);
  }
};

$("joinPublicBtn").onclick = async () => {
  $("status").textContent = "";
  try {
    const tableId = $("joinCode").value.trim().toUpperCase();
    await apiPost("/tables/join-public", { tableId }, true);
    setCurrentTableId(tableId);

    // ✅ CHEMIN CORRECT
    location.href = "../html/poker-table.html";
  } catch (e) {
    $("status").textContent = String(e.message || e);
  }
};

refreshPublic();
