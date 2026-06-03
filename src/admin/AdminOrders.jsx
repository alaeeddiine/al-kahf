import React, {useCallback, useEffect, useMemo, useState} from "react";
import {app, db} from "../firebase/config";
import {collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, updateDoc} from "firebase/firestore";
import {getFunctions, httpsCallable} from "firebase/functions";
import {
  FaCheckCircle,
  FaCity,
  FaCalendarAlt,
  FaEnvelope,
  FaFlag,
  FaHourglassHalf,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaSearch,
  FaShoppingBag,
  FaTimesCircle,
  FaUser,
} from "react-icons/fa";

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [openActionsFor, setOpenActionsFor] = useState(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [resendingOrderId, setResendingOrderId] = useState("");
  const [invoiceActionMessage, setInvoiceActionMessage] = useState({type: "", text: ""});

  useEffect(() => {
    if (!invoiceActionMessage.text) return;
    const timeoutId = setTimeout(() => {
      setInvoiceActionMessage({type: "", text: ""});
    }, 60_000);
    return () => clearTimeout(timeoutId);
  }, [invoiceActionMessage.text]);

  const PAGE_SIZE = 15;
  const ordersCollection = collection(db, "orders");
  const functionsRegion = process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || "europe-west1";
  const functions = useMemo(() => getFunctions(app, functionsRegion), [functionsRegion]);
  const resendInvoiceEmail = useMemo(
    () => httpsCallable(functions, "resendInvoiceEmail"),
    [functions]
  );
  const COMPANY_INFO = {
    name: "AL KAHF",
    address: "30 Avenue Émile Verhaeren\n1348 Louvain La-Neuve\nBelgique",
    email: "alkahf.be@gmail.com",
    vatNumber: "BE1033560437",
    enterpriseNumber: "1033.560.437",
    paymentMode: "Virement bancaire",
    iban: "LT663250063380783140",
    vatRate: 0.21,
    logoUrl: "https://res.cloudinary.com/djukqnpbs/image/upload/v1771019939/logo_4_ysrb3w.png",
  };

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const getBuyerName = (buyer) => {
    const direct = String(buyer?.name || "").trim();
    if (direct) return direct;
    return [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ").trim();
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

  const currencyFormatter = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

  const formatCurrency = (value) => currencyFormatter.format(toNumber(value, 0));

  const getItemUnitPrice = (item) => toNumber(item?.price, 0);

  const getItemLineTotal = (item) => {
    const qty = Math.max(1, toNumber(item?.quantity, 1));
    return getItemUnitPrice(item) * qty;
  };

  const normalizeStatus = (status) => {
    if (status === "rejected") return "refused";
    return status || "pending";
  };

  const getStatusLabel = (status) => {
    const normalized = normalizeStatus(status);
    if (normalized === "pending" || normalized === "paid") return "En cours";
    if (normalized === "confirmed") return "Confirmé";
    return "Refusé";
  };

  const getStatusClassName = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === "refused" ? "rejected" : normalized;
  };

  const toggleKpiFilter = (status) => {
    setFilterStatus((prev) => (prev === status ? "all" : status));
  };

  const formatRelayPoint = (relayPoint) => {
    if (!relayPoint) return "-";
    if (typeof relayPoint === "string") return relayPoint;
    if (relayPoint.raw) return relayPoint.raw;

    const parts = [
      relayPoint.name,
      [relayPoint.address1, relayPoint.address2].filter(Boolean).join(" "),
      relayPoint.zipCode && relayPoint.city ? `${relayPoint.zipCode} ${relayPoint.city}` : relayPoint.city,
      relayPoint.country,
    ].filter(Boolean);

    return parts.length ? parts.join(", ") : "-";
  };

  const formatPaymentMethod = (order) => {
    if (order?.paymentMethodLabel) return order.paymentMethodLabel;
    if (order?.paymentMethodType) return order.paymentMethodType;
    return "-";
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char] || char;
    });

  const formatDate = (date) =>
    date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const getOrderDateOrNow = (order) => {
    const createdAt = order?.createdAt;
    if (createdAt && typeof createdAt.toDate === "function") return createdAt.toDate();
    if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
    return new Date();
  };

  const getOrderTimeForInvoice = (order) => {
    const createdAt = order?.createdAt;
    if (createdAt && typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
    if (createdAt?.seconds) return createdAt.seconds * 1000;
    return 0;
  };

  const getInvoiceNumber = (order) => {
    const existing = String(order?.invoiceNumber || "").trim();
    if (existing) return existing;

    const year = Number(order?.invoiceYear);
    const sequence = Number(order?.invoiceSequence);
    if (Number.isFinite(year) && year > 2000 && Number.isFinite(sequence) && sequence > 0) {
      return `${year}-${String(Math.floor(sequence)).padStart(4, "0")}`;
    }

    const orderDate = getOrderDateOrNow(order);
    const fallbackYear = orderDate.getFullYear();

    const sortedSameYearOrders = [...orders]
      .filter((o) => getOrderDateOrNow(o).getFullYear() === fallbackYear)
      .sort((a, b) => {
        const delta = getOrderTimeForInvoice(a) - getOrderTimeForInvoice(b);
        if (delta !== 0) return delta;
        return String(a?.id || "").localeCompare(String(b?.id || ""));
      });

    const index = sortedSameYearOrders.findIndex((o) => o?.id === order?.id);
    const fallbackSequence = index >= 0 ? index + 1 : sortedSameYearOrders.length + 1;
    return `${fallbackYear}-${String(Math.max(1, fallbackSequence)).padStart(4, "0")}`;
  };

  const getInvoiceHtml = (order, items, invoiceNumber) => {
    const orderDate = getOrderDateOrNow(order);
    const dueDate = new Date(orderDate);
    dueDate.setMonth(dueDate.getMonth() + 1);

    const vatRate = toNumber(COMPANY_INFO.vatRate, 0.21);

    const lines = items.map((item) => {
      const qty = Math.max(1, toNumber(item?.quantity, 1));
      const unitTtc = getItemUnitPrice(item);
      const totalTtc = unitTtc * qty;
      const unitHtva = unitTtc / (1 + vatRate);
      const unitVat = unitTtc - unitHtva;
      const totalHtva = unitHtva * qty;
      const totalVat = unitVat * qty;
      return {
        description: item?.title || "Article",
        qty,
        unitTtc,
        unitHtva,
        unitVat,
        totalHtva,
        totalVat,
        totalTtc,
      };
    });

    const itemsSubtotalTtc = lines.reduce((acc, line) => acc + line.totalTtc, 0);
    const storedSubtotalTtc = toNumber(order?.totals?.subtotal, NaN);
    const subtotalProductsTtc = Number.isFinite(storedSubtotalTtc) && storedSubtotalTtc > 0
      ? storedSubtotalTtc
      : itemsSubtotalTtc;

    const promoDiscount = Math.max(0, toNumber(order?.totals?.promoDiscountValue, 0));
    const productsNetTtc = Math.max(0, subtotalProductsTtc - promoDiscount);
    const productsHtva = productsNetTtc / (1 + vatRate);
    const productsVat = productsNetTtc - productsHtva;

    const shippingAmount = Math.max(0, toNumber(order?.totals?.shipping, 0));
    const storedGrandTotal = toNumber(order?.totals?.grandTotal, NaN);
    const fallbackTotal = getOrderTotal(order);
    const paidTtc = Number.isFinite(storedGrandTotal) && storedGrandTotal > 0
      ? storedGrandTotal
      : (fallbackTotal > 0 ? fallbackTotal : productsNetTtc + shippingAmount);

    const buyer = order?.buyer || {};
    const buyerStreet = String(buyer?.address || "").trim();
    const buyerZipCode = String(buyer?.zipCode ?? order?.zipCode ?? "").trim();
    const buyerCity = String(buyer?.city ?? order?.city ?? "").trim();
    const buyerCountry = String(buyer?.country ?? order?.country ?? "").trim();
    const buyerZipCity = [buyerZipCode, buyerCity].filter(Boolean).join(" ").trim();
    const buyerAddressLine = [buyerStreet, buyerZipCity, buyerCountry].filter(Boolean).join(" • ");

    const companyAddressParts = String(COMPANY_INFO.address || "")
      .split("\n")
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const companyFooterAddress = companyAddressParts.slice(0, 2).join(" • ");

    const formatCurrencyPdf = (value) => formatCurrency(value).replace(/\u00A0/g, " ");
    const vatRatePercent = `${Math.round(vatRate * 100)}%`;

    return `
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>Facture AL KAHF</title>
          <style>
            @page { size: A4; margin: 12mm; }

            body{
              font-family: Arial, Helvetica, sans-serif;
              background:#fff;
              margin:0;
              color:#111;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page{
              padding:0 60px 30mm 60px;
            }

            /* LOGO */
            .logo{
              text-align:center;
              margin-top:4mm;
            }

            .logo img{
              width:130px;
              display:inline-block;
            }

            .brand{
              text-align:center;
              font-size:30px;
              letter-spacing:1px;
              margin-top:10px;
              font-weight:700;
              font-family: Georgia, "Times New Roman", serif;
            }

            /* TITRE */
            .title{
              margin-top:26px;
              font-size:42px;
              font-weight:900;
              letter-spacing:1px;
            }

            .gold-line{
              height:4px;
              background:#c9a646;
              margin:8px 0 18px 0;
            }

            /* INFOS */
            .info-table{
              width:100%;
              border-collapse:collapse;
            }

            .info-table td{
              padding:6px 4px;
              border-bottom:1px solid #e6e6e6;
              font-size:14px;
            }

            .label{
              width:220px;
              color:#555;
              font-weight:600;
            }

            /* CLIENT */
            .client{
              margin-top:14px;
              font-size:14px;
            }

            .client-title{
              font-weight:bold;
              margin-bottom:10px;
              font-style:italic;
            }

            /* TABLE PRODUITS */
            .products{
              margin-top:14px;
              width:100%;
              border-collapse:collapse;
              font-size:14px;
              table-layout:fixed;
            }

            .products th{
              background:#efe4c7;
              text-align:left;
              padding:9px;
              border:1px solid #e0e0e0;
            }

            .products td{
              padding:9px;
              border:1px solid #e0e0e0;
            }

            .products th:nth-child(1), .products td:nth-child(1) { width: 50%; }
            .products th:nth-child(2), .products td:nth-child(2) { width: 8%; }
            .products th:nth-child(3), .products td:nth-child(3) { width: 14%; }
            .products th:nth-child(4), .products td:nth-child(4) { width: 14%; }
            .products th:nth-child(5), .products td:nth-child(5) { width: 14%; }

            .right{
              text-align:right;
            }

            .center{
              text-align:center;
            }

            .note{
              margin-top:8px;
              font-size:13px;
              color:#666;
            }

            .summary-container{
              width:100%;
              display:flex;
              justify-content:flex-end;
              margin-top:10px;
            }

            .summary{
              width:420px;
              border-collapse:collapse;
              font-size:14px;
              border:1px solid #e0e0e0;
            }

            .summary td{
              padding:8px;
              border-bottom:1px solid #e6e6e6;
            }

            .summary tr td:first-child{
              background:#f7f7f7;
            }

            .summary .sep td{
              border-top:3px solid #c9a646;
            }

            .summary .total-row td{
              border-top:3px solid #c9a646;
              font-weight:bold;
              font-size:24px;
              background:white;
            }

            .summary .total-row td:last-child{
              font-size:28px;
            }

            /* FOOTER */
            .footer{
              position:fixed;
              left:12mm;
              right:12mm;
              bottom:12mm;
              font-size:13px;
              text-align:center;
            }

            .footer-box{
              border-left:5px solid #c9a646;
              padding-left:15px;
              padding-top:6px;
              padding-bottom:6px;
              line-height:1.35;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="logo">
              <img src="${escapeHtml(COMPANY_INFO.logoUrl)}" alt="AL KAHF" />
              <div class="brand">${escapeHtml(COMPANY_INFO.name)}</div>
            </div>

            <div class="title">FACTURE</div>
            <div class="gold-line"></div>

            <table class="info-table">
              <tr>
                <td class="label">Numéro de facture :</td>
                <td>${escapeHtml(String(invoiceNumber || "-"))}</td>
              </tr>
              <tr>
                <td class="label">Date :</td>
                <td>${escapeHtml(formatDate(orderDate))}</td>
              </tr>
              <tr>
                <td class="label">Échéance :</td>
                <td>${escapeHtml(formatDate(dueDate))}</td>
              </tr>
            </table>

            <div class="client">
              <div class="client-title">Facturé à :</div>
              <div><b>Nom / Prénom :</b> ${escapeHtml(getBuyerName(order?.buyer) || "-")}</div>
              <div><b>Adresse :</b> ${escapeHtml(buyerAddressLine || String(buyer?.address || "-"))}</div>
              <div><b>Email :</b> ${escapeHtml(String(order?.buyer?.email || "-"))}</div>
            </div>

            <table class="products">
              <tr>
                <th>Description</th>
                <th class="center">Qté</th>
                <th class="right">Prix HTVA</th>
                <th class="right">TVA (${escapeHtml(vatRatePercent)})</th>
                <th class="right">Total TTC</th>
              </tr>

              ${lines.length ? lines.map((line) => `
                <tr>
                  <td>${escapeHtml(String(line.description))}</td>
                  <td class="center">${escapeHtml(String(line.qty))}</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(line.unitHtva))}</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(line.unitVat))}</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(line.totalTtc))}</td>
                </tr>
              `).join("") : `
                <tr>
                  <td>Aucun article.</td>
                  <td class="center">-</td>
                  <td class="right">0,00 €</td>
                  <td class="right">0,00 €</td>
                  <td class="right">0,00 €</td>
                </tr>
              `}
            </table>

            <div class="note">Prix TTC: TVA incluse. Base HTVA calculée à partir d'un taux de 21%.</div>

            <div class="summary-container">
              <table class="summary">
                <tr>
                  <td>Sous-total produits (TTC)</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(subtotalProductsTtc))}</td>
                </tr>
                <tr>
                  <td>Remise</td>
                  <td class="right">-${escapeHtml(formatCurrencyPdf(promoDiscount))}</td>
                </tr>
                <tr class="sep">
                  <td>Total produits HTVA</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(productsHtva))}</td>
                </tr>
                <tr>
                  <td>TVA incluse (21%)</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(productsVat))}</td>
                </tr>
                <tr>
                  <td>Total produits TTC (sans livraison)</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(productsNetTtc))}</td>
                </tr>
                <tr>
                  <td>Frais de livraison</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(shippingAmount))}</td>
                </tr>
                <tr class="total-row">
                  <td>Total payé TTC</td>
                  <td class="right">${escapeHtml(formatCurrencyPdf(paidTtc))}</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="footer">
            <div class="footer-box">
              Nom : <b>${escapeHtml(COMPANY_INFO.name)}</b> • N° d’entreprise : <b>${escapeHtml(COMPANY_INFO.enterpriseNumber)}</b> • TVA : <b>${escapeHtml(COMPANY_INFO.vatNumber)}</b><br>
              ${escapeHtml(companyFooterAddress)} • IBAN : <b>${escapeHtml(COMPANY_INFO.iban)}</b>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printInvoice = (order) => {
    const invoiceWindow = window.open("", "PRINT", "height=780,width=960");
    if (!invoiceWindow) return;

    const items = Array.isArray(order?.items) ? order.items : [];
    const invoiceNumber = getInvoiceNumber(order);
    invoiceWindow.document.open();
    invoiceWindow.document.write(getInvoiceHtml(order, items, invoiceNumber));
    invoiceWindow.document.close();

    invoiceWindow.onload = () => {
      invoiceWindow.focus();
      invoiceWindow.print();
      invoiceWindow.close();
    };
  };
  const loadOrders = useCallback(async () => {
    try {
      const q = query(ordersCollection, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const allOrders = snap.docs.map((d) => ({id: d.id, ...d.data()}));
      setOrders(allOrders);
    } catch (err) {
      console.error("Erreur chargement commandes:", err);
    }
  }, [ordersCollection]);

  useEffect(() => {
    const q = query(ordersCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const allOrders = snap.docs.map((d) => ({id: d.id, ...d.data()}));
        setOrders(allOrders);
      },
      (err) => {
        console.error("Erreur abonnement commandes (realtime):", err);
        // fallback: one-time fetch
        loadOrders();
      },
    );

    return () => unsubscribe();
  }, [ordersCollection, loadOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchTerm]);

  const decrementBookStockForOrder = async (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const bookItems = items.filter((item) => item && item.id);

    if (bookItems.length === 0) return;

    await Promise.all(
      bookItems.map(async (item) => {
        const qty = Math.max(1, Number(item.quantity || 1));
        const ref = doc(db, "books", item.id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;

          const currentStock = Number(snap.data().stock || 0);
          const nextStock = Math.max(0, currentStock - qty);
          if (nextStock !== currentStock) {
            tx.update(ref, {stock: nextStock});
          }
        });
      })
    );
  };

  const toggleStatus = async (order, newStatus) => {
    try {
      if (newStatus === "confirmed" && order.status !== "confirmed") {
        await decrementBookStockForOrder(order);
      }

      const ref = doc(db, "orders", order.id);
      await updateDoc(ref, {status: newStatus});
      await loadOrders();
      setSelectedOrder((prev) => (prev ? {...prev, status: newStatus} : prev));
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleResendInvoice = async (order) => {
    const orderId = String(order?.id || "").trim();
    const buyerEmail = String(order?.buyer?.email || "").trim();

    if (!orderId) {
      setInvoiceActionMessage({type: "error", text: "Commande invalide."});
      return;
    }
    if (!buyerEmail) {
      setInvoiceActionMessage({type: "error", text: "Aucun email client sur cette commande."});
      return;
    }

    try {
      setResendingOrderId(orderId);
      setInvoiceActionMessage({type: "", text: ""});
      await resendInvoiceEmail({orderId});
      await loadOrders();
      setInvoiceActionMessage({
        type: "success",
        text: `Facture renvoyee avec succes a ${buyerEmail}.`,
      });
    } catch (err) {
      const msg =
        err?.message ||
        "Le renvoi de facture a echoue. Verifiez la configuration email.";
      setInvoiceActionMessage({type: "error", text: msg});
    } finally {
      setResendingOrderId("");
    }
  };


  const getOrderDate = (order) => {
    const createdAt = order?.createdAt;
    if (!createdAt) return null;
    if (typeof createdAt.toDate === "function") return createdAt.toDate();
    if (createdAt.seconds) return new Date(createdAt.seconds * 1000);
    return null;
  };

  const isWithinDateFilter = (order) => {
    const date = getOrderDate(order);
    if (!date || dateFilter === "all") return true;

    const now = new Date();
    const cutoff = new Date(now);
    if (dateFilter === "week") cutoff.setDate(now.getDate() - 7);
    else if (dateFilter === "month") cutoff.setMonth(now.getMonth() - 1);
    else if (dateFilter === "6months") cutoff.setMonth(now.getMonth() - 6);
    else if (dateFilter === "year") cutoff.setFullYear(now.getFullYear() - 1);

    return date >= cutoff;
  };

  const statusFilteredOrders =
    filterStatus === "all"
      ? orders
      : orders.filter((o) => {
          const status = normalizeStatus(o.status);
          if (filterStatus === "pending") {
            return status === "pending" || status === "paid";
          }
          return status === filterStatus;
        });

  const filteredOrders = statusFilteredOrders.filter(isWithinDateFilter);

  const searchQuery = searchTerm.trim().toLowerCase();
  const visibleOrders = searchQuery
    ? filteredOrders.filter((order) => {
        const haystack = [
          getBuyerName(order.buyer),
          order?.buyer?.email,
          order?.buyer?.phone,
          order?.id,
          getStatusLabel(order.status),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchQuery);
      })
    : filteredOrders;

  const totalOrdersKpi = orders.length;
  const pendingOrdersKpi = orders.filter((order) => {
    const status = normalizeStatus(order.status);
    return status === "pending" || status === "paid";
  }).length;
  const confirmedOrdersKpi = orders.filter((order) => normalizeStatus(order.status) === "confirmed").length;
  const refusedOrdersKpi = orders.filter((order) => normalizeStatus(order.status) === "refused").length;

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const currentOrders = visibleOrders.slice(startIndex, startIndex + PAGE_SIZE);

  const activeKpiStyle = (status) =>
    filterStatus === status
      ? {
          cursor: "pointer",
          textAlign: "left",
          border: "1px solid rgba(212, 160, 23, 0.65)",
          boxShadow: "0 0 0 2px rgba(212, 160, 23, 0.18)",
          background: "rgba(212, 160, 23, 0.08)",
        }
      : {
          cursor: "pointer",
          textAlign: "left",
        };

  const toggleActionsMenu = (event, orderId) => {
    if (openActionsFor === orderId) {
      setOpenActionsFor(null);
      setActionsMenuPosition(null);
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const estimatedMenuHeight = 160;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = spaceBelow < estimatedMenuHeight;

    const top = openUpward ? triggerRect.top - 8 : triggerRect.bottom + 8;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    );

    setActionsMenuPosition({top, left, openUpward});
    setOpenActionsFor(orderId);
  };

  return (
    <div className="admin-page-container admin-orders-page">
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Sales Management</span>
          <h1>Gestion des Commandes</h1>
        </div>
      </header>

      <div className="stats-mini-grid customers-kpi-grid">
        <div
          className="mini-stat-card customers-kpi-card"
          style={{textAlign: "left"}}
          title="Total commandes"
          aria-hidden="true"
        >
          <div className="stat-icon"><FaShoppingBag /></div>
          <div className="stat-info">
            <span className="stat-label">Total commandes</span>
            <span className="stat-value">{totalOrdersKpi}</span>
          </div>
        </div>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleKpiFilter("pending")}
          style={activeKpiStyle("pending")}
          title="Filtrer les commandes en cours"
          aria-pressed={filterStatus === "pending"}
        >
          <div className="stat-icon"><FaHourglassHalf /></div>
          <div className="stat-info">
            <span className="stat-label">Commandes en cours</span>
            <span className="stat-value">{pendingOrdersKpi}</span>
          </div>
        </button>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleKpiFilter("confirmed")}
          style={activeKpiStyle("confirmed")}
          title="Filtrer les commandes confirmées"
          aria-pressed={filterStatus === "confirmed"}
        >
          <div className="stat-icon"><FaCheckCircle /></div>
          <div className="stat-info">
            <span className="stat-label">Commandes confirmées</span>
            <span className="stat-value">{confirmedOrdersKpi}</span>
          </div>
        </button>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleKpiFilter("refused")}
          style={activeKpiStyle("refused")}
          title="Filtrer les commandes refusées"
          aria-pressed={filterStatus === "refused"}
        >
          <div className="stat-icon"><FaTimesCircle /></div>
          <div className="stat-info">
            <span className="stat-label">Commandes refusées</span>
            <span className="stat-value">{refusedOrdersKpi}</span>
          </div>
        </button>
      </div>
      <div className="inventory-card">
        {invoiceActionMessage.text && (
          <div
            className={invoiceActionMessage.type === "error" ?
              "form-alert-error invoice-action-msg invoice-action-msg--error" :
              "promo-msg success invoice-action-msg invoice-action-msg--success"}
            style={{marginBottom: "12px"}}
          >
            {invoiceActionMessage.text}
          </div>
        )}
        <div className="card-header customers-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FaShoppingBag className="gold-text" />
            <span className="auth-subtitle">Commandes</span>
          </div>
          <div className="action-cluster customers-actions-head">
            <div className="search-bar-premium customers-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Rechercher une commande..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="search-bar-premium customers-search" style={{ minWidth: "180px" }}>
              <FaCalendarAlt />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                <option value="all">Toutes dates</option>
                <option value="week">7 jours</option>
                <option value="month">30 jours</option>
                <option value="6months">6 mois</option>
                <option value="year">1 an</option>
              </select>
            </div>
          </div>
        </div>

        <div className="customers-table-scroll">
          <table className="premium-table customers-table">
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Client</th>
                <th style={{ textAlign: "center" }}>Contact</th>
                <th style={{ textAlign: "center" }}>Montant</th>
                <th style={{ textAlign: "center" }}>Statut</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-table-msg">Aucune commande trouvée.</td>
                </tr>
              ) : (
                currentOrders.map((order) => (
                  <tr key={order.id} style={{ height: "56px" }}>
                    <td style={{ padding: "8px 12px", textAlign: "left" }}>
                      <div className="email-cell" style={{ justifyContent: "flex-start", minWidth: "220px" }}>
                        <div className="email-icon-bg"><FaShoppingBag /></div>
                        <span className="b-title" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          {getBuyerName(order.buyer) || "Inconnu"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div className="date-cell-premium" style={{ justifyContent: "center" }}>
                        <FaPhoneAlt className="gold-text" size={12} />
                        <span>{order.buyer?.phone || "-"}</span>
                      </div>
                      <div className="date-cell-premium" style={{ justifyContent: "center" }}>
                        <FaEnvelope className="gold-text" size={12} />
                        <span>{order.buyer?.email || "-"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span className="price-tag">{formatCurrency(getOrderTotal(order))}</span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span className={`status-badge ${getStatusClassName(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", position: "relative", minWidth: "120px" }}>
                      <button
                        className="page-btn"
                        style={{ padding: "6px 10px", minWidth: "32px" }}
                        onClick={(event) => toggleActionsMenu(event, order.id)}
                      >
                        ...
                      </button>

                      {openActionsFor === order.id ? (
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
                          <button className="page-btn" onClick={() => { setSelectedOrder(order); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                            Plus d'infos
                          </button>
                          <button className="page-btn" onClick={() => { printInvoice(order); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                            Imprimer
                          </button>
                          <button className="page-btn" onClick={() => { handleResendInvoice(order); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                            Renvoyer facture
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
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
            Précédent
          </button>
          <span style={{fontSize: "0.85rem", opacity: 0.7}}>
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

      {selectedOrder && (
        <div className="popup-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="popup-card order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2 className="auth-title">Détails <span className="gold-text">Commande</span></h2>
              <button className="close-btn" onClick={() => setSelectedOrder(null)}>×</button>
            </div>

            <div className="popup-form">
              <div className="order-grid-info">
                <div className="info-item"><label><FaUser /> Nom complet</label><p>{getBuyerName(selectedOrder.buyer) || "-"}</p></div>
                <div className="info-item"><label><FaPhoneAlt /> Téléphone</label><p>{selectedOrder.buyer?.phone || "-"}</p></div>
                <div className="info-item"><label><FaEnvelope /> Email</label><p>{selectedOrder.buyer?.email || "-"}</p></div>
                <div className="info-item"><label><FaMapMarkerAlt /> Adresse</label><p>{selectedOrder.buyer?.address || "-"}</p></div>
                <div className="info-item"><label><FaCity /> Ville</label><p>{selectedOrder.buyer?.city || "-"}</p></div>
                <div className="info-item"><label><FaFlag /> Pays</label><p>{selectedOrder.buyer?.country || "-"}</p></div>
                <div className="info-item"><label>Code Postal</label><p>{selectedOrder.buyer?.zipCode || "-"}</p></div>
                <div className="info-item"><label>Point Relais</label><p>{formatRelayPoint(selectedOrder.relayPoint)}</p></div>
                <div className="info-item"><label>Méthode Livraison</label><p>{selectedOrder.shippingMethod || "-"}</p></div>
                <div className="info-item"><label>Méthode Paiement</label><p>{formatPaymentMethod(selectedOrder)}</p></div>
                <div className="info-item"><label>Date</label><p>{getOrderDate(selectedOrder)?.toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) || "-"}</p></div>
                <div className="info-item"><label>Poids Total</label>
                  <p>
                    {(Array.isArray(selectedOrder.items) ? selectedOrder.items : [])
                      .reduce((acc, item) => acc + toNumber(item?.weight, 0) * Math.max(1, toNumber(item?.quantity, 1)), 0)} kg
                  </p>
                </div>
              </div>

              <div className="order-items-box">
                <h3 className="premium-tag">Articles commandés</h3>
                <div className="items-list-premium">
                  {(Array.isArray(selectedOrder?.items) ? selectedOrder.items : []).map((item, idx) => (
                    <div key={idx} className="item-row">
                      <span>{item?.title || "Article"} <strong>× {Math.max(1, toNumber(item?.quantity, 1))}</strong></span>
                      <span className="item-price-small">{formatCurrency(getItemLineTotal(item))}</span>
                    </div>
                  ))}
                  <div className="item-row total-row">
                    <span>Total</span>
                    <span className="gold-text">{formatCurrency(getOrderTotal(selectedOrder))}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions-premium">
                <button className="btn-confirm" onClick={() => toggleStatus(selectedOrder, "confirmed")}>
                  <FaCheckCircle /> Confirmer
                </button>
                <button className="btn-reject" onClick={() => toggleStatus(selectedOrder, "refused")}>
                  <FaTimesCircle /> Refuser
                </button>
                <button
                  className="btn-confirm"
                  onClick={() => handleResendInvoice(selectedOrder)}
                  disabled={resendingOrderId === selectedOrder.id}
                >
                  <FaEnvelope /> {resendingOrderId === selectedOrder.id ? "Envoi..." : "Renvoyer facture"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;




