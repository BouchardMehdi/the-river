const $ = (id) => document.getElementById(id);

const PRICES = {
  SLOT_3X3: { 1: 5, 10: 40 },
  SLOT_3X5: { 1: 15, 10: 100 },
  SLOT_5X5: { 1: 25, 10: 200 },
};


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

const EMOJI = {
  CHERRY: "🍒",
  LEMON: "🍋",
  BELL: "🔔",
  CLUB: "♣️",
  DIAMOND: "💎",
  CHEST: "🧰",
  SEVEN: "7️⃣",
};

const SYMBOLS = Object.keys(EMOJI);

const DIMS = {
  SLOT_3X3: [3, 3],
  SLOT_3X5: [3, 5],
  SLOT_5X5: [5, 5],
};

const SYMBOL_RATES = {
  CHERRY: 0.28,
  LEMON: 0.24,
  BELL: 0.16,
  CLUB: 0.14,
  DIAMOND: 0.09,
  CHEST: 0.06,
  SEVEN: 0.03,
};

const SYMBOL_VALUES = {
  SLOT_3X3: { CHERRY: 0.4, LEMON: 0.6, BELL: 1.0, CLUB: 1.3, DIAMOND: 2.0, CHEST: 3.0, SEVEN: 6.0 },
  SLOT_3X5: { CHERRY: 0.6, LEMON: 0.8, BELL: 1.2, CLUB: 1.6, DIAMOND: 2.5, CHEST: 4.0, SEVEN: 8.0 },
  SLOT_5X5: { CHERRY: 0.8, LEMON: 1.0, BELL: 1.5, CLUB: 2.0, DIAMOND: 3.5, CHEST: 6.0, SEVEN: 12.0 },
};

const PATTERN_FACTORS = {
  LINE_3: 1.0,
  COL_3: 1.0,
  DIAG_3: 1.1,
  X_3: 1.6,
  LINE_4: 1.7,
  LINE_5: 3.0,
  COL_5: 3.0,
  DIAG_5: 3.5,
  ZIG: 2.5,
  ZAG: 2.5,
  TOP_2ROWS: 5.0,
  BOTTOM_2ROWS: 5.0,
  EYE: 6.0,
  CROSS: 6.0,
  BIG_X: 6.5,
  HOURGLASS: 8.0,
  JACKPOT: 20.0,
};

const ANIM = {
  minDurationMs: 2600,
  stopStaggerMs: 220,
  spinSpeedPxPerSec: 1600,
  preRollItems: 18,
  postRollItems: 6,
  easeOutMs: 520,
  holdAfterRevealMs: 2000,
};

function token() {
  return localStorage.getItem("token") || "";
}

function api() {
  const el = $("apiBase");
  const base = (el && el.value ? el.value : "http://127.0.0.1:3000");
  return base.trim().replace(/\/+$/, "");
}

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function updateSpins() {
  const m = $("machine").value;
  $("spins").innerHTML = "";

  Object.keys(PRICES[m])
    .map((x) => Number(x))
    .sort((a, b) => a - b)
    .forEach((v) => {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = String(v);
      $("spins").appendChild(o);
    });

  updateCost();
  renderIdleMachine();
  updateInfoPanelContentSafe();
}

function updateCost() {
  const m = $("machine").value;
  const s = $("spins").value;
  $("cost").value = PRICES[m]?.[s] != null ? `${PRICES[m][s]} crédits` : "—";
  updateInfoPanelContentSafe();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

function getDisplayedBalanceNumber() {
  const txt = ($("balance")?.textContent || "").trim();
  const n = Number(txt);
  return Number.isFinite(n) ? n : null;
}

function setDisplayedBalanceNumber(n) {
  if ($("balance")) $("balance").textContent = (n == null ? "—" : String(n));
}

async function me() {
  try {
    if (!token()) {
      setDisplayedBalanceNumber(null);
      return;
    }
    const res = await fetch(api() + "/auth/me", { headers: { Authorization: "Bearer " + token() } });
    if (!res.ok) { setDisplayedBalanceNumber(null); return; }
    const data = await safeJson(res);

    // 🥚 Easter egg: popup si une clé vient d'être débloquée
    __eggHandleUnlockedNow(data);
    const credits = data?.credits ?? data?.user?.credits;
    setDisplayedBalanceNumber(credits != null ? Number(credits) : null);
  } catch {
    setDisplayedBalanceNumber(null);
  }
}

/* ================= MACHINE UI ================= */

function makeTile(text, extraClass = "") {
  const d = document.createElement("div");
  d.className = `tile ${extraClass}`.trim();
  d.textContent = text;
  return d;
}

function renderIdleMachine() {
  const machine = $("machine").value;
  const [rows, cols] = DIMS[machine];

  const host = $("machineView");
  host.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "machineShell";

  const grid = document.createElement("div");
  grid.className = "machineGrid";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid.appendChild(makeTile("?", "idle"));
  }

  shell.appendChild(grid);
  host.appendChild(shell);
}

