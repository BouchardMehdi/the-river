// ------------------------
// Roulette order (EU)
// ------------------------
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];


// ------------------------
// 🥚 Easter Egg toast helper
// ------------------------
function __eggEnsureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

function __eggKeyToLabel(key) {
  switch (String(key)) {
    case "slots": return "Slots";
    case "blackjack": return "Blackjack";
    case "roulette": return "Roulette";
    case "poker": return "Poker";
    default: return "Clé";
  }
}

function __eggShowKeyToast(keyLabel) {
  const host = __eggEnsureToastHost();
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

function __eggHandleUnlockedNow(payload) {
  const arr = payload?.unlockedNow;
  if (Array.isArray(arr) && arr.length) {
    for (const k of arr) __eggShowKeyToast(__eggKeyToLabel(k));
  }
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BLACK = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

function colorOf(n) {
  if (n === 0) return "GREEN";
  if (RED.has(n)) return "RED";
  return "BLACK";
}

const el = (id) => document.getElementById(id);

// ------------------------
// DOM
// ------------------------
const wheelEl = el("wheel");
const segmentsEl = el("segments");
const labelsEl = el("labels");
const ticksEl = el("ticks");

const ballTrackEl = el("ballTrack");
const ballEl = el("ball");

const balanceValueEl = el("balanceValue");
const dashboardBtn = el("dashboardBtn");

const statusEl = el("status");
const resultValueEl = el("resultValue");
const resultColorEl = el("resultColor");
const totalStakedEl = el("totalStaked");
const totalProfitEl = el("totalProfit");
const winsEl = el("wins");

const betsListEl = el("betsList");
const addBetBtn = el("addBetBtn");
const spinBtn = el("spinBtn");
const betsCountEl = el("betsCount");
const betsTotalEl = el("betsTotal");

const betRowTpl = el("betRowTpl");

// Rules panel
const rulesFab = el("rulesFab");
const rulesPanel = el("rulesPanel");
const rulesOverlay = el("rulesOverlay");
const rulesClose = el("rulesClose");

// ✅ Table elements
const rouletteTableEl = el("rouletteTable");
const rtNumbersEl = el("rtNumbers");
const rtOverlayEl = el("rtOverlay");
const tableModeLabelEl = el("tableModeLabel");
const tableClearBtn = el("tableClearBtn");

// ------------------------
// Wheel geometry
// ------------------------
const SEGMENTS = WHEEL_ORDER.length;
const SEG_ANGLE = 360 / SEGMENTS;
const GAP_DEG = 0.12;

// ------------------------
// Timing
// ------------------------
const PRE_SPIN_MS = 3000;
const STOP_SPIN_MS = 2600;

// ------------------------
// Tuning: ball/ticks position + offsets
// ------------------------
const BALL_RADIUS_FACTOR = 0.50;
const TICK_RADIUS_OFFSET_PX = 18;
const BALL_OFFSET_X_PX = 1;
const BALL_OFFSET_Y_PX = -3;

// ------------------------
// Balance auto refresh
// ------------------------
const AUTO_BALANCE_MS = 4000;
let balanceTimer = null;

// ------------------------
// State
// ------------------------
let currentWheelAngle = 0;
let currentBallOrbitAngle = 0;
let ballRadiusPx = null;
let spinning = false;

// ✅ Active bet row for table selection
let activeBetRow = null;
let pendingNumbers = []; // multi number selection

// ------------------------
// Init
// ------------------------
init();

function init() {
  renderWheelWedges();
  renderWheelLabels();
  computeBallRadius();
  renderTicks();
  positionBall(currentBallOrbitAngle);

  // table colors
  paintTableColors();

  // ✅ build clickable hotspots between cells
  buildOverlayHotspots();
  window.addEventListener("resize", () => {
    computeBallRadius();
    renderWheelLabels();
    renderTicks();
    positionBall(currentBallOrbitAngle);
    buildOverlayHotspots();
  });

  if (dashboardBtn) {
    dashboardBtn.addEventListener("click", () => {
      window.location.href = "/public/html/dashboard.html";
    });
  }

  // Rules panel open/close
  rulesFab?.addEventListener("click", () => openRules());
  rulesClose?.addEventListener("click", () => closeRules());
  rulesOverlay?.addEventListener("click", () => closeRules());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRules();
  });

  // ✅ Table click handler (cells & zones)
  rouletteTableEl?.addEventListener("click", onTableClick);
  tableClearBtn?.addEventListener("click", () => {
    pendingNumbers = [];
    clearTableHighlights();
    fillActiveSelection([]);
  });

  addBetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    addBetRow();
  });

  spinBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    onSpin();
  });

  addBetRow();

  if (!getToken()) {
    window.location.href = "/html/auth/login.html";
    return;
  }

  loadMe()
    .then(() => startBalanceAutoRefresh())
    .catch(() => setStatus("Connecte-toi d'abord"));

  updateSummary();
  updateSpinAvailability();
  updateTableModeLabel();
}

