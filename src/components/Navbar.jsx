import React, { useEffect, useState } from 'react';
import { ShoppingBag, ShieldCheck, LogOut, Utensils, Clock, Sparkles, Settings } from 'lucide-react';

function NavTabs({ activeTab, setActiveTab, isAdmin, isManager, isKioskGuest, className }) {
  return (
    <nav className={className}>
      <button
        className={`tab-btn ${activeTab === 'vitrine' ? 'active' : ''}`}
        onClick={() => setActiveTab('vitrine')}
      >
        <Utensils size={16} />
        <span className="tab-text-long">Vitrine &amp; Menus</span>
        <span className="tab-text-short">Vitrine</span>
      </button>

      {/* The kiosk has no account of its own -- it must never be able to
          browse anyone's order history, including its own just-placed orders. */}
      {!isKioskGuest && (
        <button
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Clock size={16} />
          <span className="tab-text-long">Mes Commandes</span>
          <span className="tab-text-short">Commandes</span>
        </button>
      )}

      {isAdmin && (
        <button
          className={`tab-btn tab-btn-admin ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <ShieldCheck size={16} />
          <span className="tab-text-long">Espace Staff BDE</span>
          <span className="tab-text-short">Staff</span>
        </button>
      )}

      {isManager && (
        <a className="tab-btn tab-btn-admin" href="/gestion">
          <Settings size={16} />
          <span className="tab-text-long">Gestion événements</span>
          <span className="tab-text-short">Gestion</span>
        </a>
      )}
    </nav>
  );
}

export default function Navbar({ user, activeTab, setActiveTab, cartCount, onLogin42, onLogout, onOpenCart }) {
  const [isHidden, setIsHidden] = useState(false);
  const isAdmin = !!(user && user.isAdmin);
  const isManager = !!(user && user.isManager);
  const isKioskGuest = user?.role === 'kiosk_guest';

  useEffect(() => {
    let previousScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsHidden(currentScrollY > previousScrollY && currentScrollY > 80);
      previousScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Role hierarchy (see ROLE_RANK in server/auth42.js): board > admin > staff.
  const ROLE_LABELS = { board: 'Bureau BDE', admin: 'Gestion BDE', staff: 'Suivi commandes BDE' };
  const rolePillLabel = ROLE_LABELS[user?.role]
    || (user?.role === 'kiosk_guest' ? 'Commande borne' : 'Étudiant 42');

  return (
    <>
      <header className={`navbar ${isHidden ? 'navbar-hidden' : ''}`}>
        <div className="navbar-inner">
          <div className="logo-group">
            <div className="logo-badge">
              <span>42</span>
            </div>
            <div className="logo-labels">
              <div className="logo-title">BDE Sandwicherie</div>
            </div>
          </div>

          <NavTabs
            className="nav-tabs"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isAdmin={isAdmin}
            isManager={isManager}
            isKioskGuest={isKioskGuest}
          />

          <div className="nav-user">
            {user ? (
              <div className="user-badge">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.login} className="avatar" />
                ) : (
                  <div className="avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-glow)', fontWeight: 700 }}>
                    {(user.displayName || user.login || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="user-badge-info">
                  <span className="user-name">{user.displayName || user.login}</span>
                  <span className={`role-pill ${isAdmin || isManager ? 'role-admin' : 'role-student'}`}>
                    {rolePillLabel}
                  </span>
                </div>
                <button
                  className="btn btn-secondary user-logout"
                  onClick={onLogout}
                  title="Se déconnecter"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={onLogin42}>
                <Sparkles size={16} /> Connexion 42
              </button>
            )}

            <button className="btn btn-secondary cart-btn" onClick={onOpenCart}>
              <ShoppingBag size={18} />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Barre de navigation basse — visible uniquement sur mobile */}
      <NavTabs
        className="nav-tabs nav-tabs-bottom"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdmin={isAdmin}
        isManager={isManager}
        isKioskGuest={isKioskGuest}
      />
    </>
  );
}