function computeWinCellSet(wins) {
  const set = new Set();
  const arr = Array.isArray(wins) ? wins : [];
  for (const w of arr) {
    const cells = Array.isArray(w.cells) ? w.cells : [];
    for (const cell of cells) {
      if (!Array.isArray(cell) || cell.length < 2) continue;
      const r = Number(cell[0]);
      const c = Number(cell[1]);
      if (Number.isFinite(r) && Number.isFinite(c)) set.add(`${r},${c}`);
    }
  }
  return set;
}

const TILE_H = 74;
const GAP = 12;

function createReelMachine(rows, cols) {
  const shell = document.createElement("div");
  shell.className = "machineShell";

  const reelGrid = document.createElement("div");
  reelGrid.className = "reelGrid";
  reelGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const reels = [];

  for (let c = 0; c < cols; c++) {
    const reelWindow = document.createElement("div");
    reelWindow.className = "reelWindow";
    reelWindow.style.height = `${rows * TILE_H + (rows - 1) * GAP}px`;

    const strip = document.createElement("div");
    strip.className = "reelStrip";
    reelWindow.appendChild(strip);

    reelGrid.appendChild(reelWindow);
    reels.push({ strip, colIndex: c, rows, cols });
  }

  shell.appendChild(reelGrid);
  return { shell, reels };
}

function fillStripWithRandom(strip, count) {
  strip.innerHTML = "";
  for (let i = 0; i < count; i++) strip.appendChild(makeTile(EMOJI[randomSymbol()], "symbol"));
}

function buildStopStrip(strip, rows, colIndex, finalColSymbols) {
  strip.innerHTML = "";

  for (let i = 0; i < ANIM.preRollItems; i++) strip.appendChild(makeTile(EMOJI[randomSymbol()], "symbol"));

  for (let r = 0; r < rows; r++) {
    const sym = finalColSymbols[r];
    const tile = makeTile(EMOJI[sym] || sym, "symbol final");
    tile.dataset.row = String(r);
    tile.dataset.col = String(colIndex);
    strip.appendChild(tile);
  }

  for (let i = 0; i < ANIM.postRollItems; i++) strip.appendChild(makeTile(EMOJI[randomSymbol()], "symbol"));
}

function colFromGrid(grid, c) {
  return grid.map((row) => row[c]);
}

function startReelSpin(reelObj) {
  const { strip } = reelObj;

  fillStripWithRandom(strip, 24);

  let running = true;
  let offset = 0;
  let last = performance.now();

  const cycleH = 12 * (TILE_H + GAP);

  function tick(now) {
    if (!running) return;
    const dt = (now - last) / 1000;
    last = now;
    offset += ANIM.spinSpeedPxPerSec * dt;

    const y = -(offset % cycleH);
    strip.style.transform = `translateY(${y}px)`;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    stopWithFinal(finalColSymbols) {
      running = false;

      buildStopStrip(strip, reelObj.rows, reelObj.colIndex, finalColSymbols);

      strip.style.transition = "none";
      strip.style.transform = "translateY(0px)";

      const itemH = TILE_H + GAP;
      const targetY = -(ANIM.preRollItems * itemH);

      requestAnimationFrame(() => {
        strip.style.transition = `transform ${ANIM.easeOutMs}ms cubic-bezier(0.10, 0.95, 0.18, 1.0)`;
        strip.style.transform = `translateY(${targetY}px)`;
      });
    },
  };
}

