const STORAGE_KEY = "freshtrack.products.v1";
const USED_KEY = "freshtrack.usedCount.v1";
const $ = (id) => document.getElementById(id);
let products = loadProducts();
let currentView = "all";
let toastTimer;
let chatHistory = [];

const categoryEmoji = {
  "Nabiał": "🥛", "Owoce i warzywa": "🥑", "Mięso i ryby": "🐟",
  "Pieczywo": "🍞", "Produkty suche": "🌾", "Mrożonki": "🧊",
  "Napoje": "🧃", "Inne": "🥫"
};
const viewTitles = {
  all: ["Wszystkie produkty", "Miej terminy pod kontrolą i marnuj mniej.", "Twoje produkty", "Najbliższe terminy na samej górze."],
  soon: ["Do zużycia wkrótce", "Te produkty warto zaplanować na najbliższe dni.", "Zużyj w pierwszej kolejności", "Produkty z terminem w ciągu 3 dni."],
  expired: ["Po terminie", "Sprawdź te produkty i oceń je przed użyciem.", "Produkty po terminie", "Data minęła — sprawdź etykietę i stan produktu."],
  used: ["Zużyte produkty", "Dobra robota — wykorzystane produkty nie muszą się zmarnować.", "Historia zużycia", "Produkty oznaczone przez Ciebie jako zużyte."]
};

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function loadProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}
function daysUntil(dateString) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(`${dateString}T00:00:00`);
  return Math.round((date - today) / 86400000);
}
function getStatus(product) {
  if (product.used) return { key: "used", label: "Zużyty", className: "used" };
  const days = daysUntil(product.date);
  if (days < 0) return { key: "expired", label: `${Math.abs(days)} dni po terminie`, className: "expired" };
  if (days === 0) return { key: "soon", label: "Do zużycia dziś", className: "soon" };
  if (days <= 3) return { key: "soon", label: days === 1 ? "Jutro" : `Za ${days} dni`, className: "soon" };
  return { key: "fresh", label: "W terminie", className: "fresh" };
}
function formatDate(dateString) {
  if (!dateString) return "—";
  const [y, m, d] = dateString.split("-");
  return `${d}.${m}.${y}`;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function visibleProducts() {
  const search = $("searchInput").value.trim().toLocaleLowerCase("pl");
  const category = $("categoryFilter").value;
  return products
    .filter(p => {
      const status = getStatus(p);
      const matchesView = currentView === "all" ||
        (currentView === "soon" && status.key === "soon") ||
        (currentView === "expired" && status.key === "expired") ||
        (currentView === "used" && p.used);
      const matchesSearch = `${p.name} ${p.category} ${p.notes || ""}`.toLocaleLowerCase("pl").includes(search);
      const matchesCategory = category === "all" || p.category === category;
      return matchesView && matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (a.used !== b.used) return a.used ? 1 : -1;
      return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl");
    });
}
function render() {
  const active = products.filter(p => !p.used);
  const soon = active.filter(p => getStatus(p).key === "soon").length;
  const expired = active.filter(p => getStatus(p).key === "expired").length;
  const used = products.filter(p => p.used).length;
  $("statAll").textContent = active.length;
  $("statSoon").textContent = soon;
  $("statExpired").textContent = expired;
  $("statUsed").textContent = used;
  $("navAllCount").textContent = active.length;
  $("impactBar").style.width = `${Math.min(100, used * 10)}%`;
  $("impactText").textContent = used ? `Świetnie! Zużyto już ${used} ${used === 1 ? "produktu" : "produktów"}.` : "Oznacz produkt jako zużyty, by śledzić postępy.";
  const isAssistant = currentView === "assistant";
  $("trackerContent").classList.toggle("hidden", isAssistant);
  $("assistantPanel").classList.toggle("hidden", !isAssistant);
  $("openAdd").classList.toggle("hidden", isAssistant);
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === currentView));
  updateChatContext();
  if (isAssistant) {
    $("pageTitle").textContent = "Asystent kulinarny";
    $("pageSubtitle").textContent = "Pomysły i przepisy dopasowane do Twoich produktów.";
    renderChatHistory();
    return;
  }

  const title = viewTitles[currentView];
  $("pageTitle").textContent = title[0];
  $("pageSubtitle").textContent = title[1];
  $("listHeading").textContent = title[2];
  $("listDescription").textContent = title[3];

  const list = $("productList");
  const items = visibleProducts();
  list.innerHTML = items.map(p => {
    const status = getStatus(p);
    const emoji = categoryEmoji[p.category] || "🥫";
    return `<article class="product-row">
      <div class="product-main"><div class="product-emoji">${emoji}</div><div><div class="product-name">${escapeHTML(p.name)}</div><div class="product-meta">${escapeHTML(p.category)}${p.notes ? " · " + escapeHTML(p.notes) : ""}</div></div></div>
      <div class="date-cell"><span class="cell-label">DATA WAŻNOŚCI</span><span class="cell-value">${formatDate(p.date)}</span></div>
      <div class="qty-cell"><span class="cell-label">ILOŚĆ</span><span class="cell-value">${escapeHTML(p.qty)} szt.</span></div>
      <div class="status-cell"><span class="cell-label">STATUS</span><span class="status-pill ${status.className}">${status.className === "expired" ? "!" : status.className === "soon" ? "◷" : status.className === "used" ? "✓" : "●"} ${escapeHTML(status.label)}</span></div>
      <div class="row-actions">
        ${!p.used ? `<button class="icon-btn" title="Oznacz jako zużyty" aria-label="Oznacz ${escapeHTML(p.name)} jako zużyty" data-action="used" data-id="${p.id}">✓</button>` : `<button class="icon-btn" title="Przywróć produkt" aria-label="Przywróć ${escapeHTML(p.name)}" data-action="restore" data-id="${p.id}">↶</button>`}
        <button class="icon-btn" title="Edytuj" aria-label="Edytuj ${escapeHTML(p.name)}" data-action="edit" data-id="${p.id}">✎</button>
        <button class="icon-btn delete" title="Usuń" aria-label="Usuń ${escapeHTML(p.name)}" data-action="delete" data-id="${p.id}">×</button>
      </div>
    </article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden", items.length > 0);
  list.classList.toggle("hidden", items.length === 0);
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function availableProducts() {
  return products
    .filter(product => !product.used && daysUntil(product.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl"))
    .slice(0, 40);
}
function updateChatContext() {
  const count = availableProducts().length;
  $("chatContext").textContent = count
    ? `Asystent uwzględni ${count} ${count === 1 ? "produkt" : count < 5 ? "produkty" : "produktów"} z terminem dziś lub później.`
    : "Nie masz teraz produktów z aktualnym terminem — możesz poprosić o dowolny przepis.";
}
function renderChatHistory() {
  const container = $("chatMessages");
  if (!chatHistory.length) {
    container.innerHTML = `<div class="chat-welcome"><span aria-hidden="true">🥗</span><strong>W czym mogę pomóc?</strong><p>Napisz, na co masz ochotę. Podpowiem danie z produktów w spiżarni albo zaproponuję brakujące składniki.</p></div>`;
    return;
  }

  container.replaceChildren();
  for (const message of chatHistory) {
    const article = document.createElement("article");
    article.className = `chat-message ${message.role === "user" ? "from-user" : "from-assistant"}`;
    const label = document.createElement("span");
    label.className = "chat-author";
    label.textContent = message.role === "user" ? "Ty" : "Asystent FreshTrack";
    const bubble = document.createElement("p");
    bubble.className = "chat-bubble";
    bubble.textContent = message.content;
    article.append(label, bubble);
    container.append(article);
  }
  container.scrollTop = container.scrollHeight;
}
function recentChatMessages() {
  const selected = [];
  let length = 0;
  for (let index = chatHistory.length - 1; index >= 0 && selected.length < 8; index--) {
    const message = chatHistory[index];
    if (length + message.content.length > 15000) break;
    selected.unshift(message);
    length += message.content.length;
  }
  return selected;
}
function openDialog(product = null) {
  $("productForm").reset();
  $("productId").value = product?.id || "";
  $("modalTitle").textContent = product ? "Edytuj produkt" : "Dodaj produkt";
  $("productName").value = product?.name || "";
  $("productDate").value = product?.date || localISODate();
  $("productQty").value = product?.qty || 1;
  $("productCategory").value = product?.category || "Nabiał";
  $("productNotes").value = product?.notes || "";
  $("productDialog").showModal();
  $("productName").focus();
}
function closeDialog() { $("productDialog").close(); }

$("openAdd").addEventListener("click", () => openDialog());
$("emptyAdd").addEventListener("click", () => openDialog());
$("closeModal").addEventListener("click", closeDialog);
$("cancelModal").addEventListener("click", closeDialog);
$("seeSoon").addEventListener("click", () => { currentView = "soon"; render(); document.querySelector(".products-section").scrollIntoView({ behavior: "smooth", block: "start" }); });
$("searchInput").addEventListener("input", render);
$("categoryFilter").addEventListener("change", render);
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => {
  currentView = btn.dataset.view;
  render();
  if (currentView === "assistant") $("chatInput").focus();
}));

$("chatForm").addEventListener("submit", async event => {
  event.preventDefault();
  const content = $("chatInput").value.trim();
  if (!content || content.length > 1200) return;

  chatHistory.push({ role: "user", content });
  chatHistory = chatHistory.slice(-20);
  $("chatInput").value = "";
  renderChatHistory();
  $("chatStatus").classList.remove("error");
  $("chatStatus").textContent = "Asystent przygotowuje odpowiedź…";
  $("chatSubmit").disabled = true;
  $("chatInput").disabled = true;
  $("clearChat").disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: availableProducts().map(({ name, date, qty }) => ({ name, date, qty })),
        messages: recentChatMessages()
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (response.status === 429) throw new Error("Osiągnięto limit wiadomości. Spróbuj ponownie później.");
    if (response.status === 503) throw new Error("Asystent AI nie jest teraz skonfigurowany. Spróbuj ponownie później.");
    if (!response.ok) throw new Error("Nie udało się uzyskać odpowiedzi. Spróbuj ponownie za chwilę.");
    const result = await response.json();
    if (typeof result.reply !== "string" || !result.reply.trim()) {
      throw new Error("Asystent zwrócił pustą odpowiedź. Spróbuj ponownie.");
    }
    chatHistory.push({ role: "assistant", content: result.reply.trim().slice(0, 5000) });
    chatHistory = chatHistory.slice(-20);
    $("chatStatus").textContent = "";
    renderChatHistory();
  } catch (error) {
    $("chatStatus").classList.add("error");
    $("chatStatus").textContent = error.name === "TimeoutError"
      ? "Odpowiedź trwała zbyt długo. Spróbuj ponownie."
      : error.message || "Nie udało się połączyć z asystentem. Spróbuj ponownie.";
  } finally {
    $("chatSubmit").disabled = false;
    $("chatInput").disabled = false;
    $("clearChat").disabled = false;
    $("chatInput").focus();
  }
});

$("clearChat").addEventListener("click", () => {
  chatHistory = [];
  $("chatStatus").classList.remove("error");
  $("chatStatus").textContent = "";
  renderChatHistory();
  $("chatInput").focus();
});

$("productForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("productId").value;
  const product = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    name: $("productName").value.trim(),
    date: $("productDate").value,
    qty: Math.max(1, Number.parseInt($("productQty").value, 10) || 1),
    category: $("productCategory").value,
    notes: $("productNotes").value.trim(),
    used: id ? Boolean(products.find(p => p.id === id)?.used) : false,
    createdAt: id ? products.find(p => p.id === id)?.createdAt || Date.now() : Date.now()
  };
  if (!product.name || !product.date) return;
  if (id) products = products.map(p => p.id === id ? product : p);
  else products.push(product);
  saveProducts();
  closeDialog();
  render();
  showToast(id ? "Zapisano zmiany produktu" : "Dodano produkt do spiżarni");
});

$("productList").addEventListener("click", event => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const product = products.find(p => p.id === btn.dataset.id);
  if (!product) return;
  const action = btn.dataset.action;
  if (action === "edit") openDialog(product);
  if (action === "delete") {
    if (confirm(`Czy na pewno usunąć produkt „${product.name}”?`)) {
      products = products.filter(p => p.id !== product.id);
      saveProducts(); render(); showToast("Usunięto produkt");
    }
  }
  if (action === "used") {
    product.used = true; product.usedAt = Date.now();
    saveProducts(); render(); showToast(`Super! „${product.name}” oznaczono jako zużyty.`);
  }
  if (action === "restore") {
    product.used = false; delete product.usedAt;
    saveProducts(); render(); showToast("Przywrócono produkt do spiżarni");
  }
});

$("exportBtn").addEventListener("click", () => {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), products }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "freshtrack-dane.json"; a.click();
  URL.revokeObjectURL(url);
  showToast("Przygotowano eksport danych");
});

render();
