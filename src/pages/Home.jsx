import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowRight,
  FaBookOpen,
  FaShieldAlt,
  FaShippingFast,
  FaHeadset,
  FaEnvelope,
  FaFire,
} from "react-icons/fa";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

/* ---------- TAX UTILS ---------- */
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

const normalizeMojibakeText = (value) => {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("Ã©", "é")
    .replaceAll("Ã¨", "è")
    .replaceAll("Ãª", "ê")
    .replaceAll("Ã ", "à")
    .replaceAll("Ã¹", "ù")
    .replaceAll("Ã§", "ç")
    .replaceAll("Ã‰", "É")
    .replaceAll("â€™", "’")
    .replaceAll("â€œ", "“")
    .replaceAll("â€", "”")
    .replaceAll("â˜…", "★");
};

const heroVideo =
  "https://res.cloudinary.com/djukqnpbs/video/upload/v1770942080/WhatsApp_Video_2026-02-12_at_22.05.56_ziudpy.mp4";

const Home = () => {
  const [latestBooks, setLatestBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [exclusivePack, setExclusivePack] = useState(null);
  const [loadingPack, setLoadingPack] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [reviewData, setReviewData] = useState({ name: "", email: "", message: "", rating: 0 });

  // ---------- Newsletter ----------
  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "newsletter"), {
        email: newsletterEmail,
        createdAt: serverTimestamp(),
      });
      setNewsletterMessage("Merci ! Votre email a été enregistré.");
      setNewsletterEmail("");
    } catch {
      setNewsletterMessage("Une erreur est survenue. Veuillez réessayer.");
    }
  };

  const StarRating = ({ rating }) => (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? "star filled" : "star"}>
          ★
        </span>
      ))}
    </div>
  );

  // ---------- Promo utils ----------
  const applyPromo = (price, promo) => {
    if (!promo || promo.amount == null) return price;
    return +(price * (1 - promo.amount / 100)).toFixed(2);
  };

  const getGeneralPromos = async () => {
    const q = query(
      collection(db, "promos"),
      where("active", "==", true),
      where("type", "==", "general")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  // ---------- Fetch Books ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await getDocs(query(collection(db, "books"), orderBy("createdAt", "desc"), limit(4)));
      let books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const promos = await getGeneralPromos();
      const promo = promos.find((p) => p.appliesTo === "all" || p.appliesTo === "books");
      if (promo) {
        books = books.map((b) => ({ ...b, promoPrice: applyPromo(b.price, promo) }));
      }
      setLatestBooks(books);
      setLoading(false);
    })();
  }, []);

  // ---------- Hero Video iOS Play Fix ----------
  useEffect(() => {
    const video = document.querySelector(".hero-video");
    if (!video) return;
    const tryPlay = () => {
      video.play().catch(() => {});
      window.removeEventListener("touchstart", tryPlay);
    };
    window.addEventListener("touchstart", tryPlay);
  }, []);

  // ---------- Fetch Pack ----------
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "packs"), orderBy("createdAt", "desc"), limit(1)));
      if (!snap.empty) {
        let pack = normalizePackTtc({ id: snap.docs[0].id, ...snap.docs[0].data() });
        const promos = await getGeneralPromos();
        const promo = promos.find((p) => p.appliesTo === "all" || p.appliesTo === "packs");
        if (promo) pack.promoPrice = applyPromo(pack.price, promo);
        setExclusivePack(pack);
      }
      setLoadingPack(false);
    })();
  }, []);

  const formatPrice = (p) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(p);

  // fetch reviews 
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const q = query(
          collection(db, "reviews"),
          orderBy("createdAt", "desc"),
          limit(10)
        );

        const snap = await getDocs(q);

        const data = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(r => r.active === true) // ✅ FILTRAGE ICI
          .slice(0, 6);

        setReviews(data);
      } catch (err) {
        console.error("Erreur fetch reviews:", err);
      } finally {
        setReviewsLoading(false);
      }
    };

    fetchReviews();
  }, []);

  // Carousel state
  const [currentReview, setCurrentReview] = useState(0);
  const [reviewsPerPage, setReviewsPerPage] = useState(
    typeof window !== "undefined"
      ? window.innerWidth >= 992
        ? 3
        : window.innerWidth >= 768
          ? 2
          : 1
      : 1
  );

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setReviewsPerPage(w >= 992 ? 3 : w >= 768 ? 2 : 1);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const totalReviewPages = Math.max(1, Math.ceil(reviews.length / reviewsPerPage));

  useEffect(() => {
    if (currentReview > totalReviewPages - 1) {
      setCurrentReview(0);
    }
  }, [currentReview, totalReviewPages]);

  return (
    <div className="home">
      {/* HERO */}
      <section className={`hero ${videoReady ? "video-loaded" : ""}`}>
        {/* Vidéo hero (desktop + mobile) */}
        <video
          className="hero-video"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          poster="/poster.jpg"
          onLoadedData={() => setVideoReady(true)}
        >
          <source src={heroVideo} type="video/mp4" />
        </video>

        <div className="hero-content">
          <h1>
            <span>La Caverne fut un Refuge</span>
            <br />
            <span className="highlight">pour les Croyants.</span>
          </h1>
          <p>
            Explorez notre collection de livres authentiques. Profitez d'une expérience
            enrichissante à chaque page.
          </p>
          <div className="hero-actions">
            <Link to="/books" className="btn btn-primary">
              <FaBookOpen /> Parcourir la collection <FaArrowRight />
            </Link>
            <Link to="/about" className="btn btn-secondary">
              <FaFire /> Notre Histoire
            </Link>
          </div>
        </div>
      </section>

      {/* LATEST BOOKS */}
      <section className="latest-books">
        <div className="container-inner">
          <div className="section-header">
            <h2>Nos Coups de Cœur</h2>
            <p className="section-subtitle">
              Découvrez les incontournables de notre librairie
            </p>
          </div>

          {loading ? (
            <div className="loading-state">Chargement des livres...</div>
          ) : latestBooks.length === 0 ? (
            <p className="no-data">Aucun livre disponible pour le moment.</p>
          ) : (
            <>
              <div className="books-grid home-books-grid">
                {latestBooks.map((book) => (
                  <Link
                    key={book.id}
                    to={`/book/${book.id}`}       
                    state={{ bookData: book }} 
                    className="book-card-link home-book-card-link">
                    <div className="book-card">
                      <div className="book-image">
                        <img
                          src={book.images?.[0] || book.image || "/placeholder.jpg"}
                          alt={book.title}
                        />
                      </div>

                      <div className="book-info">
                        <div className="meta">
                          <span className="book-category">{book.category}</span>
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

              {/* BOUTON VERS LA PAGE LIVRES */}
              <div className="books-section-btn">
                <Link to="/books" className="btn-outline-small">
                  Voir Plus
                </Link>
              </div>
            </>
          )}
        </div>
      </section>


      {/* EXCLUSIVE PACK */}
      <section className="exclusive-mini-luxe">
        <div className="mesh-gradient-subtle"></div>
        <div className="container-compact">
          <div className="mini-branding">
            <span className="gold-label">ÉDITION SIGNATURE</span>
            <h2 className="mini-title-luxe">
              L'Exclusivité <span className="serif-italic">Alkahf</span>
            </h2>
          </div>

          {loadingPack ? (
            <div className="loading-state">Chargement des Packs...</div>
                ) : latestBooks.length === 0 ? (
                <p className="no-data">Aucun Pack disponible pour le moment.</p>
          ) : (
            exclusivePack && (
              <Link
                key={exclusivePack.id}
                to={`/pack/${exclusivePack.id}`} // redirige vers PackDetails
                state={{ packId: exclusivePack.id, packData: exclusivePack }} // passe le pack complet
                className="mini-luxury-card-link"
              >
                <div className="mini-luxury-card">
                  <div className="card-inner-flex">
                    <div className="mini-visual">
                      <img
                        src={exclusivePack.images?.[0] || exclusivePack.image || "/placeholder.jpg"}
                        alt={exclusivePack.title}
                      />
                    </div>

                    <div className="mini-content">
                      <div className="text-top">
                        <h3 className="pack-name">{exclusivePack.title}</h3>
                        <p className="pack-summary">{exclusivePack.description}</p>
                      </div>

                      <div className="mini-action-row">
                        <div className="price-minimal">
                          {exclusivePack.promoPrice && exclusivePack.promoPrice < exclusivePack.price ? (
                            <>
                              <span className="price-old">
                                {formatPrice(getPriceWithTax(exclusivePack.price))}
                              </span>
                              <span className="price-val">
                                {formatPrice(getPriceWithTax(exclusivePack.promoPrice))}
                              </span>
                            </>
                          ) : (
                            <span className="price-val">
                              {formatPrice(getPriceWithTax(exclusivePack.price))}
                            </span>
                          )}
                        </div>

                        <div className="mini-cta-black">
                          Découvrir <FaArrowRight />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          )}
        </div>
      </section>


      {/* WHY CHOOSE US */}
      <section className="why-choose">
        <div className="container-inner">
          <h2>Pourquoi Choisir Nos Livres ?</h2>
          <p className="section-subtitle">Nous nous engageons à fournir une qualité irréprochable et un savoir authentique.</p>
          <div className="features-grid">
            <div className="feature-card">
              <FaShieldAlt />
              <h3>Contenu Authentique</h3>
              <p>Chaque ouvrage est rigoureusement sélectionné et vérifié par des étudiants en science et des savants.</p>
            </div>
            <div className="feature-card">
              <FaShippingFast />
              <h3>Livraison Rapide</h3>
              <p>Expédition sécurisée sous 48h. Livraison gratuite pour toute commande supérieure à 100€.</p>
            </div>
            <div className="feature-card">
              <FaBookOpen />
              <h3>Qualité Premium</h3>
              <p>Reliures durables et papier de haute qualité pour une lecture confortable et pérenne.</p>
            </div>
            <div className="feature-card">
              <FaHeadset />
              <h3>Support Dédié</h3>
              <p>Notre équipe est à votre écoute pour vous conseiller dans vos choix de lecture.</p>
            </div>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="why-choose reviews-section">
        <div className="container-inner">
          <h2>Avis de nos Lecteurs</h2>
          <p className="section-subtitle">
            Découvrez les témoignages de notre communauté de lecteurs passionnés.
          </p>

          {reviewsLoading ? (
            <div className="loading-state">Chargement des avis...</div>
          ) : reviews.length === 0 ? (
            <p className="no-reviews">Aucun avis disponible pour le moment.</p>
          ) : (
            <>
              {/* CAROUSEL */}
              <div className="reviews-container">
                <div className="reviews-viewport">
                  <div
                    className="reviews-track"
                    style={{ transform: `translateX(-${currentReview * 100}%)` }}
                  >
                  {reviews.map((rev) => (
                    <div key={rev.id} className="review-card-slide">
                      {/* FEATURE CARD = WHY CHOOSE US */}
                      <div className="feature-card">
                        <StarRating rating={rev.rating} />

                        <p style={{ marginTop: "0.8rem", fontStyle: "italic" }}>
                          “{normalizeMojibakeText(rev.review)}”
                        </p>

                        <div style={{ marginTop: "1rem" }}>
                          <strong>{normalizeMojibakeText(rev.fullName)}</strong>
                          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                            {rev.createdAt?.toDate?.().toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
                {/* ARROWS */}
                {reviews.length > 3 && (
                  <>
                    <button
                      className="carousel-arrow prev"
                      onClick={() =>
                        setCurrentReview((prev) =>
                          prev === 0 ? totalReviewPages - 1 : prev - 1
                        )
                      }
                      aria-label="Avis précédent"
                    >
                      ‹
                    </button>

                    <button
                      className="carousel-arrow next"
                      onClick={() =>
                        setCurrentReview((prev) => (prev + 1) % totalReviewPages)
                      }
                      aria-label="Avis suivant"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>

              {/* DOT PAGINATION */}
            <div className="carousel-dots">
              {Array.from({ length: totalReviewPages }).map((_, index) => (
                <button
                  key={index}
                  className={`dot ${currentReview === index ? "active" : ""}`}
                  onClick={() => setCurrentReview(index)}
                  aria-label={`Aller au groupe d'avis ${index + 1}`}
                />
              ))}
            </div>
            </>
          )}

          {/* CTA */}
          <div className="reviews-actions" style={{ textAlign: "center", marginTop: "3rem" }}>
            <button
              className="btn-leave-review"
              onClick={() => {
                setShowReview(true);
                setSubmitted(false);
                setReviewData({ name: "", email: "", message: "", rating: 0 });
              }}
            >
              Laisser un avis
            </button>
          </div>
        </div>
      </section>


      {/* REVIEW POPUP MODAL */}
      {showReview && (
        <div className="review-modal-overlay" onClick={() => setShowReview(false)}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Partagez votre expérience</h3>
              <button className="modal-close" onClick={() => setShowReview(false)}>
                ×
              </button>
            </div>

            {!submitted ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();

                  if (!reviewData.rating) {
                    alert("Veuillez donner une note.");
                    return;
                  }

                  try {
                    await addDoc(collection(db, "reviews"), {
                      fullName: reviewData.name,
                      email: reviewData.email,
                      review: reviewData.message,
                      rating: reviewData.rating,
                      active: false,
                      createdAt: serverTimestamp(),
                    });

                    setSubmitted(true);
                  } catch (error) {
                    console.error("Erreur lors de l'envoi:", error);
                    alert("Une erreur est survenue. Veuillez réessayer.");
                  }
                }}
                className="review-form"
              >
                <div className="form-group">
                  <label htmlFor="name">Nom complet *</label>
                  <input
                    id="name"
                    type="text"
                    value={reviewData.name}
                    onChange={(e) =>
                      setReviewData({ ...reviewData, name: e.target.value })
                    }
                    required
                    placeholder="Votre nom"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    id="email"
                    type="email"
                    value={reviewData.email}
                    onChange={(e) =>
                      setReviewData({ ...reviewData, email: e.target.value })
                    }
                    required
                    placeholder="votre@email.com"
                  />
                </div>

                <div className="form-group">
                  <label>Votre avis *</label>
                  <div className="textarea-container">
                    <textarea
                      value={reviewData.message}
                      onChange={(e) => {
                        const text = e.target.value;
                        if (text.length <= 250) {
                          setReviewData({ ...reviewData, message: text });
                        }
                      }}
                      maxLength={250}
                      rows={4}
                      required
                      placeholder="Partagez votre expérience avec nos livres..."
                    />
                    <div className="char-counter">
                      {reviewData.message.length} / 250 caractères
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Note *</label>
                  <div className="stars selectable">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={star <= reviewData.rating ? "star filled" : "star"}
                        onClick={() =>
                          setReviewData({ ...reviewData, rating: star })
                        }
                        title={`${star} étoile${star > 1 ? 's' : ''}`}
                      >
                        ★
                      </span>
                    ))}
                    <span className="rating-text">
                      {reviewData.rating > 0 ? `${reviewData.rating}/5` : "Sélectionnez une note"}
                    </span>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-review-submit">
                    Envoyer mon avis
                  </button>
                  <button 
                    type="button" 
                    className="btn-review-cancel"
                    onClick={() => setShowReview(false)}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="submission-success">
                <div className="success-icon">✓</div>
                <h4>Merci pour votre avis !</h4>
                <p>Votre témoignage a été soumis avec succès. Il sera publié après modération.</p>
                <button
                  onClick={() => setShowReview(false)}
                  className="btn-review-close"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEWSLETTER */}
      <section id="newsletter-section" className="newsletter">
        <div className="container-inner">
          <h2><FaEnvelope /> Restez Informés</h2>
          <p>Inscrivez-vous pour recevoir nos nouveaux arrivages, nos offres exclusives et nos conseils de lecture.</p>
          <form className="newsletter-form" onSubmit={handleNewsletterSubmit}>
            <input
              type="email"
              placeholder="votre.email@exemple.com"
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">S'abonner</button>
          </form>
          {newsletterMessage && <p className="newsletter-message">{newsletterMessage}</p>}
        </div>
      </section>
    </div>
  );
};

export default Home;


