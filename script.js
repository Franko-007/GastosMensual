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

const GAS_URL     = "https://script.google.com/macros/s/AKfycbxciuOcsJiQEfhkNvnnFFenAcCrvlLMUdkSZmiX4ZNAQ3CA4nGYEd8lQO3KSsy8WyL3/exec";
const STORAGE_KEY = "gastos2026_v2";

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentMonth = MESES[new Date().getMonth()];
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

const getTotal = items => items.reduce((s, g) => s + g.monto, 0);

const getPaidTotal = month => {
  const items = getMonthGastos(month);
  let t = 0;
  paidState[month].forEach(i => { if (items[i]) t += items[i].monto; });
  return t;
};

// Pendientes primero, pagados al final
function getSortedItems(month) {
  const items   = getMonthGastos(month);
  const set     = paidState[month];
  const pending = [];
  const paid    = [];
  items.forEach((g, i) => {
    const item = { ...g, origIndex: i };
    set.has(i) ? paid.push(item) : pending.push(item);
  });
  return [...pending, ...paid];
}

// ─── LOCALSTORAGE ─────────────────────────────────────────────────────────────
function saveLocal() {
  try {
    const obj = {};
    MESES.forEach(m => { obj[m] = Array.from(paidState[m]); });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    console.log("💾 Guardado local OK:", obj[currentMonth]);
  } catch(e) { console.warn("saveLocal error:", e); }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { console.log("📭 No hay datos locales"); return false; }
    const obj = JSON.parse(raw);
    MESES.forEach(m => {
      if (Array.isArray(obj[m])) {
        paidState[m] = new Set(obj[m].map(Number));
      }
    });
    console.log("📦 Cargado local OK:", obj[currentMonth]);
    return true;
  } catch(e) {
    console.warn("loadLocal error:", e);
    return false;
  }
}

// ─── SYNC STATUS ──────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = msg;
  el.className   = "sync-status " + type;
  if (type === "ok") setTimeout(() => { el.textContent = ""; el.className = "sync-status"; }, 3000);
}

// ─── SYNC TO SHEETS ───────────────────────────────────────────────────────────
async function syncToSheets() {
  const items = getMonthGastos(currentMonth);
  const set   = paidState[currentMonth];
  try {
    await fetch(GAS_URL, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:      "updatePagos",
        mes:         currentMonth,
        gastos:      items.map((g, i) => ({
          n: g.n, detalle: g.detalle, monto: g.monto, pagado: set.has(i), index: i
        })),
        totalPagado: getPaidTotal(currentMonth),
        timestamp:   new Date().toISOString(),
      }),
    });
    setStatus("☁️ Sincronizado", "ok");
  } catch(e) {
    setStatus("⚠️ Sin conexión — guardado local", "warn");
  }
}

// ─── LOAD FROM SHEETS (JSONP) ─────────────────────────────────────────────────
function loadFromSheets() {
  setStatus("⏳ Cargando...", "loading");
  return new Promise(resolve => {
    const cbName = "gsCb_" + Date.now();
    const timer  = setTimeout(() => {
      cleanup();
      console.warn("⏰ Sheets timeout — usando local");
      setStatus("📱 Datos locales", "warn");
      resolve(false);
    }, 7000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      const s = document.getElementById("_jsonp");
      if (s) s.remove();
    }

    window[cbName] = function(data) {
      cleanup();
      if (data && data.pagos) {
        MESES.forEach(m => {
          paidState[m] = new Set();
          if (Array.isArray(data.pagos[m])) {
            data.pagos[m].forEach(i => paidState[m].add(Number(i)));
          }
        });
        saveLocal();
        setStatus("☁️ Datos cargados", "ok");
        console.log("☁️ Cargado desde Sheets OK");
        resolve(true);
      } else {
        console.warn("⚠️ Sheets respondió sin datos");
        resolve(false);
      }
    };

    const s   = document.createElement("script");
    s.id      = "_jsonp";
    s.src     = GAS_URL + "?action=getPagos&callback=" + cbName;
    s.onerror = () => {
      cleanup();
      setStatus("📱 Sin conexión — datos locales", "warn");
      console.warn("❌ Error al cargar Sheets");
      resolve(false);
    };
    document.head.appendChild(s);
  });
}

// ─── TOGGLE PAID ──────────────────────────────────────────────────────────────
function togglePaid(origIndex) {
  const set = paidState[currentMonth];

  // 1. Cambiar estado
  if (set.has(origIndex)) {
    set.delete(origIndex);
    console.log("❌ Desmarcado índice", origIndex);
  } else {
    set.add(origIndex);
    console.log("✅ Marcado índice", origIndex);
  }

  // 2. Guardar en localStorage INMEDIATAMENTE
  saveLocal();

  // 3. Re-renderizar (reordena automáticamente)
  renderAll();

  // 4. Sincronizar con Sheets en segundo plano
  syncToSheets();
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  renderMonths();
  renderTable();
  renderMobileCards();
  renderSummary();
  renderChart();
}

// ─── MONTHS ───────────────────────────────────────────────────────────────────
function renderMonths() {
  const grid = document.getElementById("months-grid");
  grid.innerHTML = "";
  MESES.forEach(m => {
    const count = paidState[m].size;
    const btn   = document.createElement("button");
    btn.className = "month-btn" + (m === currentMonth ? " active" : "");
    btn.title     = m;
    btn.innerHTML = m.slice(0,3) + (count > 0 ? `<span class="month-dot">${count}</span>` : "");
    btn.onclick   = () => selectMonth(m);
    grid.appendChild(btn);
  });
}