// ------------------------
// Rules panel helpers
// ------------------------
function openRules(){
  if (!rulesPanel || !rulesOverlay) return;
  rulesPanel.classList.add("open");
  rulesOverlay.classList.add("open");
  rulesPanel.setAttribute("aria-hidden", "false");
  rulesOverlay.setAttribute("aria-hidden", "false");
  updateTableModeLabel();
}
function closeRules(){
  if (!rulesPanel || !rulesOverlay) return;
  rulesPanel.classList.remove("open");
  rulesOverlay.classList.remove("open");
  rulesPanel.setAttribute("aria-hidden", "true");
  rulesOverlay.setAttribute("aria-hidden", "true");
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}
function setDisabled(disabled) {
  if (spinBtn) spinBtn.disabled = disabled;
  if (addBetBtn) addBetBtn.disabled = disabled;
}

// ------------------------
// Auto balance refresh
// ------------------------
function startBalanceAutoRefresh() {
  stopBalanceAutoRefresh();
  balanceTimer = setInterval(async () => {
    if (!getToken()) return;
    if (spinning) return;
    try { await loadMe(); } catch {}
  }, AUTO_BALANCE_MS);
}
function stopBalanceAutoRefresh() {
  if (balanceTimer) clearInterval(balanceTimer);
  balanceTimer = null;
}

// ------------------------
// Rendering (wheel)
// ------------------------
function renderWheelWedges() {
  segmentsEl.innerHTML = "";
  const radiusPercent = 50;

  for (let i = 0; i < SEGMENTS; i++) {
    const num = WHEEL_ORDER[i];
    const col = colorOf(num);

    const wedge = document.createElement("div");
    wedge.className = "wedge";
    wedge.style.background =
      (col === "GREEN") ? "var(--green)" :
      (col === "RED") ? "var(--red)" : "var(--black)";

    const center = (i * SEG_ANGLE) - 90;
    const a1 = center - (SEG_ANGLE / 2) + GAP_DEG;
    const a2 = center + (SEG_ANGLE / 2) - GAP_DEG;

    const p1 = polarToPercent(50, 50, radiusPercent, a1);
    const p2 = polarToPercent(50, 50, radiusPercent, a2);

    wedge.style.clipPath = `polygon(50% 50%, ${p1.x}% ${p1.y}%, ${p2.x}% ${p2.y}%)`;
    segmentsEl.appendChild(wedge);
  }
}

function renderWheelLabels() {
  labelsEl.innerHTML = "";

  // IMPORTANT (responsive):
  // La scène est parfois mise à l'échelle via `transform: scale()`.
  // getBoundingClientRect() renvoie la taille *après* transform.
  // Or, on applique ensuite des `translate(px)` dans le repère *non transformé*.
  // Résultat: labels/segments/bille décalés.
  // => On utilise les dimensions de layout (offsetWidth), stables.
  const wheelSize = Math.max(1, wheelEl.offsetWidth || 0);
  // Calibration: 192px sur un wheel de 460px -> ratio ~0.417
  const radiusPx = Math.round(wheelSize * (192 / 460));

  for (let i = 0; i < SEGMENTS; i++) {
    const n = WHEEL_ORDER[i];
    const centerAngle = (i * SEG_ANGLE) - 90;

    const lbl = document.createElement("div");
    lbl.className = "label";
    lbl.textContent = String(n);

    lbl.style.transform = `
      rotate(${centerAngle}deg)
      translate(${radiusPx}px, 0px)
      rotate(90deg)
      translate(-50%, -50%)
    `;
    labelsEl.appendChild(lbl);
  }
}

function renderTicks() {
  if (!ticksEl) return;
  ticksEl.innerHTML = "";
  const tickRadius = (ballRadiusPx ?? 0) + TICK_RADIUS_OFFSET_PX;

  for (let i = 0; i < SEGMENTS; i++) {
    const borderAngle = (i * SEG_ANGLE) - 90 - (SEG_ANGLE / 2);

    const tick = document.createElement("div");
    tick.className = "tick";
    tick.style.transform = `
      rotate(${borderAngle}deg)
      translate(${tickRadius}px, 0px)
      rotate(90deg)
    `;
    ticksEl.appendChild(tick);
  }
}

function polarToPercent(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function computeBallRadius() {
  // Responsive: la scène peut être en `transform: scale(...)`.
  // getBoundingClientRect() renvoie la taille après transform (viewport px),
  // alors que nos coordonnées sont en layout px.
  // 👉 On utilise donc offsetWidth/offsetHeight (avant transform).
  const size = Math.min(
    Math.max(1, ballTrackEl.offsetWidth || 0),
    Math.max(1, ballTrackEl.offsetHeight || 0),
  );
  ballRadiusPx = (size / 2) * BALL_RADIUS_FACTOR;
}

// ------------------------
// API
// ------------------------
function getApiBase() {
  return window.location.origin.replace(/\/+$/, "");
}

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
}

