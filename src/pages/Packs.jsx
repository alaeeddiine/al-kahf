import React, { useState, useEffect, useContext } from "react";
import { db } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { CartContext } from "../context/CartContext";
import { FaShoppingCart } from "react-icons/fa";

// Prix stocke en base = TTC
const getPriceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const PACK_TAX_RATE = 21;
const normalizePackTtc = (pack) => {
  const includesTax = pack?.priceIncludesTax === true;
  const toTtc = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return includesTax ? +n.toFixed(2) : +(n * (1 + PACK_TAX_RATE / 100)).toFixed(2);
  };
  return {
    ...pack,
    price: toTtc(pack?.price) ?? 0,
    promoPrice: pack?.promoPrice == null ? null : toTtc(pack?.promoPrice),
    priceIncludesTax: true,
  };
};

const PacksClient = () => {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToCart, cartItems = [] } = useContext(CartContext);
  const [stockWarnings, setStockWarnings] = useState({});
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
  const PACKS_PER_PAGE = 6;

  const navigate = useNavigate();

  // ---------- Récupérer les promos générales actives ----------
  const getGeneralPromos = async () => {
    const promosRef = collection(db, "promos");
    const q = query(
      promosRef,
      where("active", "==", true),
      where("type", "==", "general")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  // ---------- Charger les packs avec promo appliquée ----------
  useEffect(() => {
    const fetchPacks = async () => {
      try {
        const q = query(collection(db, "packs"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        let data = snap.docs.map((doc) => normalizePackTtc({ id: doc.id, ...doc.data() }));

        // Appliquer la promo générale si applicable
        const generalPromos = await getGeneralPromos();
        const applicablePromo = generalPromos.find(
          (p) => p.appliesTo === "all" || p.appliesTo === "packs"
        );

        if (applicablePromo) {
          data = data.map((pack) => {
            const basePrice = pack.price; // prix original
            let promoPrice;

            if (applicablePromo.amount.includes("%")) {
              const percent = parseFloat(applicablePromo.amount.replace("%", ""));
              promoPrice = +(basePrice * (1 - percent / 100)).toFixed(2);
            } else {
              promoPrice = +(basePrice - parseFloat(applicablePromo.amount)).toFixed(2);
            }

            promoPrice = promoPrice < 0 ? 0 : promoPrice;

            return { ...pack, promoPrice };
          });
        }

        setPacks(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPacks();
  }, []);

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

  const getFinalPrice = (pack) => pack.promoPrice ?? pack.price;
  const handleQuickAdd = (pack, e) => {
    e.stopPropagation();

    const stockLimit = Number(pack.stock);
    const hasStockLimit =
      Number.isFinite(stockLimit) && stockLimit > 0;
    const inCartQty =
      cartItems.find((i) => i.id === pack.id)?.quantity || 0;

    if (hasStockLimit && inCartQty >= stockLimit) {
      setStockWarnings((prev) => ({
        ...prev,
        [pack.id]: `Stock maximum atteint (${stockLimit}).`,
      }));
      return;
    }

    addToCart({ ...pack, price: getFinalPrice(pack) });

    if (hasStockLimit && inCartQty + 1 >= stockLimit) {
      setStockWarnings((prev) => ({
        ...prev,
        [pack.id]: `Stock maximum atteint (${stockLimit}).`,
      }));
    } else {
      setStockWarnings((prev) => ({
        ...prev,
        [pack.id]: "",
      }));
    }
  };

  if (loading) {
    return (
      <div className="cinematic-loader">
        <div className="loading-state loading-state--compact">
          Chargement des packs...
        </div>
      </div>
    );
  }

  const indexOfLastPack = currentPage * PACKS_PER_PAGE;
  const indexOfFirstPack = indexOfLastPack - PACKS_PER_PAGE;
  const currentPacks = packs.slice(indexOfFirstPack, indexOfLastPack);
  const totalPages = Math.ceil(packs.length / PACKS_PER_PAGE);
  const PAGES_PER_GROUP = pagesPerGroup;
  const currentGroup = Math.floor((currentPage - 1) / PAGES_PER_GROUP);
  const startPage = currentGroup * PAGES_PER_GROUP + 1;
  const endPage = Math.min(startPage + PAGES_PER_GROUP - 1, totalPages);

  return (
    <div className="cinematic-page">
      <header className="cinematic-hero">
        <div className="hero-visual-bg"></div>
        <div className="hero-content-reveal">
          <span className="hero-tag">L'art du savoir</span>
          <h1>
            Les <span className="gold-text">Collections</span> AL KAHF
          </h1>
          <p>
            Une sélection de livres réunis pour vous offrir le meilleur.
          </p>
        </div>
      </header>

      <main className="container-inner">
        <h2 className="grid-label">Séries Disponibles</h2>

        <div className="cinematic-grid">
          {currentPacks.map((pack) => (
            <div
              key={pack.id}
              className="cinematic-card"
              onClick={() =>
                navigate(`/pack/${encodeURIComponent(pack.id)}`, { state: { packData: pack } })
              }
            >
              <div className="card-media">
                <div className="carousel-wrapper">
                  {pack.images?.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`${pack.title} ${idx + 1}`}
                      className="carousel-image"
                    />
                  ))}
                </div>

                <div className="price-float">
                  {pack.promoPrice ? (
                    <>
                      <s>{getPriceWithTax(pack.price)}€</s>{" "}
                      <b>{getPriceWithTax(pack.promoPrice)}€</b>
                    </>
                  ) : (
                    `${getPriceWithTax(pack.price)}€`
                  )}
                </div>
              </div>

              <div className="card-info">
                <h3>{pack.title}</h3>
                {pack.includedBooks?.length > 0 && (
                  <span className="mini-includes">{pack.includedBooks.length} livres inclus</span>
                )}

                <div className="card-footer-cinematic">
                  <span className="view-link">Voir détails</span>
                  <button
                    className="quick-add"
                    onClick={(e) => handleQuickAdd(pack, e)}
                  >
                    <FaShoppingCart />
                  </button>
                </div>
                {stockWarnings[pack.id] && (
                  <p className="stock-warning">
                    {stockWarnings[pack.id]}
                  </p>
                )}
              </div>
            </div>
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
      </main>
    </div>
  );
};

export default PacksClient;
