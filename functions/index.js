/* eslint-disable max-len, quote-props */
// Deploy marker: keep this file changed to force a fresh Functions deploy.
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const nodemailer = require("nodemailer");

const stripeSecret = defineSecret("STRIPE_SECRET");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const resendApiKey = defineSecret("RESEND_API_KEY");
const resendFromSecret = defineSecret("RESEND_FROM");
const smtpUrlSecret = defineSecret("SMTP_URL");
const smtpFromSecret = defineSecret("SMTP_FROM");
const adminEmailsSecret = defineSecret("ADMIN_EMAILS");
const mailchimpApiKeySecret = defineSecret("MAILCHIMP_API_KEY");
const mailchimpAudienceIdSecret = defineSecret("MAILCHIMP_AUDIENCE_ID");
const mailchimpServerPrefixSecret = defineSecret("MAILCHIMP_SERVER_PREFIX");

admin.initializeApp();
const firestore = admin.firestore();
const pendingOrdersCollection = firestore.collection("stripePendingOrders");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isLikelyEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

const sanitizeFilenamePart = (value) => String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const getTimestampDateOrNull = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};

const formatInvoiceNumber = (year, sequence) =>
  `${String(year)}-${String(sequence).padStart(4, "0")}`;

const ensureInvoiceNumberForOrder = async (orderRef) => {
  const result = await firestore.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new Error("Order not found for invoice numbering.");

    const order = orderSnap.data() || {};
    const existing = String(order?.invoiceNumber || "").trim();
    if (existing) return {invoiceNumber: existing, order};

    const invoiceDate =
      getTimestampDateOrNull(order?.invoiceIssuedAt) ||
      getTimestampDateOrNull(order?.paidAt) ||
      getTimestampDateOrNull(order?.createdAt) ||
      new Date();
    const year = invoiceDate.getFullYear();
    const counterRef = firestore.collection("invoiceCounters").doc(String(year));
    const counterSnap = await tx.get(counterRef);

    const rawNext = counterSnap.exists ? Number(counterSnap.data()?.next) : 1;
    const next = Number.isFinite(rawNext) && rawNext > 0 ? Math.floor(rawNext) : 1;
    const invoiceNumber = formatInvoiceNumber(year, next);

    tx.set(counterRef, {
      next: next + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    const invoiceIssuedAt =
      order?.invoiceIssuedAt || admin.firestore.FieldValue.serverTimestamp();

    tx.set(orderRef, {
      invoiceNumber,
      invoiceYear: year,
      invoiceSequence: next,
      invoiceIssuedAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      invoiceNumber,
      order: {
        ...order,
        invoiceNumber,
        invoiceYear: year,
        invoiceSequence: next,
      },
    };
  });

  return result;
};

const getMailchimpConfig = () => {
  const apiKey = String(mailchimpApiKeySecret.value() || "").trim();
  const audienceId = String(mailchimpAudienceIdSecret.value() || "").trim();
  const serverPrefixFromSecret = String(mailchimpServerPrefixSecret.value() || "").trim();
  const apiKeySuffix = apiKey.includes("-") ? apiKey.split("-").pop().trim() : "";
  const looksLikeServerPrefix = (value) => /^[a-z]{2}\d+$/i.test(String(value || ""));
  const serverPrefix =
    (looksLikeServerPrefix(apiKeySuffix) && apiKeySuffix) ||
    (looksLikeServerPrefix(serverPrefixFromSecret) && serverPrefixFromSecret) ||
    "";

  if (!apiKey) throw new Error("Missing MAILCHIMP_API_KEY secret.");
  if (!audienceId) throw new Error("Missing MAILCHIMP_AUDIENCE_ID secret.");
  if (!serverPrefix) {
    throw new Error(
        "Missing or invalid Mailchimp server prefix. " +
        `Your API key suffix is "${apiKeySuffix || "unknown"}" (expected something like "us6"). ` +
        "Fix: create/copy a valid Mailchimp Marketing API key that ends with '-usX' (ex: '-us6'), " +
        "then set MAILCHIMP_API_KEY again. You can also set MAILCHIMP_SERVER_PREFIX to 'us6'.",
    );
  }

  if (serverPrefixFromSecret && apiKeySuffix &&
    looksLikeServerPrefix(serverPrefixFromSecret) &&
    looksLikeServerPrefix(apiKeySuffix) &&
    serverPrefixFromSecret.toLowerCase() !== apiKeySuffix.toLowerCase()) {
    console.warn("Mailchimp server prefix mismatch: using API key suffix.", {
      serverPrefixFromSecret,
      serverPrefixFromKey: apiKeySuffix,
    });
  }

  return {apiKey, audienceId, serverPrefix};
};

const getMailchimpAuthHeader = (apiKey) => {
  const token = Buffer.from(`anystring:${apiKey}`).toString("base64");
  return `Basic ${token}`;
};

const mailchimpFetch = async (path, {method = "GET", body = null} = {}) => {
  const {apiKey, serverPrefix} = getMailchimpConfig();
  const url = `https://${serverPrefix}.api.mailchimp.com/3.0${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: getMailchimpAuthHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`Mailchimp fetch failed for ${url}: ${error?.message || String(error)}`);
  }

  if (response.ok) {
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.includes("application/json")) return await response.json();
    return await response.text();
  }

  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch (_) {
    // ignore
  }

  throw new Error(`Mailchimp API error (${response.status}): ${errorBody || "unknown error"}`);
};

const mailchimpUpsertMember = async ({
  email,
  statusIfNew = "subscribed",
  tags = [],
  mergeFields = null,
}) => {
  const {audienceId} = getMailchimpConfig();
  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    throw new Error(`Invalid email: "${String(email || "")}"`);
  }

  const subscriberHash = crypto
      .createHash("md5")
      .update(normalizedEmail)
      .digest("hex");

  await mailchimpFetch(`/lists/${audienceId}/members/${subscriberHash}`, {
    method: "PUT",
    body: {
      email_address: normalizedEmail,
      status_if_new: statusIfNew,
      ...(mergeFields ? {merge_fields: mergeFields} : {}),
    },
  });

  const uniqueTags = Array.from(
      new Set((Array.isArray(tags) ? tags : []).map((t) => String(t || "").trim()).filter(Boolean)),
  );
  if (uniqueTags.length > 0) {
    await mailchimpFetch(`/lists/${audienceId}/members/${subscriberHash}/tags`, {
      method: "POST",
      body: {
        tags: uniqueTags.map((name) => ({name, status: "active"})),
      },
    });
  }

  return {subscriberHash, email: normalizedEmail, tags: uniqueTags};
};

const buildOrderSnapshot = (data) => ({
  items: Array.isArray(data?.items) ? data.items : [],
  shippingMethod: data?.shippingMethod || "",
  relayPoint: data?.relayPoint || null,
  buyer: data?.buyer || null,
  totals: data?.totals || null,
});

const toTitleCase = (value) => {
  if (!value || typeof value !== "string") return "";
  return value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
};

const buildPaymentMethodInfo = (paymentIntent) => {
  const latestCharge = paymentIntent?.charges?.data?.[0] || null;
  const details = latestCharge?.payment_method_details || {};
  const type = details?.type || paymentIntent?.payment_method_types?.[0] || "";

  if (type === "card") {
    const brand = details.card?.brand ?
      toTitleCase(details.card.brand) :
      "Card";
    const last4 = details.card?.last4 || "";
    return {
      paymentMethodType: "card",
      paymentMethodLabel: last4 ? `${brand} **** ${last4}` : brand,
    };
  }

  if (!type) {
    return {
      paymentMethodType: "",
      paymentMethodLabel: "Inconnue",
    };
  }

  return {
    paymentMethodType: type,
    paymentMethodLabel: toTitleCase(type),
  };
};

const writeOrderDocuments = async (orderId, payload) => {
  await Promise.all([
    firestore.collection("adminOrders")
        .doc(orderId)
        .set(payload, {merge: true}),
    firestore.collection("orders").doc(orderId).set(payload, {merge: true}),
  ]);
};

const savePendingOrder = async (paymentIntentId, payload) => {
  await pendingOrdersCollection
      .doc(paymentIntentId)
      .set(payload, {merge: true});
};

const getPendingOrder = async (paymentIntentId) => {
  const snap = await pendingOrdersCollection.doc(paymentIntentId).get();
  return snap.exists ? snap.data() : null;
};

const deletePendingOrder = async (paymentIntentId) => {
  await pendingOrdersCollection.doc(paymentIntentId).delete();
};

const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

const calculateInvoiceBreakdown = (order) => {
  const vatRate = 0.21;
  const totals = order?.totals || {};
  const fallbackSubtotal = (Array.isArray(order?.items) ? order.items : [])
      .reduce((acc, item) => {
        const qty = Math.max(1, Number(item?.quantity || 1));
        const price = Number(item?.price || 0);
        return acc + (price * qty);
      }, 0);

  const subtotalTtc = Number(totals.subtotal || fallbackSubtotal || 0);
  const promoDiscount = Math.max(0, Number(totals.promoDiscountValue || 0));
  const productsTtc = Math.max(0, subtotalTtc - promoDiscount);
  const shipping = Math.max(0, Number(totals.shipping || 0));
  const storedGrandTotal = Number(totals.grandTotal || 0);
  const grandTotal = storedGrandTotal > 0 ? storedGrandTotal : (productsTtc + shipping);
  const productsHtva = productsTtc / (1 + vatRate);
  const productsVat = productsTtc - productsHtva;

  return {
    subtotalTtc,
    promoDiscount,
    productsTtc,
    productsHtva,
    productsVat,
    shipping,
    grandTotal,
    vatRate,
  };
};

const getBaseUrlFromRequest = (req) => {
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || "https";
  const host = String(req.get("host") || "").trim();
  if (!host) return "https://alkahf-41600.web.app";
  return `${protocol}://${host}`;
};

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
};

