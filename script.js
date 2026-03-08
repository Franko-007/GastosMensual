// ─── DATA ─────────────────────────────────────────────────────────────────────
const GASTOS_DATA = {
  sueldo: 750000,
  gastos: [
    { n: 1, detalle: "ARRIENDO",         base: 320000 },
    { n: 2, detalle: "LUZ Y AGUA",       base: 35000  },
    { n: 3, detalle: "PLAN MÓVIL",       base: 25000  },
    { n: 4, detalle: "LA POLAR",         base: 32000  },
    { n: 5, detalle: "BENCINA",          base: 50000  },
    { n: 6, detalle: "SUPERMERCADO",     base: 100000 },
    { n: 7, detalle: "ALIMENTO CAPITÁN", base: 40000  },
    { n: 8, detalle: "VESP. SUR",        base: 6000   },
  ],
};

const MESES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"
];

const MONTH_DATA = {
  MARZO: { gastos: [320000,35000,25000,32000,50000,100000,40000,6000] },
};

const COLORS = [
  "#f0c93a","#e05c5c","#40d898","#5c9de0","#c05ce0",
  "#e08a5c","#5ce0c0","#e05ca8"
];

// ─── GOOGLE APPS SCRIPT API ───────────────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbxwztGeOMjSjanbHn0nRHkET-tpDXC9bZ7f1-T0nmtdPVRwHlW27n_r0DJRXkr8F7o1/exec";

// Guarda estado en Sheets (usa localStorage como caché local también)
async function syncToSheets(payload) {
  // Siempre guardar en localStorage como respaldo offline
  savePaidStateLocal();
  try {
    // Usar no-cors — Sheets recibe el POST aunque no podamos leer la respuesta
    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatus("☁️ Sincronizado", "ok");
  } catch (err) {
    setStatus("⚠️ Sin conexión — guardado local", "warn");
    console.warn("Sync error:", err);
  }
}

// Carga estado desde Sheets al abrir
async function loadFromSheets() {
  setStatus("⏳ Cargando datos...", "loading");
  try {
    const res  = await fetch(GAS_URL + "?action=getPagos", { cache: "no-store" });
    const data = await res.json();

    if (data && data.pagos) {
      // Restaurar pagos desde Sheets
      MESES.forEach(m => {
        paidState[m] = new Set();
        if (data.pagos[m]) {
          data.pagos[m].forEach(idx => paidState[m].add(Number(idx)));
        }
      });
      // Actualizar localStorage con datos del servidor
      savePaidStateLocal();
      setStatus("☁️ Datos cargados desde Sheets", "ok");
      return true;
    }
  } catch (err) {
    console.warn("No se pudo cargar desde Sheets, usando caché local:", err);
    setStatus("📱 Modo offline — datos locales", "warn");
  }
  // Fallback: usar localStorage si Sheets no responde
  loadPaidStateLocal();
  return false;
}

function setStatus(msg, type) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = msg;
  el.className   = "sync-status " + type;
  if (type === "ok") setTimeout(() => { el.textContent = ""; }, 3000);
}

// ─── PERSISTENCIA LOCAL (respaldo offline) ────────────────────────────────────
const STORAGE_KEY = "gastos2026_pagos";

function savePaidStateLocal() {
  const obj = {};
  MESES.forEach(m => { obj[m] = Array.from(paidState[m]); });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch(e) {}
}

function loadPaidStateLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    MESES.forEach(m => {
      if (obj[m] && Array.isArray(obj[m])) {
        paidState[m] = new Set(obj[m].map(Number));
      }
    });
  } catch(e) {}
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentMonth = MESES[0];
const paidState  = {};
MESES.forEach(m => { paidState[m] = new Set(); });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = n => "$" + n.toLocaleString("es-CL");

function getMonthGastos(month) {
  const data = MONTH_DATA[month];
  return GASTOS_DATA.gastos.map((g, i) => ({
    ...g, monto: data ? data.gastos[i] : g.base,
  }));
}

const getTotal     = items => items.reduce((s, g) => s + g.monto, 0);
const getPaidTotal = month => {
  const items = getMonthGastos(month);
  let t = 0;
  paidState[month].forEach(i => { t += items[i].monto; });
  return t;
};

// Pendientes primero, pagados al final
function getSortedItems(month) {
  const items = getMonthGastos(month);
  const set   = paidState[month];
  return [
    ...items.filter((_, i) => !set.has(i)),
    ...items.filter((_, i) =>  set.has(i)),
  ];
}

