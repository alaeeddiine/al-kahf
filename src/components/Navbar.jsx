import React, { useContext, useEffect, useState, useMemo } from "react"; 
import { Link, NavLink } from "react-router-dom";
import { 
  FaShoppingCart, 
  FaBars, 
  FaTimes
} from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

const NAV_LINKS = [
  { path: "/", label: "Accueil" },
  { path: "/books", label: "Librairie", hasDropdown: true }, // dropdown
  { path: "/packs", label: "Packs" },
  { path: "/promos", label: "Promos" },
  { path: "/about", label: "À Propos" },
];

// ---------- Helpers ----------
const getRemainingDays = (endDate) => {
  if (!endDate) return null;
  const today = new Date();
  const target = new Date(endDate);
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
};

const translateTarget = (value) => {
  switch (value) {
    case "all": return "Tout le site";
    case "books": return "Livres";
    case "packs": return "Packs";
    default: return value;
  }
};

const formatTarget = (appliesTo) => {
  if (!appliesTo) return "Tout le site";
  if (Array.isArray(appliesTo)) {
    return appliesTo.map(v => translateTarget(v)).join(", ");
  }
  return translateTarget(appliesTo);
};

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1771250339/Design_sans_titre_4_dnw65w.png";

const Navbar = ({ onCartClick }) => {
  const { cartItems = [] } = useContext(CartContext) || {};
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [promos, setPromos] = useState([]);
  const [currentPromo, setCurrentPromo] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false); // pour le menu Librairie

  const totalItems = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
    [cartItems]
  );

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch promos
  useEffect(() => {
    const q = query(
      collection(db, "promos"), 
      where("active", "==", true)
    );
    const unsub = onSnapshot(q, snap => {
      const filtered = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => p.type === "general" || p.type === "announce");
      setPromos(filtered);
      setCurrentPromo(0);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (promos.length <= 1) return;
    const interval = setInterval(
      () => setCurrentPromo(prev => (prev + 1) % promos.length),
      4000
    );
    return () => clearInterval(interval);
  }, [promos]);

  const formatPromoText = (promo) => {
    if (!promo) return null;
    if (promo.type === "announce") return <strong>{promo.title}</strong>;
    const daysLeft = getRemainingDays(promo.endDate);
    return (
      <>
        <strong>{promo.title}</strong>
        {promo.amount && ` -${promo.amount}%`}
        {` sur ${formatTarget(promo.appliesTo)}`}
        {daysLeft !== null && ` | ⏳ Plus que ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}
      </>
    );
  };

  return (
    <>
      {/* PROMO BAR */}
      {promos.length > 0 && (
        <div className="royal-promo-bar">
          <p>{formatPromoText(promos[currentPromo])}</p>
        </div>
      )}

      {/* MAIN NAVBAR */}
      <header className={`royal-navbar ${isScrolled ? "scrolled" : ""}`}>
        <div className="nav-container">
          {/* DESKTOP LINKS */}
          <nav className="nav-desktop">
            {NAV_LINKS.map(link => (
              <div 
                key={link.path} 
                className="nav-item"
                onMouseEnter={() => link.hasDropdown && setDropdownOpen(true)}
                onMouseLeave={() => link.hasDropdown && setDropdownOpen(false)}
              >
                <NavLink
                  to={link.path}
                  className={({ isActive }) =>
                    [isActive ? "active" : "", link.path === "/promos" ? "promo-link" : ""]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  {link.label}
                </NavLink>

                {/* Dropdown Librairie */}
                {link.hasDropdown && dropdownOpen && (
                  <div className="dropdown-menu">
                    <Link to="/books" className="dropdown-item">Livres Adultes</Link>
                    <Link to="/kids" className="dropdown-item">Livres Enfants</Link>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* LOGO */}
          <Link to="/" className="nav-logo">
            <img src={logo} alt="Logo" />
          </Link>

          {/* ACTIONS */}
          <div className="nav-actions">
            <button className="action-btn cart" onClick={onCartClick}>
              <FaShoppingCart />
              {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
            </button>
            <button className="action-btn menu-toggle" onClick={() => setIsMobileOpen(true)}>
              <FaBars />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      <div className={`drawer-overlay ${isMobileOpen ? "show" : ""}`} onClick={() => setIsMobileOpen(false)} />
      <aside className={`mobile-drawer ${isMobileOpen ? "open" : ""}`}>
        <div className="drawer-top">
          <img src={logo} alt="Logo" className="drawer-logo" />
          <button className="close-btn" onClick={() => setIsMobileOpen(false)}><FaTimes /></button>
        </div>
        <div className="drawer-links">
          {NAV_LINKS.map(link => (
            <div key={link.path}>
              <NavLink
                to={link.path}
                onClick={() => setIsMobileOpen(false)}
                className={({ isActive }) =>
                  [isActive ? "active" : "", link.path === "/promos" ? "promo-link" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                {link.label}
              </NavLink>
              {link.hasDropdown && (
                <div className="drawer-sub-links">
                  <Link to="/books" onClick={() => setIsMobileOpen(false)}>Livres Adultes</Link>
                  <Link to="/kids" onClick={() => setIsMobileOpen(false)}>Livres Enfants</Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
};

export default Navbar;