function authHeaders() {
  const token = getToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

async function loadMe() {
  const base = getApiBase();
  const headers = authHeaders();
  if (!headers) {
    if (balanceValueEl) balanceValueEl.textContent = "—";
    throw new Error("Token absent.");
  }

  const res = await fetch(`${base}/auth/me`, { headers });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`GET /auth/me (${res.status}): ${txt}`);
  }

  const me = await res.json();
  if (balanceValueEl) balanceValueEl.textContent = String(me.credits ?? "—");
  return me;
}

async function soloSpin(bets) {
  const base = getApiBase();
  const headers = authHeaders();
  if (!headers) throw new Error("Token absent.");

  const res = await fetch(`${base}/roulette/solo/spin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ bets })
  });

  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`POST /roulette/solo/spin (${res.status}): ${txt}`);
  }

  return res.json();
}

function parseApiResult(out) {
  let n =
    out?.result?.number ??
    out?.resultNumber ??
    out?.winningNumber ??
    out?.number;

  n = Number(n);

  if (!Number.isInteger(n) || n < 0 || n > 36) {
    console.log("Réponse API reçue:", out);
    throw new Error("Réponse API invalide: numéro gagnant absent ou invalide.");
  }

  const c = out?.result?.color ?? out?.color ?? colorOf(n);
  return { number: n, color: c };
}

// ------------------------
// Bets UI
// ------------------------
function addBetRow() {
  const node = betRowTpl.content.firstElementChild.cloneNode(true);

  const typeEl = node.querySelector(".betType");
  const amountInput = node.querySelector(".betAmount");
  const selectionInputsWrap = node.querySelector(".selectionInputs");
  const hintEl = node.querySelector(".hint");
  const removeBtn = node.querySelector(".removeBtn");

  node.addEventListener("click", () => setActiveRow(node));

  function rebuildSelectionInputs() {
    const meta = selectionMeta(typeEl.value);
    node.classList.toggle("noSelection", !meta.needsSelection);

    if (!meta.needsSelection) {
      selectionInputsWrap.innerHTML = "";
      if (hintEl) hintEl.textContent = "Pas de sélection";
      updateSummary();
      updateSpinAvailability();
      updateTableModeLabel();
      return;
    }

    selectionInputsWrap.innerHTML = "";
    for (let i = 0; i < meta.count; i++) {
      const inp = document.createElement("input");
      inp.className = "selInput";
      inp.type = "number";
      inp.step = "1";
      inp.min = String(meta.min);
      inp.max = String(meta.max);
      inp.placeholder = meta.placeholder || "";
      inp.addEventListener("input", () => {
        setActiveRow(node);
        updateSummary();
        updateSpinAvailability();
        updateTableModeLabel();
      });
      selectionInputsWrap.appendChild(inp);
    }

    if (hintEl) hintEl.textContent = meta.hint || "";
    updateSummary();
    updateSpinAvailability();
    updateTableModeLabel();
  }

  typeEl.addEventListener("change", () => {
    setActiveRow(node);
    pendingNumbers = [];
    clearTableHighlights();
    rebuildSelectionInputs();
  });

  amountInput.addEventListener("input", () => {
    setActiveRow(node);
    updateSummary();
    updateSpinAvailability();
  });

  removeBtn?.addEventListener("click", () => {
    node.remove();
    if (activeBetRow === node) activeBetRow = null;
    updateSummary();
    updateSpinAvailability();
    updateTableModeLabel();
  });

  betsListEl.appendChild(node);
  rebuildSelectionInputs();
  setActiveRow(node);
}

function setActiveRow(node) {
  activeBetRow = node;
  pendingNumbers = [];
  clearTableHighlights();
  updateTableModeLabel();
}

function selectionMeta(type) {
  switch (type) {
    case "STRAIGHT": return { needsSelection: true, count: 1, min: 0, max: 36, placeholder: "0-36", hint: "1 numéro (0–36)" };
    case "SPLIT": return { needsSelection: true, count: 2, min: 0, max: 36, placeholder: "0-36", hint: "2 numéros adjacents (cheval)" };
    case "STREET": return { needsSelection: true, count: 3, min: 0, max: 36, placeholder: "0-36", hint: "3 numéros en ligne (transversale)" };
    case "CORNER": return { needsSelection: true, count: 4, min: 1, max: 36, placeholder: "1-36", hint: "4 numéros en carré" };
    case "SIX_LINE": return { needsSelection: true, count: 6, min: 1, max: 36, placeholder: "1-36", hint: "6 numéros (2 lignes)" };
    case "DOZEN": return { needsSelection: true, count: 1, min: 1, max: 3, placeholder: "1-3", hint: "1=1-12, 2=13-24, 3=25-36" };
    case "COLUMN": return { needsSelection: true, count: 1, min: 1, max: 3, placeholder: "1-3", hint: "1 / 2 / 3" };
    default: return { needsSelection: false, count: 0, min: 0, max: 0, placeholder: "", hint: "" };
  }
}

function updateTableModeLabel() {
  if (!tableModeLabelEl) return;
  const row = getActiveRowFallback();
  if (!row) { tableModeLabelEl.textContent = "—"; return; }
  const type = row.querySelector(".betType")?.value || "—";
  tableModeLabelEl.textContent = type;
}

function getActiveRowFallback() {
  if (activeBetRow && document.body.contains(activeBetRow)) return activeBetRow;
  const first = betsListEl.querySelector(".betRow");
  return first || null;
}

function getActiveType() {
  const row = getActiveRowFallback();
  if (!row) return null;
  return row.querySelector(".betType")?.value || null;
}

function fillActiveSelection(values) {
  const row = getActiveRowFallback();
  if (!row) return;

  const inputs = [...row.querySelectorAll(".selectionInputs .selInput")];
  for (let i = 0; i < inputs.length; i++) {
    inputs[i].value = (values[i] != null ? String(values[i]) : "");
  }
  updateSummary();
  updateSpinAvailability();
}

function buildBetsFromUI({ soft } = { soft: false }) {
  const rows = [...betsListEl.querySelectorAll(".betRow")];
  const bets = [];

  for (const row of rows) {
    const type = row.querySelector(".betType").value;
    const amount = Number(row.querySelector(".betAmount").value);
    const meta = selectionMeta(type);

    if (!Number.isInteger(amount) || amount < 1) {
      if (!soft) throw new Error("Montant invalide (>=1).");
      continue;
    }

    let selection = {};
    let valid = true;

    if (meta.needsSelection) {
      const inputs = [...row.querySelectorAll(".selectionInputs .selInput")];
      const values = inputs.map(i => (i.value === "" ? null : Number(i.value)));

      if (values.some(v => v === null || !Number.isInteger(v))) {
        valid = false;
        if (!soft) throw new Error(`Sélection obligatoire pour ${type}.`);
      } else {
        selection = parseSelectionFromInputs(type, values, soft);
        if (selection == null) valid = false;
      }
    }

    bets.push({ type, amount, selection, __valid: valid });
  }

  return bets;
}

function parseSelectionFromInputs(type, values, soft) {
  try {
    if (type === "STRAIGHT") {
      const n = values[0];
      assertIntRange(n, 0, 36, "Numéro");
      return { number: n };
    }

    if (type === "DOZEN") {
      const d = values[0];
      assertIn(d, [1, 2, 3], "Douzaine");
      return { dozen: d };
    }

    if (type === "COLUMN") {
      const c = values[0];
      assertIn(c, [1, 2, 3], "Colonne");
      return { column: c };
    }

    const nums = values.slice().map(Number);
    for (const n of nums) assertIntRange(n, 0, 36, "Numéro");
    const unique = [...new Set(nums)].sort((a, b) => a - b);

    if (type === "SPLIT") {
      if (unique.length !== 2) throw new Error("Cheval = 2 numéros");
      if (!isValidSplit(unique[0], unique[1])) throw new Error("Cheval invalide (numéros non adjacents)");
      return { numbers: unique };
    }

    if (type === "STREET") {
      if (unique.length !== 3) throw new Error("Transversale = 3 numéros");
      if (!isValidStreet(unique)) throw new Error("Transversale invalide");
      return { numbers: unique };
    }

    if (type === "CORNER") {
      if (unique.length !== 4) throw new Error("Carré = 4 numéros");
      if (!isValidCorner(unique)) throw new Error("Carré invalide");
      return { numbers: unique };
    }

    if (type === "SIX_LINE") {
      if (unique.length !== 6) throw new Error("Sixain = 6 numéros");
      if (!isValidSixLine(unique)) throw new Error("Sixain invalide");
      return { numbers: unique };
    }

    return {};
  } catch (e) {
    if (soft) return null;
    throw e;
  }
}

function assertIntRange(n, min, max, name) {
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} doit être un entier entre ${min} et ${max}`);
}
function assertIn(n, arr, name) {
  if (!arr.includes(n)) throw new Error(`${name} doit être ${arr.join("/")}`);
}