function highlightWinningCells(machineViewEl, winSet) {
  const finals = machineViewEl.querySelectorAll(".tile.final");
  finals.forEach((t) => {
    const r = t.dataset.row;
    const c = t.dataset.col;
    if (r == null || c == null) return;
    if (winSet.has(`${r},${c}`)) t.classList.add("winCell");
  });
}

function renderWinsBelow(hostBlock, wins) {
  const list = Array.isArray(wins) ? wins : [];
  if (list.length === 0) {
    const d = document.createElement("div");
    d.className = "win";
    d.innerHTML = `<span>Aucun gain</span><span>+0</span>`;
    hostBlock.appendChild(d);
    return;
  }
  list.forEach((w) => {
    const d = document.createElement("div");
    d.className = "win ok";
    d.innerHTML = `<span>${w.name} ${EMOJI[w.symbol] || w.symbol}</span><span>+${w.payout}</span>`;
    hostBlock.appendChild(d);
  });
}

/* ================= INFO PANEL ================= */

function fmtPct(x) {
  return `${Math.round(x * 1000) / 10}%`;
}

function machineLabel(m) {
  if (m === "SLOT_3X3") return "3 × 3";
  if (m === "SLOT_3X5") return "3 × 5";
  if (m === "SLOT_5X5") return "5 × 5";
  return m;
}

function renderKeyValGrid(container, pairs) {
  container.innerHTML = "";
  for (const [k, v] of pairs) {
    const kEl = document.createElement("div");
    kEl.className = "infoKey";
    kEl.textContent = k;

    const vEl = document.createElement("div");
    vEl.className = "infoVal";
    vEl.textContent = v;

    container.appendChild(kEl);
    container.appendChild(vEl);
  }
}

/**
 * ---- Pattern shapes (preview) ----
 * Renvoie la liste des cellules [r,c] à allumer pour une machine donnée.
 * On choisit une représentation “simple” (ex: LINE_3 = 1ère ligne, 3 premières cases).
 */
