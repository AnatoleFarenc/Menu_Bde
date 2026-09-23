import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Minus, Trash2, Sparkles, Layers, User, LogIn, ArrowLeft, Check, ShoppingBag, X } from 'lucide-react';
import ItemIcon from './ItemIcon';
import MenuBuilderModal from './MenuBuilderModal';
import { normalizeChoices } from '../lib/menuChoices';
import { getPickupTimeSlots } from '../lib/pickupTime';
import { showConfirm } from '../lib/dialogs.jsx';

// Back to the attract screen after this long without a touch -- clears
// whatever the previous customer had on screen (cart, pairing, choices).
const IDLE_RESET_MS = 3 * 60 * 1000;
const PAIRING_POLL_MS = 2000;
const CONFIRMATION_DISPLAY_MS = 14000;

// A self-order-terminal-style flow (attract screen -> connect-or-guest ->
// order -> confirmation), fully separate from the regular mobile storefront.
// Security model (see server/index.js): the kiosk's OWN session never goes
// through 42 OAuth -- "Se connecter" only ever hands the customer a QR code
// to scan on THEIR phone, which does the real login and hands back a
// single-use `attributionToken` (never a session token) for the order about
// to be placed.
export default function KioskApp({ authToken, products, menus, categories, cart, onAddToCart, onAddMenuToCart, updateCartQuantity, removeCartItem, clearCart, onSubmitOrder, onExitKiosk, orderWindow }) {
  const [stage, setStage] = useState('home'); // home | choice | pairing | order | confirmation
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [builderMenu, setBuilderMenu] = useState(null);

  const [pairing, setPairing] = useState(null); // { code, qrDataUrl, expiresAt }
  const [pairingError, setPairingError] = useState('');
  const [attribution, setAttribution] = useState(null); // { displayName, attributionToken }

  // Recomputed each time the order stage is entered (see getPickupTimeSlots).
  const slots = useMemo(() => (stage === 'order' ? getPickupTimeSlots(orderWindow) : []), [stage, orderWindow]);
  const [pickupTime, setPickupTime] = useState('');
  const [note, setNote] = useState('');
  const [customerLabel, setCustomerLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  // Cart hidden by default, opened on demand -- same pattern as the regular
  // storefront (a floating bar while it's closed, a drawer once opened),
  // used identically at every screen size rather than a permanent sidebar.
  const [isCartOpen, setIsCartOpen] = useState(false);

  const resetAll = () => {
    clearCart();
    setStage('home');
    setCategoryFilter('all');
    setBuilderMenu(null);
    setPairing(null);
    setPairingError('');
    setAttribution(null);
    setPickupTime('12h00');
    setNote('');
    setCustomerLabel('');
    setOrderError('');
    setConfirmedOrder(null);
    setIsCartOpen(false);
  };

  // Idle reset: once past the attract screen, any stretch of inactivity
  // sends the terminal back to a clean state for the next customer.
  useEffect(() => {
    if (stage === 'home') return undefined;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(resetAll, IDLE_RESET_MS); };
    const events = ['mousedown', 'touchstart', 'keydown'];
    events.forEach(evt => window.addEventListener(evt, reset));
    reset();
    return () => { clearTimeout(timer); events.forEach(evt => window.removeEventListener(evt, reset)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Entering the "pairing" stage: request a fresh code + QR, then poll for
  // the phone's confirmation.
  useEffect(() => {
    if (stage !== 'pairing') return undefined;
    let cancelled = false;
    let pollTimer;
    setPairing(null);
    setPairingError('');

    const poll = (code) => {
      axios.get(`/api/kiosk/pairing/${code}`, { headers: { Authorization: `Bearer ${authToken}` } })
        .then(res => {
          if (cancelled) return;
          if (res.data.status === 'confirmed') {
            setAttribution({ displayName: res.data.displayName, attributionToken: res.data.attributionToken });
            setStage('order');
            return;
          }
          pollTimer = setTimeout(() => poll(code), PAIRING_POLL_MS);
        })
        .catch(() => { if (!cancelled) setPairingError('Ce QR code a expiré.'); });
    };

    axios.post('/api/kiosk/pairing', {}, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(res => {
        if (cancelled) return;
        setPairing(res.data);
        pollTimer = setTimeout(() => poll(res.data.code), PAIRING_POLL_MS);
      })
      .catch(() => { if (!cancelled) setPairingError('Impossible de générer le QR code, réessaie.'); });

    return () => { cancelled = true; clearTimeout(pollTimer); };
  }, [stage, authToken]);

  useEffect(() => {
    if (stage !== 'confirmation') return undefined;
    const t = setTimeout(resetAll, CONFIRMATION_DISPLAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Defaults to the first available slot whenever the list changes.
  useEffect(() => {
    if (slots.length > 0 && !slots.includes(pickupTime)) setPickupTime(slots[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const visibleCategoryIds = new Set(categories.filter(c => c.isVisible !== false).map(c => c.id));
  const visibleProducts = products.filter(p => visibleCategoryIds.has(p.category));
  const categoryOrder = new Map(categories.map((c, idx) => [c.id, idx]));
  const filteredProducts = categoryFilter === 'all'
    ? [...visibleProducts].sort((a, b) => (categoryOrder.get(a.category) ?? 999) - (categoryOrder.get(b.category) ?? 999))
    : categoryFilter === 'menu' ? [] : visibleProducts.filter(p => p.category === categoryFilter);
  const showMenus = categoryFilter === 'all' || categoryFilter === 'menu';

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setOrderError('');
    try {
      const data = await onSubmitOrder({
        items: cart,
        pickupTime,
        note,
        totalPrice: cartTotal,
        customerLabel,
        attributionToken: attribution?.attributionToken
      });
      setConfirmedOrder(data.order);
      setStage('confirmation');
    } catch (e) {
      setOrderError(e.response?.data?.error || 'Erreur lors de la validation de la commande. Réessaie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="kiosk-app">
      {/* Invisible corner tap target reserved for staff: hold isn't needed,
          a normal tap is enough since it's out of the customer's way. */}
      {stage === 'home' && (
        <button
          className="kiosk-exit-tap"
          aria-label="Désactiver la borne"
          onClick={async e => { e.stopPropagation(); if (await showConfirm('Désactiver cette borne ?')) onExitKiosk(); }}
        />
      )}

      {stage === 'home' && (
        <div className="kiosk-home fade-in" onClick={() => setStage('choice')}>
          <div className="kiosk-home-logo"><span>42</span></div>
          <h1>BDE Sandwicherie</h1>
          <p>Compose ta commande et récupère-la à l'heure de ton choix.</p>
          <button className="btn btn-primary kiosk-home-cta">Commander</button>
        </div>
      )}

      {stage === 'choice' && (
        <div className="kiosk-choice fade-in">
          <button className="btn btn-secondary kiosk-back-btn" onClick={() => setStage('home')}>
            <ArrowLeft size={16} /> Retour
          </button>
          <h1>Comment veux-tu commander ?</h1>
          <div className="kiosk-choice-grid">
            <button className="kiosk-choice-card primary" onClick={() => setStage('pairing')}>
              <span className="kiosk-choice-icon"><LogIn size={40} /></span>
              Se connecter avec mon compte 42
              <span className="kiosk-choice-desc">Retrouve cette commande dans ton historique perso, depuis ton téléphone.</span>
            </button>
            <button className="kiosk-choice-card" onClick={() => setStage('order')}>
              <span className="kiosk-choice-icon"><User size={40} /></span>
              Continuer sans me connecter
              <span className="kiosk-choice-desc">Commande rapide -- elle ne sera pas liée à un compte.</span>
            </button>
          </div>
        </div>
      )}

      {stage === 'pairing' && (
        <div className="kiosk-pairing fade-in">
          <button className="btn btn-secondary kiosk-back-btn" onClick={() => setStage('choice')}>
            <ArrowLeft size={16} /> Retour
          </button>
          <h1>Scanne ce QR code avec ton téléphone</h1>
          <p>Connecte-toi avec ton compte 42 sur ton téléphone.</p>
          {pairingError ? (
            <p style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{pairingError}</p>
          ) : pairing ? (
            <>
              <div className="kiosk-pairing-qr">
                <img src={pairing.qrDataUrl} alt="QR code de connexion" />
              </div>
              <div>
                <div className="kiosk-pairing-code">{pairing.code}</div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Le QR ne scanne pas ? Ouvre le site BDE sur ton téléphone et entre ce code.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
                <span className="kiosk-pairing-spinner" />
                En attente de ta connexion...
              </div>
            </>
          ) : (
            <div className="kiosk-pairing-spinner" />
          )}
          <button className="btn btn-secondary" onClick={() => setStage('order')}>
            Continuer sans me connecter
          </button>
        </div>
      )}

      {stage === 'order' && (
        <div className="kiosk-order fade-in">
          <div className="kiosk-order-main">
            <div className="kiosk-topbar">
              <button className="btn btn-secondary" onClick={async () => { if (await showConfirm('Annuler cette commande ?')) resetAll(); }}>
                <ArrowLeft size={16} /> Annuler
              </button>
              <div className="kiosk-topbar-identity">
                <User size={16} />
                {attribution ? `Commande pour ${attribution.displayName}` : 'Commande invité'}
              </div>
              {/* Always reachable, not just the floating bar below -- same as
                  the cart button in the regular storefront's navbar. */}
              <button className="btn btn-secondary kiosk-cart-btn" onClick={() => setIsCartOpen(true)}>
                <ShoppingBag size={18} />
                {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
              </button>
            </div>

            <div className="kiosk-categories">
              <button className={`kiosk-category-btn ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
                <Sparkles size={18} /> Tout
              </button>
              <button className={`kiosk-category-btn ${categoryFilter === 'menu' ? 'active' : ''}`} onClick={() => setCategoryFilter('menu')}>
                <Layers size={18} /> Formules
              </button>
              {categories.filter(c => c.isVisible !== false).map(category => (
                <button key={category.id} className={`kiosk-category-btn ${categoryFilter === category.id ? 'active' : ''}`} onClick={() => setCategoryFilter(category.id)}>
                  <ItemIcon item={category} size={18} /> {category.name}
                </button>
              ))}
            </div>

            <div className="kiosk-product-grid">
              {showMenus && menus.map(menu => (
                <button key={menu.id} className={`kiosk-product-tile ${!menu.available ? 'out-of-stock' : ''}`} disabled={!menu.available} onClick={() => setBuilderMenu(menu)}>
                  <div className="kiosk-product-visual">
                    <ItemIcon item={menu} type="menu" size={48} />
                    {menu.badge && <span className="kiosk-product-badge">{menu.badge}</span>}
                  </div>
                  <div className="kiosk-product-info">
                    <span className="kiosk-product-name">{menu.name}</span>
                    <div className="kiosk-product-footer">
                      <span className="kiosk-product-price">{menu.price.toFixed(2)} €</span>
                      <span className="kiosk-product-add"><Layers size={18} /></span>
                    </div>
                  </div>
                </button>
              ))}
              {filteredProducts.map(product => (
                <button key={product.id} className={`kiosk-product-tile ${!product.available ? 'out-of-stock' : ''}`} disabled={!product.available} onClick={() => onAddToCart(product)}>
                  <div className="kiosk-product-visual">
                    <ItemIcon item={product} size={48} />
                    {product.badge && <span className="kiosk-product-badge">{product.badge}</span>}
                  </div>
                  <div className="kiosk-product-info">
                    <span className="kiosk-product-name">{product.name}</span>
                    <div className="kiosk-product-footer">
                      <span className="kiosk-product-price">{product.price.toFixed(2)} €</span>
                      <span className="kiosk-product-add"><Plus size={18} /></span>
                    </div>
                  </div>
                </button>
              ))}
              {!showMenus && filteredProducts.length === 0 && (
                <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>Aucun produit dans cette catégorie.</p>
              )}
            </div>
          </div>

          {/* Cart stays hidden until the customer taps this bar -- same
              pattern as the regular storefront, and used the same way
              whatever the screen size (no more permanent sidebar). */}
          {cart.length > 0 && !isCartOpen && (
            <div className="cart-floating-bar kiosk-cart-floating-bar" onClick={() => setIsCartOpen(true)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <ShoppingBag size={22} />
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {cartCount} produit{cartCount > 1 ? 's' : ''} dans ta commande
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                    Touche pour voir ton panier
                  </span>
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: '0.4rem 1rem' }}>
                Voir ({cartTotal.toFixed(2)} €)
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 'order' && isCartOpen && (
        <div className="cart-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="kiosk-cart-drawer fade-in" onClick={e => e.stopPropagation()}>
            <div className="kiosk-cart-header">
              <ShoppingBag size={22} /> Ta commande ({cartCount})
              <button className="btn btn-secondary" style={{ marginLeft: 'auto', padding: '0.4rem', borderRadius: '50%' }} onClick={() => setIsCartOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="kiosk-cart-empty">Touche un produit pour l'ajouter à ta commande.</div>
            ) : (
              <div className="kiosk-cart-items">
                {cart.map((item, idx) => (
                  <div key={idx} className="kiosk-cart-item">
                    <div className="kiosk-cart-item-row">
                      <span className="kiosk-cart-item-name">{item.name}</span>
                      <button className="kiosk-cart-qty-btn" onClick={() => removeCartItem(idx)}><Trash2 size={14} /></button>
                    </div>
                    {item.choices && normalizeChoices(item.choices).length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {normalizeChoices(item.choices).map((choice, cIdx) => (
                          <div key={cIdx}>{choice.label} : {choice.product.name}</div>
                        ))}
                      </div>
                    )}
                    <div className="kiosk-cart-item-row">
                      <div className="kiosk-cart-item-qty">
                        <button className="kiosk-cart-qty-btn" onClick={() => updateCartQuantity(idx, -1)}><Minus size={14} /></button>
                        <strong>{item.quantity}</strong>
                        <button className="kiosk-cart-qty-btn" onClick={() => updateCartQuantity(idx, 1)}><Plus size={14} /></button>
                      </div>
                      <span style={{ fontWeight: 700 }}>{(item.price * item.quantity).toFixed(2)} €</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="kiosk-cart-footer">
              <div>
                <label className="form-label" style={{ marginBottom: '0.35rem', display: 'block' }}>Heure de retrait</label>
                {slots.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Plus aucun créneau disponible pour aujourd'hui.</p>
                ) : (
                <div className="kiosk-time-grid">
                  {slots.map(slot => (
                    <button key={slot} className={`kiosk-time-btn ${pickupTime === slot ? 'active' : ''}`} onClick={() => setPickupTime(slot)}>
                      {slot}
                    </button>
                  ))}
                </div>
                )}
              </div>

              {!attribution && (
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ton prénom (pour le ticket, optionnel)"
                  value={customerLabel}
                  onChange={e => setCustomerLabel(e.target.value)}
                  maxLength={60}
                />
              )}

              <input
                type="text"
                className="form-input"
                placeholder="Allergies / instructions (optionnel)"
                value={note}
                onChange={e => setNote(e.target.value)}
              />

              {orderError && <p style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '0.85rem' }}>{orderError}</p>}

              <div className="kiosk-cart-total-row">
                <span>Total</span>
                <span>{cartTotal.toFixed(2)} €</span>
              </div>
              <button className="btn btn-primary" style={{ padding: '1rem', fontSize: '1.05rem' }} disabled={cart.length === 0 || isSubmitting || !pickupTime} onClick={handleSubmit}>
                {isSubmitting ? 'Envoi...' : !pickupTime ? 'Aucun créneau disponible' : 'Valider ma commande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'confirmation' && confirmedOrder && (
        <div className="kiosk-confirmation fade-in">
          <div className="kiosk-confirmation-check"><Check size={64} /></div>
          <h1>Commande enregistrée !</h1>
          <div className="kiosk-confirmation-number">{confirmedOrder.orderNumber}</div>
          <p>Retrait à {confirmedOrder.pickupTime}. {attribution ? 'Tu la retrouveras aussi dans "Mes Commandes".' : 'Garde ce numéro en tête pour la récupérer.'}</p>
          <button className="btn btn-primary kiosk-home-cta" onClick={resetAll}>Nouvelle commande</button>
        </div>
      )}

      {builderMenu && (
        <MenuBuilderModal
          menu={builderMenu}
          products={products}
          onClose={() => setBuilderMenu(null)}
          onAddMenuToCart={onAddMenuToCart}
        />
      )}
    </div>
  );
}
