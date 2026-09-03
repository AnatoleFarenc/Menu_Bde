import React, { useEffect, useState } from 'react';
import { ShoppingBag, ShieldCheck, LogOut, Utensils, Clock, Sparkles } from 'lucide-react';

export default function Navbar({ user, activeTab, setActiveTab, cartCount, onLogin42, onLogout, onOpenCart }) {
  const [isHidden, setIsHidden] = useState(false);

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

  return (
    <header className={`navbar ${isHidden ? 'navbar-hidden' : ''}`}>
      <div className="navbar-inner">
        <div className="logo-group">
          <div className="logo-badge">
            <span>42</span>
          </div>
          <div>
            <div className="logo-title">BDE Sandwicherie</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Commandes & Vitrine Campus</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-actions">
          <button
            className={`tab-btn ${activeTab === 'vitrine' ? 'active' : ''}`}
            onClick={() => setActiveTab('vitrine')}
          >
            <Utensils size={16} /> Vitrine & Menus
          </button>

          <button
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <Clock size={16} /> Mes Commandes
          </button>

          {user && user.isAdmin && (
            <button
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
              style={{ borderColor: 'rgba(154, 61, 61, 0.65)', color: activeTab === 'admin' ? '#e3a0a0' : '#c97b7b' }}
            >
              <ShieldCheck size={16} /> Espace Admin BDE
            </button>
          )}

          {/* User Profile / Login */}
          {user ? (
            <div className="user-badge">
              <img src={user.avatarUrl} alt={user.login} className="avatar" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="user-name">{user.displayName || user.login}</span>
                <span className={`role-pill ${user.isAdmin ? 'role-admin' : 'role-student'}`}>
                  {user.isAdmin ? 'BDE Admin' : 'Étudiant 42'}
                </span>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', marginLeft: '0.2rem' }}
                onClick={onLogout}
                title="Se déconnecter"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={onLogin42}>
                <Sparkles size={16} /> Connexion 42
              </button>
            </div>
          )}

          {/* Cart Icon */}
          <button className="btn btn-secondary" onClick={onOpenCart} style={{ position: 'relative' }}>
            <ShoppingBag size={18} />
            {cartCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: 'var(--color-primary)',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: '0.7rem',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
