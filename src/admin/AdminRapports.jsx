import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import {
  FaFilePdf, FaChartBar, FaChartLine,
  FaBoxes, FaCrown, FaUserTie, FaCalendarCheck,
  FaArrowUp, FaCoins, FaShoppingBag, FaSpinner
} from "react-icons/fa";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

const RANGE_OPTIONS = [
  { key: "7d", label: "7 derniers jours", days: 7 },
  { key: "30d", label: "30 derniers jours", days: 30 },
  { key: "90d", label: "90 derniers jours", days: 90 },
  { key: "all", label: "Historique complet", days: null },
];

const COLORS = {
  emerald: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  pink: "#ec4899",
  slate: "#64748b",
  white: "#ffffff",
  background: "#0f172a",
  surface: "#1e293b",
  border: "#334155",
};

const AdminReports = () => {
  const [rangeKey, setRangeKey] = useState("30d");
  const [orders, setOrders] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const toNumber = useCallback((val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }, []);

  const getOrderTotal = useCallback((order) => {
    const direct = toNumber(order?.total, NaN);
    if (Number.isFinite(direct)) return direct;
    const grandTotal = toNumber(order?.totals?.grandTotal, NaN);
    if (Number.isFinite(grandTotal)) return grandTotal;
    const amountReceived = toNumber(order?.amountReceived, NaN);
    if (Number.isFinite(amountReceived)) return amountReceived / 100;
    return toNumber(order?.amount, 0) / 100;
  }, [toNumber]);

  const getOrderDate = useCallback((order) => {
    const source = order?.createdAt || order?.date || order?.updatedAt;
    if (!source) return null;
    if (source?.seconds) return new Date(source.seconds * 1000);
    const d = new Date(source);
    return Number.isNaN(d.getTime()) ? null : d;
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersSnap, booksSnap] = await Promise.all([
          getDocs(collection(db, "orders")),
          getDocs(collection(db, "books"))
        ]);
        setOrders(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBooks(booksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Erreur lors de la récupération des rapports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatCurrency = (val) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(toNumber(val));

  const rangeDays = useMemo(() =>
    RANGE_OPTIONS.find(r => r.key === rangeKey)?.days || 30, [rangeKey]
  );

  const reportData = useMemo(() => {
    const now = new Date();
    let filteredOrders = [];

    if (rangeKey === "all") {
      filteredOrders = orders.filter(o => getOrderDate(o) !== null);
    } else {
      const start = new Date(now);
      start.setDate(now.getDate() - (rangeDays - 1));
      start.setHours(0, 0, 0, 0);
      filteredOrders = orders.filter(o => {
        const d = getOrderDate(o);
        return d && d >= start && d <= now;
      });
    }

    const dailyMap = {};
    const weeklyMap = {};
    const productMap = {};
    const clientMap = {};
    let totalRevenue = 0;
    let confirmedCount = 0;
    let refusedCount = 0;
    let pendingCount = 0;

    filteredOrders.forEach(order => {
      const d = getOrderDate(order);
      if (!d) return;

      const status = order.status === "rejected" ? "refused" : (order.status || "pending");
      const total = getOrderTotal(order);

      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const displayDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { dateKey, displayDate, CA: 0, Ventes: 0 };
      }

      const oneJan = new Date(d.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((d - oneJan) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
      const weekKey = `Semaine ${weekNumber} (${d.getFullYear()})`;
      if (!weeklyMap[weekKey]) {
        weeklyMap[weekKey] = { name: weekKey, CA: 0, Commandes: 0 };
      }

      if (status === "confirmed") {
        totalRevenue += total;
        confirmedCount++;
        dailyMap[dateKey].CA += total;
        dailyMap[dateKey].Ventes += 1;
        weeklyMap[weekKey].CA += total;
        weeklyMap[weekKey].Commandes += 1;

        const items = Array.isArray(order?.items) ? order.items : [];
        items.forEach(item => {
          const name = item?.title || item?.name || item?.bookTitle || "Produit inconnu";
          const qty = toNumber(item?.quantity || item?.qty, 1);
          const price = toNumber(item?.price, 0);
          if (!productMap[name]) productMap[name] = { name, qte: 0, ca: 0 };
          productMap[name].qte += qty;
          productMap[name].ca += qty * price;
        });

        const clientName = order.buyer?.name || order.customerName || order.buyer?.email || "Client Anonyme";
        if (!clientMap[clientName]) clientMap[clientName] = { name: clientName, commandes: 0, totalAchete: 0 };
        clientMap[clientName].commandes += 1;
        clientMap[clientName].totalAchete += total;

      } else if (status === "refused") {
        refusedCount++;
      } else {
        pendingCount++;
      }
    });

    const timelineData = Object.values(dailyMap).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    const weeklyData = Object.values(weeklyMap).sort((a, b) => b.CA - a.CA);
    const bestSellers = Object.values(productMap).sort((a, b) => b.ca - a.ca).slice(0, 5);
    const bestClients = Object.values(clientMap).sort((a, b) => b.totalAchete - a.totalAchete).slice(0, 5);
    const bestWeek = weeklyData[0] || { name: "Aucune donnée", CA: 0, Commandes: 0 };

    let totalStockVolume = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    books.forEach(b => {
      const stock = toNumber(b.stock || b.quantity, 0);
      totalStockVolume += stock;
      if (stock === 0) outOfStockCount++;
      else if (stock <= 2) lowStockCount++;
    });

    return {
      timelineData,
      bestSellers,
      bestClients,
      bestWeek,
      weeklyData: weeklyData.slice(0, 6).reverse(),
      kpis: {
        revenue: totalRevenue,
        ordersCount: filteredOrders.length,
        averageBasket: confirmedCount ? totalRevenue / confirmedCount : 0,
        statusDistribution: [
          { name: "Confirmées", value: confirmedCount, color: COLORS.emerald },
          { name: "En attente", value: pendingCount, color: COLORS.amber },
          { name: "Refusées", value: refusedCount, color: COLORS.red }
        ]
      },
      stockAnalysis: {
        totalStockVolume,
        lowStockCount,
        outOfStockCount,
        totalReferences: books.length
      }
    };
  }, [orders, books, rangeKey, rangeDays, getOrderDate, getOrderTotal, toNumber]);

  const handleExportPDF = () => {
    window.print();
  };

  // --- Styles globaux intégrés pour une esthétique sombre et moderne ---
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: ${COLORS.background};
      color: ${COLORS.white};
      font-family: 'Inter', sans-serif;
    }

    .dashboard-container {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2.5rem;
      flex-wrap: wrap;
      gap: 1.5rem;
    }

    .header-left h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      background: linear-gradient(to right, #fff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.25rem;
    }

    .header-left p {
      color: #94a3b8;
      font-size: 1rem;
      font-weight: 400;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      background: ${COLORS.surface};
      border-radius: 16px;
      padding: 4px;
      border: 1px solid ${COLORS.border};
    }

    .filter-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 0.5rem 1.2rem;
      border-radius: 12px;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Inter', sans-serif;
    }

    .filter-btn.active {
      background: ${COLORS.blue};
      color: white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .export-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: ${COLORS.red};
      color: white;
      border: none;
      padding: 0.5rem 1.5rem;
      border-radius: 16px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    .export-btn:hover {
      background: #dc2626;
      transform: translateY(-1px);
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      background: ${COLORS.surface};
      border: 1px solid ${COLORS.border};
      border-radius: 24px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.3s ease;
    }

    .kpi-card:hover {
      border-color: ${COLORS.blue}40;
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }

    .kpi-content p {
      color: #94a3b8;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .kpi-content h3 {
      font-size: 2rem;
      font-weight: 800;
      color: white;
      line-height: 1.2;
    }

    .kpi-trend {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-top: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .kpi-icon {
      font-size: 2rem;
      opacity: 0.2;
    }

    .chart-grid-2col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .chart-grid-3col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .panel {
      background: ${COLORS.surface};
      border: 1px solid ${COLORS.border};
      border-radius: 24px;
      padding: 1.5rem;
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .panel-header h3 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #e2e8f0;
    }

    .stock-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .stock-item:last-child {
      border-bottom: none;
    }

    .badge {
      padding: 0.35rem 0.75rem;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.75rem;
    }

    .badge-red { background: rgba(239, 68, 68, 0.15); color: ${COLORS.red}; }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: ${COLORS.amber}; }
    .badge-emerald { background: rgba(16, 185, 129, 0.15); color: ${COLORS.emerald}; }

    .table-custom {
      width: 100%;
      border-collapse: collapse;
    }

    .table-custom th {
      text-align: left;
      color: #94a3b8;
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid ${COLORS.border};
    }

    .table-custom td {
      padding: 0.75rem 0;
      border-bottom: 1px solid ${COLORS.border}30;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .text-right { text-align: right; }
    .text-blue { color: ${COLORS.blue}; }
    .text-emerald { color: ${COLORS.emerald}; font-weight: 700; }
    .text-truncate { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }

    .loader-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 80vh;
      flex-direction: column;
      gap: 1rem;
    }

    .spinner {
      animation: spin 1s linear infinite;
      font-size: 2rem;
      color: ${COLORS.blue};
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media print {
      body { background: white; color: black; }
      .header-actions, .export-btn { display: none; }
      .panel, .kpi-card { background: white; border: 1px solid #ddd; box-shadow: none; color: black; }
    }
  `;

  if (loading) {
    return (
      <>
        <style>{styles}</style>
        <div className="loader-container">
          <FaSpinner className="spinner" />
          <p style={{ color: '#94a3b8' }}>Analyse des données en cours...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="dashboard-container" id="report-print-area">
        
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Performance Analytics</h1>
            <p>Tableau de bord consolidé · {RANGE_OPTIONS.find(r => r.key === rangeKey)?.label}</p>
          </div>
          <div className="header-actions">
            <div className="filter-group">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setRangeKey(option.key)}
                  className={`filter-btn ${rangeKey === option.key ? "active" : ""}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button onClick={handleExportPDF} className="export-btn">
              <FaFilePdf /> Exporter
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-content">
              <p>Chiffre d'Affaires</p>
              <h3>{formatCurrency(reportData.kpis.revenue)}</h3>
              <span className="kpi-trend"><FaCoins color={COLORS.amber} /> Net confirmé</span>
            </div>
            <FaChartLine className="kpi-icon" color={COLORS.emerald} />
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <p>Commandes Totales</p>
              <h3>{reportData.kpis.ordersCount}</h3>
              <span className="kpi-trend"><FaShoppingBag color={COLORS.blue} /> Tous statuts</span>
            </div>
            <FaShoppingBag className="kpi-icon" color={COLORS.blue} />
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <p>Panier Moyen</p>
              <h3>{formatCurrency(reportData.kpis.averageBasket)}</h3>
              <span className="kpi-trend"><FaArrowUp color={COLORS.emerald} /> Sur ventes validées</span>
            </div>
            <FaChartBar className="kpi-icon" color={COLORS.purple} />
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <p>Catalogue</p>
              <h3>{reportData.stockAnalysis.totalReferences}</h3>
              <span className="kpi-trend"><FaBoxes color={COLORS.slate} /> Références uniques</span>
            </div>
            <FaBoxes className="kpi-icon" color={COLORS.slate} />
          </div>
        </div>

        {/* Charts Row 1: Area & Pie */}
        <div className="chart-grid-2col">
          <div className="panel">
            <div className="panel-header">
              <FaChartLine color={COLORS.blue} />
              <h3>Évolution du Chiffre d'Affaires (€)</h3>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={reportData.timelineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientCa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="displayDate" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '12px', color: '#fff' }} />
                <Area type="monotone" dataKey="CA" stroke={COLORS.blue} strokeWidth={3} fill="url(#gradientCa)" name="CA" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <div className="panel-header">
              <FaChartBar color={COLORS.amber} />
              <h3>Répartition des Statuts</h3>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={reportData.kpis.statusDistribution.filter(d => d.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={70} outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {reportData.kpis.statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: COLORS.surface, border: 'none', borderRadius: '12px' }} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2: Best Week & Weekly Bars */}
        <div className="chart-grid-3col">
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="panel-header">
              <FaCalendarCheck color={COLORS.purple} />
              <h3>Meilleure Semaine</h3>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.1)', borderRadius: '16px', padding: '1.2rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <h4 style={{ color: COLORS.purple, fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.75rem' }}>{reportData.bestWeek.name}</h4>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.95rem' }}>
                <span><strong style={{ color: '#e2e8f0' }}>CA :</strong> {formatCurrency(reportData.bestWeek.CA)}</span>
                <span><strong style={{ color: '#e2e8f0' }}>Vol :</strong> {reportData.bestWeek.Commandes} cmd(s)</span>
              </div>
            </div>
          </div>

          <div className="panel" style={{ gridColumn: 'span 2' }}>
            <div className="panel-header">
              <FaChartBar color={COLORS.purple} />
              <h3>Comparatif Hebdomadaire (Top 6)</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={reportData.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.surface, border: 'none', borderRadius: '8px' }} />
                <Bar dataKey="CA" fill={COLORS.purple} radius={[6, 6, 0, 0]} name="CA (€)" barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Details Row: Stocks, Best Sellers, Best Clients */}
        <div className="chart-grid-3col">
          {/* Stocks */}
          <div className="panel">
            <div className="panel-header">
              <FaBoxes color={COLORS.red} />
              <h3>Santé des Stocks</h3>
            </div>
            <div className="stock-item">
              <span style={{ color: '#94a3b8' }}>Volume total</span>
              <strong style={{ fontSize: '1.1rem' }}>{reportData.stockAnalysis.totalStockVolume}</strong>
            </div>
            <div className="stock-item">
              <span style={{ color: '#94a3b8' }}>En rupture</span>
              <span className="badge badge-red">{reportData.stockAnalysis.outOfStockCount} Réf</span>
            </div>
            <div className="stock-item">
              <span style={{ color: '#94a3b8' }}>Stock faible (≤2)</span>
              <span className="badge badge-amber">{reportData.stockAnalysis.lowStockCount} Réf</span>
            </div>
          </div>

          {/* Best Sellers */}
          <div className="panel">
            <div className="panel-header">
              <FaCrown color={COLORS.amber} />
              <h3>Top 5 Produits</h3>
            </div>
            {reportData.bestSellers.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Aucune vente sur la période.</p>
            ) : (
              <table className="table-custom">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.bestSellers.map((item, idx) => (
                    <tr key={idx}>
                      <td><span className="text-truncate">{item.name}</span></td>
                      <td className="text-right text-blue">{item.qte}</td>
                      <td className="text-right text-emerald">{formatCurrency(item.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Best Clients */}
          <div className="panel">
            <div className="panel-header">
              <FaUserTie color={COLORS.blue} />
              <h3>Top 5 Clients</h3>
            </div>
            {reportData.bestClients.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Aucune donnée client.</p>
            ) : (
              <table className="table-custom">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">Cmd.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.bestClients.map((client, idx) => (
                    <tr key={idx}>
                      <td><span className="text-truncate">{client.name}</span></td>
                      <td className="text-right" style={{ color: '#94a3b8' }}>{client.commandes}</td>
                      <td className="text-right text-emerald">{formatCurrency(client.totalAchete)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminReports;