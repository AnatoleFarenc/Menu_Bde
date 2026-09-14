import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminShell from './components/AdminShell';
import AdminProductModal from './components/AdminProductModal';

// Top-level component for the /gestion route: a genuinely separate page from
// the storefront (see main.jsx), with its own auth check, its own state, and
// none of the site's navigation or visual identity. Only the auth token in
// localStorage and the backend API are shared with the site.
export default function ManagementApp() {
  const [authToken] = useState(localStorage.getItem('bde_token') || '');
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [storefronts, setStorefronts] = useState([]);
  const [selectedStorefrontId, setSelectedStorefrontId] = useState(null);
  const [adminSection, setAdminSection] = useState('vitrine'); // 'vitrine' | 'bilan' | 'avis' | 'historique'
  const [categories, setCategories] = useState([]);
  const [adminProducts, setAdminProducts] = useState([]);
  const [adminMenus, setAdminMenus] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [adminModalState, setAdminModalState] = useState({ isOpen: false, item: null, type: 'product' });

  useEffect(() => {
    if (!authToken) {
      setIsAuthChecking(false);
      return;
    }
    (async () => {
      try {
        const res = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } });
        setUser(res.data.user);
      } catch (e) {
        setUser(null);
      }
      setIsAuthChecking(false);
    })();
  }, [authToken]);

  useEffect(() => {
    if (!user || !user.isAdmin) return;
    fetchAdminEvents();
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Once the events list loads, default to viewing the active event.
  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      const active = events.find(ev => ev.isActive);
      setSelectedEventId(active ? active.id : events[0].id);
    }
  }, [events, selectedEventId]);

  // Whichever event is selected, load its storefronts and default to
  // whichever one is live (or the first one otherwise).
  useEffect(() => {
    if (!selectedEventId) return;
    (async () => {
      const list = await fetchStorefronts(selectedEventId);
      const active = list.find(sf => sf.isActive);
      setSelectedStorefrontId(active ? active.id : (list[0]?.id || null));
    })();
  }, [selectedEventId]);

  // Whichever storefront is open here, keep its catalog/shopping list in sync.
  useEffect(() => {
    if (!selectedStorefrontId) return;
    fetchAdminCatalog(selectedStorefrontId);
    fetchShoppingList(selectedStorefrontId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStorefrontId]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/products');
      setCategories(res.data.categories || []);
    } catch (e) {
      console.error('Error fetching categories:', e);
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

  // A single event can hold several storefronts (e.g. "Petit-déjeuner" and
  // "Déjeuner"). Returns the list so callers can pick a default right away.
  const fetchStorefronts = async (eventId) => {
    if (!eventId) return [];
    try {
      const res = await axios.get(`/api/admin/events/${eventId}/storefronts`, { headers: { Authorization: `Bearer ${authToken}` } });
      const list = res.data.storefronts || [];
      setStorefronts(list);
      return list;
    } catch (e) {
      console.error('Error fetching storefronts:', e);
      return [];
    }
  };

  const fetchAdminCatalog = async (storefrontId) => {
    if (!storefrontId) return;
    try {
      const res = await axios.get(`/api/admin/storefronts/${storefrontId}/catalog`, { headers: { Authorization: `Bearer ${authToken}` } });
      setAdminProducts(res.data.products || []);
      setAdminMenus(res.data.menus || []);
    } catch (e) {
      console.error('Error fetching admin catalog:', e);
    }
  };

  const fetchShoppingList = async (storefrontId) => {
    if (!storefrontId) return;
    try {
      const res = await axios.get(`/api/admin/storefronts/${storefrontId}/shopping-list`, { headers: { Authorization: `Bearer ${authToken}` } });
      setShoppingList(res.data.items || []);
    } catch (e) {
      console.error('Error fetching shopping list:', e);
    }
  };

  const handleAddShoppingListItem = async item => {
    try {
      await axios.post(`/api/admin/storefronts/${selectedStorefrontId}/shopping-list`, item, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchShoppingList(selectedStorefrontId);
      return true;
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de l\'ajout à la liste de courses.');
      return false;
    }
  };

  const handleDeleteShoppingListItem = async id => {
    try {
      await axios.delete(`/api/admin/shopping-list/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchShoppingList(selectedStorefrontId);
    } catch (e) {
      alert('Erreur lors de la suppression.');
    }
  };

  const fetchDailyReport = async (from, to) => {
    try {
      const res = await axios.get('/api/admin/report', {
        params: { from, to: to || from, storefrontId: selectedStorefrontId },
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
        params: { storefrontId: selectedStorefrontId },
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
      await axios.delete(`/api/admin/reviews/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchReviews();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de l\'avis.');
    }
  };

  const handleToggleStock = async (id, type) => {
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}/toggle-stock` : `/api/admin/products/${id}/toggle-stock`;
      await axios.patch(url, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      fetchAdminCatalog(selectedStorefrontId);
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
          await axios.post('/api/admin/menus', { ...formData, storefrontId: selectedStorefrontId }, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      } else {
        if (editingId) {
          await axios.put(`/api/admin/products/${editingId}`, formData, { headers: { Authorization: `Bearer ${authToken}` } });
        } else {
          await axios.post('/api/admin/products', { ...formData, storefrontId: selectedStorefrontId }, { headers: { Authorization: `Bearer ${authToken}` } });
        }
      }
      fetchAdminCatalog(selectedStorefrontId);
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
      fetchAdminCatalog(selectedStorefrontId);
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

  const handleSelectStorefront = id => {
    setSelectedStorefrontId(id);
  };

  const handleCreateStorefront = async name => {
    try {
      const res = await axios.post(
        `/api/admin/events/${selectedEventId}/storefronts`,
        { name },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      await fetchStorefronts(selectedEventId);
      setSelectedStorefrontId(res.data.storefront.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la création de la vitrine.');
    }
  };

  const handleDuplicateStorefront = async (id, name) => {
    try {
      const res = await axios.post(
        `/api/admin/storefronts/${id}/duplicate`,
        { name },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      await fetchStorefronts(selectedEventId);
      setSelectedStorefrontId(res.data.storefront.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la duplication de la vitrine.');
    }
  };

  const handleActivateStorefront = async id => {
    if (!confirm('Mettre cette vitrine en ligne pour les étudiants ?')) return;
    try {
      await axios.post(`/api/admin/storefronts/${id}/activate`, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      await Promise.all([fetchAdminEvents(), fetchStorefronts(selectedEventId)]);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors du changement de vitrine.');
    }
  };

  const handleDeleteStorefront = async id => {
    if (!confirm('Supprimer cette vitrine ?')) return;
    try {
      await axios.delete(`/api/admin/storefronts/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (selectedStorefrontId === id) setSelectedStorefrontId(null);
      fetchStorefronts(selectedEventId);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la suppression de la vitrine.');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${authToken}` } });
    } catch (e) {}
    localStorage.removeItem('bde_token');
    window.location.href = '/';
  };

  if (isAuthChecking) {
    return <main className="auth-page admin-modern"><p>Vérification de votre compte 42...</p></main>;
  }

  if (!user) {
    return (
      <main className="auth-page admin-modern fade-in">
        <div className="auth-panel">
          <h1>Gestion</h1>
          <p>Connecte-toi d'abord sur le site pour accéder à l'outil de gestion.</p>
          <a className="btn btn-primary" href="/">Retour au site</a>
        </div>
      </main>
    );
  }

  if (!user.isAdmin) {
    return (
      <main className="auth-page admin-modern fade-in">
        <div className="auth-panel">
          <h1>Accès réservé</h1>
          <p>Cet outil est réservé aux administrateurs BDE.</p>
          <a className="btn btn-primary" href="/">Retour au site</a>
        </div>
      </main>
    );
  }

  return (
    <>
      <AdminShell
        activeSection={adminSection}
        onSelectSection={setAdminSection}
        user={user}
        onLogout={handleLogout}
        events={events}
        selectedEvent={events.find(ev => ev.id === selectedEventId)}
        onSelectEvent={handleSelectEvent}
        onCreateEvent={handleCreateEvent}
        onDuplicateEvent={handleDuplicateEvent}
        onDeleteEvent={handleDeleteEvent}
        onUpdateEvent={handleUpdateEvent}
        storefronts={storefronts}
        selectedStorefront={storefronts.find(sf => sf.id === selectedStorefrontId)}
        onSelectStorefront={handleSelectStorefront}
        onCreateStorefront={handleCreateStorefront}
        onDuplicateStorefront={handleDuplicateStorefront}
        onActivateStorefront={handleActivateStorefront}
        onDeleteStorefront={handleDeleteStorefront}
        products={adminProducts}
        menus={adminMenus}
        categories={categories}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
        onToggleCategory={handleToggleCategory}
        dailyReport={dailyReport}
        onFetchDailyReport={fetchDailyReport}
        reviews={reviews}
        onFetchReviews={fetchReviews}
        onDeleteReview={handleDeleteReview}
        onOpenAddModal={(type) => setAdminModalState({ isOpen: true, item: null, type })}
        onToggleStock={handleToggleStock}
        onEditItem={(item, type) => setAdminModalState({ isOpen: true, item, type })}
        onDeleteItem={handleDeleteAdminItem}
        shoppingList={shoppingList}
        onAddShoppingListItem={handleAddShoppingListItem}
        onDeleteShoppingListItem={handleDeleteShoppingListItem}
      />

      <AdminProductModal
        isOpen={adminModalState.isOpen}
        onClose={() => setAdminModalState({ isOpen: false, item: null, type: 'product' })}
        onSave={handleSaveAdminProduct}
        editingItem={adminModalState.item}
        type={adminModalState.type}
        categories={categories}
        products={adminProducts}
      />
    </>
  );
}