// validations table
function isValidSplit(a, b) {
  const pair = [a, b].sort((x, y) => x - y);
  if (pair[0] === 0 && (pair[1] === 1 || pair[1] === 2 || pair[1] === 3)) return true;
  if (a === 0 || b === 0) return false;

  const min = Math.min(a, b);
  const max = Math.max(a, b);

  if (max === min + 1) return (min % 3) !== 0;
  if (max === min + 3) return min <= 33;

  return false;
}
function isValidStreet(nums3) {
  const [a, b, c] = nums3;
  if (a === 0 && b === 1 && c === 2) return true;
  if (a === 0 && b === 2 && c === 3) return true;
  return (b === a + 1) && (c === a + 2) && (a % 3 === 1);
}
function isValidCorner(nums4) {
  const s = nums4.slice().sort((x, y) => x - y);
  const n = s[0];
  if (n === 0) return false;
  if (n > 32) return false;
  if ((n % 3) === 0) return false;

  const expected = [n, n + 1, n + 3, n + 4];
  return expected.every(v => s.includes(v));
}
function isValidSixLine(nums6) {
  const s = nums6.slice().sort((x, y) => x - y);
  const n = s[0];
  if (n === 0) return false;
  if (n > 31) return false;
  if ((n % 3) !== 1) return false;

  for (let i = 0; i < 6; i++) {
    if (s[i] !== n + i) return false;
  }
  return true;
}