function getPatternCells(pattern, rows, cols) {
  const cells = [];

  const add = (r, c) => {
    if (r >= 0 && r < rows && c >= 0 && c < cols) cells.push([r, c]);
  };

  if (pattern === "LINE_3") { for (let c = 0; c < Math.min(3, cols); c++) add(0, c); return cells; }
  if (pattern === "COL_3")  { for (let r = 0; r < Math.min(3, rows); r++) add(r, 0); return cells; }
  if (pattern === "DIAG_3") { add(0,0); add(1,1); add(2,2); return cells.filter(([r,c])=>r<rows && c<cols); }

  if (pattern === "X_3") {
    add(0,0); add(1,1); add(2,2);
    add(2,0); add(0,2);
    return cells.filter(([r,c])=>r<rows && c<cols);
  }

  if (pattern === "LINE_4") { for (let c = 0; c < Math.min(4, cols); c++) add(0, c); return cells; }
  if (pattern === "LINE_5") { for (let c = 0; c < Math.min(5, cols); c++) add(0, c); return cells; }
  if (pattern === "COL_5")  { for (let r = 0; r < Math.min(5, rows); r++) add(r, 0); return cells; }

  if (pattern === "DIAG_5") {
    for (let i = 0; i < 5; i++) add(i, i);
    return cells.filter(([r,c])=>r<rows && c<cols);
  }

  if (pattern === "ZIG") {
    // 3x5 reference
    add(0,0); add(1,1); add(2,2); add(1,3); add(0,4);
    return cells.filter(([r,c])=>r<rows && c<cols);
  }

  if (pattern === "ZAG") {
    add(2,0); add(1,1); add(0,2); add(1,3); add(2,4);
    return cells.filter(([r,c])=>r<rows && c<cols);
  }

  if (pattern === "TOP_2ROWS") {
    // 3x5 :
    // row0: 5 cases
    // row1: 3 cases centrales
    // row2: case centrale
    if (rows === 3 && cols === 5) {
      for (let c = 0; c < 5; c++) add(0, c);
      add(1, 1); add(1, 2); add(1, 3);
      add(2, 2);
      return cells;
    }

    for (let r = 0; r < Math.min(2, rows); r++) {
      for (let c = 0; c < cols; c++) add(r, c);
    }
    return cells;
  }

  if (pattern === "BOTTOM_2ROWS") {
    // 3x5 :
    // row0: case centrale
    // row1: 3 cases centrales
    // row2: 5 cases
    if (rows === 3 && cols === 5) {
      add(0, 2);
      add(1, 1); add(1, 2); add(1, 3);
      for (let c = 0; c < 5; c++) add(2, c);
      return cells;
    }

    // fallback: 2 dernières lignes
    for (let r = Math.max(0, rows - 2); r < rows; r++) {
      for (let c = 0; c < cols; c++) add(r, c);
    }
    return cells;
  }

  if (pattern === "EYE") {
    // 3x5 :
    // row0: 3 cases centrales
    // row1: toutes sauf la centrale
    // row2: 3 cases centrales
    if (rows === 3 && cols === 5) {
      add(0, 1); add(0, 2); add(0, 3);
      add(1, 0); add(1, 1); add(1, 3); add(1, 4);
      add(2, 1); add(2, 2); add(2, 3);
      return cells;
    }

    // fallback: zone centrale 3 colonnes
    const cStart = Math.floor((cols - 3) / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = cStart; c < cStart + 3; c++) add(r, c);
    }
    return cells.filter(([r, c]) => r < rows && c < cols);
  }

  if (pattern === "CROSS") {
    // 5x5 ref: ligne du milieu + colonne du milieu
    const midR = Math.floor(rows/2);
    const midC = Math.floor(cols/2);
    for (let c = 0; c < cols; c++) add(midR, c);
    for (let r = 0; r < rows; r++) add(r, midC);
    // dedupe
    return Array.from(new Set(cells.map(x=>x.join(",")))).map(s=>s.split(",").map(Number));
  }

  if (pattern === "BIG_X") {
    for (let i = 0; i < Math.min(rows, cols); i++) add(i, i);
    for (let i = 0; i < Math.min(rows, cols); i++) add(rows - 1 - i, i);
    return Array.from(new Set(cells.map(x=>x.join(",")))).map(s=>s.split(",").map(Number));
  }

  if (pattern === "HOURGLASS") {
    // 5x5 ref (sablier)
    for (let c = 0; c < cols; c++) add(0, c);
    for (let c = 1; c <= cols-2; c++) add(1, c);
    add(Math.floor(rows/2), Math.floor(cols/2));
    for (let c = 1; c <= cols-2; c++) add(rows-2, c);
    for (let c = 0; c < cols; c++) add(rows-1, c);
    return Array.from(new Set(cells.map(x=>x.join(",")))).map(s=>s.split(",").map(Number));
  }

  if (pattern === "JACKPOT") {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(r,c);
    return cells;
  }

  return cells;
}

function renderPatternPreview(rows, cols, onCells) {
  const grid = document.createElement("div");
  grid.className = "patternMini";
  grid.style.gridTemplateColumns = `repeat(${cols}, 12px)`;

  const onSet = new Set(onCells.map(([r,c]) => `${r},${c}`));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "pCell" + (onSet.has(`${r},${c}`) ? " on" : "");
      grid.appendChild(cell);
    }
  }
  return grid;
}

function patternApplies(pattern, rows, cols) {
  // On cache les patterns impossibles pour la machine
  if (pattern === "X_3") return rows === 3 && cols === 3;
  if (pattern === "LINE_4") return cols >= 4;
  if (pattern === "LINE_5") return cols >= 5;
  if (pattern === "COL_5") return rows >= 5;
  if (pattern === "DIAG_5") return rows >= 5 && cols >= 5;
  if (pattern === "ZIG" || pattern === "ZAG" || pattern === "TOP_2ROWS" || pattern === "BOTTOM_2ROWS" || pattern === "EYE") return rows === 3 && cols === 5;
  if (pattern === "CROSS" || pattern === "BIG_X" || pattern === "HOURGLASS") return rows === 5 && cols === 5;
  // LINE_3/COL_3/DIAG_3 : uniquement pour la machine 3x3 (pas pour 3x5 / 5x5)
  if (pattern === "LINE_3" || pattern === "COL_3" || pattern === "DIAG_3") return rows === 3 && cols === 3;

  // JACKPOT s’applique à toute taille
  return rows >= 3 && cols >= 3;
}

