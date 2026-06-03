import React, { useState, useEffect, useContext, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FaArrowRight,
  FaChevronLeft,
  FaChevronRight,
  FaShoppingCart,
  FaPlus,
  FaMinus,
} from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const formatLanguageDisplay = (language) => {
  if (!language) return "";
  return language.toString().replace(/arabic/gi, "Arabe");
};

const BookDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { bookData } = location.state || {};

  const { addToCart, cartItems = [] } = useContext(CartContext);

  const [quantity, setQuantity] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [stockMessage, setStockMessage] = useState("");
  const [book, setBook] = useState(bookData || null);
  const [isLoading, setIsLoading] = useState(!bookData);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (bookData) {
      setBook(bookData);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    if (!id) {
      setIsLoading(false);
      setLoadError("Livre introuvable.");
      return;
    }

    let cancelled = false;
    const fetchBook = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const snap = await getDoc(doc(db, "books", id));
        if (!snap.exists()) {
          if (cancelled) return;
          setBook(null);
          setLoadError("Livre introuvable.");
          setIsLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        if (cancelled) return;
        setBook(data);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setBook(null);
        setLoadError("Erreur lors du chargement du livre.");
        setIsLoading(false);
      }
    };

    fetchBook();
    return () => {
      cancelled = true;
    };
  }, [bookData, id]);

  useEffect(() => {
    setActiveImgIdx(0);
  }, [book?.id]);

  // ---------------- CAROUSEL ----------------
  const handlePrevImg = useCallback(() => {
    if (!book) return;
    setActiveImgIdx((prev) =>
      prev === 0
        ? (book.images?.length || 1) - 1
        : prev - 1
    );
  }, [book]);

  const handleNextImg = useCallback(() => {
    if (!book) return;
    setActiveImgIdx((prev) =>
      prev === (book.images?.length || 1) - 1
        ? 0
        : prev + 1
    );
  }, [book]);

  // ---------------- SWIPE MOBILE ----------------
  useEffect(() => {
    const imgContainer = document.querySelector(
      ".book-images .main-img"
    );
    if (!imgContainer) return;

    let startX = 0;
    let endX = 0;

    const handleTouchStart = (e) => {
      startX = e.touches[0].clientX;
    };
    const handleTouchMove = (e) => {
      endX = e.touches[0].clientX;
    };
    const handleTouchEnd = () => {
      const deltaX = endX - startX;
      if (Math.abs(deltaX) > 50) {
        deltaX > 0 ? handlePrevImg() : handleNextImg();
      }
      startX = 0;
      endX = 0;
    };

    imgContainer.addEventListener(
      "touchstart",
      handleTouchStart
    );
    imgContainer.addEventListener(
      "touchmove",
      handleTouchMove
    );
    imgContainer.addEventListener(
      "touchend",
      handleTouchEnd
    );

    return () => {
      imgContainer.removeEventListener(
        "touchstart",
        handleTouchStart
      );
      imgContainer.removeEventListener(
        "touchmove",
        handleTouchMove
      );
      imgContainer.removeEventListener(
        "touchend",
        handleTouchEnd
      );
    };
  }, [handlePrevImg, handleNextImg]);

  if (isLoading) return <div className="loading-state">Chargement du livre...</div>;
  if (!book) return <p>{loadError || "Livre introuvable."}</p>;

  // ---------------- ACTIONS ----------------
  const handleAddToCart = () => {
    const stockLimit = Number(book.stock);
    const hasStockLimit =
      Number.isFinite(stockLimit) && stockLimit > 0;
    const inCartQty =
      cartItems.find((i) => i.id === book.id)?.quantity || 0;

    if (hasStockLimit && inCartQty >= stockLimit) {
      setStockMessage(
        `Stock maximum atteint (${stockLimit}).`
      );
      return;
    }

    addToCart({ ...book, quantity });
    if (hasStockLimit && inCartQty + quantity > stockLimit) {
      setStockMessage(
        `Stock maximum atteint (${stockLimit}).`
      );
    } else {
      setStockMessage("");
    }
  };

  const handleCheckout = () => {
    navigate("/checkout", {
      state: { book, quantity },
    });
  };

  // ---------------- PROMO ----------------
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


  return (
    <div className="book-details-page">
      <div className="container-inner">
        <div className="book-details-grid">
          {/* ---------------- IMAGES ---------------- */}
          <div className="book-images">
            {hasDiscount && (
              <div
                className="discount-badge"
                aria-label={`Promotion ${discountPercent}%`}
              >
                <span className="discount-value">-{discountPercent}%</span>
              </div>
            )}
            {book.images?.length > 1 ? (
              <div className="carousel-container">
                <img
                  src={book.images[activeImgIdx]}
                  alt={`${book.title} ${
                    activeImgIdx + 1
                  }`}
                  className="main-img"
                />
                <button
                  className="prev-btn"
                  onClick={handlePrevImg}
                >
                  <FaChevronLeft />
                </button>
                <button
                  className="next-btn"
                  onClick={handleNextImg}
                >
                  <FaChevronRight />
                </button>

                <div className="thumbnail-row">
                  {book.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`thumb ${idx + 1}`}
                      className={`thumb ${
                        activeImgIdx === idx
                          ? "active-thumb"
                          : ""
                      }`}
                      onClick={() =>
                        setActiveImgIdx(idx)
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <img
                src={
                  book.images?.[0] ||
                  book.image ||
                  "/placeholder.jpg"
                }
                alt={book.title}
                className="main-img"
              />
            )}
          </div>

          {/* ---------------- INFO ---------------- */}
          <div className="book-info-panel">
            <h1 className="book-title">
              {book.title}
            </h1>
            <div className="quantity-price">
              {/* Badge rupture */}
              {book.stock <= 0 && (
                <span className="out-of-stock">
                  Rupture de stock
                </span>
              )}
              {/* Prix (toujours visible) */}
              <div className="price-block">
                <span className="price-book">
                  {hasDiscount ? (
                    <>
                      <s>
                        {(
                          getPriceWithTax(book.price) *
                          quantity
                        ).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </s>{" "}
                      <strong>
                        {(
                          getPriceWithTax(book.promoPrice) *
                          quantity
                        ).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </strong>
                    </>
                  ) : (
                    (
                      getPriceWithTax(book.price) *
                      quantity
                    ).toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })
                  )}
                </span>
                <span className="price-tax-note">TTC</span>
              </div>

              {/* Quantité (uniquement si stock > 0) */}
              {book.stock > 0 && (
                <div className="quantity-block">
                  <label>Quantité :</label>

                  <div className="qty-stepper">
                    <button
                      onClick={() =>
                        setQuantity((q) => Math.max(1, q - 1))
                      }
                      disabled={quantity <= 1}
                    >
                      <FaMinus />
                    </button>

                    <span>{quantity}</span>

                    <button
                      onClick={() =>
                        setQuantity((q) =>
                          Math.min(book.stock, q + 1)
                        )
                      }
                      disabled={quantity >= book.stock}
                    >
                      <FaPlus />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="book-actions">
              <button
                className={`btn btn-primary ${
                  book.stock <= 0 ? "btn-disabled" : ""
                }`}
                disabled={book.stock <= 0}
                onClick={handleAddToCart}
              >
                Ajouter au panier <FaShoppingCart />
              </button>

              <button
                className={`btn btn-sec-book ${
                  book.stock <= 0 ? "btn-disabled" : ""
                }`}
                disabled={book.stock <= 0}
                onClick={handleCheckout}
              >
                Passer au Paiement <FaArrowRight />
              </button>
            </div>
            {stockMessage && (
              <p className="stock-warning">{stockMessage}</p>
            )}
            <div className="return-badge">
              <strong>
                Expédition sous 48h – Frais d'envoi OFFERTS
                dès 100€ d'achat
              </strong>
              <br /> <br />
              <strong>Politique de retour : </strong>Vous disposez d'un délai de 14 Jours à compter de la réception de votre commande pour retourner votre articles.
              <br /> voir <a href="/TermsOfSale" className="terms">Conditions générales de ventes</a>
            </div>
            <div className="book-description">
              <h2>Caractéristiques</h2>
              <p className="author">
                <strong>Auteur: {" "}</strong> {book.author || "Auteur inconnu"}
              </p>
              <p>
                <strong>Édition:</strong> {book.edition}
              </p>
              <p>
                <strong>Langue: </strong>{formatLanguageDisplay(book.language)}
              </p>
              <p>
                <strong>ISBN: </strong>{book.isbn}
              </p>
            </div>

            <div className="book-description">
              <h2>Description</h2>
              <p>
                {book.description ||
                  "Aucune description pour le moment"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookDetails;
