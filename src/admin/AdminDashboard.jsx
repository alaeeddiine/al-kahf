import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase/config";
import {
  FaArrowUp,
  FaBoxOpen,
  FaBullseye,
  FaChartLine,
  FaCheckCircle,
  FaChevronRight,
  FaClock,
  FaRegCalendarAlt,
  FaShoppingCart,
  FaUsers,
  FaExclamationTriangle,
  FaShippingFast
} from "react-icons/fa";

const RANGE_OPTIONS = [
  { key: "7d", label: "7 jours", days: 7 },
  { key: "30d", label: "30 jours", days: 30 },
  { key: "90d", label: "90 jours", days: 90 },
  { key: "all", label: "Tout le temps", days: null }, 
];

const AdminDashboard = () => {
  const [rangeKey, setRangeKey] = useState("30d");
  const [stats, setStats] = useState({ books: 0, orders: 0, newsletter: 0, revenue: 0 });
  const [allOrders, setAllOrders] = useState([]);
  const [latestBooks, setLatestBooks] = useState([]);
  const [latestOrders, setLatestOrders] = useState([]);
  const [latestSubs, setLatestSubs] = useState([]);
  const [lowStockBooks, setLowStockBooks] = useState({
    outOfStock: [],
    limitedStock: []
  });

  const toNumber = useCallback((value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }, []);

  const getOrderTotal = useCallback(
    (order) => {
      const direct = toNumber(order?.total, NaN);
      if (Number.isFinite(direct)) return direct;
      const grandTotal = toNumber(order?.totals?.grandTotal, NaN);
      if (Number.isFinite(grandTotal)) return grandTotal;
      const amountReceived = toNumber(order?.amountReceived, NaN);
      if (Number.isFinite(amountReceived)) return amountReceived / 100;
      const amount = toNumber(order?.amount, NaN);
      if (Number.isFinite(amount)) return amount / 100;
      return 0;
    },
    [toNumber]
  );

  const normalizeStatus = useCallback((status) => {
    if (status === "rejected") return "refused";
    return status || "pending";
  }, []);

  const getOrderDate = useCallback((order) => {
    const source = order?.createdAt || order?.date || order?.updatedAt;
    if (!source) return null;
    if (source?.seconds) return new Date(source.seconds * 1000);
    const d = new Date(source);
    return Number.isNaN(d.getTime()) ? null : d;
  }, []);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }),
    []
  );

  const formatCurrency = useCallback(
    (value) => currencyFormatter.format(toNumber(value, 0)),
    [currencyFormatter, toNumber]
  );

  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return "Date inconnue";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString("fr-FR");
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [booksSnap, ordersSnap, newsSnap] = await Promise.all([
          getDocs(collection(db, "books")),
          getDocs(collection(db, "orders")),
          getDocs(collection(db, "newsletter")),
        ]);

        const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const books = booksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const totalRevenue = orders.reduce((acc, order) => {
          const status = normalizeStatus(order?.status);
          if (status !== "confirmed") return acc;
          return acc + getOrderTotal(order);
        }, 0);

        const outOfStock = books.filter((b) => {
          const stock = toNumber(b.stock ?? b.quantity, 0);
          return stock === 0;
        });

        const limitedStock = books.filter((b) => {
          const stock = toNumber(b.stock ?? b.quantity, 0);
          return stock > 0 && stock < 5;
        });

        setLowStockBooks({
          outOfStock,
          limitedStock
        });

        setStats({
          books: booksSnap.size,
          orders: ordersSnap.size,
          newsletter: newsSnap.size,
          revenue: totalRevenue,
        });

        setAllOrders(orders);

        const qBooks = query(collection(db, "books"), orderBy("createdAt", "desc"), limit(5));
        const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(6));
        const qNews = query(collection(db, "newsletter"), orderBy("createdAt", "desc"), limit(6));

        const [bSnap, oSnap, nSnap] = await Promise.all([getDocs(qBooks), getDocs(qOrders), getDocs(qNews)]);

        setLatestBooks(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLatestOrders(oSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLatestSubs(
          nSnap.docs.map((d) => ({
            id: d.id,
            email: d.data().email,
            joinedAt: d.data().createdAt,
          }))
        );
      } catch (err) {
        console.error("Admin Dashboard Error:", err);
      }
    };

    fetchDashboardData();
  }, [getOrderTotal, normalizeStatus, toNumber]);

  const rangeDays = useMemo(
    () => RANGE_OPTIONS.find((r) => r.key === rangeKey)?.days || 30,
    [rangeKey]
  );

  const business = useMemo(() => {
    const now = new Date();
    
    let inCurrentRange = [];
    let inPreviousRange = [];

    if (rangeKey === "all") {
      inCurrentRange = allOrders.filter((order) => getOrderDate(order) !== null);
      inPreviousRange = [];
    } else {
      const start = new Date(now);
      start.setDate(now.getDate() - (rangeDays - 1));
      start.setHours(0, 0, 0, 0);

      const previousStart = new Date(start);
      previousStart.setDate(start.getDate() - rangeDays);

      inCurrentRange = allOrders.filter((order) => {
        const d = getOrderDate(order);
        return d && d >= start && d <= now;
      });

      inPreviousRange = allOrders.filter((order) => {
        const d = getOrderDate(order);
        return d && d >= previousStart && d < start;
      });
    }

    const confirmedCurrent = inCurrentRange.filter((o) => normalizeStatus(o.status) === "confirmed");
    const confirmedPrevious = inPreviousRange.filter((o) => normalizeStatus(o.status) === "confirmed");
    const actionRequired = allOrders.filter((o) => {
      const status = normalizeStatus(o.status);

      return status !== "confirmed" && status !== "refused";
    });

    const revenueCurrent = confirmedCurrent.reduce((acc, o) => acc + getOrderTotal(o), 0);
    const revenuePrevious = confirmedPrevious.reduce((acc, o) => acc + getOrderTotal(o), 0);

    const averageBasket = confirmedCurrent.length ? revenueCurrent / confirmedCurrent.length : 0;
    const conversionRate = inCurrentRange.length
      ? (confirmedCurrent.length / inCurrentRange.length) * 100
      : 0;

    const statusCounts = inCurrentRange.reduce(
      (acc, o) => {
        const s = normalizeStatus(o.status);
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      { confirmed: 0, pending: 0, refused: 0 }
    );

    const productMap = new Map();
    confirmedCurrent.forEach((order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      items.forEach((item) => {
        const name = item?.title || item?.name || item?.bookTitle || "Produit";
        const qty = toNumber(item?.quantity || item?.qty, 1);
        const price = toNumber(item?.price, 0);
        const prev = productMap.get(name) || { name, qty: 0, revenue: 0 };
        prev.qty += qty;
        prev.revenue += qty * price;
        productMap.set(name, prev);
      });
    });

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const growth = rangeKey === "all" ? 0 : (revenuePrevious > 0 ? ((revenueCurrent - revenuePrevious) / revenuePrevious) * 100 : 0);

    return {
      inCurrentRange,
      revenueCurrent,
      growth,
      averageBasket,
      conversionRate,
      statusCounts,
      topProducts,
      actionRequired
    };
  }, [allOrders, getOrderDate, getOrderTotal, normalizeStatus, rangeDays, rangeKey, toNumber]);

  // NOUVEAU : Préparation des données pour les graphiques
  const chartData = useMemo(() => {
    const grouped = {};

    business.inCurrentRange.forEach(order => {
      const d = getOrderDate(order);
      if (!d) return;

      // Création d'une clé de regroupement par jour (ex: "2023-10-05") pour pouvoir trier correctement
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      // Affichage plus joli pour le graphique (ex: "05/10")
      const displayDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!grouped[dateKey]) {
        grouped[dateKey] = { dateKey, displayDate, CA: 0, Acceptées: 0, Refusées: 0, Attente: 0 };
      }

      const status = normalizeStatus(order.status);
      if (status === "confirmed") {
        grouped[dateKey].Acceptées += 1;
        grouped[dateKey].CA += getOrderTotal(order);
      } else if (status === "refused") {
        grouped[dateKey].Refusées += 1;
      } else {
        grouped[dateKey].Attente += 1;
      }
    });

    // On transforme l'objet en tableau et on trie chronologiquement
    return Object.values(grouped).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [business.inCurrentRange, getOrderDate, normalizeStatus, getOrderTotal]);


  return (
    <div className="intelligence-hub">
      <div className="hub-header">
        <div className="welcome-text">
          <h1>Tableau de bord admin</h1>
          <p>Pilotage des ventes, conversion et exécution commerciale.</p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="date-display">
            <FaRegCalendarAlt />
            <span>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
          </div>
          <div className="filter-pill-group">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRangeKey(option.key)}
                className={`filter-pill ${rangeKey === option.key ? "active" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="metrics-deck">
        <article className="glass-card highlight">
          <div className="metric-content">
            <p className="label">{rangeKey === "all" ? "CA Global" : `CA (${rangeDays}j)`}</p>
            <h3 className="value">{formatCurrency(business.revenueCurrent)}</h3>
            {rangeKey !== "all" ? (
              <p className={`trend ${business.growth >= 0 ? 'positive' : 'negative'}`}>
                <FaArrowUp style={{ transform: business.growth < 0 ? 'rotate(180deg)' : 'none' }} /> 
                {business.growth >= 0 ? "+" : ""}{business.growth.toFixed(1)}%
              </p>
            ) : (
              <p className="trend" style={{ opacity: 0.7 }}>Cumulé historique</p>
            )}
          </div>
          <div className="metric-icon-box"><FaChartLine /></div>
        </article>

        <article className="glass-card">
          <div className="metric-content">
            <p className="label">Commandes</p>
            <h3 className="value">{business.inCurrentRange.length}</h3>
            <p className="trend"><FaCheckCircle /> {business.statusCounts.confirmed} confirmées</p>
          </div>
          <div className="metric-icon-box"><FaShoppingCart /></div>
        </article>

        <article className="glass-card">
          <div className="metric-content">
            <p className="label">Panier moyen</p>
            <h3 className="value">{formatCurrency(business.averageBasket)}</h3>
            <p className="trend"><FaBullseye /> Cible: {formatCurrency(Math.max(business.averageBasket * 1.15, 35))}</p>
          </div>
          <div className="metric-icon-box"><FaBoxOpen /></div>
        </article>

        <article className="glass-card">
          <div className="metric-content">
            <p className="label">Conversion</p>
            <h3 className="value">{business.conversionRate.toFixed(1)}%</h3>
            <p className="trend"><FaClock /> {business.statusCounts.pending} en attente</p>
          </div>
          <div className="metric-icon-box"><FaUsers /></div>
        </article>
      </div>

      <div className="operations-grid">
        <div className="glass-panel">
          <div className="panel-top">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaShippingFast color="#f59e0b" /> Nouvelles Commandes ({business.actionRequired.length})
            </h3>
            <Link to="/admin/orders?status=pending" className="hub-btn-sm">Gérer <FaChevronRight /></Link>
          </div>
          {business.actionRequired.length === 0 ? (
            <p className="copyright-text">Super ! Toutes les commandes sont traitées.</p>
          ) : (
            business.actionRequired.slice(0, 5).map((o) => (
              <div key={o.id} className="stream-row">
                <span className="status-indicator" style={{ background: '#f59e0b' }} />
                <div className="stream-info">
                  <strong>{o.buyer?.name || o.customerName || "Client"}</strong>
                  <span>{formatDate(o.createdAt)}</span>
                </div>
                <div className="stream-amount">{formatCurrency(getOrderTotal(o))}</div>
              </div>
            ))
          )}
        </div>

        <div className="glass-panel">
          <div className="panel-top">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaExclamationTriangle color="#ef4444" /> Rupture de stock ({lowStockBooks.outOfStock.length})
            </h3>
            <Link to="/admin/books" className="hub-btn-sm">Inventaire <FaChevronRight /></Link>
          </div>
          {lowStockBooks.outOfStock.length === 0 ? (
            <p className="copyright-text">Aucun produit en rupture de stock.</p>
          ) : (
            lowStockBooks.outOfStock.slice(0,5).map((b, idx) => (
              <div className="asset-mini-card" key={b.id || idx}>
                <div className="asset-details">
                  <strong>{b.title || b.name || "Livre"}</strong>
                  <p style={{ color: '#ef4444', fontWeight: 'bold' }}>{b.stock || b.quantity || 0} unités</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="glass-panel">
          <div className="panel-top">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaExclamationTriangle color="#f59e0b" />
              Stock limité ({lowStockBooks.limitedStock.length})
            </h3>

            <Link to="/admin/books" className="hub-btn-sm">
              Inventaire <FaChevronRight />
            </Link>
          </div>

          {lowStockBooks.limitedStock.length === 0 ? (
            <p className="copyright-text">
              Aucun produit avec un stock faible.
            </p>
          ) : (
            lowStockBooks.limitedStock.slice(0, 5).map((b, idx) => {
              const stock = Number(b.stock ?? b.quantity ?? 0);

              return (
                <div className="asset-mini-card" key={b.id || idx}>
                  <div className="asset-details">
                    <strong>{b.title || b.name || "Livre"}</strong>

                    <p
                      style={{
                        color: "#f59e0b",
                        fontWeight: "bold"
                      }}
                    >
                      Plus que {stock} unités
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="glass-panel">
          <div className="panel-top">
            <h3>Top produits</h3>
            <Link to="/admin/books" className="hub-btn-sm">Voir tout <FaChevronRight /></Link>
          </div>
          {business.topProducts.length === 0 ? (
            <p className="copyright-text">Pas assez de données.</p>
          ) : (
            business.topProducts.slice(0, 5).map((p, idx) => (
              <div className="asset-mini-card" key={`${p.name}-${idx}`}>
                <div className="asset-details">
                  <strong>{p.name}</strong>
                  <p>{p.qty} ventes</p>
                </div>
                <div className="asset-price">{formatCurrency(p.revenue)}</div>
              </div>
            ))
          )}
        </div>

        <div className="glass-panel">
          <div className="panel-top">
            <h3>Nouvelle Audience</h3>
            <Link to="/admin/newsletter" className="hub-btn-sm">Newsletter <FaChevronRight /></Link>
          </div>
          {latestSubs.length === 0 ? (
            <p className="copyright-text">Aucun nouvel abonné.</p>
          ) : (
            latestSubs.slice(0, 5).map((s) => (
              <div className="audience-item" key={s.id}>
                <div className="audience-init">{(s.email || "?").slice(0, 1).toUpperCase()}</div>
                <div className="audience-meta">
                  <strong>{s.email}</strong>
                  <span>Le {formatDate(s.joinedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;