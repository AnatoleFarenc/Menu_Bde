import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import MenuBuilderModal from './components/MenuBuilderModal';
import CartDrawer from './components/CartDrawer';
import AdminKitchenBoard from './components/AdminKitchenBoard';
import AdminOrderHistory from './components/AdminOrderHistory';
import OrderStatus from './components/OrderStatus';
import ItemIcon from './components/ItemIcon';
import { Layers, LogIn, Sparkles } from 'lucide-react';
import { playNewOrderSound } from './lib/sound';

// Kiosk mode: hidden activation via the URL, specific to this browser only.
// To activate on a kiosk: open the URL once with ?kiosk=1 (then ?kiosk=0 to deactivate).
const KIOSK_STORAGE_KEY = 'bde_kiosk_mode';
const KIOSK_INACTIVITY_MINUTES = 3;
const KIOSK_POST_ORDER_LOGOUT_DELAY_SECONDS = 6;
const SOUND_STORAGE_KEY = 'bde_admin_sound_enabled';

export default function App() {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('bde_token') || '');
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // A tap on a new-order notification opens the site on `?tab=admin` (see
  // public/sw.js); the tab only actually shows for a signed-in admin, below.
  const [activeTab, setActiveTab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'admin' ? 'admin' : 'vitrine')); // 'vitrine' | 'orders' | 'admin'
  const [adminSubView, setAdminSubView] = useState('kitchen'); // 'kitchen' | 'history'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isKioskMode, setIsKioskMode] = useState(() => localStorage.getItem(KIOSK_STORAGE_KEY) === '1');
  const [kioskLoginInput, setKioskLoginInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [products, setProducts] = useState([]);
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [userOrders, setUserOrders] = useState([]);

  // Live order tracking (site-themed "Staff" tab): always follows whichever
  // storefront is currently active. Event/storefront creation, catalog and
  // stock management live entirely on the separate /gestion page instead.
  const [activeStorefront, setActiveStorefront] = useState(null);
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [kitchenSynthesis, setKitchenSynthesis] = useState({});
  const [kitchenProducts, setKitchenProducts] = useState([]);

  const knownOrderIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  // Modals & Drawers state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [builderMenu, setBuilderMenu] = useState(null);

  // 1. Initial Load & Auth Check
  useEffect(() => {
    // Check URL params for OAuth redirect token
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const errorFromUrl = urlParams.get('error');
    if (tokenFromUrl) {
      setAuthToken(tokenFromUrl);
      localStorage.setItem('bde_token', tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorFromUrl) {
      setAuthError(errorFromUrl);
      setIsAuthChecking(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (!authToken) {
      setIsAuthChecking(false);
    }
  }, []);

  // Hidden kiosk mode activation: ?kiosk=1 (or ?kiosk=0 to deactivate), specific to this browser.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const kioskParam = urlParams.get('kiosk');
    if (kioskParam === '1') {
      localStorage.setItem(KIOSK_STORAGE_KEY, '1');
      setIsKioskMode(true);
      urlParams.delete('kiosk');
      window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams}` : ''));
    } else if (kioskParam === '0') {
      localStorage.removeItem(KIOSK_STORAGE_KEY);
      setIsKioskMode(false);
      urlParams.delete('kiosk');
      window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams}` : ''));
    }
  }, []);

  // Coming from a new-order notification (see public/sw.js): drop `?tab=admin`
  // from the address so a later refresh behaves normally, and follow the
  // service worker's "open the staff tab" message when the site was already open.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('tab')) {
      urlParams.delete('tab');
      window.history.replaceState({}, document.title, window.location.pathname + (urlParams.toString() ? `?${urlParams}` : ''));
    }
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = event => {
      if (event.data && event.data.type === 'open-admin') {
        setActiveTab('admin');
        setAdminSubView('kitchen');
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // The staff tab only exists for an admin: someone landing on it without
  // being one (or with an expired login) is sent back to the storefront
  // instead of a blank page.
  useEffect(() => {
    if (!isAuthChecking && activeTab === 'admin' && !(user && user.isAdmin)) setActiveTab('vitrine');
  }, [isAuthChecking, user, activeTab]);

  // Kiosk mode: automatic logout after inactivity.
  useEffect(() => {
    if (!isKioskMode || !user) return undefined;
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleLogout();
      }, KIOSK_INACTIVITY_MINUTES * 60 * 1000);
    };
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKioskMode, user]);

  useEffect(() => {
    fetchProducts();
    if (authToken) {
      fetchUser();
      fetchUserOrders();
    }
  }, [authToken]);

  // "Admin" tab (site-themed order tracking) always follows the live
  // storefront, refreshed regularly in case staff switch it while open.
  useEffect(() => {
    if (user && user.isAdmin) {
      const pollAdminOrders = async () => {
        const sf = await fetchActiveStorefront();
        if (sf) {
          fetchKitchenOrders(sf.id);
          fetchKitchenProducts(sf.id);
        }
      };
      pollAdminOrders();
      const refreshTimer = setInterval(pollAdminOrders, 5000);
      return () => clearInterval(refreshTimer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Global sound notification when a new order arrives for admins
  useEffect(() => {
    if (!user || !user.isAdmin || !kitchenOrders || kitchenOrders.length === 0) return;

    if (isFirstLoadRef.current) {
      kitchenOrders.forEach(o => knownOrderIdsRef.current.add(o.id));
      isFirstLoadRef.current = false;
      return;
    }

    const newOrders = kitchenOrders.filter(o => !knownOrderIdsRef.current.has(o.id) && o.status !== 'cancelled');

    if (newOrders.length > 0) {
      newOrders.forEach(o => knownOrderIdsRef.current.add(o.id));

      const soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
      if (soundEnabled) {
        playNewOrderSound();
      }

      if (document.hidden || activeTab !== 'admin') {
        const originalTitle = document.title;
        document.title = `🔔 (${newOrders.length}) Nouvelle commande !`;
        setTimeout(() => {
          document.title = originalTitle;
        }, 8000);
      }
    }
  }, [kitchenOrders, user, activeTab]);

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
      setCategories(res.data.categories || []);
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

  // Whichever storefront is currently live for students -- the site-themed
  // "Staff" order tracking tab always follows this, not a manually browsed one.
  const fetchActiveStorefront = async () => {
    try {
      const res = await axios.get('/api/admin/active-storefront', { headers: { Authorization: `Bearer ${authToken}` } });
      setActiveStorefront(res.data.storefront);
      return res.data.storefront;
    } catch (e) {
      console.error('Error fetching active storefront:', e);
      return null;
    }
  };

  const fetchKitchenOrders = async (storefrontId) => {
    if (!storefrontId) return;
    try {
      const res = await axios.get('/api/admin/orders', {
        params: { storefrontId },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setKitchenOrders(res.data.orders || []);
      setKitchenSynthesis(res.data.synthesisByTime || {});
    } catch (e) {
      console.error('Error fetching kitchen orders:', e);
    }
  };

  const fetchKitchenProducts = async (storefrontId) => {
    if (!storefrontId) return;
    try {
      const res = await axios.get(`/api/admin/storefronts/${storefrontId}/catalog`, { headers: { Authorization: `Bearer ${authToken}` } });
      setKitchenProducts(res.data.products || []);
    } catch (e) {
      console.error('Error fetching kitchen products:', e);
    }
  };

  const handleSubmitReview = async (orderId, rating, comment) => {
    try {
      await axios.post(`/api/orders/${orderId}/review`, { rating, comment }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchUserOrders();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de l\'envoi de l\'avis.');
    }
  };

  // Auth Handlers
  const handleLogin42 = async () => {
    try {
      const res = await axios.get('/api/auth/42/url');
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        alert('Erreur: URL d\'authentification manquante reçue du serveur.');
      }
    } catch (error) {
      const serverErr = error.response?.data?.error;
      const networkErr = !error.response ? 'Impossible de contacter le serveur backend. Vérifiez que le serveur est bien démarré (npm run dev).' : null;
      alert(serverErr || networkErr || error.message || 'Erreur lors de la redirection vers 42 Intra OAuth.');
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

  // Kiosk login: no 42 OAuth, just a manually entered login to attribute the order.
  const handleKioskLogin = async (login) => {
    const trimmed = (login || '').trim();
    if (!trimmed) return;
    try {
      const res = await axios.post('/api/auth/kiosk-login', { login: trimmed });
      localStorage.setItem('bde_token', res.data.token);
      setAuthToken(res.data.token);
      setKioskLoginInput('');
    } catch (error) {
      alert('Erreur lors de la connexion à la borne.');
    }
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
      fetchProducts();
      if (user && user.isAdmin && activeStorefront) {
        fetchKitchenOrders(activeStorefront.id);
      }
      setActiveTab('orders');
      if (isKioskMode) {
        setTimeout(() => {
          handleLogout();
        }, KIOSK_POST_ORDER_LOGOUT_DELAY_SECONDS * 1000);
      }
    } catch (e) {
      alert('Erreur lors de la validation de la commande.');
    }
  };

  // Order-tracking handlers below all operate on the currently ACTIVE
  // storefront (the site-themed "Staff" tab), not the one browsed in the
  // management tool.
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/status`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
      fetchKitchenProducts(activeStorefront?.id);
    } catch (e) {
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  const handleClearOrderHistory = async () => {
    if (!confirm('Supprimer définitivement tout l\'historique des commandes de cette vitrine ? Cette action est irréversible.')) return;
    try {
      await axios.delete('/api/admin/orders', {
        params: { storefrontId: activeStorefront?.id },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
    } catch (e) {
      alert('Erreur lors de la suppression de l\'historique.');
    }
  };

  const handleUpdateOrder = async (orderId, updates) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}`, updates, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la modification de la commande.');
      return false;
    }
  };

  const handleCreateFreeOrder = async (payload) => {
    try {
      await axios.post('/api/admin/orders/free', { ...payload, storefrontId: activeStorefront?.id }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
      fetchKitchenProducts(activeStorefront?.id);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la création du don.');
      return false;
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('Supprimer définitivement cette commande ?')) return;
    try {
      await axios.delete(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
      fetchKitchenProducts(activeStorefront?.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de la commande.');
    }
  };

  const handleTogglePaid = async (orderId, isPaid) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/paid`, { isPaid }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchKitchenOrders(activeStorefront?.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la mise à jour du règlement.');
    }
  };

  // Filter products by category tab
  const visibleCategoryIds = new Set(categories.filter(category => category.isVisible !== false).map(category => category.id));
  const visibleProducts = products.filter(product => visibleCategoryIds.has(product.category));
  // On "All Products", group by type (in category order) instead of creation order.
  const categoryOrder = new Map(categories.map((category, idx) => [category.id, idx]));
  const filteredProducts = categoryFilter === 'all'
    ? [...visibleProducts].sort((a, b) => (categoryOrder.get(a.category) ?? 999) - (categoryOrder.get(b.category) ?? 999))
    : visibleProducts.filter(product => product.category === categoryFilter);

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCategory = categories.find(category => category.id === categoryFilter);

  if (isAuthChecking) {
    return <main className="auth-page"><p>Vérification de votre compte 42...</p></main>;
  }

  if (!user) {
    if (isKioskMode) {
      return (
        <main className="auth-page fade-in">
          <div className="auth-panel">
            <div className="logo-badge"><span>42</span></div>
            <h1>Borne de commande BDE</h1>
            <p>Entre ton login 42 pour passer commande.</p>
            <form onSubmit={e => { e.preventDefault(); handleKioskLogin(kioskLoginInput); }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: jdupont"
                value={kioskLoginInput}
                onChange={e => setKioskLoginInput(e.target.value)}
                autoFocus
                style={{ marginBottom: '1rem', textAlign: 'center' }}
              />
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                <LogIn size={18} /> Continuer
              </button>
            </form>
          </div>
        </main>
      );
    }
    return (
      <main className="auth-page fade-in">
        <div className="auth-panel">
          <div className="logo-badge"><span>42</span></div>
          <h1>Bienvenue sur BDE Sandwicherie</h1>
          <p>Connectez-vous avec votre compte 42 pour accéder à la vitrine, commander et suivre vos commandes.</p>
          {authError && (
            <p style={{ color: 'var(--color-accent)', fontWeight: 600, marginBottom: '1rem' }}>{authError}</p>
          )}
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
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'admin') {
            setAdminSubView('kitchen');
          }
        }}
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
              <h1>Précommandes</h1>
              <p>
                Commandez votre repas en avance pour que l'équipe du BDE le prépare et récuperez-le quand c'est prêt !
              </p>
            </div>
          </div>

          {/* CATEGORY TABS */}
          <div className="tabs-bar">
            <button aria-pressed={categoryFilter === 'all'} className={`tab-btn ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
              <Sparkles size={16} /> Tous les Produits
            </button>
            <button aria-pressed={categoryFilter === 'menu'} className={`tab-btn ${categoryFilter === 'menu' ? 'active' : ''}`} onClick={() => setCategoryFilter('menu')}>
              <Layers size={16} /> Formules Menus
            </button>
            {categories.filter(category => category.isVisible !== false).map(category => (
              <button key={category.id} aria-pressed={categoryFilter === category.id} className={`tab-btn ${categoryFilter === category.id ? 'active' : ''}`} onClick={() => setCategoryFilter(category.id)}>
                <ItemIcon item={category} size={16} /> {category.name}
              </button>
            ))}
          </div>

          {/* MENUS SECTION (When All or Menu) */}
          {(categoryFilter === 'all' || categoryFilter === 'menu') && (
            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--color-primary-text)' }}>
                <Layers size={20} /> Formules Repas BDE (Bons Plans)
              </h2>
              <div className="menu-list menu-accordion-list">
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
                {selectedCategory ? <><ItemIcon item={selectedCategory} size={20} /> {selectedCategory.name}</> : <><Sparkles size={20} /> Tous les Produits</>} ({filteredProducts.length})
              </h2>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                  Aucun produit disponible dans cette catégorie pour le moment.
                </div>
              ) : (
                <div className="menu-list">
                  {filteredProducts.map((product, idx) => (
                    <ProductCard
                      key={`${product.id}_${idx}`}
                      item={product}
                      type="product"
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      )}

      {/* TAB 2: MY ORDERS */}
      {activeTab === 'orders' && (
        <OrderStatus orders={userOrders} onSubmitReview={handleSubmitReview} />
      )}

      {/* TAB 3: STAFF BDE (Kitchen board & Order history sub-views) */}
      {activeTab === 'admin' && user && user.isAdmin && (
        adminSubView === 'history' ? (
          <AdminOrderHistory
            activeStorefront={activeStorefront}
            orders={kitchenOrders}
            products={kitchenProducts}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onClearOrderHistory={handleClearOrderHistory}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={handleDeleteOrder}
            onTogglePaid={handleTogglePaid}
            onBackToKitchen={() => setAdminSubView('kitchen')}
          />
        ) : (
          <AdminKitchenBoard
            authToken={authToken}
            activeStorefront={activeStorefront}
            orders={kitchenOrders}
            synthesisByTime={kitchenSynthesis}
            products={kitchenProducts}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onClearOrderHistory={handleClearOrderHistory}
            onUpdateOrder={handleUpdateOrder}
            onCreateFreeOrder={handleCreateFreeOrder}
            onDeleteOrder={handleDeleteOrder}
            onTogglePaid={handleTogglePaid}
            onGoToManagement={() => { window.location.href = '/gestion'; }}
            onGoToHistory={() => setAdminSubView('history')}
          />
        )
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
    </div>
  );
}
