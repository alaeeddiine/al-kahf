import React, { useState, useEffect, useContext, useCallback } from "react"; 
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FaArrowRight, FaChevronLeft, FaChevronRight, FaShoppingCart, FaMinus, FaPlus } from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const PACK_TAX_RATE = 21;
const normalizePackTtc = (pack) => {
  if (!pack) return pack;
  const includesTax = pack.priceIncludesTax === true;
  const toTtc = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return includesTax ? +n.toFixed(2) : +(n * (1 + PACK_TAX_RATE / 100)).toFixed(2);
  };
  return {
    ...pack,
    price: toTtc(pack.price) ?? 0,
    promoPrice: pack.promoPrice == null ? null : toTtc(pack.promoPrice),
    priceIncludesTax: true,
  };
};

const PackDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { packData } = location.state || {};
  const { addToCart, cartItems = [] } = useContext(CartContext);

  const [pack, setPack] = useState(normalizePackTtc(packData) || null);
  const [quantity, setQuantity] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [stockMessage, setStockMessage] = useState("");
  const [isLoading, setIsLoading] = useState(!packData);
  const [loadError, setLoadError] = useState("");

  // ---------------- LOAD PACK ----------------
  useEffect(() => {
    if (packData) {
      setPack(normalizePackTtc(packData));
      setIsLoading(false);
      setLoadError("");
      return;
    }

    if (!id) {
      setIsLoading(false);
      setLoadError("Pack introuvable.");
      setPack(null);
      return;
    }

    let cancelled = false;
    const fetchPack = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const docSnap = await getDoc(doc(db, "packs", id));
        if (!docSnap.exists()) {
          if (cancelled) return;
          setPack(null);
          setLoadError("Pack introuvable.");
          setIsLoading(false);
          return;
        }
        if (cancelled) return;
        setPack(normalizePackTtc({ id: docSnap.id, ...docSnap.data() }));
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setPack(null);
        setLoadError("Erreur lors du chargement du pack.");
        setIsLoading(false);
      }
    };

    fetchPack();
    return () => {
      cancelled = true;
    };
  }, [packData, id]);

  useEffect(() => {
    setActiveImgIdx(0);
  }, [pack?.id]);

  // ---------------- CAROUSEL ----------------
  const handlePrevImg = useCallback(() => {
    setActiveImgIdx((prev) =>
      prev === 0 ? (pack.images?.length || 1) - 1 : prev - 1
    );
  }, [pack]);
  const handleNextImg = useCallback(() => {
    setActiveImgIdx((prev) =>
      prev === (pack.images?.length || 1) - 1 ? 0 : prev + 1
    );
  }, [pack]);

  // ---------------- SWIPE MOBILE ----------------
  useEffect(() => {
    const imgContainer = document.querySelector(".pack-images .main-img");
    if (!imgContainer) return;

    let startX = 0;
    let endX = 0;

    const handleTouchStart = (e) => { startX = e.touches[0].clientX; };
    const handleTouchMove = (e) => { endX = e.touches[0].clientX; };
    const handleTouchEnd = () => {
      const deltaX = endX - startX;
      if (Math.abs(deltaX) > 50) deltaX > 0 ? handlePrevImg() : handleNextImg();
      startX = 0; endX = 0;
    };

    imgContainer.addEventListener("touchstart", handleTouchStart);
    imgContainer.addEventListener("touchmove", handleTouchMove);
    imgContainer.addEventListener("touchend", handleTouchEnd);

    return () => {
      imgContainer.removeEventListener("touchstart", handleTouchStart);
      imgContainer.removeEventListener("touchmove", handleTouchMove);
      imgContainer.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handlePrevImg, handleNextImg]);

  if (isLoading) return <div className="loading-state">Chargement du pack...</div>;
  if (!pack) return <p>{loadError || "Pack introuvable."}</p>;

  // ---------------- ACTIONS ----------------
  const handleAddToCart = () => {
    const stockLimit = Number(pack.stock);
    const hasStockLimit =
      Number.isFinite(stockLimit) && stockLimit > 0;
    const inCartQty =
      cartItems.find((i) => i.id === pack.id)?.quantity || 0;

    if (hasStockLimit && inCartQty >= stockLimit) {
      setStockMessage(
        `Stock maximum atteint (${stockLimit}).`
      );
      return;
    }

    addToCart({ ...pack, quantity });
    if (hasStockLimit && inCartQty + quantity > stockLimit) {
      setStockMessage(
        `Stock maximum atteint (${stockLimit}).`
      );
    } else {
      setStockMessage("");
    }
  }; 

  const handleCheckout = () => {
    navigate("/checkout", { state: { book: pack, quantity } });
  };

  // ---------------- PROMO BADGE ----------------
  const hasDiscount = pack.promoPrice && pack.promoPrice < pack.price;
  const discountPercent = hasDiscount ? Math.round(100 - (pack.promoPrice / pack.price) * 100) : 0;

  return (
    <div className="book-details-page">
      <div className="container-inner">
        <div className="book-details-grid">

           {/* ---------------- IMAGE CAROUSEL ---------------- */}
           <div className="book-images">
             {hasDiscount && (
               <div className="discount-badge" aria-label={`Promo -${discountPercent}%`}>
                 PROMO -{discountPercent}%
               </div>
             )}
             {pack.images?.length > 1 ? (
               <div className="carousel-container">
                 <img src={pack.images[activeImgIdx]} alt={`${pack.title} ${activeImgIdx + 1}`} className="main-img" />
                 <button className="prev-btn" onClick={handlePrevImg}><FaChevronLeft /></button>
                 <button className="next-btn" onClick={handleNextImg}><FaChevronRight /></button>
                <div className="thumbnail-row">
                  {pack.images.map((img, idx) => (
                    <img key={idx} src={img} className={`thumb ${activeImgIdx === idx ? "active-thumb" : ""}`} onClick={() => setActiveImgIdx(idx)} alt={`thumb ${idx + 1}`} />
                  ))}
                </div>
              </div>
            ) : (
              <img src={pack.images?.[0] || "/placeholder.jpg"} alt={pack.title} className="main-img" />
            )}
          </div>

           {/* ---------------- INFO PANEL ---------------- */}
           <div className="book-info-panel">
             <h1 className="book-title">{pack.title}</h1>

            {/* Quantité + prix */}
            <div className="quantity-price">
              <div className="price-block">
                <span className="price-book">
                  {hasDiscount ? (
                    <>
                      <s>
                        {(getPriceWithTax(pack.price) * quantity).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                      </s>{" "}
                      <strong>
                        {(getPriceWithTax(pack.promoPrice) * quantity).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                      </strong>
                    </>
                  ) : (
                    <span>
                      {(getPriceWithTax(pack.price) * quantity).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </span>
                  )}
                </span>
                <span className="price-tax-note">TTC</span>
              </div>

              <div className="quantity-block">
                <label>Quantité :</label>
                <div className="qty-stepper">
                  <button
                    onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                    disabled={quantity <= 1}
                  >
                    <FaMinus />
                  </button>
                  <span>{quantity}</span>
                  <button
                    onClick={() => setQuantity(prev => Math.min(pack.stock || 5, prev + 1))}
                    disabled={quantity >= (pack.stock || 5)}
                  >
                    <FaPlus />
                  </button>
                </div>
              </div>

              {quantity > (pack.stock || 5) && (
                <p style={{ color: "red", fontSize: "0.85rem", marginTop: "4px" }}>
                  Quantité maximale : {pack.stock || 5}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="book-actions">
              <button className="btn btn-primary" onClick={handleAddToCart} disabled={quantity > (pack.stock || 5)}>
                Ajouter au panier <FaShoppingCart style={{ marginLeft: "8px" }} />
              </button>
              <button className="btn btn-sec-book" onClick={handleCheckout}>
                Passer au Paiement <FaArrowRight style={{ marginLeft: "8px" }} />
              </button>
            </div>
            {stockMessage && (
              <p className="stock-warning">{stockMessage}</p>
            )}

            {/* Politique de retour */}
            <div className="return-badge">
              <center><strong>Expédition sous 48h – Frais OFFERTS dès 100€ d'achat</strong></center><br/>
              <strong>Politique de retour:</strong> Vous disposez d'un délai de 14 Jours à compter de la réception de votre commande pour retourner votre articles.
                <br /> voir <a href="/TermsOfSale" className="terms">Conditions générales de ventes</a>
            </div>

            {/* Livres inclus */}
            {pack.includedBooks?.length > 0 && (
              <div className="pack-included-books">
                <h3> {pack.includedBooks.length} Livres inclus</h3>
                <ul>
                  {pack.includedBooks.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Description */}
            <div className="book-description">
              <h2>Description</h2>
              <p>{pack.description || "Aucune description pour le moment"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackDetails;
