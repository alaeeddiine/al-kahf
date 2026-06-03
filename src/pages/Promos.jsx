import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllBooks } from "../firebase/config";
import { FaSearch, FaTimes, FaFilter, FaSortAmountDown } from "react-icons/fa";

const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);

const formatPrice = (price) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(price);

const isKidsBook = (book) =>
  (book?.category || "").toLowerCase().trim() === "livres enfants";

const toSearchableValue = (value) => (value ?? "").toString().toLowerCase();

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1776780700/SPECIAL_2_awvwim.png";

const Promos = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [selectedAudience, setSelectedAudience] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const getPagesPerGroup = (width) => {
    if (width <= 360) return 3;
    if (width <= 480) return 4;
    if (width <= 768) return 5;
    return 6;
  };
  const [pagesPerGroup, setPagesPerGroup] = useState(
    typeof window !== "undefined" ? getPagesPerGroup(window.innerWidth) : 6
  );

  const BOOKS_PER_PAGE = 12;

  const sortOptions = [
    { value: "default", label: "Par defaut" },
    { value: "price-asc", label: "Prix croissant" },
    { value: "price-desc", label: "Prix decroissant" },
    { value: "title", label: "Ordre alphabetique" },
  ];

  const audienceOptions = [
    { value: "all", label: "Adultes + Kids" },
    { value: "adults", label: "Livres adultes" },
    { value: "kids", label: "Livres enfants" },
  ];

  useEffect(() => {
    const loadPromoBooks = async () => {
      setLoading(true);
      try {
        const allBooks = await getAllBooks();

        // Afficher uniquement les promotions definies manuellement par l'admin sur chaque livre.
        const promoBooks = allBooks.filter((book) => {
          const price = Number(book?.price);
          const promoPrice = Number(book?.promoPrice);

          if (!Number.isFinite(promoPrice) || promoPrice <= 0) return false;
          if (!Number.isFinite(price) || price <= 0) return false;

          return promoPrice < price;
        });

        setBooks(promoBooks);
        setFilteredBooks(promoBooks);
      } catch (error) {
        console.error("Erreur chargement page promos:", error);
        setBooks([]);
        setFilteredBooks([]);
      } finally {
        setLoading(false);
      }
    };

    loadPromoBooks();
  }, []);

  useEffect(() => {
    let result = [...books];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((book) =>
        [book.title, book.edition, book.author, book.isbn, book.ISBN]
          .map(toSearchableValue)
          .some((value) => value.includes(term))
      );
    }

    if (selectedAudience === "kids") {
      result = result.filter((book) => isKidsBook(book));
    } else if (selectedAudience === "adults") {
      result = result.filter((book) => !isKidsBook(book));
    }

    const getSortablePrice = (book) => Number(book.promoPrice ?? book.price ?? 0);

    if (sortBy === "price-asc") {
      result.sort((a, b) => getSortablePrice(a) - getSortablePrice(b));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => getSortablePrice(b) - getSortablePrice(a));
    } else if (sortBy === "title") {
      result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    setFilteredBooks(result);
  }, [books, searchTerm, selectedAudience, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedAudience, sortBy]);

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
  const currentBooks = filteredBooks.slice(indexOfFirstBook, indexOfLastBook);

  const totalPages = Math.ceil(filteredBooks.length / BOOKS_PER_PAGE);
  const PAGES_PER_GROUP = pagesPerGroup;
  const currentGroup = Math.floor((currentPage - 1) / PAGES_PER_GROUP);
  const startPage = currentGroup * PAGES_PER_GROUP + 1;
  const endPage = Math.min(startPage + PAGES_PER_GROUP - 1, totalPages);

  return (
    <div className="books-page">
        <div className="banner-promo promos-banner">
          <img
            src={logo}
            alt="Promotions livres"
            className="books-logo-main promos-logo-main"
          />
        </div>

      <div className="container-inner">
        <div className="books-tools promos-books-tools">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <FaTimes className="clear-search" onClick={() => setSearchTerm("")} />
            )}
          </div>

          <div className="action-buttons">
            <button className="tool-btn" onClick={() => setShowFilters(!showFilters)}>
              <FaFilter /> <span>Filtres</span>
            </button>

            <div className="sort-wrapper">
              <FaSortAmountDown className="sort-icon" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={`filter-drawer ${showFilters ? "open" : ""}`}>
          <h3>Type de livres</h3>
          <div className="category-tags">
            {audienceOptions.map((option) => (
              <button
                key={option.value}
                className={`tag-btn ${selectedAudience === option.value ? "active" : ""}`}
                onClick={() => {
                  setSelectedAudience(option.value);
                  setShowFilters(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="content-area">
          {loading ? (
            <div className="loading-state">Chargement des livres en promo...</div>
          ) : (
            <>
              <p className="results-text promos-results-text">
                {filteredBooks.length} livres en promo trouves
              </p>

              {filteredBooks.length === 0 ? (
                <div className="no-data">Aucun livre en promo pour ce filtre.</div>
              ) : (
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
                                aria-label={`Promotion ${discountPercent}%`}
                              >
                                <span className="discount-value">-{discountPercent}%</span>
                              </div>
                            ) : null;
                          })()}
                          <img
                            src={book.images?.[0] || book.image || "/placeholder.jpg"}
                            alt={book.title}
                          />
                        </div>

                        <div className="book-info">
                          <span className="book-category">{book.category}</span>
                          <h3>{book.title}</h3>
                          <p className="book-edition">Edition {book.edition}</p>

                          <span className="price">
                            <s>{formatPrice(getPriceWithTax(book.price))}</s>{" "}
                            <strong>
                              {formatPrice(getPriceWithTax(book.promoPrice))}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  >
                    Precedent
                  </button>

                  {Array.from({ length: endPage - startPage + 1 }, (_, i) => {
                    const page = startPage + i;
                    return (
                      <button
                        key={page}
                        className={`page-btn ${currentPage === page ? "active" : ""}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    );
                  })}

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
    </div>
  );
};

export default Promos;
