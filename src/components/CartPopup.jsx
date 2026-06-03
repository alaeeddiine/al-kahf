import React, { useEffect, useContext, useMemo, useState } from "react";
import {
  FaTimes,
  FaTrashAlt,
  FaPlus,
  FaMinus,
  FaShoppingBag,
  FaArrowRight,
  FaLock,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import { CartContext } from "../context/CartContext";

// Prix stocke en base = TTC
const priceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const FREE_SHIPPING_THRESHOLD = 100;
const formatLanguageDisplay = (language) => {
  if (!language) return "";
  return language.toString().replace(/arabic/gi, "Arabe");
};

const CartPopup = ({ isOpen, onClose }) => {
  const { cartItems = [], removeFromCart, updateQuantity } =
    useContext(CartContext);

  const [stockWarnings, setStockWarnings] = useState({});

  const items = useMemo(() => {
    return Array.isArray(cartItems) ? cartItems : [];
  }, [cartItems]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const subtotalTTC = useMemo(() => {
    return items.reduce(
      (sum, item) =>
        sum +
        priceWithTax(item.promoPrice ?? item.price ?? 0) *
          item.quantity,
      0
    );
  }, [items]);

  const isEligibleForFreeShipping = subtotalTTC >= FREE_SHIPPING_THRESHOLD;
  const grandTotalTTC = isEligibleForFreeShipping ? subtotalTTC : null;

  const handleIncrease = (item) => {
    if (item.quantity + 1 > item.stock) {
      setStockWarnings((prev) => ({
        ...prev,
        [item.id]: `Stock epuise ! Maximum disponible : ${item.stock}`,
      }));
      return;
    }

    updateQuantity(item.id, item.quantity + 1);
    setStockWarnings((prev) => ({ ...prev, [item.id]: "" }));
  };

  const handleDecrease = (item) => {
    if (item.quantity > 1) {
      updateQuantity(item.id, item.quantity - 1);
    }
    setStockWarnings((prev) => ({ ...prev, [item.id]: "" }));
  };

  return (
    <>
      <div
        className={`cart-overlay-blur ${isOpen ? "active" : ""}`}
        onClick={onClose}
      />

      <aside
        className={`cart-sidebar-premium ${isOpen ? "open" : ""}`}
      >
        <header className="cart-side-header">
          <div className="title-group">
            <FaShoppingBag className="bag-icon" />
            <h3>Votre Panier</h3>
            <span className="item-count-pill">
              {items.length}
            </span>
          </div>
          <button
            className="close-cart-btn"
            onClick={onClose}
          >
            <FaTimes />
          </button>
        </header>

        <section className="cart-side-body">
          {items.length === 0 ? (
            <div className="cart-empty-state">
              <div className="empty-icon-wrapper">
                <FaShoppingBag />
              </div>
              <p>Votre panier est encore vide.</p>
              <Link
                to="/"
                className="btn-gold-outline"
                onClick={onClose}
              >
                Retour a l'accueil
              </Link>
            </div>
          ) : (
            <div className="cart-items-wrapper">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="cart-item-card"
                >
                  <div className="item-img-box">
                    <img
                      src={
                        item.images?.[0] ||
                        item.image ||
                        "/placeholder.jpg"
                      }
                      alt={item.title}
                    />
                  </div>

                  <div className="item-info-box">
                    <div className="item-header-row">
                      <h4>{item.title}</h4>
                      <button
                        className="remove-small"
                        onClick={() =>
                          removeFromCart(item.id)
                        }
                      >
                        <FaTrashAlt />
                      </button>
                    </div>

                    <p className="item-meta">
                      Edition {item.edition}
                    </p>
                    {item.language && (
                      <p className="book-language">
                        {formatLanguageDisplay(item.language)}
                      </p>
                    )}

                    <div className="item-controls-row">
                      <div className="qty-stepper">
                        <button
                          onClick={() =>
                            handleDecrease(item)
                          }
                          disabled={item.quantity <= 1}
                        >
                          <FaMinus />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          onClick={() =>
                            handleIncrease(item)
                          }
                        >
                          <FaPlus />
                        </button>
                      </div>

                      <span className="item-price-final">
                        {item.promoPrice ? (
                          <>
                            <s>
                              {priceWithTax(
                                item.price
                              ).toFixed(2)}{" "}
                              €
                            </s>{" "}
                            {(
                              priceWithTax(
                                item.promoPrice
                              ) * item.quantity
                            ).toFixed(2)}{" "}
                            €
                          </>
                        ) : (
                          `${(
                            priceWithTax(item.price) *
                            item.quantity
                          ).toFixed(2)} €`
                        )}
                      </span>
                    </div>

                    {stockWarnings[item.id] && (
                      <p className="stock-warning">
                        {stockWarnings[item.id]}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {items.length > 0 && (
          <footer className="cart-side-footer">
            <div className="summary-details">
              <div className="sum-line">
                <span>Sous-total (TTC)</span>
                <span>
                  {subtotalTTC.toFixed(2)} €
                </span>
              </div>

              <div className="sum-line">
                <span>Livraison</span>
                <span
                  style={
                    isEligibleForFreeShipping
                      ? { color: "#1f8a3b", fontWeight: 700 }
                      : undefined
                  }
                >
                  {isEligibleForFreeShipping ? "Offert" : "En cours..."}
                </span>
              </div>

              <div className="sum-line grand-total">
                <span>Total</span>
                <span>
                  {grandTotalTTC === null
                    ? "En cours..."
                    : `${grandTotalTTC.toFixed(2)} €`}
                </span>
              </div>
            </div>

            <Link
              to="/checkout"
              className="checkout-btn-premium"
              onClick={onClose}
            >
              Commander maintenant <FaArrowRight />
            </Link>

            <div className="secure-footer-note">
              <FaLock /> Paiement 100% securise
            </div>
          </footer>
        )}
      </aside>
    </>
  );
};

export default CartPopup;
