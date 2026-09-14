import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const GROUPS = [
  { id: 'home', label: 'Home', icon: 'home', paths: ['/'] },
  { id: 'people', label: 'People', icon: 'groups', paths: ['/directory', '/onboarding', '/engagement'] },
  { id: 'work', label: 'Work & Pay', icon: 'work', paths: ['/leaves', '/payroll', '/expenses', '/insurance'] },
  { id: 'resources', label: 'Resources', icon: 'folder', paths: ['/policies', '/assets', '/gsync'] },
  { id: 'support', label: 'Support', icon: 'support_agent', paths: ['/helpdesk', '/workflows'] },
  { id: 'admin', label: 'Administration', icon: 'admin_panel_settings', paths: ['/people-ops', '/permissions', '/reports', '/audit', '/settings'], adminOnly: true }
];

const readStored = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
};

export default function SidebarNav({ items, user, onNavigate }) {
  const location = useLocation();
  const prefix = `jjfo.nav.${user?.id || 'guest'}`;
  const [compact, setCompact] = useState(() => readStored(`${prefix}.compact`, false));
  const [favorites, setFavorites] = useState(() => readStored(`${prefix}.favorites`, []));
  const available = useMemo(() => new Map(items.map((item) => [item.to, item])), [items]);
  const visibleGroups = GROUPS
    .filter((group) => !group.adminOnly || user?.role === 'admin')
    .map((group) => ({ ...group, items: group.paths.map((path) => available.get(path)).filter(Boolean) }))
    .filter((group) => group.items.length);
  const activeGroup = visibleGroups.find((group) =>
    group.items.some((item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))
  )?.id || 'home';
  const [openGroup, setOpenGroup] = useState(activeGroup);

  useEffect(() => setOpenGroup(activeGroup), [activeGroup]);
  useEffect(() => {
    setCompact(readStored(`${prefix}.compact`, false));
    setFavorites(readStored(`${prefix}.favorites`, []));
  }, [prefix]);
  useEffect(() => {
    try { localStorage.setItem(`${prefix}.compact`, JSON.stringify(compact)); } catch { /* unavailable */ }
  }, [compact, prefix]);
  useEffect(() => {
    try { localStorage.setItem(`${prefix}.favorites`, JSON.stringify(favorites)); } catch { /* unavailable */ }
  }, [favorites, prefix]);

  const favoriteItems = favorites.map((path) => available.get(path)).filter(Boolean);
  const toggleFavorite = (path) => setFavorites((current) =>
    current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
  );

  const link = (item, showPin = true) => (
    <li className="sidebar-link-row" key={item.to}>
      <NavLink
        to={item.to}
        end={item.end}
        title={compact ? item.label : undefined}
        className={({ isActive }) => `menu-link${isActive ? ' active' : ''}`}
        onClick={onNavigate}
      >
        <i className="material-icons-round">{item.icon}</i>
        <span>{item.label}</span>
        {item.badge ? <small className="nav-badge">{item.badge}</small> : null}
      </NavLink>
      {showPin && !compact && (
        <button
          type="button"
          className={`nav-pin${favorites.includes(item.to) ? ' pinned' : ''}`}
          aria-label={`${favorites.includes(item.to) ? 'Unpin' : 'Pin'} ${item.label}`}
          title={favorites.includes(item.to) ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => toggleFavorite(item.to)}
        >
          <i className="material-icons-round">{favorites.includes(item.to) ? 'star' : 'star_border'}</i>
        </button>
      )}
    </li>
  );

  return (
    <aside className={`sidebar${compact ? ' compact' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand-row">
        <div className="sidebar-logo">
          <i className="material-icons-round">account_balance</i>
          <span>JJFO HRMS</span>
        </div>
      </div>

      <nav className="sidebar-menu">
        {compact ? (
          <ul className="sidebar-compact-list">
            {visibleGroups.flatMap((group) => group.items).map((item) => link(item, false))}
          </ul>
        ) : (
          <>
            {favoriteItems.length > 0 && (
              <section className="sidebar-group favorites-group">
                <div className="sidebar-section-label"><i className="material-icons-round">star</i> My Favorites</div>
                <ul>{favoriteItems.map((item) => link(item))}</ul>
              </section>
            )}
            {visibleGroups.map((group) => group.id === 'home' ? (
              <section className="sidebar-group" key={group.id}>
                <ul>{group.items.map((item) => link(item))}</ul>
              </section>
            ) : (
              <section className={`sidebar-group${openGroup === group.id ? ' open' : ''}`} key={group.id}>
                <button
                  type="button"
                  className={`sidebar-group-button${activeGroup === group.id ? ' active' : ''}`}
                  aria-expanded={openGroup === group.id}
                  onClick={() => setOpenGroup((current) => current === group.id ? '' : group.id)}
                >
                  <i className="material-icons-round">{group.icon}</i>
                  <span>{group.label}</span>
                  <i className="material-icons-round group-chevron">expand_more</i>
                </button>
                {openGroup === group.id && <ul>{group.items.map((item) => link(item))}</ul>}
              </section>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-compact-toggle"
          onClick={() => setCompact((value) => !value)}
          title={compact ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={compact ? 'Expand navigation' : 'Collapse navigation'}
        >
          <i className="material-icons-round">{compact ? 'last_page' : 'first_page'}</i>
          <span>Collapse menu</span>
        </button>
      </div>
    </aside>
  );
}
