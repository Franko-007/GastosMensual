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
const GAS_URL = "https://script.google.com/macros/s/AKfycbxEgAqCo075hdmRPjnJlCtErb0ZnEGUq5tghYGbHLZiEMVAoRnQmwd3yPVr4tpi45rC/exec";

async function syncToSheets(payload) {
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("✅ Sincronizado con Google Sheets");
  } catch (err) {
    console.warn("⚠️ Error al sincronizar:", err);
  }
}

async function fetchFromSheets() {
  try {
    const res  = await fetch(GAS_URL + "?action=getData");
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn("⚠️ No se pudo cargar desde Sheets:", err);
    return null;
  }
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
  const items = getMonthGastos(currentMonth);
  const total = getTotal(items);
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  items.forEach((g, i) => {
    const pct    = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const isPaid = paidState[currentMonth].has(i);
    const tr     = document.createElement("tr");
    tr.className = isPaid ? "row-paid" : "";
    tr.innerHTML = `
      <td class="td-num">${g.n}</td>
      <td class="td-detalle ${isPaid ? "detalle-paid" : ""}">${g.detalle}</td>
      <td class="amount-cell ${isPaid ? "amount-paid" : ""}">${fmt(g.monto)}</td>
      <td class="pct-cell">${pct}%</td>
      <td class="td-check">
        <button class="check-btn ${isPaid ? "check-active" : ""}" onclick="togglePaid(${i})">
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
  const items     = getMonthGastos(currentMonth);
  const total     = getTotal(items);
  const container = document.getElementById("expense-cards");
  container.innerHTML = "";

  items.forEach((g, i) => {
    const pct    = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const isPaid = paidState[currentMonth].has(i);
    const card   = document.createElement("div");
    card.className = "expense-card" + (isPaid ? " card-paid" : "");
    card.innerHTML = `
      <span class="exp-num">${g.n}</span>
      <div class="exp-info">
        <div class="exp-name ${isPaid ? "paid-name" : ""}">${g.detalle}</div>
        <div class="exp-amount ${isPaid ? "paid-amount" : ""}">${fmt(g.monto)}</div>
      </div>
      <span class="exp-pct">${pct}%</span>
      <button class="exp-check-btn ${isPaid ? "active" : ""}" onclick="togglePaid(${i})" title="${isPaid ? "Desmarcar" : "Marcar pagado"}">
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

  // Sincronizar con Google Apps Script
  const items = getMonthGastos(currentMonth);
  syncToSheets({
    action: "updatePago",
    mes: currentMonth,
    gastos: items.map((g, i) => ({
      n:       g.n,
      detalle: g.detalle,
      monto:   g.monto,
      pagado:  set.has(i),
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

  document.getElementById("stat-total").textContent      = fmt(total);
  document.getElementById("stat-disponible").textContent = fmt(disp);
  document.getElementById("stat-pagado").textContent     = fmt(pagado);
  document.getElementById("val-gastos").textContent      = fmt(total);
  document.getElementById("val-disponible").textContent  = fmt(disp);
  document.getElementById("val-pagado").textContent      = fmt(pagado);
  document.getElementById("paid-count-badge").textContent = `${paidCount}/${totalCount}`;

  const sub = document.getElementById("sub-pagado");
  sub.textContent = paidCount === 0       ? "Ningún gasto cancelado aún"
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

  // Responsive canvas size
  const isMobile = window.innerWidth <= 600;
  const size = isMobile ? 200 : 240;
  canvas.width  = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const cx  = size / 2, cy = size / 2, r = size * 0.46;

  ctx.clearRect(0, 0, size, size);

  let start = -Math.PI / 2;
  items.forEach((g, i) => {
    const isPaid = paidState[currentMonth].has(i);
    const slice  = (g.monto / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + slice);
    ctx.closePath();
    ctx.fillStyle   = isPaid ? "#40d898" : COLORS[i % COLORS.length];
    ctx.globalAlpha = isPaid ? 1 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0d0f14";
    ctx.lineWidth   = 2;
    ctx.stroke();
    start += slice;
  });

  // Donut hole
  const holeR = size * 0.21;
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, 2 * Math.PI);
  ctx.fillStyle = "#0d0f14";
  ctx.fill();

  // Center text
  const paidTotal = getPaidTotal(currentMonth);
  const displayVal = paidTotal > 0 ? fmt(paidTotal) : fmt(total);
  ctx.fillStyle = paidTotal > 0 ? "#40d898" : "#e8eaf2";
  const fontSize = size < 220 ? 11 : 13;
  ctx.font = `bold ${fontSize}px 'Space Mono', monospace`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayVal, cx, cy - 7);
  ctx.fillStyle = "#6b7494";
  ctx.font = `${fontSize - 2}px 'Space Mono', monospace`;
  ctx.fillText(paidTotal > 0 ? "cancelado" : "total", cx, cy + 10);

  // Legend
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
      .then(reg => {
        console.log("SW registered:", reg.scope);
        document.getElementById("pwa-status").textContent = "✓ App disponible offline";
      })
      .catch(err => console.warn("SW registration failed:", err));
  });
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById("pwa-banner");
  banner.style.display = "flex";
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("pwa-install-btn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("PWA install outcome:", outcome);
    deferredPrompt = null;
    document.getElementById("pwa-banner").style.display = "none";
  });

  document.getElementById("pwa-close-btn").addEventListener("click", () => {
    document.getElementById("pwa-banner").style.display = "none";
  });
});

window.addEventListener("appinstalled", () => {
  document.getElementById("pwa-status").textContent = "✓ App instalada correctamente";
  document.getElementById("pwa-banner").style.display = "none";
});

// Redraw chart on resize
window.addEventListener("resize", () => { renderChart(); });

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Abrir automáticamente en el mes actual
  const mesActual = MESES[new Date().getMonth()];
  selectMonth(mesActual);
});