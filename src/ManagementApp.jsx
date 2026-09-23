import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TopBar from './components/TopBar';
import SectionShell from './components/SectionShell';
import Dashboard from './components/Dashboard';
import CataloguePanel from './components/CataloguePanel';
import StockPanel from './components/StockPanel';
import CoursesPanel from './components/CoursesPanel';
import BilanPanel from './components/BilanPanel';
import StatsPanel from './components/StatsPanel';
import ForecastPanel from './components/ForecastPanel';
import HistoriquePanel from './components/HistoriquePanel';
import AvisPanel from './components/AvisPanel';
import TeamPanel from './components/TeamPanel';
import LegalPanel from './components/LegalPanel';
import StorefrontHoursModal from './components/StorefrontHoursModal';
import AdminProductModal from './components/AdminProductModal';
import { showAlert, showConfirm, showPrompt } from './lib/dialogs.jsx';

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
  const [hoursModalStorefront, setHoursModalStorefront] = useState(null);

  // 'dashboard' = the event's own hub; 'section' = one of the tab pages below it.
  const [view, setView] = useState('dashboard');
  const [activeSection, setActiveSection] = useState('catalogue');

  const [categories, setCategories] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [adminProducts, setAdminProducts] = useState([]);
  const [adminMenus, setAdminMenus] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);
  const [dashboardReport, setDashboardReport] = useState(null);
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [kioskSecretInfo, setKioskSecretInfo] = useState(null); // { secret, source }
  const [kioskSessions, setKioskSessions] = useState([]);
  const [legalDocs, setLegalDocs] = useState({ mentions: null, privacy: null, cgu: null });
  const [legalVersions, setLegalVersions] = useState({ mentions: [], privacy: [], cgu: [] });
  const [cguStats, setCguStats] = useState(null);
  const [cguAcceptances, setCguAcceptances] = useState([]);
  const [adminModalState, setAdminModalState] = useState({ isOpen: false, item: null, type: 'product' });

  // The storefront's warm background/scrollbar colors live on <body>, outside
  // React's tree, so .admin-modern (a nested div) can override them for its
  // own content but never for the actual viewport scrollbar or the page area
  // below that div's content -- both are drawn from <body> itself. Stamping
  // the class directly on <body> for as long as this page is mounted fixes
  // both, and is undone on unmount so the storefront is untouched.
  useEffect(() => {
    document.body.classList.add('admin-modern');
    return () => document.body.classList.remove('admin-modern');
  }, []);

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
    if (!user || !user.isManager) return;
    fetchAdminEvents();
    fetchCategories();
    fetchStockItems();
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
    setView('dashboard');
    (async () => {
      const list = await fetchStorefronts(selectedEventId);
      const active = list.find(sf => sf.isActive);
      setSelectedStorefrontId(active ? active.id : (list[0]?.id || null));
    })();
  }, [selectedEventId]);

  // Revenue/profit tiles on the Dashboard -- so the important figures are
  // visible immediately, without opening Bilan/Statistiques.
  useEffect(() => {
    if (!selectedEventId) { setDashboardReport(null); return; }
    fetchEventReport(selectedEventId).then(setDashboardReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  // Whichever storefront is open here, keep its catalog/shopping list in sync.
  useEffect(() => {
    if (!selectedStorefrontId) return;
    fetchAdminCatalog(selectedStorefrontId);
    fetchShoppingList(selectedStorefrontId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStorefrontId]);

  const authHeaders = { headers: { Authorization: `Bearer ${authToken}` } };

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/products');
      setCategories(res.data.categories || []);
    } catch (e) {
      console.error('Error fetching categories:', e);
    }
  };

  // StockItem (every counted thing: recipe ingredients AND products sold
  // as-is) is global -- not scoped to an event/storefront, unlike
  // categories/products -- fetched once per session, same as categories.
  const fetchStockItems = async () => {
    try {
      const res = await axios.get('/api/admin/stock-items', authHeaders);
      setStockItems(res.data.items || []);
    } catch (e) {
      console.error('Error fetching stock items:', e);
    }
  };

  // A count changing has three visible consequences: the stock table
  // itself, which catalog products are available (a product's status is
  // derived from its counts), and the shopping list (anything that just
  // went low is added to it server-side). Every stock write refreshes all
  // three, so none of them can lag behind the others.
  const refreshAfterStockChange = () => {
    fetchStockItems();
    fetchAdminCatalog(selectedStorefrontId);
    fetchShoppingList(selectedStorefrontId);
  };

  // `storefrontId` tells the server which storefront's shopping list a
  // newly-low article goes on: the one being worked on here.
  const stockParams = { params: { storefrontId: selectedStorefrontId } };

  const handleAddStockItem = async data => {
    try {
      await axios.post('/api/admin/stock-items', data, { ...authHeaders, ...stockParams });
      refreshAfterStockChange();
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de l\'ajout de l\'article.');
      return false;
    }
  };

  const handleUpdateStockItem = async (id, updates) => {
    try {
      await axios.put(`/api/admin/stock-items/${id}`, updates, { ...authHeaders, ...stockParams });
      refreshAfterStockChange();
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la mise à jour de l\'article.');
      return false;
    }
  };

  const handleDeleteStockItem = async id => {
    if (!(await showConfirm('Supprimer cet article du stock ?', { danger: true }))) return;
    try {
      await axios.delete(`/api/admin/stock-items/${id}`, authHeaders);
      fetchStockItems();
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la suppression.');
    }
  };

  const fetchAdminEvents = async () => {
    try {
      const res = await axios.get('/api/admin/events', authHeaders);
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
      const res = await axios.get(`/api/admin/events/${eventId}/storefronts`, authHeaders);
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
      const res = await axios.get(`/api/admin/storefronts/${storefrontId}/catalog`, authHeaders);
      setAdminProducts(res.data.products || []);
      setAdminMenus(res.data.menus || []);
    } catch (e) {
      console.error('Error fetching admin catalog:', e);
    }
  };

  const fetchShoppingList = async (storefrontId) => {
    if (!storefrontId) return;
    try {
      const res = await axios.get(`/api/admin/storefronts/${storefrontId}/shopping-list`, authHeaders);
      setShoppingList(res.data.items || []);
    } catch (e) {
      console.error('Error fetching shopping list:', e);
    }
  };

  const handleAddShoppingListItem = async item => {
    try {
      await axios.post(`/api/admin/storefronts/${selectedStorefrontId}/shopping-list`, item, authHeaders);
      fetchShoppingList(selectedStorefrontId);
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de l\'ajout à la liste de courses.');
      return false;
    }
  };

  const handleUpdateShoppingListItem = async (id, updates) => {
    try {
      await axios.put(`/api/admin/shopping-list/${id}`, updates, authHeaders);
      fetchShoppingList(selectedStorefrontId);
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la modification de l\'article.');
      return false;
    }
  };

  const handleDeleteShoppingListItem = async id => {
    try {
      await axios.delete(`/api/admin/shopping-list/${id}`, authHeaders);
      fetchShoppingList(selectedStorefrontId);
    } catch (e) {
      showAlert('Erreur lors de la suppression.');
    }
  };

  const handleGenerateShoppingList = async () => {
    try {
      const res = await axios.post(`/api/admin/storefronts/${selectedStorefrontId}/shopping-list/generate`, {}, authHeaders);
      fetchShoppingList(selectedStorefrontId);
      return res.data;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la génération de la liste.');
      return null;
    }
  };

  const fetchRestockCandidates = async () => {
    try {
      const res = await axios.get(`/api/admin/storefronts/${selectedStorefrontId}/restock-candidates`, authHeaders);
      return res.data.items || [];
    } catch (e) {
      console.error('Error fetching restock candidates:', e);
      return [];
    }
  };

  const handleCloseShoppingTrip = async () => {
    if (!(await showConfirm('Clôturer la liste de courses actuelle ? Elle passera dans l\'historique, une nouvelle liste vide démarrera, et le stock des produits liés à un seul article coché sera mis à jour.'))) return false;
    try {
      const res = await axios.post(`/api/admin/storefronts/${selectedStorefrontId}/shopping-list/close`, {}, authHeaders);
      fetchShoppingList(selectedStorefrontId);
      refreshAfterStockChange(); // restocked counts, and with them product availability
      return res.data.trip;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la clôture de la liste.');
      return null;
    }
  };

  const fetchShoppingTripHistory = async () => {
    try {
      const res = await axios.get(`/api/admin/storefronts/${selectedStorefrontId}/shopping-list/history`, authHeaders);
      return res.data.trips || [];
    } catch (e) {
      console.error('Error fetching shopping trip history:', e);
      return [];
    }
  };

  const fetchDailyReport = async (from, to) => {
    try {
      const res = await axios.get('/api/admin/report', { params: { from, to: to || from, storefrontId: selectedStorefrontId }, ...authHeaders });
      setDailyReport(res.data);
    } catch (e) {
      console.error('Error fetching daily report:', e);
    }
  };

  const fetchStats = async (from, to, groupBy) => {
    try {
      const res = await axios.get('/api/admin/stats', { params: { from, to: to || from, groupBy, storefrontId: selectedStorefrontId }, ...authHeaders });
      setStats(res.data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const fetchForecast = async (unit, count) => {
    try {
      const res = await axios.get('/api/admin/forecast', { params: { unit, count }, ...authHeaders });
      return res.data;
    } catch (e) {
      console.error('Error fetching forecast:', e);
      return null;
    }
  };

  // Historique tab: per-event data, fetched lazily by HistoriquePanel itself
  // as each row expands -- these just wrap the request and hand back data,
  // no state kept here.
  const fetchEventReport = async (eventId) => {
    try {
      const res = await axios.get(`/api/admin/events/${eventId}/report`, authHeaders);
      return res.data;
    } catch (e) {
      console.error('Error fetching event report:', e);
      return null;
    }
  };

  const fetchEventShoppingList = async (eventId) => {
    try {
      const res = await axios.get(`/api/admin/events/${eventId}/shopping-list`, authHeaders);
      return res.data.items || [];
    } catch (e) {
      console.error('Error fetching event shopping list:', e);
      return [];
    }
  };

  const fetchAverageShoppingList = async () => {
    try {
      const res = await axios.get('/api/admin/shopping-list/average', { params: { storefrontId: selectedStorefrontId }, ...authHeaders });
      return res.data.items || [];
    } catch (e) {
      console.error('Error fetching average shopping list:', e);
      return [];
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await axios.get('/api/admin/reviews', { params: { storefrontId: selectedStorefrontId }, ...authHeaders });
      setReviews(res.data.reviews || []);
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  };

  const handleDeleteReview = async (orderId) => {
    if (!(await showConfirm('Supprimer définitivement cet avis ?', { danger: true }))) return;
    try {
      await axios.delete(`/api/admin/reviews/${orderId}`, authHeaders);
      fetchReviews();
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la suppression de l\'avis.');
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await axios.get('/api/admin/team', authHeaders);
      setTeamMembers(res.data.members || []);
    } catch (e) {
      console.error('Error fetching team members:', e);
    }
  };

  const handleSetTeamMemberRole = async (login, role) => {
    try {
      await axios.post('/api/admin/team', { login, role }, authHeaders);
      fetchTeamMembers();
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de l\'attribution du rôle.');
      return false;
    }
  };

  const handleRemoveTeamMember = async (login) => {
    if (!(await showConfirm(`Retirer le rôle de ${login} ? Redeviendra un membre normal (sauf s'il est encore listé dans les variables d'environnement historiques).`, { danger: true }))) return;
    try {
      await axios.delete(`/api/admin/team/${login}`, authHeaders);
      fetchTeamMembers();
    } catch (e) {
      showAlert('Erreur lors du retrait.');
    }
  };

  // LEGAL DOCUMENTS -- see LegalPanel.jsx. /api/legal/:kind is public (no
  // auth) since it's the same route the storefront's footer links use.
  const fetchLegalDoc = async (kind) => {
    try {
      const res = await axios.get(`/api/legal/${kind}`);
      setLegalDocs(prev => ({ ...prev, [kind]: res.data.document }));
    } catch (e) {
      setLegalDocs(prev => ({ ...prev, [kind]: null }));
    }
  };

  const fetchLegalVersions = async (kind) => {
    try {
      const res = await axios.get(`/api/admin/legal/${kind}/versions`, authHeaders);
      setLegalVersions(prev => ({ ...prev, [kind]: res.data.versions || [] }));
    } catch (e) {
      console.error('Error fetching legal versions:', e);
    }
  };

  const fetchCguStats = async () => {
    try {
      const res = await axios.get('/api/admin/legal/cgu/acceptance-stats', authHeaders);
      setCguStats(res.data);
    } catch (e) {
      console.error('Error fetching CGU acceptance stats:', e);
    }
  };

  const handlePublishLegal = async (kind, title, content) => {
    try {
      await axios.post(`/api/admin/legal/${kind}`, { title, content }, authHeaders);
      fetchLegalDoc(kind);
      fetchLegalVersions(kind);
      if (kind === 'cgu') fetchCguStats();
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la publication.');
      return false;
    }
  };

  // Full "who accepted what, when" history, across every CGU version --
  // see LegalPanel.jsx.
  const fetchCguAcceptances = async () => {
    try {
      const res = await axios.get('/api/admin/legal/cgu/acceptances', authHeaders);
      setCguAcceptances(res.data.acceptances || []);
    } catch (e) {
      console.error('Error fetching CGU acceptance history:', e);
    }
  };

  // Kiosk terminal management (Board-only, Équipe tab): the activation code
  // itself, and the individual terminals currently activated with it.
  const fetchKioskSecret = async () => {
    try {
      const res = await axios.get('/api/admin/kiosk-secret', authHeaders);
      setKioskSecretInfo(res.data);
    } catch (e) {
      console.error('Error fetching kiosk secret:', e);
    }
  };

  const handleRegenerateKioskSecret = async () => {
    if (!(await showConfirm('Régénérer le code borne ? Toutes les bornes actuellement activées seront immédiatement déconnectées.', { danger: true }))) return;
    try {
      const res = await axios.post('/api/admin/kiosk-secret/regenerate', {}, authHeaders);
      setKioskSecretInfo(res.data);
      fetchKioskSessions();
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la régénération du code.');
    }
  };

  const fetchKioskSessions = async () => {
    try {
      const res = await axios.get('/api/admin/kiosk-sessions', authHeaders);
      setKioskSessions(res.data.kiosks || []);
    } catch (e) {
      console.error('Error fetching kiosk sessions:', e);
    }
  };

  const handleLockKioskSession = async (id) => {
    if (!(await showConfirm('Verrouiller cette borne ? Elle devra être réactivée avec le code pour reprendre des commandes.'))) return;
    try {
      await axios.delete(`/api/admin/kiosk-sessions/${id}`, authHeaders);
      fetchKioskSessions();
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors du verrouillage de la borne.');
    }
  };

  const handleToggleStock = async (id, type) => {
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}/toggle-stock` : `/api/admin/products/${id}/toggle-stock`;
      await axios.patch(url, {}, authHeaders);
      fetchAdminCatalog(selectedStorefrontId);
    } catch (e) {
      showAlert('Erreur lors de la modification du stock.');
    }
  };

  const handleSaveAdminProduct = async (formData, editingId, type) => {
    try {
      if (type === 'menu') {
        if (editingId) {
          await axios.put(`/api/admin/menus/${editingId}`, formData, authHeaders);
        } else {
          await axios.post('/api/admin/menus', { ...formData, storefrontId: selectedStorefrontId }, authHeaders);
        }
      } else {
        if (editingId) {
          await axios.put(`/api/admin/products/${editingId}`, formData, authHeaders);
        } else {
          await axios.post('/api/admin/products', { ...formData, storefrontId: selectedStorefrontId }, authHeaders);
        }
      }
      // Saving a product can create/update its stock article and recipe.
      fetchAdminCatalog(selectedStorefrontId);
      fetchStockItems();
      fetchShoppingList(selectedStorefrontId);
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de l\'enregistrement du produit.');
      return false;
    }
  };

  const handleDeleteAdminItem = async (id, type) => {
    if (!(await showConfirm('Voulez-vous vraiment supprimer cet élément ?', { danger: true }))) return;
    try {
      const url = type === 'menu' ? `/api/admin/menus/${id}` : `/api/admin/products/${id}`;
      await axios.delete(url, authHeaders);
      fetchAdminCatalog(selectedStorefrontId);
      fetchStockItems(); // its article's "used by" list changed
    } catch (e) {
      showAlert('Erreur lors de la suppression.');
    }
  };

  const handleAddCategory = async category => {
    try {
      const res = await axios.post('/api/admin/categories', category, authHeaders);
      setCategories(res.data.categories || []);
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la création de la catégorie.');
      return false;
    }
  };

  const handleDeleteCategory = async id => {
    if (!(await showConfirm('Supprimer cette catégorie ?', { danger: true }))) return;
    try {
      const res = await axios.delete(`/api/admin/categories/${id}`, authHeaders);
      setCategories(res.data.categories || []);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la suppression de la catégorie.');
    }
  };

  const handleToggleCategory = async id => {
    try {
      const res = await axios.patch(`/api/admin/categories/${id}/visibility`, {}, authHeaders);
      setCategories(res.data.categories || []);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la modification de la visibilité.');
    }
  };

  const handleSelectEvent = id => {
    setSelectedEventId(id);
  };

  // The event switcher's "+": a genuinely new, empty event.
  const handleCreateEvent = async eventData => {
    try {
      const res = await axios.post('/api/admin/events', eventData, authHeaders);
      await fetchAdminEvents();
      setSelectedEventId(res.data.event.id);
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la création de l\'événement.');
      return false;
    }
  };

  // Per-event "copy" action: duplicates that specific event's catalog under a new name.
  const handleDuplicateEvent = async id => {
    const source = events.find(ev => ev.id === id);
    const name = await showPrompt('Nom du nouvel événement :', source ? `${source.name} (copie)` : '');
    if (!name || !name.trim()) return;
    try {
      const res = await axios.post('/api/admin/events', { name, copyFromEventId: id }, authHeaders);
      await fetchAdminEvents();
      setSelectedEventId(res.data.event.id);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la duplication de l\'événement.');
    }
  };

  const handleUpdateEvent = async (id, updates) => {
    try {
      await axios.patch(`/api/admin/events/${id}`, updates, authHeaders);
      await fetchAdminEvents();
      return true;
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la modification de l\'événement.');
      return false;
    }
  };

  const handleDeleteEvent = async id => {
    if (!(await showConfirm('Supprimer cet événement enregistré ?', { danger: true }))) return;
    try {
      await axios.delete(`/api/admin/events/${id}`, authHeaders);
      if (selectedEventId === id) setSelectedEventId(null);
      fetchAdminEvents();
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la suppression de l\'événement.');
    }
  };

  const handleSelectStorefront = id => {
    setSelectedStorefrontId(id);
  };

  const handleCreateStorefront = async name => {
    try {
      const res = await axios.post(`/api/admin/events/${selectedEventId}/storefronts`, { name }, authHeaders);
      await fetchStorefronts(selectedEventId);
      setSelectedStorefrontId(res.data.storefront.id);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la création de la vitrine.');
    }
  };

  const handleDuplicateStorefront = async (id, name) => {
    try {
      const res = await axios.post(`/api/admin/storefronts/${id}/duplicate`, { name }, authHeaders);
      await fetchStorefronts(selectedEventId);
      setSelectedStorefrontId(res.data.storefront.id);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la duplication de la vitrine.');
    }
  };

  const handleActivateStorefront = async id => {
    if (!(await showConfirm('Mettre cette vitrine en ligne pour les étudiants ?'))) return;
    try {
      await axios.post(`/api/admin/storefronts/${id}/activate`, {}, authHeaders);
      await Promise.all([fetchAdminEvents(), fetchStorefronts(selectedEventId)]);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors du changement de vitrine.');
    }
  };

  const handleDeleteStorefront = async id => {
    if (!(await showConfirm('Supprimer cette vitrine ?', { danger: true }))) return;
    try {
      await axios.delete(`/api/admin/storefronts/${id}`, authHeaders);
      if (selectedStorefrontId === id) setSelectedStorefrontId(null);
      fetchStorefronts(selectedEventId);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la suppression de la vitrine.');
    }
  };

  const handleUpdateStorefrontHours = async (id, updates) => {
    try {
      await axios.patch(`/api/admin/storefronts/${id}`, updates, authHeaders);
      fetchStorefronts(selectedEventId);
    } catch (e) {
      showAlert(e.response?.data?.error || 'Erreur lors de la mise à jour des horaires.');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, authHeaders);
    } catch (e) {}
    localStorage.removeItem('bde_token');
    window.location.href = '/';
  };

  const handleGoToSection = (section) => {
    setActiveSection(section);
    setView('section');
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

  if (!user.isManager) {
    return (
      <main className="auth-page admin-modern fade-in">
        <div className="auth-panel">
          <h1>Accès réservé</h1>
          <p>Cet outil est réservé aux gestionnaires BDE.</p>
          <a className="btn btn-primary" href="/">Retour au site</a>
        </div>
      </main>
    );
  }

  const selectedEvent = events.find(ev => ev.id === selectedEventId);
  const selectedStorefront = storefronts.find(sf => sf.id === selectedStorefrontId);

  return (
    <div className="admin-modern gestion-shell">
      <TopBar
        events={events}
        selectedEvent={selectedEvent}
        onSelectEvent={handleSelectEvent}
        onCreateEvent={handleCreateEvent}
        user={user}
        onLogout={handleLogout}
      />

      {view === 'dashboard' ? (
        <div className="gestion-content">
          <Dashboard
            events={events}
            selectedEvent={selectedEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            storefronts={storefronts}
            selectedStorefront={selectedStorefront}
            onSelectStorefront={handleSelectStorefront}
            onCreateStorefront={handleCreateStorefront}
            onDuplicateStorefront={handleDuplicateStorefront}
            onActivateStorefront={handleActivateStorefront}
            onDeleteStorefront={handleDeleteStorefront}
            onEditStorefrontHours={setHoursModalStorefront}
            products={adminProducts}
            shoppingList={shoppingList}
            report={dashboardReport}
            onSelectSection={handleGoToSection}
            showTeam={user.isBoard}
          />
        </div>
      ) : (
        <SectionShell activeSection={activeSection} onSelectSection={setActiveSection} onGoToDashboard={() => setView('dashboard')} showTeam={user.isBoard}>
          {activeSection === 'catalogue' && (
            <CataloguePanel
              products={adminProducts}
              menus={adminMenus}
              categories={categories}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onToggleCategory={handleToggleCategory}
              onOpenAddModal={(type) => setAdminModalState({ isOpen: true, item: null, type })}
              onToggleStock={handleToggleStock}
              onEditItem={(item, type) => setAdminModalState({ isOpen: true, item, type })}
              onDeleteItem={handleDeleteAdminItem}
              storefronts={storefronts}
              selectedStorefrontId={selectedStorefrontId}
              onSelectStorefront={handleSelectStorefront}
              onCreateStorefront={handleCreateStorefront}
              onDuplicateStorefront={handleDuplicateStorefront}
              onActivateStorefront={handleActivateStorefront}
              onDeleteStorefront={handleDeleteStorefront}
              onEditStorefrontHours={setHoursModalStorefront}
            />
          )}
          {activeSection === 'stock' && (
            <StockPanel
              products={adminProducts}
              menus={adminMenus}
              stockItems={stockItems}
              shoppingList={shoppingList}
              onAddShoppingListItem={handleAddShoppingListItem}
              onUpdateShoppingListItem={handleUpdateShoppingListItem}
              onDeleteShoppingListItem={handleDeleteShoppingListItem}
              onGenerateShoppingList={handleGenerateShoppingList}
              onAddStockItem={handleAddStockItem}
              onUpdateStockItem={handleUpdateStockItem}
              onDeleteStockItem={handleDeleteStockItem}
            />
          )}
          {activeSection === 'courses' && (
            <CoursesPanel
              products={adminProducts}
              menus={adminMenus}
              stockItems={stockItems}
              shoppingList={shoppingList}
              onAddShoppingListItem={handleAddShoppingListItem}
              onUpdateShoppingListItem={handleUpdateShoppingListItem}
              onDeleteShoppingListItem={handleDeleteShoppingListItem}
              onFetchRestockCandidates={fetchRestockCandidates}
              onCloseTrip={handleCloseShoppingTrip}
              onFetchTripHistory={fetchShoppingTripHistory}
            />
          )}
          {activeSection === 'bilan' && (
            <BilanPanel dailyReport={dailyReport} onFetchDailyReport={fetchDailyReport} />
          )}
          {activeSection === 'statistiques' && (
            <StatsPanel stats={stats} onFetchStats={fetchStats} />
          )}
          {activeSection === 'previsionnel' && (
            <ForecastPanel onFetchForecast={fetchForecast} />
          )}
          {activeSection === 'historique' && (
            <HistoriquePanel
              events={events}
              onSelectEvent={id => { handleSelectEvent(id); setView('dashboard'); }}
              onDuplicateEvent={handleDuplicateEvent}
              onFetchEventReport={fetchEventReport}
              onFetchEventShoppingList={fetchEventShoppingList}
              onFetchAverageShoppingList={fetchAverageShoppingList}
            />
          )}
          {activeSection === 'avis' && (
            <AvisPanel reviews={reviews} onFetchReviews={fetchReviews} onDeleteReview={handleDeleteReview} />
          )}
          {activeSection === 'equipe' && user.isBoard && (
            <TeamPanel
              members={teamMembers}
              currentLogin={user.login}
              onFetchTeam={fetchTeamMembers}
              onSetRole={handleSetTeamMemberRole}
              onRemove={handleRemoveTeamMember}
              kioskSecretInfo={kioskSecretInfo}
              onFetchKioskSecret={fetchKioskSecret}
              onRegenerateKioskSecret={handleRegenerateKioskSecret}
              kioskSessions={kioskSessions}
              onFetchKioskSessions={fetchKioskSessions}
              onLockKioskSession={handleLockKioskSession}
            />
          )}
          {activeSection === 'legal' && user.isBoard && (
            <LegalPanel
              documents={legalDocs}
              versions={legalVersions}
              cguStats={cguStats}
              cguAcceptances={cguAcceptances}
              onFetchDoc={fetchLegalDoc}
              onFetchVersions={fetchLegalVersions}
              onPublish={handlePublishLegal}
              onFetchCguStats={fetchCguStats}
              onFetchCguAcceptances={fetchCguAcceptances}
            />
          )}
        </SectionShell>
      )}

      <AdminProductModal
        isOpen={adminModalState.isOpen}
        onClose={() => setAdminModalState({ isOpen: false, item: null, type: 'product' })}
        onSave={handleSaveAdminProduct}
        editingItem={adminModalState.item}
        type={adminModalState.type}
        categories={categories}
        products={adminProducts}
        stockItems={stockItems}
      />

      {hoursModalStorefront && (
        <StorefrontHoursModal
          storefront={hoursModalStorefront}
          onClose={() => setHoursModalStorefront(null)}
          onSave={handleUpdateStorefrontHours}
        />
      )}
    </div>
  );
}
