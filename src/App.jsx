import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import MenuBuilderModal from './components/MenuBuilderModal';
import CartDrawer from './components/CartDrawer';
import AdminProductModal from './components/AdminProductModal';
import KitchenDashboard from './components/KitchenDashboard';
import OrderStatus from './components/OrderStatus';
import ItemIcon from './components/ItemIcon';
import { Layers, LogIn, Sparkles, Utensils } from 'lucide-react';

// Kiosk mode: hidden activation via the URL, specific to this browser only.
// To activate on a kiosk: open the URL once with ?kiosk=1 (then ?kiosk=0 to deactivate).
const KIOSK_STORAGE_KEY = 'bde_kiosk_mode';
const KIOSK_INACTIVITY_MINUTES = 3;
const KIOSK_POST_ORDER_LOGOUT_DELAY_SECONDS = 6;

export default function App() {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('bde_token') || '');
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('vitrine'); // 'vitrine' | 'orders' | 'admin'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isKioskMode, setIsKioskMode] = useState(() => localStorage.getItem(KIOSK_STORAGE_KEY) === '1');
  const [kioskLoginInput, setKioskLoginInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [products, setProducts] = useState([]);
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [adminProducts, setAdminProducts] = useState([]);
  const [adminMenus, setAdminMenus] = useState([]);
  const [cart, setCart] = useState([]);
  const [userOrders, setUserOrders] = useState([]);

  // Admin Kitchen state
  const [adminOrders, setAdminOrders] = useState([]);
  const [synthesisByTime, setSynthesisByTime] = useState({});
  const [dailyReport, setDailyReport] = useState(null);
  const [reviews, setReviews] = useState([]);

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

  useEffect(() => {
    if (user && user.isAdmin && activeTab === 'admin') {
      fetchAdminEvents();
      const refreshTimer = setInterval(() => fetchAdminOrders(selectedEventId), 5000);
      return () => clearInterval(refreshTimer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  // Once the events list loads, default to viewing the active event.
  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      const active = events.find(ev => ev.isActive);
      setSelectedEventId(active ? active.id : events[0].id);
    }
  }, [events, selectedEventId]);

  // Whichever event is selected in the admin, keep its catalog/orders/bilan in sync.
  useEffect(() => {
    if (!selectedEventId || activeTab !== 'admin') return;
    fetchAdminCatalog(selectedEventId);
    fetchAdminOrders(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, activeTab]);

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

  // Products/menus of whichever event is open in the admin -- independent
  // from the public storefront's `products`/`menus`, which always reflect
  // the active event only.
  const fetchAdminCatalog = async (eventId) => {
    if (!eventId) return;
    try {
      const res = await axios.get(`/api/admin/events/${eventId}/catalog`, { headers: { Authorization: `Bearer ${authToken}` } });
      setAdminProducts(res.data.products || []);
      setAdminMenus(res.data.menus || []);
    } catch (e) {
      console.error('Error fetching admin catalog:', e);
    }
  };

  const fetchAdminOrders = async (eventId = selectedEventId) => {
    if (!eventId) return;
    try {
      const res = await axios.get('/api/admin/orders', {
        params: { eventId },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setAdminOrders(res.data.orders || []);
      setSynthesisByTime(res.data.synthesisByTime || {});
    } catch (e) {
      console.error('Error fetching admin orders:', e);
    }
  };

  const fetchDailyReport = async (from, to) => {
    try {
      const res = await axios.get('/api/admin/report', {
        params: { from, to: to || from, eventId: selectedEventId },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setDailyReport(res.data);
    } catch (e) {
      console.error('Error fetching daily report:', e);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await axios.get('/api/admin/reviews', {
        params: { eventId: selectedEventId },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setReviews(res.data.reviews || []);
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  };

  const handleDeleteReview = async (orderId) => {
    if (!confirm('Supprimer définitivement cet avis ?')) return;
    try {
      await axios.delete(`/api/admin/reviews/${orderId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchReviews();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de l\'avis.');
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

  const fetchAdminEvents = async () => {
    try {
      const res = await axios.get('/api/admin/events', { headers: { Authorization: `Bearer ${authToken}` } });
      setEvents(res.data.events || []);
    } catch (e) {
      console.error('Error fetching events:', e);
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
      if (user && user.isAdmin) {
        fetchAdminOrders();
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

  // Admin Stock & Product Handlers (always operate on the event currently
  // open in the admin -- see EventSidebar/EventHeader).
  const handleToggleStock = async (id, type) => {
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}/toggle-stock` : `/api/admin/products/${id}/toggle-stock`;
      await axios.patch(url, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchAdminCatalog(selectedEventId);
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
          await axios.post('/api/admin/menus', { ...formData, eventId: selectedEventId }, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      } else {
        if (editingId) {
          await axios.put(`/api/admin/products/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        } else {
          await axios.post('/api/admin/products', { ...formData, eventId: selectedEventId }, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      }
      fetchAdminCatalog(selectedEventId);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de l\'enregistrement du produit.');
      return false;
    }
  };

  const handleDeleteAdminItem = async (id, type) => {
    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return;
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}` : `/api/admin/products/${id}`;
      await axios.delete(url, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchAdminCatalog(selectedEventId);
    } catch (e) {
      alert('Erreur lors de la suppression.');
    }
  };

  const handleAddCategory = async category => {
    try {
      const res = await axios.post('/api/admin/categories', category, { headers: { Authorization: `Bearer ${authToken}` } });
      setCategories(res.data.categories || []);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la création de la catégorie.');
      return false;
    }
  };

  const handleDeleteCategory = async id => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    try {
      const res = await axios.delete(`/api/admin/categories/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      setCategories(res.data.categories || []);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de la catégorie.');
    }
  };

  const handleToggleCategory = async id => {
    try {
      const res = await axios.patch(`/api/admin/categories/${id}/visibility`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      setCategories(res.data.categories || []);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la modification de la visibilité.');
    }
  };

  const handleSelectEvent = id => {
    setSelectedEventId(id);
  };

  // "+" in the sidebar: a genuinely new, empty event.
  const handleCreateEvent = async eventData => {
    try {
      const res = await axios.post('/api/admin/events', eventData, { headers: { Authorization: `Bearer ${authToken}` } });
      await fetchAdminEvents();
      setSelectedEventId(res.data.event.id);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la création de l\'événement.');
      return false;
    }
  };

  // Per-event "copy" action: duplicates that specific event's catalog under a new name.
  const handleDuplicateEvent = async id => {
    const source = events.find(ev => ev.id === id);
    const name = prompt('Nom du nouvel événement :', source ? `${source.name} (copie)` : '');
    if (!name || !name.trim()) return;
    try {
      const res = await axios.post(
        '/api/admin/events',
        { name, copyFromEventId: id },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      await fetchAdminEvents();
      setSelectedEventId(res.data.event.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la duplication de l\'événement.');
    }
  };

  const handleUpdateEvent = async (id, updates) => {
    try {
      await axios.patch(`/api/admin/events/${id}`, updates, { headers: { Authorization: `Bearer ${authToken}` } });
      await fetchAdminEvents();
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la modification de l\'événement.');
      return false;
    }
  };

  const handleActivateEvent = async id => {
    if (!confirm('Basculer la vitrine sur cet événement ?')) return;
    try {
      await axios.post(`/api/admin/events/${id}/activate`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      await fetchAdminEvents();
      fetchProducts(); // refresh the public storefront, now serving this event
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors du changement d\'événement.');
    }
  };

  const handleDeleteEvent = async id => {
    if (!confirm('Supprimer cet événement enregistré ?')) return;
    try {
      await axios.delete(`/api/admin/events/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (selectedEventId === id) setSelectedEventId(null);
      fetchAdminEvents();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de l\'événement.');
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/status`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
      fetchAdminCatalog(selectedEventId);
    } catch (e) {
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  const handleClearOrderHistory = async () => {
    if (!confirm('Supprimer définitivement tout l\'historique des commandes de cet événement ? Cette action est irréversible.')) return;
    try {
      await axios.delete('/api/admin/orders', {
        params: { eventId: selectedEventId },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
    } catch (e) {
      alert('Erreur lors de la suppression de l\'historique.');
    }
  };

  const handleUpdateOrder = async (orderId, updates) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}`, updates, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la modification de la commande.');
      return false;
    }
  };

  const handleCreateFreeOrder = async (payload) => {
    try {
      await axios.post('/api/admin/orders/free', { ...payload, eventId: selectedEventId }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
      fetchAdminCatalog(selectedEventId);
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
      fetchAdminOrders();
      fetchAdminCatalog(selectedEventId);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de la commande.');
    }
  };

  const handleTogglePaid = async (orderId, isPaid) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/paid`, { isPaid }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      fetchAdminOrders();
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

      {/* TAB 3: ADMIN BDE DASHBOARD */}
      {activeTab === 'admin' && user && user.isAdmin && (
        <KitchenDashboard
          orders={adminOrders}
          synthesisByTime={synthesisByTime}
          products={adminProducts}
          menus={adminMenus}
          categories={categories}
          events={events}
          selectedEvent={events.find(ev => ev.id === selectedEventId)}
          onSelectEvent={handleSelectEvent}
          onCreateEvent={handleCreateEvent}
          onDuplicateEvent={handleDuplicateEvent}
          onActivateEvent={handleActivateEvent}
          onDeleteEvent={handleDeleteEvent}
          onUpdateEvent={handleUpdateEvent}
          onAddCategory={handleAddCategory}
          onDeleteCategory={handleDeleteCategory}
          onToggleCategory={handleToggleCategory}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onClearOrderHistory={handleClearOrderHistory}
          onUpdateOrder={handleUpdateOrder}
          onCreateFreeOrder={handleCreateFreeOrder}
          dailyReport={dailyReport}
          onFetchDailyReport={fetchDailyReport}
          reviews={reviews}
          onFetchReviews={fetchReviews}
          onDeleteReview={handleDeleteReview}
          onDeleteOrder={handleDeleteOrder}
          onTogglePaid={handleTogglePaid}
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
        categories={categories}
        products={adminProducts}
      />
    </div>
  );
}