function sumBets(bets) {
  return bets.reduce((s, b) => s + (Number(b.amount) || 0), 0);
}
function updateSummary() {
  const bets = buildBetsFromUI({ soft: true });
  const total = sumBets(bets);

  if (betsCountEl) betsCountEl.textContent = String(bets.length);
  if (betsTotalEl) betsTotalEl.textContent = String(total);
}
function updateSpinAvailability() {
  if (spinning) return;

  try {
    const bets = buildBetsFromUI({ soft: true });
    const total = sumBets(bets);
    const ok = bets.length > 0 && total > 0 && bets.every(b => b.__valid !== false);
    if (spinBtn) spinBtn.disabled = !ok;
  } catch {
    if (spinBtn) spinBtn.disabled = true;
  }
}

// ------------------------
// ✅ TABLE COLORS + HIGHLIGHTS
// ------------------------
function paintTableColors() {
  const cells = document.querySelectorAll(".rtCell[data-n]");
  cells.forEach(c => {
    const n = Number(c.getAttribute("data-n"));
    const col = colorOf(n);
    c.classList.remove("red", "black", "green");
    if (col === "RED") c.classList.add("red");
    else if (col === "BLACK") c.classList.add("black");
    else c.classList.add("green");
  });
}

function clearTableHighlights() {
  rouletteTableEl?.querySelectorAll(".rtSelected").forEach(n => n.classList.remove("rtSelected"));
  rtOverlayEl?.querySelectorAll(".rtHotspotSelected").forEach(n => n.classList.remove("rtHotspotSelected"));
}

function highlightNumbers(nums) {
  clearTableHighlights();
  for (const n of nums) {
    const cell = rouletteTableEl.querySelector(`[data-rt="number"][data-n="${n}"]`);
    if (cell) cell.classList.add("rtSelected");
  }
}

// ------------------------
// ✅ OVERLAY HOTSPOTS (split/street/corner)
// ------------------------
function buildOverlayHotspots() {
  if (!rtNumbersEl || !rtOverlayEl) return;

  rtOverlayEl.innerHTML = "";

  const numbersRect = rtNumbersEl.getBoundingClientRect();
  const cells = [...rtNumbersEl.querySelectorAll('.rtCell[data-rt="number"]')];

  const byRC = new Map();
  for (const cell of cells) {
    const r = Number(cell.getAttribute("data-r"));
    const c = Number(cell.getAttribute("data-c"));
    byRC.set(`${r}:${c}`, cell);
  }

  // helper: rect relative to rtNumbers
  const relRect = (cell) => {
    const r = cell.getBoundingClientRect();
    return {
      left: r.left - numbersRect.left,
      top: r.top - numbersRect.top,
      width: r.width,
      height: r.height,
      right: r.right - numbersRect.left,
      bottom: r.bottom - numbersRect.top
    };
  };

  // STREET: 1 hotspot per row covering the 3 cells
  for (let r = 1; r <= 12; r++) {
    const c1 = byRC.get(`${r}:1`);
    const c2 = byRC.get(`${r}:2`);
    const c3 = byRC.get(`${r}:3`);
    if (!c1 || !c2 || !c3) continue;

    const a = Number(c1.getAttribute("data-n"));
    const b = Number(c2.getAttribute("data-n"));
    const c = Number(c3.getAttribute("data-n"));
    const nums = [a, b, c].sort((x,y)=>x-y);

    const rr1 = relRect(c1);
    const rr3 = relRect(c3);

    const hs = document.createElement("div");
    hs.className = "rtHotspot street";
    hs.style.left = `${rr1.left}px`;
    hs.style.top = `${rr1.top}px`;
    hs.style.width = `${(rr3.right - rr1.left)}px`;
    hs.style.height = `${rr1.height}px`;
    hs.style.opacity = "0.0"; // invisible but hoverable
    hs.dataset.hot = "street";
    hs.dataset.nums = nums.join(",");
    hs.style.pointerEvents = "auto";
    hs.addEventListener("mouseenter", () => { hs.style.opacity = "0.12"; });
    hs.addEventListener("mouseleave", () => { hs.style.opacity = "0.0"; });
    hs.addEventListener("click", (e) => {
      e.stopPropagation();
      setTypeIfNeeded("STREET");
      fillActiveSelection(nums);
      highlightNumbers(nums);
      setStatus("");
    });

    rtOverlayEl.appendChild(hs);
  }

  // SPLIT horizontal: between col1-col2 and col2-col3
  const splitGapW = 16;
  for (let r = 1; r <= 12; r++) {
    for (let c = 1; c <= 2; c++) {
      const leftCell = byRC.get(`${r}:${c}`);
      const rightCell = byRC.get(`${r}:${c+1}`);
      if (!leftCell || !rightCell) continue;

      const n1 = Number(leftCell.getAttribute("data-n"));
      const n2 = Number(rightCell.getAttribute("data-n"));
      const nums = [n1, n2].sort((x,y)=>x-y);

      const rrL = relRect(leftCell);
      const rrR = relRect(rightCell);

      const hs = document.createElement("div");
      hs.className = "rtHotspot splitH";
      hs.style.left = `${rrL.right - (splitGapW/2)}px`;
      hs.style.top = `${rrL.top + 6}px`;
      hs.style.width = `${splitGapW}px`;
      hs.style.height = `${rrL.height - 12}px`;
      hs.style.opacity = "0.0";
      hs.dataset.hot = "split";
      hs.dataset.nums = nums.join(",");
      hs.addEventListener("mouseenter", () => { hs.style.opacity = "0.25"; });
      hs.addEventListener("mouseleave", () => { hs.style.opacity = "0.0"; });
      hs.addEventListener("click", (e) => {
        e.stopPropagation();
        setTypeIfNeeded("SPLIT");
        if (!isValidSplit(nums[0], nums[1])) { setStatus("Cheval invalide."); return; }
        fillActiveSelection(nums);
        highlightNumbers(nums);
        setStatus("");
      });

      rtOverlayEl.appendChild(hs);
    }
  }

  // SPLIT vertical: between row r and r+1 for each column
  const splitGapH = 16;
  for (let r = 1; r <= 11; r++) {
    for (let c = 1; c <= 3; c++) {
      const topCell = byRC.get(`${r}:${c}`);
      const bottomCell = byRC.get(`${r+1}:${c}`);
      if (!topCell || !bottomCell) continue;

      const n1 = Number(topCell.getAttribute("data-n"));
      const n2 = Number(bottomCell.getAttribute("data-n"));
      const nums = [n1, n2].sort((x,y)=>x-y);

      const rrT = relRect(topCell);
      const rrB = relRect(bottomCell);

      const hs = document.createElement("div");
      hs.className = "rtHotspot splitV";
      hs.style.left = `${rrT.left + 6}px`;
      hs.style.top = `${rrT.bottom - (splitGapH/2)}px`;
      hs.style.width = `${rrT.width - 12}px`;
      hs.style.height = `${splitGapH}px`;
      hs.style.opacity = "0.0";
      hs.dataset.hot = "split";
      hs.dataset.nums = nums.join(",");
      hs.addEventListener("mouseenter", () => { hs.style.opacity = "0.25"; });
      hs.addEventListener("mouseleave", () => { hs.style.opacity = "0.0"; });
      hs.addEventListener("click", (e) => {
        e.stopPropagation();
        setTypeIfNeeded("SPLIT");
        if (!isValidSplit(nums[0], nums[1])) { setStatus("Cheval invalide."); return; }
        fillActiveSelection(nums);
        highlightNumbers(nums);
        setStatus("");
      });

      rtOverlayEl.appendChild(hs);
    }
  }

  // CORNER: cross between 4 cells (2x2)
  for (let r = 1; r <= 11; r++) {
    for (let c = 1; c <= 2; c++) {
      const a = byRC.get(`${r}:${c}`);
      const b = byRC.get(`${r}:${c+1}`);
      const d = byRC.get(`${r+1}:${c}`);
      const e = byRC.get(`${r+1}:${c+1}`);
      if (!a || !b || !d || !e) continue;

      const nums = [
        Number(a.getAttribute("data-n")),
        Number(b.getAttribute("data-n")),
        Number(d.getAttribute("data-n")),
        Number(e.getAttribute("data-n")),
      ].sort((x,y)=>x-y);

      // place the cross at intersection center
      const rrA = relRect(a);
      const rrB = relRect(b);
      const rrD = relRect(d);

      const crossX = rrA.right;         // vertical separator between c and c+1
      const crossY = rrA.bottom;        // horizontal separator between r and r+1

      const hs = document.createElement("div");
      hs.className = "rtHotspot corner";
      hs.style.left = `${crossX - 9}px`;
      hs.style.top = `${crossY - 9}px`;
      hs.style.opacity = "0.0";
      hs.dataset.hot = "corner";
      hs.dataset.nums = nums.join(",");
      hs.addEventListener("mouseenter", () => { hs.style.opacity = "0.45"; });
      hs.addEventListener("mouseleave", () => { hs.style.opacity = "0.0"; });
      hs.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setTypeIfNeeded("CORNER");
        if (!isValidCorner(nums)) { setStatus("Carré invalide."); return; }
        fillActiveSelection(nums);
        highlightNumbers(nums);
        setStatus("");
      });

      rtOverlayEl.appendChild(hs);
    }
  }
}

