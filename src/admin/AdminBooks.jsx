import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db, auth } from "../firebase/config";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getCountFromServer,
  Timestamp,
  query,
  orderBy,
  limit,
  startAfter,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  FaSearch,
  FaPlus,
  FaTimes,
  FaImage,
  FaBook,
  FaTag,
  FaExclamationTriangle,
} from "react-icons/fa";

const CATEGORIES = [
  "Quran & Tafsir",
  "Sciences du Hadith",
  "Fiqh & Jurisprudence",
  "Sira & Biographies",
  "Livres enfants",
  "Tawhid ",
  "Aqida & Croyances"
];

const LANGUAGES = ["arabic", "arabic/fran\u00E7ais", "fran\u00E7ais", "anglais", "arabic/anglais"];

const formatLanguageLabel = (language) =>
  (language || "").toString().replace(/arabic/gi, "Arabe");
const RESULTS_LABEL = `r${String.fromCharCode(233)}sultats`;
const KIDS_CATEGORY_KEYWORDS = ["livres enfants", "enfants", "kids"];

const isKidsBook = (book) => {
  const category = String(book?.category || "").trim().toLowerCase();
  return KIDS_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword));
};

const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const AdminBooks = () => {
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("adultes");
  const [stockLimitValue, setStockLimitValue] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("");
  const [editId, setEditId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [openActionsFor, setOpenActionsFor] = useState(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState(null);
  const [detailsBook, setDetailsBook] = useState(null);
  const [searchPoolAdultes, setSearchPoolAdultes] = useState(null);
  const [searchPoolEnfants, setSearchPoolEnfants] = useState(null);
  const [overviewBooks, setOverviewBooks] = useState([]);

  const [form, setForm] = useState({
    title: "",
    edition: "",
    author: "",
    description: "",
    isbn:"",
    price: "",
    promoPrice: "",
    promoPercent: "",
    stock: "",
    weight: "",
    language: "",
    category: "",
    images: [""],
  });
  const resetForm = () =>
    setForm({
      title: "",
      edition: "",
      author: "",
      description: "",
      isbn: "",
      price: "",
      promoPrice: "",
      promoPercent: "",
      stock: "",
      weight: "",
      language: "",
      category: "",
      images: [""],
    });

  // pagination (server-side)
  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCounts, setTotalCounts] = useState({ total: 0, kids: 0 });

  const formatPrice = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)}\u20AC` : "-";
  };

  const toHtva = (ttcValue) => {
    const n = Number(ttcValue);
    return Number.isFinite(n) ? +(n * 0.79).toFixed(2) : null;
  };

  const hasPromo = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

  const getStockValue = (book) => toFiniteNumber(book?.stock, 0);
  const isOutOfStock = (book) => getStockValue(book) <= 0;
  const isLimitedStock = (book) => {
    const stock = getStockValue(book);
    return stock >= 1 && stock <= 4;
  };

  const truncateText = (value, maxLength = 34) => {
    const text = String(value || "-");
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
  };


  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentPage]);

  const booksCollection = useMemo(() => collection(db, "books"), []);
  const isSearchActive = searchTerm.trim().length > 0;
  const isStockFilterActive = stockLimitValue.trim() !== "";
  const isInventoryFilterActive = inventoryFilter !== "" || isStockFilterActive;
  
  const calculatePromoPrice = (price, percent) => {
  const p = Number(price);
  const pct = Number(percent);
  if (!p || !pct) return "";
    return (p - (p * pct) / 100).toFixed(2);
  };

  const calculatePercent = (price, promoPrice) => {
    const p = Number(price);
    const promo = Number(promoPrice);
    if (!p || !promo) return "";
    return (((p - promo) / p) * 100).toFixed(0);
  };

  /* ================= AUTH & FETCH ================= */
  const buildBooksQuery = useCallback((cursor = null, categoryMode = "adultes") => {
    const constraints = [];
    if (categoryMode === "enfants") {
      constraints.push(where("category", "==", "Livres enfants"));
    }
    constraints.push(orderBy("__name__"));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(PAGE_SIZE + 1));
    return query(booksCollection, ...constraints);
  }, [booksCollection, PAGE_SIZE]);

  const normalizeBook = (docSnap) => {
    const bookData = docSnap.data();
    return {
      ...bookData,
      images: Array.isArray(bookData.images) ? bookData.images : [""],
      id: docSnap.id,
    };
  };

  const ensureSearchPool = useCallback(async (categoryMode) => {
    if (categoryMode === "adultes" && searchPoolAdultes) return;
    if (categoryMode === "enfants" && searchPoolEnfants) return;

    setIsSearchLoading(true);
    try {
      const constraints = [];
      if (categoryMode === "enfants") {
        constraints.push(where("category", "==", "Livres enfants"));
      }
      const snap = await getDocs(query(booksCollection, ...constraints));
      let results = snap.docs.map(normalizeBook);
      if (categoryMode === "adultes") results = results.filter((b) => !isKidsBook(b));
      results.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

      if (categoryMode === "adultes") setSearchPoolAdultes(results);
      else setSearchPoolEnfants(results);
    } catch (err) {
      console.error("Erreur chargement recherche books:", err);
    } finally {
      setIsSearchLoading(false);
    }
  }, [booksCollection, searchPoolAdultes, searchPoolEnfants]);

  const getBooks = useCallback(async (cursor = null, pageIndex = 1, categoryMode = "adultes") => {
    setIsLoading(true);
    let results = [];
    let hasNext = false;
    let lastCursor = cursor;

    if (categoryMode === "enfants") {
      const q = buildBooksQuery(cursor, categoryMode);
      const data = await getDocs(q);
      const docs = data.docs;
      hasNext = docs.length > PAGE_SIZE;
      const pageDocs = hasNext ? docs.slice(0, PAGE_SIZE) : docs;
      results = pageDocs.map(normalizeBook);
      if (pageDocs.length > 0) lastCursor = pageDocs[pageDocs.length - 1];
    } else {
      let done = false;
      while (!done) {
        const q = buildBooksQuery(lastCursor, "adultes");
        const data = await getDocs(q);
        const docs = data.docs;

        if (docs.length === 0) {
          hasNext = false;
          break;
        }

        for (let i = 0; i < docs.length; i += 1) {
          const d = docs[i];
          const bookData = d.data();
          const isKids = isKidsBook(bookData);
          lastCursor = d;
          if (!isKids) {
            results.push(normalizeBook(d));
          }
          if (results.length === PAGE_SIZE) {
            hasNext = i < docs.length - 1 || docs.length === PAGE_SIZE + 1;
            done = true;
            break;
          }
        }

        if (done) break;
        if (docs.length <= PAGE_SIZE) {
          hasNext = false;
          break;
        }
        // Continue fetching to fill the page with non-kids books
      }
    }

    setHasNextPage(hasNext);
    setBooks(results);

    if (results.length > 0 && lastCursor) {
      setPageCursors((prev) => {
        if (prev.length < pageIndex) {
          return [...prev, lastCursor];
        }
        const copy = [...prev];
        copy[pageIndex - 1] = lastCursor;
        return copy;
      });
    }
    setIsLoading(false);
  }, [buildBooksQuery, PAGE_SIZE]);

  const fetchCounts = useCallback(async () => {
    try {
      setIsOverviewLoading(true);
      const [totalSnap, kidsSnap, overviewSnap] = await Promise.all([
        getCountFromServer(query(booksCollection)),
        getCountFromServer(query(booksCollection, where("category", "==", "Livres enfants"))),
        getDocs(query(booksCollection)),
      ]);
      const overview = overviewSnap.docs.map(normalizeBook);
      setOverviewBooks(overview);
      setTotalCounts({
        total: totalSnap.data().count || 0,
        kids: overview.filter(isKidsBook).length || kidsSnap.data().count || 0,
      });
    } catch (err) {
      console.error("Erreur count books:", err);
    } finally {
      setIsOverviewLoading(false);
    }
  }, [booksCollection]);

  /* ================= AUTH & FETCH ================= */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAdminUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setPageCursors([]);
    getBooks(null, 1, categoryFilter);
    fetchCounts();
  }, [categoryFilter, getBooks, fetchCounts]);

  useEffect(() => {
    if (!isSearchActive) return;
    setCurrentPage(1);
    ensureSearchPool(categoryFilter);
  }, [isSearchActive, categoryFilter, ensureSearchPool]);

  useEffect(() => {
    setCurrentPage(1);
  }, [inventoryFilter]);

  useEffect(() => {
    const kids = totalCounts.kids || 0;
    const total = totalCounts.total || 0;
    const adultes = Math.max(0, total - kids);
    const count = categoryFilter === "enfants" ? kids : adultes;
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    if (currentPage > pages) {
      setCurrentPage(1);
      setPageCursors([]);
      getBooks(null, 1, categoryFilter);
    }
  }, [totalCounts, categoryFilter, currentPage, PAGE_SIZE, getBooks]);

  /* ================= IMAGE UPLOAD ================= */
  const handleImageUpload = async (index, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert("Image max 5MB");

    try {
      setIsUploadingImage(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "preset_public"); 

      const res = await fetch(
        "https://api.cloudinary.com/v1_1/djukqnpbs/image/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await res.json();
      const url = data.secure_url;

      setForm((prev) => {
        const imgs = [...prev.images];
        imgs[index] = url;
        return { ...prev, images: imgs };
      });
    } catch (err) {
      console.error(err);
      alert("Erreur upload image Cloudinary.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleAddImageSlot = () => {
    setForm((prev) => {
      if (prev.images.length >= 5) return prev;
      return { ...prev, images: [...prev.images, ""] };
    });
  };

  const handleRemoveImage = (index) => {
    setForm((prev) => {
      if (prev.images.length === 1) return prev;
      return { ...prev, images: prev.images.filter((_, i) => i !== index) };
    });
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adminUser) return alert("Acc\u00E8s refus\u00E9");

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        price: Number(Number(form.price).toFixed(2)),
        promoPrice: form.promoPrice
          ? Number(Number(form.promoPrice).toFixed(2))
          : null,
        promoPercent: form.promoPercent
          ? Number(form.promoPercent)
          : null,
        stock: Number(form.stock),
        weight: Number(form.weight),
        updatedAt: Timestamp.now(),
      };

      if (editId) {
        await updateDoc(doc(db, "books", editId), payload);
      } else {
        await addDoc(booksCollection, { ...payload, createdAt: Timestamp.now() });
      }

      setShowForm(false);
      setEditId(null);
      resetForm();
      setCurrentPage(1);
      setPageCursors([]);
      setSearchPoolAdultes(null);
      setSearchPoolEnfants(null);
      await getBooks(null, 1, categoryFilter);
      fetchCounts();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Supprimer ce livre ?")) {
      await deleteDoc(doc(db, "books", id));
      setCurrentPage(1);
      setPageCursors([]);
      setSearchPoolAdultes(null);
      setSearchPoolEnfants(null);
      await getBooks(null, 1, categoryFilter);
      fetchCounts();
    }
  };

  const handleEdit = (book) => {
    setEditId(book.id);

    const percent = book.price && book.promoPrice
      ? calculatePercent(book.price, book.promoPrice)
      : "";

    setForm({
      title: book.title || "",
      edition: book.edition || "",
      author: book.author || "",
      description: book.description || "",
      isbn: book.isbn || "",
      price: book.price || "",
      promoPrice: book.promoPrice || "",
      promoPercent: percent, // ✅ auto calcul
      stock: book.stock || "",
      weight: book.weight || "",
      language: book.language || "",
      category: book.category || "",
      images: book.images?.length ? book.images : [""],
    });

    setShowForm(true);
  };

  const booksSource = useMemo(() => {
    if (isInventoryFilterActive) {
      return categoryFilter === "enfants"
        ? overviewBooks.filter(isKidsBook)
        : overviewBooks.filter((book) => !isKidsBook(book));
    }
    if (!isSearchActive) return books;
    return categoryFilter === "enfants" ? (searchPoolEnfants || []) : (searchPoolAdultes || []);
  }, [books, categoryFilter, isInventoryFilterActive, isSearchActive, overviewBooks, searchPoolAdultes, searchPoolEnfants]);

  const filteredBooks = (() => {
    let result = [...booksSource];

    if (categoryFilter === "adultes") {
      result = result.filter((b) => (b.category || "").toLowerCase() !== "livres enfants");
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();

      result = result.filter(b =>
        b.title?.toLowerCase().includes(term) ||
        b.author?.toLowerCase().includes(term) ||
        b.category?.toLowerCase().includes(term) ||
        b.edition?.toLowerCase().includes(term) ||
        b.isbn?.toLowerCase().includes(term)
      );
    }

    if (inventoryFilter === "promo") {
      result = result.filter((book) => hasPromo(book.promoPrice));
    }

    if (inventoryFilter === "rupture") {
      result = result.filter(isOutOfStock);
    }

    if (inventoryFilter === "limited") {
      result = result.filter(isLimitedStock);
    }

    if (isStockFilterActive) {
      result = result.filter(isLimitedStock);
    }

    return result;
  })();

  const categoryCount = (() => {
    const kids = totalCounts.kids || 0;
    const total = totalCounts.total || 0;
    const adultes = Math.max(0, total - kids);
    return categoryFilter === "enfants" ? kids : adultes;
  })();

  const computedTotalPages = Math.max(
    1,
    Math.ceil((isSearchActive || isInventoryFilterActive ? filteredBooks.length : categoryCount) / PAGE_SIZE)
  );

  const isTableLoading = isInventoryFilterActive ? isOverviewLoading : (isSearchActive ? isSearchLoading : isLoading);

  useEffect(() => {
    if (!isSearchActive && !isInventoryFilterActive) return;
    if (currentPage > computedTotalPages) setCurrentPage(1);
  }, [computedTotalPages, currentPage, isInventoryFilterActive, isSearchActive]);

  useEffect(() => {
    setOpenActionsFor(null);
    setActionsMenuPosition(null);
  }, [searchTerm, currentPage, categoryFilter, inventoryFilter]);

  const currentBooks = useMemo(() => {
    if (!isSearchActive && !isInventoryFilterActive) return filteredBooks;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBooks.slice(start, start + PAGE_SIZE);
  }, [PAGE_SIZE, currentPage, filteredBooks, isInventoryFilterActive, isSearchActive]);

  const handleNextPage = async () => {
    if (isSearchActive || isInventoryFilterActive) {
      setCurrentPage((prev) => Math.min(computedTotalPages, prev + 1));
      return;
    }

    if (!hasNextPage) return;
    const cursor = pageCursors[currentPage - 1];
    if (!cursor) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await getBooks(cursor, nextPage, categoryFilter);
  };

  const handlePrevPage = async () => {
    if (currentPage <= 1) return;

    if (isSearchActive || isInventoryFilterActive) {
      setCurrentPage((prev) => Math.max(1, prev - 1));
      return;
    }

    const prevCursor = currentPage - 2 >= 0 ? pageCursors[currentPage - 2] : null;
    const prevPage = currentPage - 1;
    setCurrentPage(prevPage);
    await getBooks(prevCursor, prevPage, categoryFilter);
  };

  const toggleActionsMenu = (event, bookId) => {
    if (openActionsFor === bookId) {
      setOpenActionsFor(null);
      setActionsMenuPosition(null);
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const estimatedMenuHeight = 150;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = spaceBelow < estimatedMenuHeight;

    const top = openUpward ? triggerRect.top - 8 : triggerRect.bottom + 8;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    );

    setActionsMenuPosition({ top, left, openUpward });
    setOpenActionsFor(bookId);
  };

  const closeDetailsModal = () => {
    setDetailsBook(null);
  };

  const totalBooks = totalCounts.total || overviewBooks.length || 0;
  const kidsBooksTotal = totalCounts.kids || overviewBooks.filter(isKidsBook).length || 0;
  const adultBooksTotal = Math.max(0, totalBooks - kidsBooksTotal);
  const promoBooksTotal = overviewBooks.filter((book) => hasPromo(book.promoPrice)).length;
  const outOfStockBooksTotal = overviewBooks.filter(isOutOfStock).length;
  const limitedStockBooksTotal = overviewBooks.filter(isLimitedStock).length;

  const toggleInventoryFilter = (filterName) => {
    setStockLimitValue("");
    setInventoryFilter((prev) => (prev === filterName ? "" : filterName));
  };

  const activeKpiStyle = (filterName) =>
    inventoryFilter === filterName
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

  

  return (
    <div className="admin-page-container admin-books-page">
      {/* HEADER */}
      <header className="hub-header-premium">
        <h1>Bibliothèque</h1>
        <button
          className="add-btn auth-submit-btn-premium"
          onClick={() => {
            setShowForm(true);
            setEditId(null);
            resetForm();
          }}
        >
          <FaPlus /> Ajouter un livre
        </button>
      </header>

      <div className="stats-mini-grid customers-kpi-grid">
        <div className="mini-stat-card customers-kpi-card">
          <div className="stat-icon"><FaBook /></div>
          <div className="stat-info">
            <span className="stat-label">Livres Total</span>
            <span className="stat-value">{isOverviewLoading ? "..." : totalBooks}</span>
            <span className="stat-label" style={{ marginTop: "2px" }}>
              Adultes {adultBooksTotal} | Enfants {kidsBooksTotal}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleInventoryFilter("promo")}
          style={activeKpiStyle("promo")}
          title={inventoryFilter === "promo" ? "Afficher tous les livres" : "Filtrer les livres en promotion"}
          aria-pressed={inventoryFilter === "promo"}
        >
          <div className="stat-icon"><FaTag /></div>
          <div className="stat-info">
            <span className="stat-label">Livres en Promotions</span>
            <span className="stat-value">{isOverviewLoading ? "..." : promoBooksTotal}</span>
          </div>
        </button>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleInventoryFilter("rupture")}
          style={activeKpiStyle("rupture")}
          title={inventoryFilter === "rupture" ? "Afficher tous les livres" : "Filtrer les livres en rupture"}
          aria-pressed={inventoryFilter === "rupture"}
        >
          <div className="stat-icon"><FaExclamationTriangle /></div>
          <div className="stat-info">
            <span className="stat-label">Livres en Rupture</span>
            <span className="stat-value">{isOverviewLoading ? "..." : outOfStockBooksTotal}</span>
          </div>
        </button>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => toggleInventoryFilter("limited")}
          style={activeKpiStyle("limited")}
          title={inventoryFilter === "limited" ? "Afficher tous les livres" : "Filtrer le stock limite"}
          aria-pressed={inventoryFilter === "limited"}
        >
          <div className="stat-icon"><FaExclamationTriangle /></div>
          <div className="stat-info">
            <span className="stat-label">Stock Limite</span>
            <span className="stat-value">{isOverviewLoading ? "..." : limitedStockBooksTotal}</span>
          </div>
        </button>
      </div>

      {/* TABLE */}
      <div className="inventory-card">
        <div className="card-header customers-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="auth-subtitle">Catalogue</span>
          </div>
          <div className="action-cluster customers-actions-head">
            <div className="search-bar-premium customers-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Rechercher un livre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filter-pill-group sort-wrapper" style={{ gap: "6px" }}>
                <button
                  className={`filter-pill ${categoryFilter === "adultes" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("adultes")}
                >
                  Adultes
                </button>
                <button
                  className={`filter-pill ${categoryFilter === "enfants" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("enfants")}
                >
                  Enfants
                </button>
            </div>
          </div>
        </div>
        <div className="customers-table-scroll">
          <table className="premium-table customers-table">
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Livre</th>
              <th style={{ textAlign: "center" }}>Prix</th>
              <th style={{ textAlign: "center" }}>Stock</th>
              <th style={{ textAlign: "center" }}>Promotion</th>
              <th style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isTableLoading ? (
              <tr>
                <td colSpan="5" className="table-loader">Chargement...</td>
              </tr>
            ) : currentBooks.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-table-msg">Aucun livre trouve.</td>
              </tr>
            ) : (
              currentBooks.map((book) => {
                const menuOpen = openActionsFor === book.id;
                const promoActive = hasPromo(book.promoPrice);

                return (
                  <tr key={book.id} style={{ height: "56px" }}>
                    <td style={{ padding: "8px 12px", textAlign: "left" }}>
                      <div className="book-cell" style={{ minWidth: "240px" }}>
                        <img src={book.images?.[0] || "/placeholder.jpg"} alt={book.title || "Livre"} />
                        <div>
                          <span className="b-title" title={book.title || ""}>{truncateText(book.title, 36)}</span>
                          <span className="b-author" title={book.author || ""}>{truncateText(book.author, 28)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="price-tag" style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div style={{ display: "grid", gap: "3px" }}>
                        <span>{formatPrice(book.price)} TTC</span>
                        <span style={{ fontSize: "0.78rem", opacity: 0.68 }}>
                          {formatPrice(toHtva(book.price))} HTVA
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>{book.stock ?? "-"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span
                        className="status-badge"
                        style={
                          promoActive
                            ? {
                                background: "rgba(37, 99, 235, 0.12)",
                                color: "#1d4ed8",
                                borderColor: "rgba(37, 99, 235, 0.28)",
                              }
                            : {
                                background: "rgba(100, 116, 139, 0.12)",
                                color: "#64748b",
                                borderColor: "rgba(100, 116, 139, 0.22)",
                              }
                        }
                      >
                        {promoActive ? formatPrice(book.promoPrice) : "Aucune"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", position: "relative", minWidth: "120px" }}>
                      <button
                        className="page-btn"
                        style={{ padding: "6px 10px", minWidth: "32px" }}
                        onClick={(event) => toggleActionsMenu(event, book.id)}
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
                          <button className="page-btn" onClick={() => { setDetailsBook(book); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                            Plus d'infos
                          </button>
                          <button className="page-btn" onClick={() => { handleEdit(book); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                            Modifier
                          </button>
                          <button
                            className="page-btn"
                            onClick={() => { setOpenActionsFor(null); setActionsMenuPosition(null); handleDelete(book.id); }}
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
          {(() => {
            const kids = totalCounts.kids || 0;
            const total = totalCounts.total || 0;
            const adultes = Math.max(0, total - kids);
            const count = categoryFilter === "enfants" ? kids : adultes;
            const pageCount = isSearchActive || isInventoryFilterActive ? computedTotalPages : Math.max(1, Math.ceil(count / PAGE_SIZE));
            return (
              <>
          <button
            className="page-btn"
            disabled={currentPage === 1}
            onClick={handlePrevPage}
          >
            Précédent
          </button>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Page {currentPage} / {pageCount}
          </span>
          <button
            className="page-btn"
            disabled={isSearchActive || isInventoryFilterActive ? currentPage >= computedTotalPages : !hasNextPage}
            onClick={handleNextPage}
          >
            Suivant
          </button>
              </>
            );
          })()}
        </div>

      </div>

      {detailsBook ? (
        <div className="popup-overlay" onClick={closeDetailsModal}>
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
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Details Livre</h2>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Titre</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.title || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Auteur</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.author || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Edition</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.edition || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>ISBN</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.isbn || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Categorie</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.category || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Langue</strong><p style={{ margin: "6px 0 0" }}>{formatLanguageLabel(detailsBook.language) || "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Prix TTC</strong><p style={{ margin: "6px 0 0" }}>{formatPrice(detailsBook.price)}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Prix HTVA</strong><p style={{ margin: "6px 0 0" }}>{formatPrice(toHtva(detailsBook.price))}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Prix promo TTC</strong><p style={{ margin: "6px 0 0" }}>{hasPromo(detailsBook.promoPrice) ? formatPrice(detailsBook.promoPrice) : "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Promo %</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.promoPercent ? `${detailsBook.promoPercent}%` : "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Stock</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.stock ?? "-"}</p></div>
                <div style={{ border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Poids</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.weight ? `${detailsBook.weight} kg` : "-"}</p></div>
                <div style={{ gridColumn: "1 / -1", border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px" }}><strong>Description</strong><p style={{ margin: "6px 0 0" }}>{detailsBook.description || "-"}</p></div>
              </div>
              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(20,20,20,0.1)", paddingTop: "12px" }}>
                <button className="page-btn" onClick={closeDetailsModal}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* FORM POPUP */}
      {showForm && (
        <div className="popup-overlay">
          <form className="popup-card" onSubmit={handleSubmit}>
            <div className="popup-header">
              <h3>{editId ? "Modifier" : "Ajouter"} un livre</h3>
              <button type="button" className="close-btn" onClick={() => setShowForm(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="popup-form">
              <div className="input-group">
                <label>Titre</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Edition</label>
                <input
                  required
                  value={form.edition}
                  onChange={(e) => setForm({ ...form, edition: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Auteur</label>
                <input
                  required
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label>ISBN</label>
                <input
                  type="text"
                  placeholder="ex: 978-2-1234-5678-9"
                  value={form.isbn}
                  onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                />
              </div>

              <div className="form-row-split">
                {/* PRIX TTC */}
                <div className="input-group">
                  <label>Prix TTC</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.price}
                    onChange={(e) => {
                      const price = e.target.value;

                      let updated = { ...form, price };

                      if (form.promoPercent) {
                        updated.promoPrice = calculatePromoPrice(price, form.promoPercent);
                      } else if (form.promoPrice) {
                        updated.promoPercent = calculatePercent(price, form.promoPrice);
                      }

                      setForm(updated);
                    }}
                  />
                </div>

                {/* PRIX PROMO */}
                <div className="input-group">
                  <label>Prix promo TTC</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.promoPrice}
                    onChange={(e) => {
                      const promoPrice = e.target.value;

                      let updated = { ...form, promoPrice };

                      if (form.price) {
                        updated.promoPercent = calculatePercent(form.price, promoPrice);
                      }

                      setForm(updated);
                    }}
                  />
                </div>

                {/* PROMO % */}
                <div className="input-group">
                  <label>Promo %</label>
                  <input
                    type="number"
                    placeholder="ex: 10"
                    value={form.promoPercent}
                    onChange={(e) => {
                      const percent = e.target.value;

                      let updated = { ...form, promoPercent: percent };

                      if (form.price) {
                        updated.promoPrice = calculatePromoPrice(form.price, percent);
                      }

                      setForm(updated);
                    }}
                  />
                </div>
              </div>
              <div className="input-group">
                <label>Stock</label>
                <input
                  type="number"
                  required
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />

              </div>
              
              <div className="input-group">
                <label>Poids (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })}
                  placeholder="ex: 0.45"
                />
              </div>

              <div className="form-row-split">
                <div className="input-group">
                  <label>Langue</label>
                  <select
                    required
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    <option value="">Langue</option>
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {formatLanguageLabel(l)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Cat\u00E9gorie</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">Cat\u00E9gorie</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* IMAGE UPLOAD */}
              <div className="image-upload-zone">
                {form.images.map((img, index) => (
                  <div className="image-slot" key={index}>
                    {img ? (
                      <div className="preview-container">
                        <img src={img} alt={`Book ${index + 1}`} />
                        <button
                          type="button"
                          className="remove-img"
                          onClick={() => handleRemoveImage(index)}
                        >
                          <FaTimes />
                        </button>
                      </div>
                    ) : (
                      <label className="upload-placeholder">
                        <FaImage size={24} />
                        <span>Ajouter une image</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleImageUpload(index, e)}
                          disabled={isUploadingImage}
                        />
                      </label>
                    )}
                  </div>
                ))}
                {form.images.length < 5 && (
                  <button
                    type="button"
                    className="add-image-btn"
                    onClick={handleAddImageSlot}
                    disabled={isUploadingImage}
                  >
                    <FaPlus /> Ajouter une image
                  </button>
                )}
              </div>

              <button type="submit" className="submit-action-btn auth-submit-btn-premium" disabled={isSubmitting}>
                {isSubmitting ? "..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminBooks;
