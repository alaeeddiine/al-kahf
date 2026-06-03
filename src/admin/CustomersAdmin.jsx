import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { FaEnvelope, FaCalendarAlt, FaDownload, FaUserShield, FaSearch, FaStar } from "react-icons/fa";

const SUCCESS_STATUSES = new Set(["paid", "confirmed", "completed", "delivered", "shipped"]);
const CUSTOMER_META_COLLECTION = "customers_admin";

const getDateFromOrder = (order) => {
  const createdAt = order?.createdAt;
  if (createdAt && typeof createdAt.toDate === "function") return createdAt.toDate();
  if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
  return null;
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getOrderTotal = (order) => {
  const direct = toNumber(order?.total, NaN);
  if (Number.isFinite(direct)) return direct;

  const grandTotal = toNumber(order?.totals?.grandTotal, NaN);
  if (Number.isFinite(grandTotal)) return grandTotal;

  const amountReceived = toNumber(order?.amountReceived, NaN);
  if (Number.isFinite(amountReceived)) return amountReceived / 100;

  const amount = toNumber(order?.amount, NaN);
  if (Number.isFinite(amount)) return amount / 100;

  return 0;
};

const emailToDocId = (email) => encodeURIComponent(email);

const getBookTitle = (item) => {
  if (!item) return "-";
  return String(item.title || item.name || item.bookTitle || "-");
};

const formatOrderDateLabel = (date) => {
  if (!date) return "Date inconnue";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const CustomersAdmin = () => {
  const [customers, setCustomers] = useState([]);
  const [customerMeta, setCustomerMeta] = useState({});
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [openActionsFor, setOpenActionsFor] = useState(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState(null);
  const [detailsCustomer, setDetailsCustomer] = useState(null);
  const [booksCustomer, setBooksCustomer] = useState(null);
  const [loyalOnlyFilter, setLoyalOnlyFilter] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState({});
  const [actionLoadingEmail, setActionLoadingEmail] = useState("");
  const PAGE_SIZE = 20;

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const ordersSnap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
      let metaSnap = null;
      try {
        metaSnap = await getDocs(collection(db, CUSTOMER_META_COLLECTION));
      } catch (metaError) {
        console.warn("Lecture customers_admin indisponible, fallback sans meta:", metaError);
      }

      const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const metaMap = {};
      if (metaSnap) {
        metaSnap.forEach((d) => {
          metaMap[d.id] = d.data();
        });
      }
      setCustomerMeta(metaMap);

      const byEmail = new Map();

      orders.forEach((order) => {
        const status = String(order?.status || "").toLowerCase();
        if (!SUCCESS_STATUSES.has(status)) return;

        const email = String(order?.buyer?.email || "").trim().toLowerCase();
        if (!email) return;

        const orderDate = getDateFromOrder(order);
        const orderTotal = getOrderTotal(order);
        const previous = byEmail.get(email);

        if (!previous) {
          byEmail.set(email, {
            id: order.id,
            email,
            createdAt: orderDate,
            totalOrders: 1,
            totalSpent: orderTotal,
            latestOrder: order,
            books: Array.isArray(order?.items) ? order.items : [],
            orders: [
              {
                id: order.id,
                createdAt: orderDate,
                items: Array.isArray(order?.items) ? order.items : [],
              },
            ],
          });
          return;
        }

        const previousTime = previous.createdAt?.getTime?.() || 0;
        const currentTime = orderDate?.getTime?.() || 0;

        byEmail.set(email, {
          ...previous,
          createdAt: currentTime > previousTime ? orderDate : previous.createdAt,
          totalOrders: previous.totalOrders + 1,
          totalSpent: previous.totalSpent + orderTotal,
          latestOrder: currentTime > previousTime ? order : previous.latestOrder,
          books: previous.books.concat(Array.isArray(order?.items) ? order.items : []),
          orders: previous.orders.concat({
            id: order.id,
            createdAt: orderDate,
            items: Array.isArray(order?.items) ? order.items : [],
          }),
        });
      });

      const list = Array.from(byEmail.values())
        .filter((customer) => {
          const meta = metaMap[emailToDocId(customer.email)];
          return !meta?.deleted;
        })
        .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));

      setCustomers(list);
    } catch (error) {
      console.error("Erreur recuperation clients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const isCustomerLoyal = (customer) => {
    const meta = customerMeta[emailToDocId(customer.email)] || {};
    if (typeof meta.loyal === "boolean") return meta.loyal;
    return customer.totalOrders >= 2;
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = customer.email.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (!loyalOnlyFilter) return true;
    return isCustomerLoyal(customer);
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, customers.length]);

  useEffect(() => {
    setSelectedCustomers([]);
    setOpenActionsFor(null);
    setActionsMenuPosition(null);
  }, [searchTerm, currentPage]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const currentCustomers = filteredCustomers.slice(startIndex, startIndex + PAGE_SIZE);
  const allCurrentPageSelected =
    currentCustomers.length > 0 && currentCustomers.every((c) => selectedCustomers.includes(c.email));

  const toggleSelectAllCurrentPage = () => {
    if (allCurrentPageSelected) {
      setSelectedCustomers((prev) => prev.filter((email) => !currentCustomers.some((c) => c.email === email)));
      return;
    }
    setSelectedCustomers((prev) => {
      const merged = new Set(prev);
      currentCustomers.forEach((c) => merged.add(c.email));
      return Array.from(merged);
    });
  };

  const toggleSelectCustomer = (email) => {
    setSelectedCustomers((prev) =>
      prev.includes(email) ? prev.filter((id) => id !== email) : [...prev, email]
    );
  };

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const kpiTotalClients = customers.length;
  const kpiNewClients = customers.filter((c) => c.createdAt && c.createdAt >= thirtyDaysAgo).length;
  const kpiActiveClients = customers.filter((c) => c.totalOrders >= 1).length;
  const kpiLoyalClients = customers.filter((c) => isCustomerLoyal(c)).length;

  const toggleLoyalty = async (customer) => {
    const email = customer.email;
    const docId = emailToDocId(email);
    const current = isCustomerLoyal(customer);
    const nextLoyal = !current;

    // Optimistic UI update: KPI, badge, button label and star update instantly.
    setCustomerMeta((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        email,
        loyal: nextLoyal,
        deleted: false,
        updatedAt: new Date(),
      },
    }));
    setOpenActionsFor(null);
    setActionsMenuPosition(null);

    try {
      setActionLoadingEmail(email);
      await setDoc(
        doc(db, CUSTOMER_META_COLLECTION, docId),
        {
          email,
          loyal: nextLoyal,
          deleted: false,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Erreur mise a jour fidelisation:", error);
    } finally {
      setActionLoadingEmail("");
    }
  };

  const handleDeleteCustomer = async (customer) => {
    const confirmed = window.confirm(`Supprimer ${customer.email} de la liste clients ?`);
    if (!confirmed) return;

    const email = customer.email;
    const docId = emailToDocId(email);

    try {
      setActionLoadingEmail(email);
      await setDoc(
        doc(db, CUSTOMER_META_COLLECTION, docId),
        {
          email,
          deleted: true,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setCustomers((prev) => prev.filter((c) => c.email !== email));
      setCustomerMeta((prev) => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          email,
          deleted: true,
          updatedAt: new Date(),
        },
      }));
      setOpenActionsFor(null);
      setActionsMenuPosition(null);
    } catch (error) {
      console.error("Erreur suppression client:", error);
    } finally {
      setActionLoadingEmail("");
    }
  };

  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Email"]
        .concat(
          customers.map(
            (c) => `${c.email}`
          )
        )
        .join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "clients_emails.csv");
    document.body.appendChild(link);
    link.click();
  };

  const closeModal = () => {
    setDetailsCustomer(null);
    setBooksCustomer(null);
    setExpandedOrderIds({});
  };

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrderIds((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const toggleActionsMenu = (event, email) => {
    if (openActionsFor === email) {
      setOpenActionsFor(null);
      setActionsMenuPosition(null);
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const estimatedMenuHeight = 190;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = spaceBelow < estimatedMenuHeight;

    const top = openUpward ? triggerRect.top - 8 : triggerRect.bottom + 8;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    );

    setActionsMenuPosition({ top, left, openUpward });
    setOpenActionsFor(email);
  };

  return (
    <div className="admin-page-container customers-admin-page">
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Audience Insight</span>
          <h1>Nos Clients</h1>
        </div>
      </header>

      <div className="stats-mini-grid customers-kpi-grid">
        <div className="mini-stat-card customers-kpi-card">
          <div className="stat-icon"><FaUserShield /></div>
          <div className="stat-info">
            <span className="stat-label">Clients Totaux</span>
            <span className="stat-value">{kpiTotalClients}</span>
          </div>
        </div>
        <div className="mini-stat-card customers-kpi-card">
          <div className="stat-icon"><FaUserShield /></div>
          <div className="stat-info">
            <span className="stat-label">Nouveaux Clients</span>
            <span className="stat-value">{kpiNewClients}</span>
          </div>
        </div>
        <div className="mini-stat-card customers-kpi-card">
          <div className="stat-icon"><FaUserShield /></div>
          <div className="stat-info">
            <span className="stat-label">Clients Actifs</span>
            <span className="stat-value">{kpiActiveClients}</span>
          </div>
        </div>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => setLoyalOnlyFilter((prev) => !prev)}
          style={{
            cursor: "pointer",
            textAlign: "left",
            border: loyalOnlyFilter ? "1px solid rgba(212, 160, 23, 0.65)" : undefined,
            boxShadow: loyalOnlyFilter ? "0 0 0 2px rgba(212, 160, 23, 0.18)" : undefined,
            background: loyalOnlyFilter ? "rgba(212, 160, 23, 0.08)" : undefined,
          }}
          title={loyalOnlyFilter ? "Afficher tous les clients" : "Filtrer les clients fideles"}
          aria-pressed={loyalOnlyFilter}
        >
          <div className="stat-icon"><FaUserShield /></div>
          <div className="stat-info">
            <span className="stat-label">Clients Fideles</span>
            <span className="stat-value">{kpiLoyalClients}</span>
          </div>
        </button>
      </div>

      <div className="inventory-card">
        <div className="card-header customers-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FaEnvelope className="gold-text" />
            <span className="auth-subtitle">Clients (commandes reussies)</span>
          </div>
          <div className="action-cluster customers-actions-head">
            <div className="search-bar-premium customers-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Rechercher un email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="add-btn auth-submit-btn-premium customers-export-btn" onClick={handleExport}>
              <FaDownload /> Exporter CSV
            </button>
          </div>
        </div>

        <div className="customers-table-scroll">
          <table className="premium-table customers-table">
            <thead>
              <tr>
                <th style={{ width: "42px" }}>
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={toggleSelectAllCurrentPage}
                    aria-label="Selectionner tous les clients de la page"
                  />
                </th>
                <th style={{ textAlign: "center" }}>Client</th>
                <th style={{ textAlign: "center" }}>Derniere commande</th>
                <th style={{ textAlign: "center" }}>Total commandes</th>
                <th style={{ textAlign: "center" }}>Depense</th>
                <th style={{ textAlign: "center" }}>Statut</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="table-loader">Chargement des donnees...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan="7" className="empty-table-msg">Aucun client trouve.</td></tr>
              ) : (
                currentCustomers.map((customer) => {
                  const loyal = isCustomerLoyal(customer);
                  const menuOpen = openActionsFor === customer.email;
                  const isBusy = actionLoadingEmail === customer.email;

                  return (
                    <tr key={customer.id} style={{ height: "56px" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(customer.email)}
                          onChange={() => toggleSelectCustomer(customer.email)}
                          aria-label={`Selectionner ${customer.email}`}
                        />
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "left" }}>
                        <div className="email-cell" style={{ justifyContent: "flex-start", minWidth: "220px" }}>
                          <div className="email-icon-bg"><FaEnvelope /></div>
                          <span className="b-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {customer.email}
                            {loyal ? <FaStar size={12} color="#d4a017" title="Client fidele" /> : null}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <div className="date-cell-premium" style={{ justifyContent: "center" }}>
                          <FaCalendarAlt className="gold-text" size={12} />
                          {customer.createdAt?.toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }) || "-"}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{customer.totalOrders}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        {customer.totalSpent.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <span
                          className={`status-badge ${loyal ? "confirmed" : "confirmed"}`}
                          style={
                            loyal
                              ? {
                                  background: "rgba(212, 160, 23, 0.16)",
                                  color: "#7a5700",
                                  borderColor: "rgba(212, 160, 23, 0.45)",
                                }
                              : undefined
                          }
                        >
                          {loyal ? "Fidele" : "Actif"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center", position: "relative", minWidth: "120px" }}>
                        <button
                          className="page-btn"
                          style={{ padding: "6px 10px", minWidth: "32px" }}
                          onClick={(event) => toggleActionsMenu(event, customer.email)}
                        >
                          ...
                        </button>

                        {menuOpen ? (
                          <div
                            style={{
                              position: "fixed",
                              top: `${actionsMenuPosition?.top ?? 0}px`,
                              left: `${actionsMenuPosition?.left ?? 0}px`,
                              transform: actionsMenuPosition?.openUpward ? "translateY(-100%)" : "none",
                              background: "#fff",
                              border: "1px solid rgba(0,0,0,0.1)",
                              borderRadius: "12px",
                              padding: "8px",
                              display: "grid",
                              gap: "6px",
                              minWidth: "220px",
                              zIndex: 20,
                              boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
                            }}
                          >
                            <button className="page-btn" disabled={isBusy} onClick={() => { setDetailsCustomer(customer); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                              Plus d'infos
                            </button>
                            <button className="page-btn" disabled={isBusy} onClick={() => {
                              setBooksCustomer(customer);
                              setExpandedOrderIds({});
                              setOpenActionsFor(null);
                              setActionsMenuPosition(null);
                            }}>
                              Livres commandes
                            </button>
                            <button className="page-btn" disabled={isBusy} onClick={() => toggleLoyalty(customer)}>
                              {loyal ? "Retirer de client fidele" : "Marquer comme client fidele"}
                            </button>
                            <button
                              className="page-btn"
                              disabled={isBusy}
                              onClick={() => handleDeleteCustomer(customer)}
                              style={{ background: "#dc2626", color: "#ffffff", borderColor: "#dc2626" }}
                            >
                              Supprimer
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            className="page-btn"
            disabled={clampedPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Precedent
          </button>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Page {clampedPage} / {totalPages}
          </span>
          <button
            className="page-btn"
            disabled={clampedPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Suivant
          </button>
        </div>
      </div>

      {detailsCustomer ? (
        <div className="popup-overlay" onClick={closeModal}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "820px",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              border: "1px solid rgba(20,20,20,0.14)",
              borderRadius: "12px",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(20,20,20,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Details Client</h2>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Email</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.email}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Total commandes</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.totalOrders}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Depense</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.totalSpent.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Derniere commande</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.createdAt?.toLocaleDateString("fr-FR") || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Nom</strong><p style={{ margin: "6px 0 0" }}>{String(detailsCustomer.latestOrder?.buyer?.name || [detailsCustomer.latestOrder?.buyer?.firstName, detailsCustomer.latestOrder?.buyer?.lastName].filter(Boolean).join(" ") || "-")}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Telephone</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.latestOrder?.buyer?.phone || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Adresse</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.latestOrder?.buyer?.address || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Ville</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.latestOrder?.buyer?.city || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Pays</strong><p style={{ margin: "6px 0 0" }}>{detailsCustomer.latestOrder?.buyer?.country || "-"}</p></div>
              </div>
              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(20,20,20,0.1)", paddingTop: "12px" }}>
                <button className="page-btn" onClick={closeModal}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {booksCustomer ? (
        <div className="popup-overlay" onClick={closeModal}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "820px",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              border: "1px solid rgba(20,20,20,0.14)",
              borderRadius: "12px",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(20,20,20,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Livres Commandes</h2>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(20,20,20,0.1)", fontWeight: 600 }}>Commandes par date</div>
                <div style={{ padding: "8px 12px", display: "grid", gap: "10px" }}>
                  {(booksCustomer.orders || []).length === 0 ? (
                    <div><span>Aucun livre trouve.</span></div>
                  ) : (
                    (booksCustomer.orders || [])
                      .slice()
                      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
                      .map((order) => {
                        const isOpen = Boolean(expandedOrderIds[order.id]);
                        return (
                          <div key={order.id} style={{ padding: "2px 0" }}>
                            <button
                              onClick={() => toggleOrderExpansion(order.id)}
                              style={{
                                width: "100%",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                textAlign: "left",
                                border: "1px solid rgba(20,20,20,0.14)",
                                borderRadius: "12px",
                                background: isOpen ? "rgba(20,20,20,0.04)" : "#ffffff",
                                color: "inherit",
                                padding: "11px 13px",
                                cursor: "pointer",
                                fontWeight: 600,
                                transition: "all 0.2s ease",
                              }}
                            >
                              <span>{formatOrderDateLabel(order.createdAt)}</span>
                              <span
                                style={{
                                  width: "24px",
                                  height: "24px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "999px",
                                  background: isOpen ? "rgba(20,20,20,0.12)" : "rgba(20,20,20,0.06)",
                                  color: "inherit",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s ease, background 0.2s ease",
                                }}
                              >
                                &gt;
                              </span>
                            </button>

                            {isOpen ? (
                              <div style={{ marginTop: "8px", padding: "0 8px 8px", display: "grid", gap: "6px", borderRadius: "10px" }}>
                                {(order.items || []).length === 0 ? (
                                  <div><span>Aucun livre dans cette commande.</span></div>
                                ) : (
                                  (order.items || []).map((item, idx) => (
                                    <div key={`${order.id}-${idx}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 6px", borderRadius: "8px", background: idx % 2 === 0 ? "rgba(20,20,20,0.03)" : "transparent" }}>
                                      <span>{getBookTitle(item)}</span>
                                      <span>x {toNumber(item?.qty || item?.quantity, 1)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(20,20,20,0.1)", paddingTop: "12px" }}>
                <button className="page-btn" onClick={closeModal}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CustomersAdmin;