// ------------------------
// ✅ MAIN TABLE CLICK (numbers/zones)
// ------------------------
function onTableClick(e) {
  const hot = e.target.closest(".rtHotspot");
  if (hot) return; // already handled by listeners

  const target = e.target.closest("[data-rt]");
  if (!target) return;

  const kind = target.getAttribute("data-rt");

  if (kind === "dozen") {
    setTypeIfNeeded("DOZEN");
  }

if (kind === "dozen") {
  setTypeIfNeeded("DOZEN");
  const v = Number(target.getAttribute("data-v"));
  fillActiveSelection([v]);
  highlightNumbers([]); // pas de highlight numéros pour une zone
  return;
}

  if (kind === "column") {
    setTypeIfNeeded("COLUMN");
    const v = Number(target.getAttribute("data-v"));
    fillActiveSelection([v]);
    highlightNumbers([]);
    return;
  }

  if (kind === "low") { setTypeIfNeeded("LOW"); highlightNumbers([]); return; }
  if (kind === "high") { setTypeIfNeeded("HIGH"); highlightNumbers([]); return; }
  if (kind === "even") { setTypeIfNeeded("EVEN"); highlightNumbers([]); return; }
  if (kind === "odd") { setTypeIfNeeded("ODD"); highlightNumbers([]); return; }
  if (kind === "red") { setTypeIfNeeded("RED"); highlightNumbers([]); return; }
  if (kind === "black") { setTypeIfNeeded("BLACK"); highlightNumbers([]); return; }

  if (kind === "number") {
    const n = Number(target.getAttribute("data-n"));
    setTypeIfNeeded("STRAIGHT");
    fillActiveSelection([n]);
    highlightNumbers([n]);
    setStatus("");
    return;
  }
}

