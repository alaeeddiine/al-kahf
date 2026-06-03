import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  FaBook,
  FaShoppingCart,
  FaTags,
  FaEnvelope,
  FaSignOutAlt,
  FaChartLine,
  FaBars,
  FaTimes,
  FaBox,
  FaStar,
  FaUsers,
  FaPowerOff,
} from "react-icons/fa";
import "../styles/admin.tailwind.css";

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1771250339/Design_sans_titre_4_dnw65w.png";

const AdminLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const logout = () => {
    localStorage.removeItem("adminLogged");
    navigate("/admin/login");
  };

  const menuItems = [
    { label: "Vue d'ensemble", icon: <FaChartLine />, path: "/admin/dashboard" },
    { label: "Bibliothèque", icon: <FaBook />, path: "/admin/books" },
    { label: "Packs", icon: <FaBox />, path: "/admin/packs" },
    { label: "Commandes", icon: <FaShoppingCart />, path: "/admin/orders" },
    { label: "Marketing", icon: <FaTags />, path: "/admin/promos" },
    { label: "Nos Clients", icon: <FaUsers />, path: "/admin/customers" },
    { label: "Avis", icon: <FaStar />, path: "/admin/reviews" },
    { label: "Newsletter", icon: <FaEnvelope />, path: "/admin/newsletter" },
    // { label: "Rapports", icon: <FaChartLine />, path: "/admin/rapports" }
  ];

  return (
    <div className="manager-dashboard">
      {/* MOBILE HAMBURGER */}
      <button className="mobile-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? <FaTimes /> : <FaBars />}
      </button>

      {/* PERSISTENT SIDEBAR */}
      <aside className={`manager-sidebar ${isSidebarOpen ? "active" : ""}`}>
        <div className="sidebar-brand">
          <img src={logo} alt="logo" />
          <div className="brand-text">
            <h3>ALKAHF</h3>
            <span>Tableau De Board Admin</span>
          </div>
        </div>

        <nav className="nav-group">
          <p className="nav-label">Console Admin</p>
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? "active" : ""}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/admin/site-closure"
            className={`site-disable-action ${location.pathname === "/admin/site-closure" ? "active" : ""}`}
            onClick={() => setIsSidebarOpen(false)}
          >
            <FaPowerOff /> Desactiver le site
          </Link>
          <button className="logout-action" onClick={logout}>
            <FaSignOutAlt /> Terminer la session
          </button>
        </div>
      </aside>

      {/* DYNAMIC CONTENT AREA */}
      <main className={`manager-content ${location.pathname !== "/admin/dashboard" ? "admin-full" : ""}`}>
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
