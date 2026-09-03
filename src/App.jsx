import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import MenuBuilderModal from './components/MenuBuilderModal';
import CartDrawer from './components/CartDrawer';
import AdminProductModal from './components/AdminProductModal';
import KitchenDashboard from './components/KitchenDashboard';
import OrderStatus from './components/OrderStatus';
import { Sparkles, Utensils, Coffee, Cake, Plus, ShieldCheck, LogIn } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('bde_token') || '');
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('vitrine'); // 'vitrine' | 'orders' | 'admin'
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [products, setProducts] = useState([]);
  const [menus, setMenus] = useState([]);
  const [cart, setCart] = useState([]);
  const [userOrders, setUserOrders] = useState([]);

  // Admin Kitchen state
  const [adminOrders, setAdminOrders] = useState([]);
  const [synthesisByTime, setSynthesisByTime] = useState({});

  // Modals & Drawers state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [builderMenu, setBuilderMenu] = useState(null);
  const [adminModalState, setAdminModalState] = useState({ isOpen: false, item: null, type: 'product' });

  // Axios config with token
  const api = axios.create({
    baseURL: '',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
  });

  // 1. Initial Load & Auth Check
  useEffect(() => {
    // Check URL params for OAuth redirect token
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      setAuthToken(tokenFromUrl);
      localStorage.setItem('bde_token', tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (!authToken) {
      setIsAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    if (authToken) {
      fetchUser();
      fetchUserOrders();
    }
  }, [authToken]);

  useEffect(() => {
    if (user && user.isAdmin && activeTab === 'admin') {
      fetchAdminOrders();
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (!user || activeTab !== 'orders') return undefined;

    fetchUserOrders();
    const refreshTimer = setInterval(fetchUserOrders, 5000);
    return () => clearInterval(refreshTimer);
  }, [user, activeTab]);

  const fetchUser = async () => {
    try {
      const res = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setUser(res.data.user);
      setIsAuthChecking(false);
    } catch (e) {
      setUser(null);
      setAuthToken('');
      setIsAuthChecking(false);
      localStorage.removeItem('bde_token');
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await axios.get('/api/products');
      setProducts(res.data.products || []);
      setMenus(res.data.menus || []);
    } catch (e) {
      console.error('Error fetching products:', e);
    }
  };

  const fetchUserOrders = async () => {
    try {
      const res = await axios.get('/api/orders', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setUserOrders(res.data.orders || []);
    } catch (e) {
      console.error('Error fetching user orders:', e);
    }
  };

  const fetchAdminOrders = async () => {
    try {
      const res = await axios.get('/api/admin/orders', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setAdminOrders(res.data.orders || []);
      setSynthesisByTime(res.data.synthesisByTime || {});
    } catch (e) {
      console.error('Error fetching admin orders:', e);
    }
  };

  // Auth Handlers
  const handleLogin42 = async () => {
    try {
      const res = await axios.get('/api/auth/42/url');
      window.location.href = res.data.url;
    } catch (error) {
      alert(error.response?.data?.error || 'Erreur lors de la redirection vers 42 Intra OAuth.');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
    } catch (e) {}
    setUser(null);
    setAuthToken('');
    setIsAuthChecking(false);
    localStorage.removeItem('bde_token');
    setActiveTab('vitrine');
  };

  // Cart Handlers
  const handleAddToCart = (product) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.id === product.id && !item.choices);
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [...prev, { ...product, quantity: 1, type: 'product' }];
    });
    setIsCartOpen(true);
  };

  const handleAddMenuToCart = (menu, choices, calculatedPrice) => {
    const itemPrice = calculatedPrice !== undefined ? calculatedPrice : menu.price;
    setCart(prev => [
      ...prev,
      {
        id: menu.id + '_' + Date.now(),
        menuId: menu.id,
        name: menu.name,
        price: itemPrice,
        icon: menu.icon || '🍱',
        type: 'menu',
        choices,
        quantity: 1
      }
    ]);
    setIsCartOpen(true);
  };

  const updateCartQuantity = (index, delta) => {
    setCart(prev => {
      const updated = [...prev];
      updated[index].quantity += delta;
      if (updated[index].quantity <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      return updated;
    });
  };

  const removeCartItem = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitOrder = async (orderPayload) => {
    try {
      await axios.post('/api/orders', orderPayload, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchUserOrders();
      if (user && user.isAdmin) {
        fetchAdminOrders();
      }
      setActiveTab('orders');
    } catch (e) {
      alert('Erreur lors de la validation de la commande.');
    }
  };

  // Admin Stock & Product Handlers
  const handleToggleStock = async (id, type) => {
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}/toggle-stock` : `/api/admin/products/${id}/toggle-stock`;
      await axios.patch(url, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchProducts();
    } catch (e) {
      alert('Erreur lors de la modification du stock.');
    }
  };

  const handleSaveAdminProduct = async (formData, editingId, type) => {
    try {
      if (type === 'menu') {
        if (editingId) {
          await axios.put(`/api/admin/menus/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        } else {
          await axios.post('/api/admin/menus', formData, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      } else {
        if (editingId) {
          await axios.put(`/api/admin/products/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        } else {
          await axios.post('/api/admin/products', formData, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      }
      fetchProducts();
    } catch (e) {
      alert('Erreur lors de l\'enregistrement.');
    }
  };

  const handleDeleteAdminItem = async (id, type) => {
    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return;
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}` : `/api/admin/products/${id}`;
      await axios.delete(url, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchProducts();
    } catch (e) {
      alert('Erreur lors de la suppression.');
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/status`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
    } catch (e) {
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  // Filter products by category tab
  const filteredProducts = categoryFilter === 'all'
    ? products
    : products.filter(p => p.category === categoryFilter);

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (isAuthChecking) {
    return <main className="auth-page"><p>Vérification de votre compte 42...</p></main>;
  }

  if (!user) {
    return (
      <main className="auth-page fade-in">
        <div className="auth-panel">
          <div className="logo-badge"><span>42</span></div>
          <h1>Bienvenue sur BDE Sandwicherie</h1>
          <p>Connectez-vous avec votre compte 42 pour accéder à la vitrine, commander et suivre vos commandes.</p>
          <button className="btn btn-primary" onClick={handleLogin42}>
            <LogIn size={18} /> Se connecter avec 42
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-container">
      {/* NAVBAR */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cartTotalCount}
        onLogin42={handleLogin42}
        onLogout={handleLogout}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* TAB 1: STUDENT VITRINE */}
      {activeTab === 'vitrine' && (
        <main className="fade-in">
          {/* HERO BANNER */}
          <div className="hero-banner">
            <div className="hero-text">
              <h1>Précommande de Sandwichs 42</h1>
              <p>
                Commandez votre déjeuner en avance pour que l'équipe BDE le prépare sur mesure avant le rush du midi !
              </p>
            </div>
            <div className="hero-stats">
              <div className="stat-box">
                <div className="stat-number">100%</div>
                <div className="stat-label">Intra 42 Sync</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">⚡ Rapidité</div>
                <div className="stat-label">Zéro Attente</div>
              </div>
            </div>
          </div>

          {/* CATEGORY TABS */}
          <div className="tabs-bar">
            <button className={`tab-btn ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
              ✨ Tous les Produits
            </button>
            <button className={`tab-btn ${categoryFilter === 'menu' ? 'active' : ''}`} onClick={() => setCategoryFilter('menu')}>
              🍱 Formules Menus
            </button>
            <button className={`tab-btn ${categoryFilter === 'plat' ? 'active' : ''}`} onClick={() => setCategoryFilter('plat')}>
              🥪 Plats Principal
            </button>
            <button className={`tab-btn ${categoryFilter === 'boisson' ? 'active' : ''}`} onClick={() => setCategoryFilter('boisson')}>
              🥤 Boissons
            </button>
            <button className={`tab-btn ${categoryFilter === 'dessert' ? 'active' : ''}`} onClick={() => setCategoryFilter('dessert')}>
              🍩 Desserts
            </button>
          </div>

          {/* MENUS SECTION (When All or Menu) */}
          {(categoryFilter === 'all' || categoryFilter === 'menu') && (
            <section style={{ marginBottom: '2.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--color-primary)' }}>
                🍱 Formules Repas BDE (Bons Plans)
              </h2>
              <div className="grid-container">
                {menus.map(menu => (
                  <ProductCard
                    key={menu.id}
                    item={menu}
                    type="menu"
                    onAddToCart={handleAddToCart}
                    onOpenMenuBuilder={setBuilderMenu}
                  />
                ))}
              </div>
            </section>
          )}

          {/* PRODUCTS SECTION */}
          {categoryFilter !== 'menu' && (
            <section>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem' }}>
                {categoryFilter === 'plat' ? '🥪 Plats Principal' : categoryFilter === 'boisson' ? '🥤 Boissons Fraîches' : categoryFilter === 'dessert' ? '🍩 Desserts' : '✨ Tous les Produits'} ({filteredProducts.length})
              </h2>
              <div className="grid-container">
                {filteredProducts.map((product, idx) => (
                  <ProductCard
                    key={`${product.id}_${idx}`}
                    item={product}
                    type="product"
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* TAB 2: MY ORDERS */}
      {activeTab === 'orders' && (
        <OrderStatus orders={userOrders} />
      )}

      {/* TAB 3: ADMIN BDE DASHBOARD */}
      {activeTab === 'admin' && user && user.isAdmin && (
        <KitchenDashboard
          orders={adminOrders}
          synthesisByTime={synthesisByTime}
          products={products}
          menus={menus}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onOpenAddModal={(type) => setAdminModalState({ isOpen: true, item: null, type })}
          onToggleStock={handleToggleStock}
          onEditItem={(item, type) => setAdminModalState({ isOpen: true, item, type })}
          onDeleteItem={handleDeleteAdminItem}
        />
      )}

      {/* FLOATING CART BAR (WHEN CART NOT EMPTY & DRAWER CLOSED) */}
      {cart.length > 0 && !isCartOpen && (
        <div className="cart-floating-bar" onClick={() => setIsCartOpen(true)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🛒</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {cartTotalCount} produit{cartTotalCount > 1 ? 's' : ''} dans le panier
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                Cliquez pour choisir l'heure de retrait
              </span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ padding: '0.4rem 1rem' }}>
            Voir le Panier ({cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)} €)
          </button>
        </div>
      )}

      {/* MENU BUILDER MODAL */}
      {builderMenu && (
        <MenuBuilderModal
          menu={builderMenu}
          products={products}
          onClose={() => setBuilderMenu(null)}
          onAddMenuToCart={handleAddMenuToCart}
        />
      )}

      {/* CART DRAWER */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateQuantity={updateCartQuantity}
        removeItem={removeCartItem}
        clearCart={() => setCart([])}
        onSubmitOrder={handleSubmitOrder}
        user={user}
      />

      {/* ADMIN ADD/EDIT MODAL */}
      <AdminProductModal
        isOpen={adminModalState.isOpen}
        onClose={() => setAdminModalState({ isOpen: false, item: null, type: 'product' })}
        onSave={handleSaveAdminProduct}
        editingItem={adminModalState.item}
        type={adminModalState.type}
      />
    </div>
  );
}
