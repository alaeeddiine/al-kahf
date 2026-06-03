import React, { useEffect, useState } from "react";
import { getBooksByCategory } from "../firebase/config";
import { useLocation, Link } from "react-router-dom";
import {
  FaTimes,
  FaSortAmountDown,
  FaSearch,
} from "react-icons/fa";

/* 🔥 FIRESTORE PROMOS */
import { db } from "../firebase/config";
import { collection, getDocs, query, where } from "firebase/firestore";

/* Prix stocke en base = TTC */
const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);

/* ---------- PRICE FORMAT ---------- */
const formatPrice = (price) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(price);

/* ---------- PROMO UTILS ---------- */
const applyPromo = (price, promo) => {
  if (!promo || promo.amount == null) return price;
  return +(price * (1 - promo.amount / 100)).toFixed(2);
};

const headerBg =
  "https://res.cloudinary.com/djukqnpbs/image/upload/f_auto,q_auto/kids-banner_nmdbk6";

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/f_auto,q_auto/kids_jxrz0q";

const KidsBooks = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [currentPage, setCurrentPage] = useState(1);
  const getPagesPerGroup = (width) => {
    if (width <= 360) return 3;
    if (width <= 480) return 4;
    if (width <= 768) return 5;
    return 6;
  };
  const [pagesPerGroup, setPagesPerGroup] = useState(
    typeof window !== "undefined"
      ? getPagesPerGroup(window.innerWidth)
      : 6
  );

  const location = useLocation();

  const BOOKS_PER_PAGE = 12;

  const sortOptions = [
    { value: "default", label: "Par défaut" },
    { value: "stock-limited", label: "Stock limité" },
    { value: "price-asc", label: "Prix croissant" },
    { value: "price-desc", label: "Prix décroissant" },
    { value: "title", label: "Ordre alphabétique" },
  ];

  /* ---------- PROMOS ---------- */
  const getGeneralPromos = async () => {
    const q = query(
      collection(db, "promos"),
      where("active", "==", true),
      where("type", "==", "general")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  /* ---------- LOAD BOOKS ---------- */
  useEffect(() => {
    const loadKidsBooks = async () => {
      setLoading(true);

      let data = await getBooksByCategory("Livres enfants");

      const promos = await getGeneralPromos();
      const promo = promos.find(
        (p) => p.appliesTo === "all" || p.appliesTo === "books"
      );

      if (promo) {
        data = data.map((book) => ({
          ...book,
          promoPrice: applyPromo(book.price, promo),
        }));
      }

      setBooks(data);
      setFilteredBooks(data);
      setLoading(false);
    };

    loadKidsBooks();
  }, [location.state]);

  /* ---------- FILTER & SORT ---------- */
  useEffect(() => {
    let result = [...books];

    if (searchTerm.trim()) {
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          b.author.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (sortBy === "stock-limited") {
      result = result.filter((b) => {
        const stock = Number(b?.stock ?? 0);
        return stock === 1 || stock === 2;
      });
    }

    if (sortBy === "price-asc") result.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") result.sort((a, b) => b.price - a.price);
    else if (sortBy === "title")
      result.sort((a, b) => a.title.localeCompare(b.title));

    setFilteredBooks(result);
    setCurrentPage(1);
  }, [searchTerm, sortBy, books]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  useEffect(() => {
    const handleResize = () => {
      setPagesPerGroup(getPagesPerGroup(window.innerWidth));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const indexOfLastBook = currentPage * BOOKS_PER_PAGE;
  const indexOfFirstBook = indexOfLastBook - BOOKS_PER_PAGE;
  const currentBooks = filteredBooks.slice(
    indexOfFirstBook,
    indexOfLastBook
  );
  const totalPages = Math.ceil(filteredBooks.length / BOOKS_PER_PAGE);
  const PAGES_PER_GROUP = pagesPerGroup;
  const currentGroup = Math.floor((currentPage - 1) / PAGES_PER_GROUP);
  const startPage = currentGroup * PAGES_PER_GROUP + 1;
  const endPage = Math.min(startPage + PAGES_PER_GROUP - 1, totalPages);

  return (
    <div className="books-page">
      {/* HERO */}
      <div className="kids-hero-banner">
        <div
          className="hero-bg-container"
          style={{ backgroundImage: `url(${headerBg})` }}
        ></div>
        <div className="hero-content">
          <img src={logo} alt="Kids Books" className="books-logo-main" />
        </div>
      </div>

      {/* SEARCH & SORT */}
      <div className="container-inner">
        <div className="books-tools kids-books-tools">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <FaTimes
                className="clear-search"
                onClick={() => setSearchTerm("")}
              />
            )}
          </div>

          <div className="sort-wrapper">
            <FaSortAmountDown className="sort-icon" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <br />

      {/* BOOKS GRID */}
      <div className="container-inner">
        {loading ? (
          <div className="loading-state">Chargement des livres...</div>
        ) : (
          <>
            <p className="results-text">
              {filteredBooks.length} ouvrages trouvés
            </p>

            <div className="books-grid">
              {currentBooks.map((book) => (
                <Link
                  key={book.id}
                  to={`/book/${encodeURIComponent(book.id)}`}
                  state={{ bookData: book }}
                  className="book-card-link"
                >
                  <div className="book-card">
                    <div className="book-image">
                      {(() => {
                        const basePrice = Number(book.price);
                        const promoPrice = Number(book.promoPrice);
                        const hasDiscount =
                          Number.isFinite(basePrice) &&
                          Number.isFinite(promoPrice) &&
                          basePrice > 0 &&
                          promoPrice > 0 &&
                          promoPrice < basePrice;
                        const discountPercent = hasDiscount
                          ? Math.round(((basePrice - promoPrice) / basePrice) * 100)
                          : 0;

                        return hasDiscount ? (
                          <div
                            className="discount-badge-card"
                            aria-label={`Promotion ${discountPercent}% OFF`}
                          >
                            <span className="discount-value">-{discountPercent}%</span>
                          </div>
                        ) : null;
                      })()}
                      <img
                        src={
                          book.images?.[0] ||
                          book.image ||
                          "/placeholder.jpg"
                        }
                        alt={book.title}
                      />
                    </div>

                    <div className="book-info">
                      <div className="meta">
                        <span className="book-category">{book.category}</span>
                        {sortBy === "stock-limited" && (Number(book.stock ?? 0) === 1 || Number(book.stock ?? 0) === 2) ? (
                          <span className="stock-chip-limited">
                            <span className="stock-chip-label">Stock restant:</span> {Number(book.stock ?? 0)}
                          </span>
                        ) : null}
                      </div>

                      <h3>{book.title}</h3>
                      <p className="book-edition">Edition {book.edition}</p>

                      <div className="book-footer">
                        <span className="price">
                          {book.promoPrice && book.promoPrice < book.price ? (
                            <>
                              <s>
                                {formatPrice(
                                  getPriceWithTax(book.price)
                                )}
                              </s>{" "}
                              <strong>
                                {formatPrice(
                                  getPriceWithTax(book.promoPrice)
                                )}
                              </strong>
                            </>
                            ) : (
                            formatPrice(
                              getPriceWithTax(book.price)
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                >
                  Précédent
                </button>

                {Array.from(
                  { length: endPage - startPage + 1 },
                  (_, i) => {
                    const page = startPage + i;
                    return (
                      <button
                        key={page}
                        className={`page-btn ${
                          currentPage === page ? "active" : ""
                        }`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    );
                  }
                )}

                <button
                  className="page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  Suivant
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default KidsBooks;