const buildSitemapXml = (baseUrl, entries) => {
  const xmlEntries = entries.map((entry) => {
    const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
    const changefreq = entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : "";
    const priority = entry.priority ? `<priority>${entry.priority}</priority>` : "";
    return `<url><loc>${baseUrl}${entry.path}</loc>${lastmod}${changefreq}${priority}</url>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xmlEntries}</urlset>`;
};

const buildInvoiceEmailHtml = (invoiceNumber, order) => {
  const buyer = order?.buyer || {};
  const items = Array.isArray(order?.items) ? order.items : [];
  const breakdown = calculateInvoiceBreakdown(order);
  const orderDate =
    getTimestampDateOrNull(order?.invoiceIssuedAt) ||
    getTimestampDateOrNull(order?.paidAt) ||
    getTimestampDateOrNull(order?.createdAt) ||
    new Date();

  const buyerStreet = String(buyer?.address || "").trim();
  const buyerZipCode = String(buyer?.zipCode ?? order?.zipCode ?? "").trim();
  const buyerCity = String(buyer?.city ?? order?.city ?? "").trim();
  const buyerCountry = String(buyer?.country ?? order?.country ?? "").trim();
  const buyerZipCity = [buyerZipCode, buyerCity].filter(Boolean).join(" ").trim();
  const buyerAddressLine = [buyerStreet, buyerZipCity, buyerCountry].filter(Boolean).join(" • ");

  const linesHtml = items.map((item) => {
    const qty = Math.max(1, Number(item?.quantity || 1));
    const unitTtc = Number(item?.price || 0);
    const lineTotalTtc = unitTtc * qty;
    const unitHtva = unitTtc / (1 + breakdown.vatRate);
    const unitVat = unitTtc - unitHtva;
    return `
      <tr>
        <td style="padding:8px;border:1px solid #d6d9df;">${escapeHtml(String(item?.title || "Article"))}</td>
        <td style="padding:8px;border:1px solid #d6d9df;text-align:center;">${escapeHtml(String(qty))}</td>
        <td style="padding:8px;border:1px solid #d6d9df;text-align:right;">${formatCurrency(unitHtva)}</td>
        <td style="padding:8px;border:1px solid #d6d9df;text-align:right;">${formatCurrency(unitVat)}</td>
        <td style="padding:8px;border:1px solid #d6d9df;text-align:right;">${formatCurrency(lineTotalTtc)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:760px;margin:0 auto;padding:18px;">
      <h1 style="margin:0 0 10px;font-size:26px;color:#141414;">FACTURE</h1>
      <p style="margin:0 0 2px;"><strong>AL KAHF</strong></p>
      <p style="margin:0 0 2px;">30 Avenue Émile Verhaeren, 1348 Louvain La-Neuve, Belgique</p>
      <p style="margin:0 0 12px;">Email: alkahf.be@gmail.com | TVA: BE1033560437</p>

      <p style="margin:0 0 2px;"><strong>Numéro de facture :</strong> ${escapeHtml(String(invoiceNumber || "-"))}</p>
      <p style="margin:0 0 10px;"><strong>Date :</strong> ${escapeHtml(orderDate.toLocaleDateString("fr-FR"))}</p>

      <p style="margin:0 0 2px;"><strong>Facturé à:</strong> ${escapeHtml(String(buyer?.name || "-"))}</p>
      <p style="margin:0 0 2px;">${escapeHtml(buyerAddressLine || String(buyer?.address || "-"))}</p>
      <p style="margin:0 0 14px;">${escapeHtml(String(buyer?.email || "-"))}</p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f7efd0;color:#141414;">
            <th style="padding:8px;border:1px solid #d6d9df;text-align:left;">Description</th>
            <th style="padding:8px;border:1px solid #d6d9df;text-align:center;">Qté</th>
            <th style="padding:8px;border:1px solid #d6d9df;text-align:right;">Prix HTVA</th>
            <th style="padding:8px;border:1px solid #d6d9df;text-align:right;">TVA (21%)</th>
            <th style="padding:8px;border:1px solid #d6d9df;text-align:right;">Total TTC</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml || `<tr><td colspan="5" style="padding:8px;border:1px solid #d6d9df;">Aucun article.</td></tr>`}
        </tbody>
      </table>

      <table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;">Sous-total produits (TTC)</td><td style="padding:4px 0;text-align:right;">${formatCurrency(breakdown.subtotalTtc)}</td></tr>
        <tr><td style="padding:4px 0;">Remise</td><td style="padding:4px 0;text-align:right;">-${formatCurrency(breakdown.promoDiscount)}</td></tr>
        <tr><td style="padding:4px 0;">Total produits HTVA</td><td style="padding:4px 0;text-align:right;">${formatCurrency(breakdown.productsHtva)}</td></tr>
        <tr><td style="padding:4px 0;">TVA incluse (21%)</td><td style="padding:4px 0;text-align:right;">${formatCurrency(breakdown.productsVat)}</td></tr>
        <tr><td style="padding:4px 0;">Total produits TTC (sans livraison)</td><td style="padding:4px 0;text-align:right;">${formatCurrency(breakdown.productsTtc)}</td></tr>
        <tr><td style="padding:4px 0;">Frais de livraison</td><td style="padding:4px 0;text-align:right;">${formatCurrency(breakdown.shipping)}</td></tr>
        <tr><td style="padding:8px 0;border-top:2px solid #d4af37;font-size:20px;font-weight:800;color:#141414;">Total payé TTC</td><td style="padding:8px 0;border-top:2px solid #d4af37;text-align:right;font-size:24px;font-weight:900;color:#141414;">${formatCurrency(breakdown.grandTotal)}</td></tr>
      </table>
    </div>
  `;
};

const buildInvoicePdfHtml = (invoiceNumber, order) => {
  const buyer = order?.buyer || {};
  const items = Array.isArray(order?.items) ? order.items : [];
  const breakdown = calculateInvoiceBreakdown(order);
  const vatRatePercent = "21%";
  const orderDate =
    getTimestampDateOrNull(order?.invoiceIssuedAt) ||
    getTimestampDateOrNull(order?.paidAt) ||
    getTimestampDateOrNull(order?.createdAt) ||
    new Date();
  const dueDate = new Date(orderDate);
  dueDate.setMonth(dueDate.getMonth() + 1);
  const logoUrl = "https://res.cloudinary.com/djukqnpbs/image/upload/f_auto,q_auto,w_240/v1771019939/logo_4_ysrb3w.png";

  const formatCurrencyPdf = (value) => formatCurrency(value).replace(/\u00A0/g, " ");

  const buyerStreet = String(buyer?.address || "").trim();
  const buyerZipCode = String(buyer?.zipCode ?? order?.zipCode ?? "").trim();
  const buyerCity = String(buyer?.city ?? order?.city ?? "").trim();
  const buyerCountry = String(buyer?.country ?? order?.country ?? "").trim();
  const buyerZipCity = [buyerZipCode, buyerCity].filter(Boolean).join(" ").trim();
  const buyerAddressLine = [buyerStreet, buyerZipCity, buyerCountry].filter(Boolean).join(" • ");

  const linesHtml = items.map((item) => {
    const qty = Math.max(1, Number(item?.quantity || 1));
    const unitTtc = Number(item?.price || 0);
    const totalTtc = unitTtc * qty;
    const unitHtva = unitTtc / (1 + breakdown.vatRate);
    const unitVat = unitTtc - unitHtva;

    return `
<tr>
<td>${escapeHtml(String(item?.title || "Article"))}</td>
<td class="center">${escapeHtml(String(qty))}</td>
<td class="right">${escapeHtml(formatCurrencyPdf(unitHtva))}</td>
<td class="right">${escapeHtml(formatCurrencyPdf(unitVat))}</td>
<td class="right">${escapeHtml(formatCurrencyPdf(totalTtc))}</td>
</tr>
    `;
  }).join("");

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
      }

      .page{
        padding:0 60px 26mm 60px;
      }

      /* LOGO */
      .logo{
        text-align:center;
        margin-top:6mm;
      }

      .logo img{
        width:140px;
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
        margin-top:34px;
        font-size:44px;
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
        padding:7px 4px;
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
        margin-top:18px;
        font-size:14px;
      }

      .client-title{
        font-weight:bold;
        margin-bottom:10px;
        font-style:italic;
      }

      /* TABLE PRODUITS */
      .products{
        margin-top:18px;
        width:100%;
        border-collapse:collapse;
        font-size:14px;
        table-layout:fixed;
      }

      .products th{
        background:#efe4c7;
        text-align:left;
        padding:10px;
        border:1px solid #e0e0e0;
      }

      .products td{
        padding:10px;
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
        margin-top:14px;
      }

      .summary{
        width:420px;
        border-collapse:collapse;
        font-size:14px;
        border:1px solid #e0e0e0;
      }

      .summary td{
        padding:9px;
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
        font-size:14px;
        text-align:center;
      }

      .footer-box{
        border-left:5px solid #c9a646;
        padding-left:15px;
        padding-top:8px;
        padding-bottom:8px;
        line-height:1.35;
      }
    </style>
  </head>

  <body>
    <div class="page">
      <div class="logo">
        <img src="${escapeHtml(logoUrl)}" alt="AL KAHF" />
        <div class="brand">AL KAHF</div>
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
          <td>${escapeHtml(orderDate.toLocaleDateString("fr-FR"))}</td>
        </tr>
        <tr>
          <td class="label">Échéance :</td>
          <td>${escapeHtml(dueDate.toLocaleDateString("fr-FR"))}</td>
        </tr>
      </table>

      <div class="client">
        <div class="client-title">Facturé à :</div>
        <div><b>Nom / Prénom :</b> ${escapeHtml(String(buyer?.name || "-"))}</div>
        <div><b>Adresse :</b> ${escapeHtml(buyerAddressLine || String(buyer?.address || "-"))}</div>
        <div><b>Email :</b> ${escapeHtml(String(buyer?.email || "-"))}</div>
      </div>

      <table class="products">
        <tr>
          <th>Description</th>
          <th class="center">Qté</th>
          <th class="right">Prix HTVA</th>
          <th class="right">TVA (${vatRatePercent})</th>
          <th class="right">Total TTC</th>
        </tr>

        ${linesHtml || `
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
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.subtotalTtc))}</td>
          </tr>
          <tr>
            <td>Remise</td>
            <td class="right">-${escapeHtml(formatCurrencyPdf(breakdown.promoDiscount))}</td>
          </tr>
          <tr class="sep">
            <td>Total produits HTVA</td>
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.productsHtva))}</td>
          </tr>
          <tr>
            <td>TVA incluse (21%)</td>
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.productsVat))}</td>
          </tr>
          <tr>
            <td>Total produits TTC (sans livraison)</td>
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.productsTtc))}</td>
          </tr>
          <tr>
            <td>Frais de livraison</td>
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.shipping))}</td>
          </tr>
          <tr class="total-row">
            <td>Total payé TTC</td>
            <td class="right">${escapeHtml(formatCurrencyPdf(breakdown.grandTotal))}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="footer">
      <div class="footer-box">
        Nom : <b>AL KAHF</b> • N° d’entreprise : <b>1033.560.437</b> • TVA : <b>BE1033560437</b><br>
        30 Avenue Émile Verhaeren • 1348 Louvain La-Neuve • IBAN : <b>LT663250063380783140</b>
      </div>
    </div>
  </body>
</html>
  `;
};

const toNodeBuffer = (value) => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  return null;
};

const looksLikePdfBuffer = (value) => {
  const buffer = toNodeBuffer(value);
  if (!buffer || buffer.length < 8) return false;
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") return false;
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("ascii");
  return tail.includes("%%EOF");
};

const generateInvoicePdfBuffer = async (invoiceNumber, order) => {
  let browser;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(buildInvoicePdfHtml(invoiceNumber, order), {waitUntil: "load"});
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {top: "0mm", right: "0mm", bottom: "0mm", left: "0mm"},
    });
    const pdfBuffer = toNodeBuffer(pdfBytes);

    if (!looksLikePdfBuffer(pdfBuffer)) {
      const header = pdfBuffer?.subarray?.(0, 16)?.toString("ascii") || "";
      const bytes = pdfBuffer?.length || (pdfBytes?.length || 0);
      throw new Error(`Generated invoice PDF is invalid (header="${header}", bytes=${bytes}).`);
    }

    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
};

const sendInvoiceEmail = async ({to, invoiceNumber, internalOrderId, order}) => {
  const smtpUrl = String(smtpUrlSecret.value() || "").trim();
  const smtpFrom = String(smtpFromSecret.value() || "").trim();
  const defaultSmtpFrom = "AL KAHF <alkahf.be@gmail.com>";
  const smtpSender = smtpFrom || defaultSmtpFrom;
  const safeInvoiceNumber = sanitizeFilenamePart(invoiceNumber) || "AL-KAHF";
  const attachmentFilename = `facture-${safeInvoiceNumber}.pdf`;
  const invoicePdfBuffer = await generateInvoicePdfBuffer(invoiceNumber, order);

  if (smtpUrl) {
    try {
      const transporter = nodemailer.createTransport(smtpUrl);
      await transporter.verify();
      await transporter.sendMail({
        from: smtpSender,
        to,
        subject: invoiceNumber ? `Votre facture AL KAHF` : `Votre facture AL KAHF`,
        html: buildInvoiceEmailHtml(invoiceNumber, order),
        attachments: [
          {
            filename: attachmentFilename,
            content: invoicePdfBuffer,
            contentType: "application/pdf",
            contentDisposition: "attachment",
          },
        ],
      });
      return;
    } catch (smtpError) {
      console.error("SMTP send failed, fallback to Resend:", smtpError);
    }
  }

  const apiKey = String(resendApiKey.value() || "").trim();
  if (!apiKey) {
    if (smtpUrl) {
      throw new Error("SMTP configured but failed, and RESEND_API_KEY is missing.");
    }
    throw new Error("Missing RESEND_API_KEY secret.");
  }

  const invoicePdfBase64 = invoicePdfBuffer.toString("base64");
  const configuredFrom = String(resendFromSecret.value() || "").trim();
  const primaryFrom = configuredFrom || "AL KAHF <facture@alkahf.be>";
  const fallbackFrom = "AL KAHF <onboarding@resend.dev>";

  const sendWithFrom = async (fromAddress) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: invoiceNumber ? `Votre facture AL KAHF #${invoiceNumber}` : `Votre facture AL KAHF`,
        html: buildInvoiceEmailHtml(invoiceNumber, order),
        attachments: [
          {
            filename: attachmentFilename,
            content: invoicePdfBase64,
            content_type: "application/pdf",
          },
        ],
      }),
    });

    if (response.ok) return;
    const body = await response.text();
    const domainNotVerified = /domain is not verified/i.test(body);
    const resendError = new Error(`Resend API error (${response.status}): ${body}`);
    resendError.status = response.status;
    resendError.body = body;
    resendError.domainNotVerified = domainNotVerified;
    throw resendError;
  };

  try {
    await sendWithFrom(primaryFrom);
  } catch (primaryError) {
    const canTryFallback =
      primaryError?.status === 403 &&
      primaryError?.domainNotVerified &&
      primaryFrom !== fallbackFrom;

    if (canTryFallback) {
      try {
        await sendWithFrom(fallbackFrom);
        return;
      } catch (fallbackError) {
        throw new Error(
            `Resend API error (${fallbackError.status}): ${fallbackError.body}. ` +
            "Action requise: verifier le domaine alkahf.be sur Resend et configurer le secret RESEND_FROM (ex: AL KAHF <facture@alkahf.be>).",
        );
      }
    }

    throw new Error(`Resend API error (${primaryError.status}): ${primaryError.body}`);
  }
};