function renderPatternsWithShapes(container, rows, cols) {
  container.innerHTML = "";
  container.className = "patternList";

  const entries = Object.entries(PATTERN_FACTORS);

  for (const [name, factor] of entries) {
    if (!patternApplies(name, rows, cols)) continue;

    const item = document.createElement("div");
    item.className = "patternItem";

    const cells = getPatternCells(name, rows, cols);
    const mini = renderPatternPreview(rows, cols, cells);

    const label = document.createElement("div");
    label.className = "patternName";
    label.textContent = name;

    const fac = document.createElement("div");
    fac.className = "patternFactor";
    fac.textContent = `×${factor}`;

    item.appendChild(mini);
    item.appendChild(label);
    item.appendChild(fac);

    container.appendChild(item);
  }
}

/* ✅ SAFE wrapper (évite crash si éléments manquants) */
function updateInfoPanelContentSafe() {
  const required = ["infoSub", "infoPrices", "infoRates", "infoValues", "infoPatterns"];
  if (!required.every((id) => $(id))) return;
  updateInfoPanelContent();
}

function updateInfoPanelContent() {
  const m = $("machine")?.value || "SLOT_3X3";
  const [rows, cols] = DIMS[m];
  const prices = PRICES[m];
  const values = SYMBOL_VALUES[m];

  $("infoSub").textContent = `${machineLabel(m)} • ${rows} lignes × ${cols} colonnes`;

  renderKeyValGrid($("infoPrices"), Object.keys(prices)
    .sort((a,b)=>Number(a)-Number(b))
    .map(sp => [`${sp} spin${Number(sp)>1?'s':''}`, `${prices[sp]} crédits`])
  );

  renderKeyValGrid($("infoRates"), SYMBOLS.map(sym => [
    `${EMOJI[sym]} ${sym}`,
    fmtPct(SYMBOL_RATES[sym] ?? 0),
  ]));

  renderKeyValGrid($("infoValues"), SYMBOLS.map(sym => [
    `${EMOJI[sym]} ${sym}`,
    `×${values?.[sym] ?? "—"}`,
  ]));

  // ✅ Patterns avec forme
  renderPatternsWithShapes($("infoPatterns"), rows, cols);
}

function openInfoPanel() {
  $("infoPanel").classList.add("open");
  $("infoBackdrop").classList.add("open");
  $("infoPanel").setAttribute("aria-hidden", "false");
  $("infoBackdrop").setAttribute("aria-hidden", "false");
  updateInfoPanelContentSafe();
}

function closeInfoPanel() {
  $("infoPanel").classList.remove("open");
  $("infoBackdrop").classList.remove("open");
  $("infoPanel").setAttribute("aria-hidden", "true");
  $("infoBackdrop").setAttribute("aria-hidden", "true");
}

/* ================= SPIN (séquentiel) ================= */

let spinning = false;

async function playOneSpinUI(machineView, rows, cols, spinResult, spinIndex) {
  machineView.innerHTML = "";

  const { shell, reels } = createReelMachine(rows, cols);
  machineView.appendChild(shell);

  const controllers = reels.map((r) => startReelSpin(r));

  setStatus(`Spin ${spinIndex + 1}...`);

  await sleep(ANIM.minDurationMs);

  const grid = spinResult.grid;
  const winSet = computeWinCellSet(spinResult.wins);

  for (let c = 0; c < cols; c++) {
    const delay = c * ANIM.stopStaggerMs;
    setTimeout(() => {
      const finalCol = colFromGrid(grid, c);
      controllers[c].stopWithFinal(finalCol);
    }, delay);
  }

  const totalStopTime = (cols - 1) * ANIM.stopStaggerMs + ANIM.easeOutMs + 80;
  await sleep(totalStopTime);

  highlightWinningCells(machineView, winSet);
  renderWinsBelow(machineView, spinResult.wins);

  await sleep(ANIM.holdAfterRevealMs);
}

