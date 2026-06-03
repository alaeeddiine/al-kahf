import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";
import { FaTimes } from "react-icons/fa";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CartPopup from "./components/CartPopup";
import CookieBanner from "./components/CookieBanner";
import AdminLayout from "./admin/AdminLayout";

import Home from "./pages/Home";
import About from "./pages/About";
import Books from "./pages/Books";
import KidsBooks from "./pages/KidsBooks";
import BookDetails from "./pages/BookDetails";
import Packs from "./pages/Packs";
import PackDetails from "./pages/PackDetails";
import Promos from "./pages/Promos";
import Checkout from "./pages/Checkout";
import RelayPoint from "./pages/RelayPoint";
import LegalNotice from "./pages/LegalNotice";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import TermsOfSale from "./pages/TermsOfSale";

import Login from "./admin/login";
import AdminDashboard from "./admin/AdminDashboard";
import AdminBooks from "./admin/AdminBooks";
import AdminPacks from "./admin/AdminPacks";
import AdminPromos from "./admin/AdminPromos";
import AdminOrders from "./admin/AdminOrders";
import NewsletterAdmin from "./admin/NewsletterAdmin";
import CustomersAdmin from "./admin/CustomersAdmin";
import ReviewsAdmin from "./admin/ReviewsAdmin";
import AdminRapports from "./admin/AdminRapports";
import AdminSiteClosure from "./admin/AdminSiteClosure";
import SiteClosurePage from "./pages/SiteClosurePage";

import { db, onAuthState } from "./firebase/config";
import { doc, onSnapshot } from "firebase/firestore";
import { CartProvider } from "./context/CartContext";

import "./styles/components.css";
import "./styles/pages.css";
import "./styles/admin.css";
import "./styles/admin.tailwind.css";

/* ===============================
   SCROLL TO TOP COMPONENT
================================ */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname]);

  return null;
}

function NewsletterReminderBadge({ siteClosureActive }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seenInSession = sessionStorage.getItem("newsletter_badge_seen_session");
    if (!seenInSession) {
      setVisible(true);
      sessionStorage.setItem("newsletter_badge_seen_session", "true");
    }
  }, []);

  if (!visible || siteClosureActive || location.pathname.startsWith("/admin")) {
    return null;
  }

  const hideBadge = () => {
    setVisible(false);
  };

  const handleSubscribeClick = () => {
    hideBadge();

    const scrollToNewsletter = () => {
      const newsletterSection = document.getElementById("newsletter-section");
      newsletterSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(scrollToNewsletter, 200);
      return;
    }

    scrollToNewsletter();
  };
  return (
    <div className="newsletter-reminder-badge" role="status" aria-live="polite">
      <div className="newsletter-reminder-content">
        <span className="newsletter-reminder-kicker">Newsletter</span>
        <p>Recevez nos nouveaux livres et offres exclusives en avant-premiere.</p>
      </div>
      <button type="button" onClick={handleSubscribeClick}>
        Je m'abonne
      </button>
      <button
        type="button"
        className="newsletter-reminder-close"
        onClick={hideBadge}
        aria-label="Fermer le rappel newsletter"
      >
        <FaTimes aria-hidden="true" />
      </button>
    </div>
  );
}

/* ===============================
   PUBLIC LAYOUT
================================ */
function PublicLayout({ onCartClick, isCartOpen, setIsCartOpen }) {
  return (
    <>
      <Navbar onCartClick={onCartClick} />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      <CartPopup isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <CookieBanner />
    </>
  );
}

/* ===============================
   ADMIN GUARD
================================ */
const ProtectedAdmin = ({ adminUser, loadingAuth }) => {
  if (loadingAuth) {
    return <div className="table-loader">Chargement...</div>;
  }

  if (!adminUser) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
};

/* ===============================
   APP ROUTES
================================ */
function AppRoutes({ isCartOpen, setIsCartOpen, adminUser, loadingAuth }) {
  const location = useLocation();
  const state = location.state;
  const backgroundLocation = state && state.backgroundLocation;
  const [siteClosure, setSiteClosure] = useState(null);
  const [loadingSiteClosure, setLoadingSiteClosure] = useState(true);
  const siteClosureActive = Boolean(siteClosure?.active);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "site_settings", "temporary_closure"),
      (snapshot) => {
        setSiteClosure(snapshot.exists() ? snapshot.data() : null);
        setLoadingSiteClosure(false);
      },
      (error) => {
        console.error("Erreur lecture fermeture site:", error);
        setLoadingSiteClosure(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const publicElement = loadingSiteClosure ? (
    <div className="table-loader">Chargement...</div>
  ) : siteClosureActive ? (
    <SiteClosurePage settings={siteClosure} />
  ) : (
    <PublicLayout
      onCartClick={() => setIsCartOpen(true)}
      isCartOpen={isCartOpen}
      setIsCartOpen={setIsCartOpen}
    />
  );

  return (
    <>
      <ScrollToTop />
      <NewsletterReminderBadge siteClosureActive={siteClosureActive} />
      <Routes location={backgroundLocation || location}>
        {/* PUBLIC ROUTES */}
        <Route element={publicElement}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/books" element={<Books />} />
          <Route path="/kids" element={<KidsBooks />} />
          <Route path="/book/:id" element={<BookDetails />} />
          <Route path="/packs" element={<Packs />} />
          <Route path="/promos" element={<Promos />} />
          <Route path="/pack/:id" element={<PackDetails />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/relay-point" element={<RelayPoint />} />
          <Route path="/LegalNotice" element={<LegalNotice />} />
          <Route path="/PrivacyPolicy" element={<PrivacyPolicy />} />
          <Route path="/TermsOfUse" element={<TermsOfUse />} />
          <Route path="/TermsOfSale" element={<TermsOfSale />} />
        </Route>

        {/* ADMIN LOGIN */}
        <Route path="/admin/login" element={<Login />} />

        {/* ADMIN PROTECTED ROUTES */}
        <Route
          path="/admin"
          element={
            <ProtectedAdmin adminUser={adminUser} loadingAuth={loadingAuth} />
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="books" element={<AdminBooks />} />
          <Route path="packs" element={<AdminPacks />} />
          <Route path="promos" element={<AdminPromos />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="newsletter" element={<NewsletterAdmin />} />
          <Route path="customers" element={<CustomersAdmin />} />
          <Route path="reviews" element={<ReviewsAdmin />} />
          <Route path="rapports" element={<AdminRapports />} />
          <Route path="site-closure" element={<AdminSiteClosure />} />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          <Route path="/relay-point" element={<RelayPoint />} />
        </Routes>
      )}
    </>
  );
}

/* ===============================
   APP
================================ */
function App() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthState((user) => {
      setAdminUser(user);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <CartProvider>
      <Router>
        <AppRoutes
          isCartOpen={isCartOpen}
          setIsCartOpen={setIsCartOpen}
          adminUser={adminUser}
          loadingAuth={loadingAuth}
        />
      </Router>
    </CartProvider>
  );
}

export default App;