const upsertPaidOrderAndTrySendInvoice = async ({
  paymentIntent,
  source = "unknown",
  webhookEventId = null,
}) => {
  const pendingOrder = await getPendingOrder(paymentIntent.id);
  const paymentMethodInfo = buildPaymentMethodInfo(paymentIntent);
  const orderRef = firestore.collection("orders").doc(paymentIntent.id);
  const existingOrderSnap = await orderRef.get();
  const existingOrder = existingOrderSnap.exists ? existingOrderSnap.data() : null;

  await writeOrderDocuments(paymentIntent.id, {
    paymentIntentId: paymentIntent.id,
    paymentStatus: paymentIntent.status,
    status: "paid",
    amount: pendingOrder?.amount || existingOrder?.amount || paymentIntent.amount,
    amountReceived: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    items: pendingOrder?.items || existingOrder?.items || [],
    shippingMethod: pendingOrder?.shippingMethod || existingOrder?.shippingMethod || "",
    relayPoint: pendingOrder?.relayPoint || existingOrder?.relayPoint || null,
    buyer: pendingOrder?.buyer || existingOrder?.buyer || null,
    totals: pendingOrder?.totals || existingOrder?.totals || null,
    paymentMethodType: paymentMethodInfo.paymentMethodType,
    paymentMethodLabel: paymentMethodInfo.paymentMethodLabel,
    webhookEventId: webhookEventId || existingOrder?.webhookEventId || null,
    createdAt:
      existingOrder?.createdAt ||
      pendingOrder?.createdAt ||
      admin.firestore.FieldValue.serverTimestamp(),
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source,
  });

  const latestOrderSnap = await orderRef.get();
  const latestOrder = latestOrderSnap.exists ? latestOrderSnap.data() : null;
  const buyerEmail = latestOrder?.buyer?.email || "";
  const alreadySent = Boolean(latestOrder?.invoiceEmailSentAt);
  const shouldSendInvoice = Boolean(buyerEmail) && !alreadySent;

  if (shouldSendInvoice) {
    try {
      const {invoiceNumber} = await ensureInvoiceNumberForOrder(orderRef);
      await sendInvoiceEmail({
        to: buyerEmail,
        invoiceNumber,
        internalOrderId: paymentIntent.id, // reste admin
        order: {
          items: latestOrder?.items || [],
          buyer: latestOrder?.buyer || null,
          totals: latestOrder?.totals || null,
          createdAt: latestOrder?.createdAt || null,
          paidAt: latestOrder?.paidAt || null,
          invoiceNumber,
        },
      });
      await writeOrderDocuments(paymentIntent.id, {
        invoiceEmailStatus: "sent",
        invoiceEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        invoiceEmailError: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (emailError) {
      await writeOrderDocuments(paymentIntent.id, {
        invoiceEmailStatus: "failed",
        invoiceEmailError: emailError.message || "Invoice email failed",
        invoiceEmailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw emailError;
    }
  }

  if (pendingOrder) {
    await deletePendingOrder(paymentIntent.id);
  }

  return {
    orderId: paymentIntent.id,
    alreadySent,
    invoiceEmailStatus: shouldSendInvoice ? "sent" : (alreadySent ? "already_sent" : "skipped_no_email"),
  };
};

const normalizeStripeSecret = (raw) => String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");

const getValidatedStripeSecret = () => {
  const secret = normalizeStripeSecret(stripeSecret.value());
  if (!/^sk_(live|test)_/.test(secret)) {
    throw new HttpsError(
        "failed-precondition",
        "Invalid STRIPE_SECRET configuration on server.",
    );
  }
  return secret;
};

const getAllowedAdminEmails = () => {
  const raw = String(adminEmailsSecret.value() || "").trim();
  const fromSecret = raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

  if (fromSecret.length > 0) return fromSecret;
  return ["alkahf.be@gmail.com"];
};

const assertAdminCaller = (request) => {
  const auth = request.auth;
  const email = String(auth?.token?.email || "").toLowerCase().trim();
  if (!auth?.uid || !email) {
    throw new HttpsError(
        "unauthenticated",
        "Authentification requise pour cette action admin.",
    );
  }

  const allowedEmails = getAllowedAdminEmails();
  if (!allowedEmails.includes(email)) {
    throw new HttpsError(
        "permission-denied",
        "Acces refuse: permissions admin requises.",
    );
  }
};

exports.sitemap = onRequest(
    {
      region: "europe-west1",
    },
    async (req, res) => {
      if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const baseUrl = getBaseUrlFromRequest(req);

      const staticEntries = [
        {path: "/", changefreq: "daily", priority: "1.0"},
        {path: "/about", changefreq: "monthly", priority: "0.7"},
        {path: "/books", changefreq: "daily", priority: "0.9"},
        {path: "/kids", changefreq: "weekly", priority: "0.8"},
        {path: "/packs", changefreq: "daily", priority: "0.9"},
        {path: "/promos", changefreq: "daily", priority: "0.8"},
        {path: "/checkout", changefreq: "weekly", priority: "0.6"},
        {path: "/relay-point", changefreq: "weekly", priority: "0.5"},
        {path: "/LegalNotice", changefreq: "yearly", priority: "0.3"},
        {path: "/PrivacyPolicy", changefreq: "yearly", priority: "0.3"},
        {path: "/TermsOfUse", changefreq: "yearly", priority: "0.3"},
        {path: "/TermsOfSale", changefreq: "yearly", priority: "0.3"},
      ];

      try {
        const [booksSnap, packsSnap] = await Promise.all([
          firestore.collection("books").get(),
          firestore.collection("packs").get(),
        ]);

        const dynamicBookEntries = booksSnap.docs.map((doc) => {
          const data = doc.data() || {};
          return {
            path: `/book/${encodeURIComponent(doc.id)}`,
            lastmod: toIsoDate(data.updatedAt || data.createdAt),
            changefreq: "weekly",
            priority: "0.8",
          };
        });

        const dynamicPackEntries = packsSnap.docs.map((doc) => {
          const data = doc.data() || {};
          return {
            path: `/pack/${encodeURIComponent(doc.id)}`,
            lastmod: toIsoDate(data.updatedAt || data.createdAt),
            changefreq: "weekly",
            priority: "0.8",
          };
        });

        const xml = buildSitemapXml(baseUrl, [
          ...staticEntries,
          ...dynamicBookEntries,
          ...dynamicPackEntries,
        ]);

        res.set("Content-Type", "application/xml; charset=UTF-8");
        res.set("Cache-Control", "public, max-age=3600");
        res.status(200).send(xml);
      } catch (error) {
        console.error("Sitemap generation failed:", error);
        res.status(500).send("Sitemap generation failed");
      }
    },
);

exports.createPaymentIntent = onCall(
    {
      region: "europe-west1",
      secrets: [stripeSecret],
    },
    async (request) => {
      const {amount, currency} = request.data || {};
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new HttpsError(
            "invalid-argument",
            "amount must be a positive integer in cents.",
        );
      }
      if (typeof currency !== "string" || currency.trim().length < 3) {
        throw new HttpsError(
            "invalid-argument",
            "currency is required.",
        );
      }

      const stripe = require("stripe")(getValidatedStripeSecret());
      try {
        const orderSnapshot = buildOrderSnapshot(request.data?.order);
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          automatic_payment_methods: {enabled: true},
        });

        await savePendingOrder(paymentIntent.id, {
          paymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status,
          amount,
          currency,
          status: "pending",
          items: orderSnapshot.items,
          shippingMethod: orderSnapshot.shippingMethod,
          relayPoint: orderSnapshot.relayPoint,
          buyer: orderSnapshot.buyer,
          totals: orderSnapshot.totals,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      } catch (error) {
        throw new HttpsError("internal", error.message);
      }
    },
);

exports.finalizeOrderAfterPayment = onCall(
    {
      region: "europe-west1",
      timeoutSeconds: 120,
      memory: "1GiB",
      secrets: [stripeSecret, resendApiKey, resendFromSecret, smtpUrlSecret, smtpFromSecret],
    },
    async (request) => {
      const paymentIntentId = String(request.data?.paymentIntentId || "").trim();
      if (!paymentIntentId) {
        throw new HttpsError("invalid-argument", "paymentIntentId is required.");
      }

      const stripe = require("stripe")(getValidatedStripeSecret());
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (error) {
        throw new HttpsError(
            "not-found",
            `PaymentIntent introuvable: ${error.message || "unknown error"}`,
        );
      }

      if (paymentIntent.status !== "succeeded") {
        throw new HttpsError(
            "failed-precondition",
            `PaymentIntent status is ${paymentIntent.status}, expected succeeded.`,
        );
      }

      try {
        const result = await upsertPaidOrderAndTrySendInvoice({
          paymentIntent,
          source: "stripe_finalize_callable",
        });
        return {
          ok: true,
          ...result,
        };
      } catch (error) {
        throw new HttpsError(
            "internal",
            error?.message || "Failed to finalize order and send invoice email.",
        );
      }
    },
);

exports.resendInvoiceEmail = onCall(
    {
      region: "europe-west1",
      timeoutSeconds: 120,
      memory: "1GiB",
      secrets: [resendApiKey, resendFromSecret, smtpUrlSecret, smtpFromSecret, adminEmailsSecret],
    },
    async (request) => {
      assertAdminCaller(request);

      const orderId = String(request.data?.orderId || "").trim();
      if (!orderId) {
        throw new HttpsError("invalid-argument", "orderId is required.");
      }

      const orderRef = firestore.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", "Commande introuvable.");
      }

      const order = orderSnap.data() || {};
      const buyerEmail = String(order?.buyer?.email || "").trim();
      if (!buyerEmail) {
        throw new HttpsError(
            "failed-precondition",
            "Aucun email client sur cette commande.",
        );
      }

      const paymentStatus = String(order?.paymentStatus || "").toLowerCase();
      const status = String(order?.status || "").toLowerCase();
      const isPaid = paymentStatus === "succeeded" || status === "paid" || status === "confirmed";
      if (!isPaid) {
        throw new HttpsError(
            "failed-precondition",
            "La commande n'est pas marquee comme payee.",
        );
      }

      try {
        const {invoiceNumber} = await ensureInvoiceNumberForOrder(orderRef);
        await sendInvoiceEmail({
          to: buyerEmail,
          invoiceNumber,
          order: {
            items: Array.isArray(order?.items) ? order.items : [],
            buyer: order?.buyer || null,
            totals: order?.totals || null,
            createdAt: order?.createdAt || null,
            paidAt: order?.paidAt || null,
            invoiceNumber,
          },
        });

        await writeOrderDocuments(orderId, {
          invoiceEmailStatus: "sent",
          invoiceEmailError: null,
          invoiceEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          invoiceEmailResentAt: admin.firestore.FieldValue.serverTimestamp(),
          invoiceEmailResendCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          ok: true,
          orderId,
          recipient: buyerEmail,
        };
      } catch (error) {
        await writeOrderDocuments(orderId, {
          invoiceEmailStatus: "failed",
          invoiceEmailError: error?.message || "Invoice resend failed",
          invoiceEmailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new HttpsError(
            "internal",
            error?.message || "Echec du renvoi de facture.",
        );
      }
    },
);

exports.resequenceInvoices2026 = onCall(
    {
      region: "europe-west1",
      timeoutSeconds: 120,
      memory: "512MiB",
      secrets: [adminEmailsSecret],
    },
    async (request) => {
      assertAdminCaller(request);

      const year = 2026;
      const expectedCount = 26;
      const dryRun = request.data?.dryRun !== false;

      const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

      let snap;
      try {
        snap = await firestore
            .collection("orders")
            .where("createdAt", ">=", start)
            .where("createdAt", "<", end)
            .orderBy("createdAt", "asc")
            .get();
      } catch (error) {
        throw new HttpsError(
            "failed-precondition",
            `Impossible de charger les commandes 2026 (index manquant?): ${error?.message || "unknown error"}`,
        );
      }

      const orders = snap.docs.map((doc) => ({
        id: doc.id,
        ref: doc.ref,
        data: doc.data() || {},
      }));

      const sorted = [...orders].sort((a, b) => {
        const aDate =
          getTimestampDateOrNull(a.data?.createdAt) ||
          getTimestampDateOrNull(a.data?.paidAt) ||
          getTimestampDateOrNull(a.data?.invoiceIssuedAt) ||
          new Date(0);
        const bDate =
          getTimestampDateOrNull(b.data?.createdAt) ||
          getTimestampDateOrNull(b.data?.paidAt) ||
          getTimestampDateOrNull(b.data?.invoiceIssuedAt) ||
          new Date(0);

        const delta = aDate.getTime() - bDate.getTime();
        if (delta !== 0) return delta;
        return String(a.id).localeCompare(String(b.id));
      });

      if (sorted.length !== expectedCount) {
        throw new HttpsError(
            "failed-precondition",
            `Nombre de commandes 2026 inattendu: ${sorted.length} (attendu ${expectedCount}). ` +
            "Vérifiez les dates createdAt ou ajustez expectedCount dans le code.",
        );
      }

      const changes = sorted.map((entry, idx) => {
        const sequence = idx + 1;
        const newInvoiceNumber = formatInvoiceNumber(year, sequence);
        return {
          orderId: entry.id,
          previousInvoiceNumber: String(entry.data?.invoiceNumber || "").trim() || null,
          invoiceNumber: newInvoiceNumber,
          invoiceYear: year,
          invoiceSequence: sequence,
        };
      });

      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          year,
          count: sorted.length,
          first: changes[0] || null,
          last: changes[changes.length - 1] || null,
          changes,
        };
      }

      const batch = firestore.batch();
      changes.forEach((change) => {
        const orderRef = firestore.collection("orders").doc(change.orderId);
        batch.set(orderRef, {
          invoiceNumber: change.invoiceNumber,
          invoiceYear: change.invoiceYear,
          invoiceSequence: change.invoiceSequence,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      });

      const counterRef = firestore.collection("invoiceCounters").doc(String(year));
      batch.set(counterRef, {
        next: expectedCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      await batch.commit();

      return {
        ok: true,
        dryRun: false,
        year,
        count: sorted.length,
        first: changes[0] || null,
        last: changes[changes.length - 1] || null,
      };
    },
);

exports.stripeWebhook = onRequest(
    {
      region: "europe-west1",
      timeoutSeconds: 120,
      memory: "1GiB",
      secrets: [stripeSecret, stripeWebhookSecret, resendApiKey, resendFromSecret, smtpUrlSecret, smtpFromSecret],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string") {
        res.status(400).send("Missing stripe-signature header");
        return;
      }

      const stripe = require("stripe")(getValidatedStripeSecret());
      let event;
      try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            stripeWebhookSecret.value(),
        );
      } catch (error) {
        res.status(400).send(`Webhook Error: ${error.message}`);
        return;
      }

      try {
        if (event.type === "payment_intent.succeeded") {
          const paymentIntent = event.data.object;
          try {
            await upsertPaidOrderAndTrySendInvoice({
              paymentIntent,
              source: "stripe_webhook",
              webhookEventId: event.id,
            });
          } catch (emailError) {
            console.error("Invoice email failed from webhook:", emailError);
          }
        }

        if (event.type === "payment_intent.payment_failed") {
          const paymentIntent = event.data.object;
          await savePendingOrder(paymentIntent.id, {
            paymentIntentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
            status: "failed",
            lastPaymentError:
              paymentIntent.last_payment_error?.message || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        res.status(200).json({received: true});
      } catch (error) {
        res.status(500).json({error: error.message});
      }
    },
);

exports.syncNewsletterToMailchimp = onDocumentCreated(
    {
      region: "europe-west1",
      document: "newsletter/{docId}",
      secrets: [mailchimpApiKeySecret, mailchimpAudienceIdSecret, mailchimpServerPrefixSecret],
    },
    async (event) => {
      const data = event.data?.data?.() || {};
      const email = normalizeEmail(data?.email);
      if (!email) return;

      try {
        await mailchimpUpsertMember({
          email,
          statusIfNew: "subscribed",
          tags: ["newsletter"],
        });
      } catch (error) {
        console.error("Mailchimp newsletter sync failed:", {
          docId: event.params?.docId || null,
          email,
          message: error?.message || String(error),
        });
      }
    },
);