// change bet type if needed
function setTypeIfNeeded(type) {
  const row = getActiveRowFallback();
  if (!row) return;

  const select = row.querySelector(".betType");
  if (!select) return;

  if (select.value !== type) {
    select.value = type;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// ------------------------
// Spin flow
// ------------------------
async function onSpin() {
  if (spinning) return;

  setStatus("");

  let bets;
  try {
    bets = buildBetsFromUI({ soft: false });
  } catch (e) {
    setStatus(e.message || String(e));
    return;
  }

  if (!bets.length) {
    setStatus("Aucune mise.");
    return;
  }

  const totalStake = sumBets(bets);
  if (totalStake <= 0) {
    setStatus("Total invalide.");
    return;
  }

  // solde affiché - mise immédiatement
  const shownBal = Number(balanceValueEl?.textContent);
  if (Number.isFinite(shownBal)) {
    balanceValueEl.textContent = String(shownBal - totalStake);
  }

  if (winsEl) winsEl.textContent = "—";
  if (resultValueEl) resultValueEl.textContent = "—";
  if (resultColorEl) resultColorEl.textContent = "—";
  if (totalStakedEl) totalStakedEl.textContent = "—";
  if (totalProfitEl) totalProfitEl.textContent = "—";

  spinning = true;
  setDisabled(true);
  updateSpinAvailability();

  try {
    const apiPromise = soloSpin(bets);

    setStatus("Spin...");
    await preSpin(PRE_SPIN_MS);

    setStatus("Résultat...");
    const out = await apiPromise;

    // 🥚 Easter egg: popup si une clé vient d'être débloquée
    __eggHandleUnlockedNow(out);

    const { number, color } = parseApiResult(out);

    await stopToResult(number, STOP_SPIN_MS);

    if (resultValueEl) resultValueEl.textContent = String(number);
    if (resultColorEl) resultColorEl.textContent = String(color);

    const staked = Number(out?.settlement?.totalStaked ?? out?.totalStaked ?? totalStake);
    const profit = Number(out?.settlement?.totalProfit ?? out?.profit ?? out?.netProfit ?? 0);

    if (totalStakedEl) totalStakedEl.textContent = String(staked);
    if (totalProfitEl) totalProfitEl.textContent = String(profit);

    if (out?.settlement?.winningBets && winsEl) {
      if (out.settlement.winningBets.length === 0) {
        winsEl.textContent = "Aucune mise gagnante.";
      } else {
        winsEl.textContent = out.settlement.winningBets
          .map(w => `• ${w.bet?.type} | mise=${w.bet?.amount} | profit=${w.profit} | rendu=${w.returned}`)
          .join("\n");
      }
    }

    await loadMe().catch(() => {});
    setStatus(profit >= 0 ? `✅ Profit: +${profit}` : `❌ Perte: ${profit}`);
  } catch (e) {
    console.error(e);
    setStatus("Erreur: " + (e.message || String(e)));
    await loadMe().catch(() => {});
  } finally {
    spinning = false;
    setDisabled(false);
    updateSpinAvailability();
  }
}

// ------------------------
// Animations
// ------------------------
async function preSpin(ms) {
  const wheelTurns = randInt(4, 6);
  const ballTurns = randInt(6, 9);

  const wheelTarget = currentWheelAngle + wheelTurns * 360;
  const ballTarget = currentBallOrbitAngle - ballTurns * 360;

  const p1 = animateRotation(wheelEl, currentWheelAngle, wheelTarget, ms, "linear");
  const p2 = animateBallOrbit(currentBallOrbitAngle, ballTarget, ms, "linear");

  await Promise.all([p1, p2]);

  currentWheelAngle = wheelTarget;
  currentBallOrbitAngle = ballTarget;
}

async function stopToResult(resultNumber, ms) {
  const idx = WHEEL_ORDER.indexOf(resultNumber);
  if (idx < 0) throw new Error("Numéro introuvable dans la roue.");

  const ballLandingAngle = rand(0, 360);
  const wedgeCenterTopZero = idx * SEG_ANGLE;
  const desiredWheelMod = mod360(ballLandingAngle - wedgeCenterTopZero);

  const wheelTurns = randInt(2, 4);
  let wheelTarget = currentWheelAngle + wheelTurns * 360;
  wheelTarget = snapAngleToMod(wheelTarget, desiredWheelMod);

  const ballTurns = randInt(2, 5);
  let ballTarget = currentBallOrbitAngle - ballTurns * 360;
  ballTarget = snapAngleToMod(ballTarget, mod360(ballLandingAngle));

  const p1 = animateRotation(wheelEl, currentWheelAngle, wheelTarget, ms, "cubic-bezier(0.12, 0.75, 0.12, 1)");
  const p2 = animateBallOrbit(currentBallOrbitAngle, ballTarget, ms, "cubic-bezier(0.12, 0.75, 0.12, 1)");

  await Promise.all([p1, p2]);

  currentWheelAngle = wheelTarget;
  currentBallOrbitAngle = ballTarget;
  positionBall(currentBallOrbitAngle);
}

function animateRotation(node, fromDeg, toDeg, duration, easing) {
  const anim = node.animate(
    [{ transform: `rotate(${fromDeg}deg)` }, { transform: `rotate(${toDeg}deg)` }],
    { duration, easing, fill: "forwards" }
  );
  return anim.finished.catch(() => {});
}

function animateBallOrbit(fromDeg, toDeg, duration, easing) {
  const start = performance.now();
  const total = duration;

  const ease = (t) => {
    if (easing === "linear") return t;
    return 1 - Math.pow(1 - t, 3);
  };

  return new Promise((resolve) => {
    function tick(now) {
      const t = Math.min(1, (now - start) / total);
      const p = ease(t);
      const angle = fromDeg + (toDeg - fromDeg) * p;
      positionBall(angle);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

function positionBall(angleDeg) {
  // Même raison que computeBallRadius(): on reste en layout px
  // (avant scale CSS) pour éviter des décalages.
  const size = Math.min(ballTrackEl.offsetWidth || 0, ballTrackEl.offsetHeight || 0) || 0;

  const cx = size / 2;
  const cy = size / 2;

  const r = ballRadiusPx ?? (size / 2) * 0.50;
  const rad = (angleDeg - 90) * Math.PI / 180;

  const x = cx + r * Math.cos(rad) + BALL_OFFSET_X_PX;
  const y = cy + r * Math.sin(rad) + BALL_OFFSET_Y_PX;

  ballEl.style.left = `${x}px`;
  ballEl.style.top = `${y}px`;
  ballEl.style.transform = "translate(-50%, -50%)";
}

// ------------------------
// Utils
// ------------------------
function mod360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}
function shortestDelta(a, b) {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function snapAngleToMod(angle, desiredMod) {
  const cur = mod360(angle);
  const delta = shortestDelta(cur, desiredMod);
  return angle + delta;
}
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
