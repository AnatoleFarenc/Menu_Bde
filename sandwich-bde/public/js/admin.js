const TYPE_LABELS = { plat: "Plat", boisson: "Boisson", dessert: "Dessert", supplement: "Supplément" };
let state = { user: null, view: "orders", products: [], menus: [], orders: [] };

function euros(cents) { return (cents / 100).toFixed(2).replace(".", ",") + " €"; }

async function loadAuth() {
  const res = await fetch("/auth/me");
  const data = await res.json();
  state.user = data.user;
  const el = document.getElementById("auth-area");
  if (!state.user || !state.user.is_admin) {
    document.getElementById("app-main").innerHTML =
      '<div class="empty">Accès réservé aux admins. <a href="/auth/42" style="color:var(--accent)">Se connecter</a></div>';
    return false;
  }
  el.innerHTML = `<span style="margin-right:10px">${state.user.login} (admin)</span>
    <a class="btn secondary" href="/" style="margin-right:8px;text-decoration:none">Vitrine</a>
    <button id="logout-btn" class="secondary">Déconnexion</button>`;
  document.getElementById("logout-btn").onclick = async () => { await fetch("/auth/logout", { method: "POST" }); location.reload(); };
  return true;
}

// ---------- ORDERS ----------
async function renderOrders() {
  state.orders = await fetch("/api/orders").then((r) => r.json());
  const container = document.getElementById("view-container");
  if (state.orders.length === 0) {
    container.innerHTML = '<div class="empty">Aucune commande pour le moment.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Élève</th><th>Créneau</th><th>Contenu</th><th>Total</th><th>Statut</th><th></th></tr></thead>
      <tbody>
        ${state.orders
          .map(
            (o) => `
          <tr>
            <td>${o.id}</td>
            <td>${o.login}</td>
            <td>${o.pickup_time || "—"}</td>
            <td>${o.items.map((i) => `${i.quantity}× ${i.label}`).join(", ")}${o.note ? `<br><em style="color:var(--muted)">${o.note}</em>` : ""}</td>
            <td>${euros(o.total_cents)}</td>
            <td><span class="status-pill status-${o.status}">${o.status}</span></td>
            <td>
              <select data-status="${o.id}">
                ${["pending", "confirmed", "ready", "cancelled"]
                  .map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`)
                  .join("")}
              </select>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  container.querySelectorAll("[data-status]").forEach((sel) => {
    sel.onchange = async () => {
      await fetch(`/api/orders/${sel.dataset.status}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
      renderOrders();
    };
  });
}

// ---------- PRODUCTS ----------
async function renderProducts() {
  state.products = await fetch("/api/products?all=1").then((r) => r.json());
  const container = document.getElementById("view-container");
  container.innerHTML = `
    <button id="add-product-btn" style="margin-bottom:14px">+ Ajouter un produit</button>
    <div class="admin-grid">
      ${state.products
        .map(
          (p) => `
        <div class="admin-card" style="opacity:${p.available ? 1 : 0.5}">
          <span class="type-badge">${TYPE_LABELS[p.type]}</span>
          <h3>${p.name}</h3>
          <p class="desc">${p.description || ""}</p>
          <div class="price">${euros(p.price_cents)}</div>
          <div class="row">
            <button class="secondary" data-edit="${p.id}">Modifier</button>
            <button class="secondary" data-toggle="${p.id}">${p.available ? "Retirer" : "Remettre"}</button>
            <button class="danger" data-del="${p.id}">Suppr.</button>
          </div>
        </div>`
        )
        .join("")}
    </div>`;

  document.getElementById("add-product-btn").onclick = () => openProductModal();
  container.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openProductModal(state.products.find((p) => p.id == b.dataset.edit))));
  container.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => { await fetch(`/api/products/${b.dataset.toggle}/toggle`, { method: "PATCH" }); renderProducts(); }));
  container.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Supprimer ce produit ?")) { await fetch(`/api/products/${b.dataset.del}`, { method: "DELETE" }); renderProducts(); } }));
}

function openProductModal(product) {
  const isEdit = !!product;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? "Modifier" : "Ajouter"} un produit</h2>
      <div class="field"><label>Nom</label><input id="f-name" value="${product?.name || ""}"></div>
      <div class="field"><label>Description</label><textarea id="f-desc" rows="2">${product?.description || ""}</textarea></div>
      <div class="row">
        <div class="field"><label>Prix (€)</label><input id="f-price" type="number" step="0.01" value="${product ? (product.price_cents / 100).toFixed(2) : ""}"></div>
        <div class="field"><label>Type</label>
          <select id="f-type">
            ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${product?.type === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field"><label>Image (URL, optionnel)</label><input id="f-img" value="${product?.image_url || ""}"></div>
      <div class="row" style="margin-top:14px">
        <button class="secondary" id="cancel-btn">Annuler</button>
        <button id="save-btn">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#cancel-btn").onclick = () => backdrop.remove();
  backdrop.querySelector("#save-btn").onclick = async () => {
    const body = {
      name: backdrop.querySelector("#f-name").value.trim(),
      description: backdrop.querySelector("#f-desc").value.trim(),
      price_cents: Math.round(parseFloat(backdrop.querySelector("#f-price").value) * 100),
      type: backdrop.querySelector("#f-type").value,
      image_url: backdrop.querySelector("#f-img").value.trim() || null,
    };
    if (!body.name || !body.price_cents) return alert("Nom et prix requis.");
    await fetch(isEdit ? `/api/products/${product.id}` : "/api/products", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    backdrop.remove();
    renderProducts();
  };
}

// ---------- MENUS ----------
async function renderMenus() {
  [state.products, state.menus] = await Promise.all([
    fetch("/api/products?all=1").then((r) => r.json()),
    fetch("/api/menus?all=1").then((r) => r.json()),
  ]);
  const container = document.getElementById("view-container");
  container.innerHTML = `
    <button id="add-menu-btn" style="margin-bottom:14px">+ Ajouter un menu</button>
    <div class="admin-grid">
      ${state.menus
        .map(
          (m) => `
        <div class="admin-card" style="opacity:${m.available ? 1 : 0.5}">
          <h3>${m.name}</h3>
          <p class="desc">${m.items.map((i) => i.name).join(" + ")}</p>
          <div class="price">${euros(m.price_cents)}</div>
          <div class="row">
            <button class="secondary" data-edit="${m.id}">Modifier</button>
            <button class="secondary" data-toggle="${m.id}">${m.available ? "Retirer" : "Remettre"}</button>
            <button class="danger" data-del="${m.id}">Suppr.</button>
          </div>
        </div>`
        )
        .join("")}
    </div>`;

  document.getElementById("add-menu-btn").onclick = () => openMenuModal();
  container.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openMenuModal(state.menus.find((m) => m.id == b.dataset.edit))));
  container.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => { await fetch(`/api/menus/${b.dataset.toggle}/toggle`, { method: "PATCH" }); renderMenus(); }));
  container.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Supprimer ce menu ?")) { await fetch(`/api/menus/${b.dataset.del}`, { method: "DELETE" }); renderMenus(); } }));
}

function openMenuModal(menu) {
  const isEdit = !!menu;
  const selectedIds = new Set((menu?.items || []).map((i) => i.product_id));
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? "Modifier" : "Ajouter"} un menu</h2>
      <div class="field"><label>Nom</label><input id="f-name" value="${menu?.name || ""}"></div>
      <div class="field"><label>Description</label><textarea id="f-desc" rows="2">${menu?.description || ""}</textarea></div>
      <div class="field"><label>Prix du menu (€)</label><input id="f-price" type="number" step="0.01" value="${menu ? (menu.price_cents / 100).toFixed(2) : ""}"></div>
      <div class="field">
        <label>Produits inclus</label>
        <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px">
          ${state.products
            .map(
              (p) => `
            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-bottom:4px;color:var(--text)">
              <input type="checkbox" value="${p.id}" data-slot="${p.type}" ${selectedIds.has(p.id) ? "checked" : ""}>
              ${p.name} <span style="color:var(--muted)">(${TYPE_LABELS[p.type]})</span>
            </label>`
            )
            .join("")}
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="secondary" id="cancel-btn">Annuler</button>
        <button id="save-btn">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#cancel-btn").onclick = () => backdrop.remove();
  backdrop.querySelector("#save-btn").onclick = async () => {
    const checked = [...backdrop.querySelectorAll("input[type=checkbox]:checked")];
    if (checked.length === 0) return alert("Sélectionne au moins un produit pour le menu.");
    const body = {
      name: backdrop.querySelector("#f-name").value.trim(),
      description: backdrop.querySelector("#f-desc").value.trim(),
      price_cents: Math.round(parseFloat(backdrop.querySelector("#f-price").value) * 100),
      items: checked.map((c) => ({ product_id: Number(c.value), slot: c.dataset.slot })),
    };
    if (!body.name || !body.price_cents) return alert("Nom et prix requis.");
    await fetch(isEdit ? `/api/menus/${menu.id}` : "/api/menus", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    backdrop.remove();
    renderMenus();
  };
}

// ---------- NAV ----------
function renderView() {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  if (state.view === "orders") renderOrders();
  if (state.view === "products") renderProducts();
  if (state.view === "menus") renderMenus();
}

document.querySelectorAll(".tab-btn").forEach((b) => {
  b.onclick = () => { state.view = b.dataset.view; renderView(); };
});

(async function init() {
  const ok = await loadAuth();
  if (ok) renderView();
})();