// ─── MONTHS ───────────────────────────────────────────────────────────────────
function renderMonths() {
  const grid = document.getElementById("months-grid");
  grid.innerHTML = "";
  MESES.forEach(m => {
    const count = paidState[m].size;
    const btn   = document.createElement("button");
    btn.className = "month-btn" + (m === currentMonth ? " active" : "");
    btn.title = m;
    btn.innerHTML = m.slice(0,3) + (count > 0 ? `<span class="month-dot">${count}</span>` : "");
    btn.onclick = () => selectMonth(m);
    grid.appendChild(btn);
  });
}

function selectMonth(month) {
  currentMonth = month;
  document.getElementById("month-badge").textContent = month;
  renderMonths();
  renderTable();
  renderMobileCards();
  renderSummary();
  renderChart();
}

// ─── TABLE (desktop) ──────────────────────────────────────────────────────────
function renderTable() {
  const sorted = getSortedItems(currentMonth);
  const total  = getTotal(getMonthGastos(currentMonth));
  const tbody  = document.getElementById("table-body");
  tbody.innerHTML = "";

  sorted.forEach(g => {
    const origIndex = GASTOS_DATA.gastos.findIndex(x => x.n === g.n);
    const isPaid    = paidState[currentMonth].has(origIndex);
    const pct       = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const tr        = document.createElement("tr");
    tr.className    = isPaid ? "row-paid" : "";
    tr.innerHTML = `
      <td class="td-num">${g.n}</td>
      <td class="td-detalle ${isPaid ? "detalle-paid" : ""}">${g.detalle}</td>
      <td class="amount-cell ${isPaid ? "amount-paid" : ""}">${fmt(g.monto)}</td>
      <td class="pct-cell">${pct}%</td>
      <td class="td-check">
        <button class="check-btn ${isPaid ? "check-active" : ""}" onclick="togglePaid(${origIndex})">
          <span class="check-icon">${isPaid ? "✓" : "○"}</span>
          <span class="check-label">${isPaid ? "Pagado" : "Pendiente"}</span>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("foot-total").textContent = fmt(total);
}

// ─── MOBILE CARDS ─────────────────────────────────────────────────────────────
function renderMobileCards() {
  const sorted    = getSortedItems(currentMonth);
  const total     = getTotal(getMonthGastos(currentMonth));
  const container = document.getElementById("expense-cards");
  container.innerHTML = "";

  sorted.forEach(g => {
    const origIndex = GASTOS_DATA.gastos.findIndex(x => x.n === g.n);
    const isPaid    = paidState[currentMonth].has(origIndex);
    const pct       = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const card      = document.createElement("div");
    card.className  = "expense-card" + (isPaid ? " card-paid" : "");
    card.innerHTML  = `
      <span class="exp-num">${g.n}</span>
      <div class="exp-info">
        <div class="exp-name ${isPaid ? "paid-name" : ""}">${g.detalle}</div>
        <div class="exp-amount ${isPaid ? "paid-amount" : ""}">${fmt(g.monto)}</div>
      </div>
      <span class="exp-pct">${pct}%</span>
      <button class="exp-check-btn ${isPaid ? "active" : ""}" onclick="togglePaid(${origIndex})" title="${isPaid ? "Desmarcar" : "Marcar pagado"}">
        ${isPaid ? "✓" : "○"}
      </button>`;
    container.appendChild(card);
  });
}

// ─── TOGGLE PAID ──────────────────────────────────────────────────────────────
function togglePaid(index) {
  const set = paidState[currentMonth];
  set.has(index) ? set.delete(index) : set.add(index);

  renderTable();
  renderMobileCards();
  renderSummary();
  renderMonths();
  renderChart();

  // Enviar TODO el estado del mes a Sheets
  const items = getMonthGastos(currentMonth);
  syncToSheets({
    action:      "updatePagos",
    mes:         currentMonth,
    gastos:      items.map((g, i) => ({
      n:       g.n,
      detalle: g.detalle,
      monto:   g.monto,
      pagado:  set.has(i),
      index:   i,
    })),
    totalPagado: getPaidTotal(currentMonth),
    timestamp:   new Date().toISOString(),
  });
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
function renderSummary() {
  const items      = getMonthGastos(currentMonth);
  const total      = getTotal(items);
  const sueldo     = GASTOS_DATA.sueldo;
  const disp       = sueldo - total;
  const pagado     = getPaidTotal(currentMonth);
  const paidCount  = paidState[currentMonth].size;
  const totalCount = items.length;

  document.getElementById("stat-total").textContent       = fmt(total);
  document.getElementById("stat-disponible").textContent  = fmt(disp);
  document.getElementById("stat-pagado").textContent      = fmt(pagado);
  document.getElementById("val-gastos").textContent       = fmt(total);
  document.getElementById("val-disponible").textContent   = fmt(disp);
  document.getElementById("val-pagado").textContent       = fmt(pagado);
  document.getElementById("paid-count-badge").textContent = `${paidCount}/${totalCount}`;

  const sub = document.getElementById("sub-pagado");
  sub.textContent = paidCount === 0         ? "Ningún gasto cancelado aún"
                  : paidCount === totalCount ? "✅ ¡Todos los gastos cancelados!"
                  : `${paidCount} de ${totalCount} gastos cancelados`;

  const gastPct = Math.min((total  / sueldo) * 100, 100).toFixed(1);
  const dispPct = Math.max((disp   / sueldo) * 100, 0).toFixed(1);
  const paidPct = total > 0 ? Math.min((pagado / total) * 100, 100).toFixed(1) : "0";

  document.getElementById("bar-gastos").style.width     = gastPct + "%";
  document.getElementById("bar-disponible").style.width = dispPct + "%";
  document.getElementById("bar-pagado").style.width     = paidPct + "%";
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function renderChart() {
  const items  = getMonthGastos(currentMonth);
  const total  = getTotal(items);
  const canvas = document.getElementById("pie-chart");
  const size   = window.innerWidth <= 600 ? 200 : 240;
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext("2d");
  const cx  = size / 2, cy = size / 2, r = size * 0.46;
  ctx.clearRect(0, 0, size, size);

  let start = -Math.PI / 2;
  items.forEach((g, i) => {
    const isPaid = paidState[currentMonth].has(i);
    const slice  = (g.monto / total) * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + slice);
    ctx.closePath();
    ctx.fillStyle   = isPaid ? "#40d898" : COLORS[i % COLORS.length];
    ctx.globalAlpha = isPaid ? 1 : 0.85;
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0d0f14"; ctx.lineWidth = 2; ctx.stroke();
    start += slice;
  });

  ctx.beginPath(); ctx.arc(cx, cy, size * 0.21, 0, 2 * Math.PI);
  ctx.fillStyle = "#0d0f14"; ctx.fill();

  const paidTotal  = getPaidTotal(currentMonth);
  const fontSize   = size < 220 ? 11 : 13;
  ctx.fillStyle    = paidTotal > 0 ? "#40d898" : "#e8eaf2";
  ctx.font         = `bold ${fontSize}px 'Space Mono', monospace`;
  ctx.textAlign    = "center"; ctx.textBaseline = "middle";
  ctx.fillText(paidTotal > 0 ? fmt(paidTotal) : fmt(total), cx, cy - 7);
  ctx.fillStyle = "#6b7494"; ctx.font = `${fontSize - 2}px 'Space Mono', monospace`;
  ctx.fillText(paidTotal > 0 ? "cancelado" : "total", cx, cy + 10);

  const legend = document.getElementById("chart-legend");
  legend.innerHTML = "";
  items.forEach((g, i) => {
    const pct    = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0";
    const isPaid = paidState[currentMonth].has(i);
    const div    = document.createElement("div");
    div.className = "legend-item" + (isPaid ? " legend-paid" : "");
    div.innerHTML = `
      <span class="legend-dot" style="background:${isPaid ? "#40d898" : COLORS[i % COLORS.length]}"></span>
      <span class="legend-name ${isPaid ? "legend-name-paid" : ""}">${g.detalle}</span>
      <span class="legend-val">${pct}%</span>
      ${isPaid ? '<span class="legend-check">✓</span>' : ""}`;
    legend.appendChild(div);
  });
}

// ─── GOOGLE SHEETS TOGGLE ─────────────────────────────────────────────────────
function showGSInfo() {
  const el = document.getElementById("gs-instructions");
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// ─── PWA ──────────────────────────────────────────────────────────────────────
let deferredPrompt = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => { document.getElementById("pwa-status").textContent = "✓ App disponible offline"; })
      .catch(err => console.warn("SW error:", err));
  });
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById("pwa-banner").style.display = "flex";
});

window.addEventListener("appinstalled", () => {
  document.getElementById("pwa-status").textContent = "✓ App instalada";
  document.getElementById("pwa-banner").style.display = "none";
});

window.addEventListener("resize", () => renderChart());

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("pwa-install-btn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById("pwa-banner").style.display = "none";
  });
  document.getElementById("pwa-close-btn").addEventListener("click", () => {
    document.getElementById("pwa-banner").style.display = "none";
  });

  // 1. Cargar caché local inmediatamente (respuesta rápida)
  loadPaidStateLocal();
  const mesActual = MESES[new Date().getMonth()];
  selectMonth(mesActual);

  // 2. Luego intentar sincronizar con Sheets en segundo plano
  const loaded = await loadFromSheets();
  if (loaded) selectMonth(mesActual); // re-renderizar con datos del servidor
});
