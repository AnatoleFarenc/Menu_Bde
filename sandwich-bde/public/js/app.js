const TYPE_LABELS = {
  plat: "Plats",
  boisson: "Boissons",
  dessert: "Desserts",
  supplement: "Suppléments",
  menu: "Menus",
};

let state = {
  user: null,
  products: [],
  menus: [],
  activeTab: "plat",
  cart: [], // { type: 'product'|'menu', id, name, price_cents, quantity }
};

function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

async function loadAuth() {
  const res = await fetch("/auth/me");
  const data = await res.json();
  state.user = data.user;
  renderAuth();
}

function renderAuth() {
  const el = document.getElementById("auth-area");
  if (state.user) {
    el.innerHTML = `
      <span style="margin-right:10px">Salut, ${state.user.login}</span>
      ${state.user.is_admin ? '<a class="btn secondary" href="/admin.html" style="margin-right:8px;text-decoration:none">Admin</a>' : ""}
      <button id="logout-btn" class="secondary">Déconnexion</button>
    `;
    document.getElementById("logout-btn").onclick = async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.reload();
    };
    document.getElementById("cart-box").style.display = "block";
  } else {
    el.innerHTML = `<a class="btn" href="/auth/42" style="text-decoration:none">Se connecter avec l'intra 42</a>`;
    document.getElementById("cart-box").style.display = "none";
  }
}

async function loadCatalog() {
  const [products, menus] = await Promise.all([
    fetch("/api/products").then((r) => r.json()),
    fetch("/api/menus").then((r) => r.json()),
  ]);
  state.products = products;
  state.menus = menus;
  renderTabs();
  renderGrid();
}

function renderTabs() {
  const tabsEl = document.getElementById("type-tabs");
  const types = ["plat", "boisson", "dessert", "supplement", "menu"];
  tabsEl.innerHTML = types
    .map(
      (t) =>
        `<button class="tab-btn ${state.activeTab === t ? "active" : ""}" data-type="${t}">${TYPE_LABELS[t]}</button>`
    )
    .join("");
  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      state.activeTab = btn.dataset.type;
      renderTabs();
      renderGrid();
    };
  });
}

function renderGrid() {
  const grid = document.getElementById("product-grid");
  let items = [];

  if (state.activeTab === "menu") {
    items = state.menus.map((m) => ({
      id: m.id,
      type: "menu",
      name: m.name,
      description: m.description || m.items.map((i) => i.name).join(" + "),
      price_cents: m.price_cents,
    }));
  } else {
    items = state.products
      .filter((p) => p.type === state.activeTab)
      .map((p) => ({ id: p.id, type: "product", name: p.name, description: p.description, price_cents: p.price_cents }));
  }

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty">Rien de disponible ici pour le moment.</div>`;
    return;
  }

  grid.innerHTML = `
    <div class="menu-section-title">${TYPE_LABELS[state.activeTab]}</div>
    ${items
      .map(
        (it) => `
    <div class="card">
      <div class="card-head">
        <h3>${it.name}</h3>
        <span class="leader"></span>
        <span class="price">${euros(it.price_cents)}</span>
      </div>
      ${it.description ? `<p class="desc">${it.description}</p>` : ""}
      <div class="row-foot"><button class="add-link" data-add="${it.type}:${it.id}">Ajouter</button></div>
    </div>`
      )
      .join("")}`;

  grid.querySelectorAll("[data-add]").forEach((btn) => {
    btn.onclick = () => {
      const [type, id] = btn.dataset.add.split(":");
      const source = type === "menu" ? state.menus : state.products;
      const item = source.find((x) => String(x.id) === id);
      addToCart(type, item);
    };
  });
}

function addToCart(type, item) {
  if (!state.user) {
    alert("Connecte-toi avec ton compte intra 42 pour commander.");
    return;
  }
  const existing = state.cart.find((c) => c.type === type && c.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ type, id: item.id, name: item.name, price_cents: item.price_cents, quantity: 1 });
  }
  renderCart();
}

function renderCart() {
  const box = document.getElementById("cart-items");
  if (state.cart.length === 0) {
    box.innerHTML = `<div class="empty" style="padding:12px">Panier vide</div>`;
  } else {
    box.innerHTML = state.cart
      .map(
        (c, idx) => `
      <div class="cart-item">
        <span>${c.quantity}× ${c.name}</span>
        <span>
          ${euros(c.price_cents * c.quantity)}
          <button data-remove="${idx}" class="secondary" style="padding:2px 8px;margin-left:6px">✕</button>
        </span>
      </div>`
      )
      .join("");
    box.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.onclick = () => {
        state.cart.splice(Number(btn.dataset.remove), 1);
        renderCart();
      };
    });
  }
  const total = state.cart.reduce((sum, c) => sum + c.price_cents * c.quantity, 0);
  document.getElementById("cart-total").textContent = euros(total);
}

async function checkout() {
  const msg = document.getElementById("checkout-msg");
  if (state.cart.length === 0) {
    msg.textContent = "Ton panier est vide.";
    return;
  }
  const pickup_time = document.getElementById("pickup-time").value;
  const note = document.getElementById("order-note").value;

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pickup_time: pickup_time || null,
      note,
      cart: state.cart.map((c) => ({ type: c.type, id: c.id, quantity: c.quantity })),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || "Erreur lors de la commande.";
    msg.style.color = "var(--danger)";
    return;
  }
  msg.style.color = "var(--accent-2)";
  msg.textContent = `Commande #${data.id} enregistrée ✔️`;
  state.cart = [];
  renderCart();
}

document.getElementById("checkout-btn").addEventListener("click", checkout);

(async function init() {
  await loadAuth();
  await loadCatalog();
  renderCart();
})();