function selectMonth(month) {
  currentMonth = month;
  document.getElementById("month-badge").textContent = month;
  renderAll();
}

// ─── TABLE (desktop) ──────────────────────────────────────────────────────────
function renderTable() {
  const sorted = getSortedItems(currentMonth);
  const total  = getTotal(getMonthGastos(currentMonth));
  const tbody  = document.getElementById("table-body");
  tbody.innerHTML = "";

  sorted.forEach(g => {
    const isPaid = paidState[currentMonth].has(g.origIndex);
    const pct    = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const tr     = document.createElement("tr");
    tr.className = isPaid ? "row-paid" : "";
    tr.innerHTML = `
      <td class="td-num">${g.n}</td>
      <td class="td-detalle ${isPaid ? "detalle-paid" : ""}">${g.detalle}</td>
      <td class="amount-cell ${isPaid ? "amount-paid" : ""}">${fmt(g.monto)}</td>
      <td class="pct-cell">${pct}%</td>
      <td class="td-check">
        <button class="check-btn ${isPaid ? "check-active" : ""}"
                onclick="togglePaid(${g.origIndex})">
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
    const isPaid = paidState[currentMonth].has(g.origIndex);
    const pct    = total > 0 ? ((g.monto / total) * 100).toFixed(1) : "0.0";
    const card   = document.createElement("div");
    card.className = "expense-card" + (isPaid ? " card-paid" : "");
    card.innerHTML = `
      <span class="exp-num">${g.n}</span>
      <div class="exp-info">
        <div class="exp-name ${isPaid ? "paid-name" : ""}">${g.detalle}</div>
        <div class="exp-amount ${isPaid ? "paid-amount" : ""}">${fmt(g.monto)}</div>
      </div>
      <span class="exp-pct">${pct}%</span>
      <button class="exp-check-btn ${isPaid ? "active" : ""}"
              onclick="togglePaid(${g.origIndex})">
        ${isPaid ? "✓" : "○"}
      </button>`;
    container.appendChild(card);
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

  document.getElementById("sub-pagado").textContent =
    paidCount === 0          ? "Ningún gasto cancelado aún" :
    paidCount === totalCount ? "✅ ¡Todos los gastos cancelados!" :
                               `${paidCount} de ${totalCount} gastos cancelados`;

  document.getElementById("bar-gastos").style.width     = Math.min((total  / sueldo) * 100, 100) + "%";
  document.getElementById("bar-disponible").style.width = Math.max((disp   / sueldo) * 100, 0)   + "%";
  document.getElementById("bar-pagado").style.width     = (total > 0 ? Math.min((pagado / total) * 100, 100) : 0) + "%";
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function renderChart() {
  const items  = getMonthGastos(currentMonth);
  const total  = getTotal(items);
  const canvas = document.getElementById("pie-chart");
  const size   = window.innerWidth <= 600 ? 200 : 240;
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext("2d");
  const cx  = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  let start = -Math.PI / 2;
  items.forEach((g, i) => {
    const isPaid = paidState[currentMonth].has(i);
    const slice  = (g.monto / total) * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, size * 0.46, start, start + slice);
    ctx.closePath();
    ctx.fillStyle   = isPaid ? "#40d898" : COLORS[i % COLORS.length];
    ctx.globalAlpha = isPaid ? 1 : 0.85;
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0d0f14"; ctx.lineWidth = 2; ctx.stroke();
    start += slice;
  });

  ctx.beginPath(); ctx.arc(cx, cy, size * 0.21, 0, 2 * Math.PI);
  ctx.fillStyle = "#0d0f14"; ctx.fill();

  const paidTotal = getPaidTotal(currentMonth);
  const fs = size < 220 ? 11 : 13;
  ctx.fillStyle = paidTotal > 0 ? "#40d898" : "#e8eaf2";
  ctx.font = `bold ${fs}px 'Space Mono', monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(paidTotal > 0 ? fmt(paidTotal) : fmt(total), cx, cy - 7);
  ctx.fillStyle = "#6b7494"; ctx.font = `${fs - 2}px 'Space Mono', monospace`;
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

// ─── MISC ─────────────────────────────────────────────────────────────────────
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
        console.log("SW registrado:", reg.scope);
        document.getElementById("pwa-status").textContent = "✓ App disponible offline";
        // Forzar actualización del SW si hay nueva versión
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              console.log("🔄 Nueva versión disponible — recargando...");
              window.location.reload();
            }
          });
        });
      })
      .catch(e => console.warn("SW error:", e));
  });
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("pwa-banner").style.display = "flex";
});

window.addEventListener("appinstalled", () => {
  document.getElementById("pwa-status").textContent = "✓ App instalada";
  document.getElementById("pwa-banner").style.display = "none";
});

window.addEventListener("resize", renderChart);

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

  // PASO 1: cargar localStorage (instantáneo, sin espera)
  loadLocal();
  selectMonth(currentMonth);

  // PASO 2: intentar traer datos frescos de Sheets
  const ok = await loadFromSheets();
  if (ok) selectMonth(currentMonth);
});