async function spin() {
  if (spinning) return;
  spinning = true;

  const machine = $("machine").value;
  const spins = Number($("spins").value);
  const cost = PRICES[machine]?.[spins];

  const balanceBefore = getDisplayedBalanceNumber();
  const canOptimisticallyDebit = (balanceBefore != null && Number.isFinite(cost));
  if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore - cost);

  try {
    if (!token()) {
      setStatus("Pas de token. Connecte-toi via login.html.");
      if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore);
      return;
    }

    setStatus("Envoi au serveur...");
    $("history").innerHTML = "";
    $("meta").textContent = "Spin en cours…";
    $("totalPayout").textContent = "0";
    $("lastNet").textContent = "0";

    const dims = DIMS[machine];
    if (!dims) {
      setStatus("Machine invalide.");
      if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore);
      return;
    }
    const [rows, cols] = dims;

    const res = await fetch(api() + "/slots/spin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token(),
      },
      body: JSON.stringify({ machine, spins }),
    });

    if (!res.ok) {
      const txt = await safeText(res);
      setStatus(`Erreur API (${res.status}) : ${txt || "voir logs serveur"}`);
      if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore);
      return;
    }

    const data = await safeJson(res);
    if (!data) {
      setStatus("Réponse API invalide (pas du JSON).");
      if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore);
      return;
    }

    if (data.credits != null) setDisplayedBalanceNumber(Number(data.credits));
    else me();

    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      setStatus("OK (mais aucun résultat renvoyé par l’API)");
      renderIdleMachine();
      return;
    }

    const machineView = $("machineView");

    const spinsCount = Number(data.spins || results.length) || results.length;
    const costPerSpin = (Number(data.totalCost || 0) / Math.max(1, spinsCount)) || 0;

    let cumPayout = 0;

    for (let i = 0; i < results.length; i++) {
      // Avant la révélation : pas de spoiler
      $("meta").textContent = `${data.machine} | spin ${i + 1}/${results.length} | cost/spin ${Math.round(costPerSpin)} | payout ? | net ?`;

      await playOneSpinUI(machineView, rows, cols, results[i], i);

      const payout = Number(results[i]?.payout || 0);
      cumPayout += payout;
      const netSpin = payout - costPerSpin;

      // Après la révélation
      $("meta").textContent = `${data.machine} | spin ${i + 1}/${results.length} | cost/spin ${Math.round(costPerSpin)} | payout ${payout} | net ${Math.round(netSpin)}`;
      $("totalPayout").textContent = String(cumPayout);
      $("lastNet").textContent = String(Math.round(netSpin));
    }

    // Résultat final (réel) de la séquence
    $("meta").textContent = `${data.machine} | cost ${data.totalCost} | payout ${data.totalPayout} | net ${data.net}`;
    $("totalPayout").textContent = String(data.totalPayout ?? cumPayout);
    $("lastNet").textContent = String(data.net ?? Math.round(cumPayout - Number(data.totalCost || 0)));

    const history = $("history");
    const summary = document.createElement("div");
    summary.className = "resultBlock";
    summary.innerHTML = `<div class="histTitle">Séquence terminée — total payout ${data.totalPayout} — net ${data.net}</div>`;
    history.appendChild(summary);

    setStatus("OK ✅");
  } catch (e) {
    console.error(e);
    setStatus("Erreur JS: " + (e?.message || e));
    if (canOptimisticallyDebit) setDisplayedBalanceNumber(balanceBefore);
  } finally {
    spinning = false;
  }
}

/* ================= EVENTS ================= */

$("machine").addEventListener("change", updateSpins);
$("spins").addEventListener("change", updateCost);

$("spinBtn").addEventListener("click", spin);
/* bouton supprimé du HTML -> pas d'erreur si absent */
$('refreshMeBtn')?.addEventListener('click', me);

$("infoBtn").addEventListener("click", () => {
  const panelOpen = $("infoPanel").classList.contains("open");
  if (panelOpen) closeInfoPanel();
  else openInfoPanel();
});
$("infoClose").addEventListener("click", closeInfoPanel);
$("infoBackdrop").addEventListener("click", closeInfoPanel);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInfoPanel();
});
$("backDashboardBtn").addEventListener("click", () => {
  window.location.href = "/public/html/dashboard.html";
});

/* ================= INIT ================= */

updateSpins();
me();
renderIdleMachine();
updateInfoPanelContentSafe();
