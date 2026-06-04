import React, { useEffect, useState, useContext } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getAllBooks, getBooksByCategory } from "../firebase/config";
import { CartContext } from "../context/CartContext";
import {
  FaSearch,
  FaTimes,
  FaFilter,
  FaSortAmountDown,
} from "react-icons/fa";
import { db } from "../firebase/config";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const getStockValue = (book) => Number(book?.stock ?? 0);
const isLimitedStock = (book) => {
  const stock = getStockValue(book);
  return stock >= 1 && stock <= 4;
};

const Books = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [showFilters, setShowFilters] =
    useState(false);

  const [currentPage, setCurrentPage] =
    useState(1);
  const getPagesPerGroup = (width) => {
    if (width <= 360) return 3;
    if (width <= 480) return 4;
    if (width <= 768) return 5;
    return 6;
  };
  const [pagesPerGroup, setPagesPerGroup] =
    useState(
      typeof window !== "undefined"
        ? getPagesPerGroup(window.innerWidth)
        : 6
    );

  const [searchParams] = useSearchParams();
  useContext(CartContext); // kept for future use

  const BOOKS_PER_PAGE = 12;
  const urlCategory = searchParams.get("category");

  const formatPrice = (price) =>
    price.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
    });

  const categories = [
    { value: "all", label: "Toutes les catégories" },
    {
      value: "Quran & Tafsir",
      label: "Coran & Tafsir",
    },
    {
      value: "Sciences du Hadith",
      label: "Hadith",
    },
    {
      value: "Fiqh & Jurisprudence",
      label: "Jurisprudence",
    },
    {
      value: "Sira & Biographies",
      label: "Biographies",
    },
    { value: "Tawhid ", label: "Tawhid" },
    {
      value: "Aqida & Croyances",
      label: "Aqida & Croyances",
    },
  ];

  const sortOptions = [
    { value: "default", label: "Par défaut" },
    {
      value: "stock-limited",
      label: "Stock limité",
    },
    {
      value: "price-asc",
      label: "Prix croissant",
    },
    {
      value: "price-desc",
      label: "Prix décroissant",
    },
    {
      value: "title",
      label: "Ordre alphabétique",
    },
  ];

  // ---------- PROMOS ----------
  const getGeneralPromos = async () => {
    const promosRef = collection(db, "promos");
    const q = query(
      promosRef,
      where("active", "==", true),
      where("type", "==", "general")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  };

  // ---------- LOAD BOOKS ----------
  useEffect(() => {
    const loadBooks = async () => {
      setLoading(true);

      let data =
        urlCategory && urlCategory !== "all"
          ? await getBooksByCategory(urlCategory)
          : await getAllBooks();

      data = data.filter(
        (book) =>
          book.category !== "Livres enfants"
      );

      const generalPromos =
        await getGeneralPromos();

      const applyPromo = (price, promo) => {
        if (!promo || promo.amount == null)
          return price;
        return +(
          price *
          (1 - promo.amount / 100)
        ).toFixed(2);
      };

      const applicablePromo =
        generalPromos.find(
          (p) =>
            p.appliesTo === "all" ||
            p.appliesTo === "books"
        );

      if (applicablePromo) {
        data = data.map((book) => ({
          ...book,
          promoPrice: applyPromo(
            book.price,
            applicablePromo
          ),
        }));
      }

      setBooks(data);
      setFilteredBooks(data);
      setLoading(false);
    };

    loadBooks();
  }, [urlCategory]);

  // ---------- FILTER & SORT ----------
  useEffect(() => {
    let result = [...books];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          b.title?.toLowerCase().includes(term) ||
          b.author
            ?.toLowerCase()
            .includes(term) ||
          b.category
            ?.toLowerCase()
            .includes(term) ||
          b.edition
            ?.toLowerCase()
            .includes(term)
      );
    }

    if (selectedCategory !== "all") {
      result = result.filter(
        (b) =>
          b.category === selectedCategory
      );
    }

    if (sortBy === "stock-limited") {
      result = result.filter(isLimitedStock);
    }

    if (sortBy === "price-asc")
      result.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc")
      result.sort((a, b) => b.price - a.price);
    else if (sortBy === "title")
      result.sort((a, b) =>
        a.title.localeCompare(b.title)
      );

    setFilteredBooks(result);
  }, [searchTerm, selectedCategory, books, sortBy]);

  // ---------- RESET PAGE ----------
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortBy, setCurrentPage]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentPage]);

  useEffect(() => {
    const handleResize = () => {
      setPagesPerGroup(
        getPagesPerGroup(window.innerWidth)
      );
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () =>
      window.removeEventListener(
        "resize",
        handleResize
      );
  }, []);

  const indexOfLastBook =
    currentPage * BOOKS_PER_PAGE;
  const indexOfFirstBook =
    indexOfLastBook - BOOKS_PER_PAGE;
  const currentBooks =
    filteredBooks.slice(
      indexOfFirstBook,
      indexOfLastBook
    );

  const totalPages = Math.ceil(
    filteredBooks.length / BOOKS_PER_PAGE
  );

  const PAGES_PER_GROUP = pagesPerGroup;
  const currentGroup = Math.floor(
    (currentPage - 1) / PAGES_PER_GROUP
  );
  const startPage =
    currentGroup * PAGES_PER_GROUP + 1;
  const endPage = Math.min(
    startPage + PAGES_PER_GROUP - 1,
    totalPages
  );

  return (
    <div className="books-page">
      <div className="container-inner">
        {/* Search & tools */}
        <div className="books-tools">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(e.target.value)
              }
            />
            {searchTerm && (
              <FaTimes
                className="clear-search"
                onClick={() =>
                  setSearchTerm("")
                }
              />
            )}
          </div>

          <div className="action-buttons">
            <button
              className="tool-btn"
              onClick={() =>
                setShowFilters(!showFilters)
              }
            >
              <FaFilter /> <span>Filtres</span>
            </button>

            <div className="sort-wrapper">
              <FaSortAmountDown className="sort-icon" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value)
                }
              >
                {sortOptions.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div
          className={`filter-drawer ${
            showFilters ? "open" : ""
          }`}
        >
          <h3>Catégories</h3>
          <div className="category-tags">
            {categories.map((cat) => (
              <button
                key={cat.value}
                className={`tag-btn ${
                  selectedCategory === cat.value
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setSelectedCategory(cat.value);
                  setShowFilters(false);
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Books */}
        <div className="content-area">
          {loading ? (
            <div className="loading-state">
              Chargement des livres...
            </div>
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
                          <span className="book-category">
                            {book.category}
                          </span>

                          {sortBy === "stock-limited" &&
                            isLimitedStock(book) ? (
                            <span className="stock-chip-limited">
                              <span className="stock-chip-label">
                                Stock restant:
                              </span>{" "}
                              {getStockValue(book)}
                            </span>
                          ) : null}
                        </div>

                        <h3>{book.title}</h3>

                        <p className="book-edition">
                          Edition {book.edition}
                        </p>

                        <div className="book-footer">
                          <span className="price">
                            {book.promoPrice &&
                            book.promoPrice < book.price ? (
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.max(1, prev - 1)
                      )
                    }
                  >
                    Précédent
                  </button>

                  {Array.from(
                    {
                      length:
                        endPage - startPage + 1,
                    },
                    (_, i) => {
                      const page =
                        startPage + i;
                      return (
                        <button
                          key={page}
                          className={`page-btn ${
                            currentPage === page
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            setCurrentPage(page)
                          }
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
                      setCurrentPage((prev) =>
                        Math.min(totalPages, prev + 1)
                      )
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
    </div>
  );
};

export default Books;

