import React, {useCallback, useEffect, useMemo, useState} from "react";
import {auth, db} from "../firebase/config";
import {addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, Timestamp, updateDoc} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";
import {
  FaBookOpen,
  FaGlobe,
  FaImage,
  FaPlus,
  FaSearch,
  FaTag,
  FaTimes,
} from "react-icons/fa";

const LANGUAGES = ["arabic", "arabic/francais", "francais", "anglais", "arabic/anglais"];
const PACK_TAX_RATE = 21;

const formatLanguageLabel = (language) =>
  (language || "").toString().replace(/arabic/gi, "Arabe").replace(/francais/gi, "Français");

const toTtcIfLegacy = (value, priceIncludesTax) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return priceIncludesTax ? +n.toFixed(2) : +(n * (1 + PACK_TAX_RATE / 100)).toFixed(2);
};

const hasPromo = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const imageSrc = (img) => {
  if (!img) return "https://via.placeholder.com/300x180?text=No+Image";
  if (typeof img === "string") return img;
  return img.url || "https://via.placeholder.com/300x180?text=No+Image";
};

const AdminPacks = () => {
  const [packs, setPacks] = useState([]);
  const [overviewPacks, setOverviewPacks] = useState([]);
  const [adminUser, setAdminUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [openActionsFor, setOpenActionsFor] = useState(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState(null);
  const [detailsPack, setDetailsPack] = useState(null);
  const [packsFilter, setPacksFilter] = useState("all");

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    promoPrice: "",
    language: "",
    weight: "",
    includedBooks: [""],
    images: [""],
  });

  const resetForm = () =>
    setForm({
      title: "",
      description: "",
      price: "",
      promoPrice: "",
      language: "",
      weight: "",
      includedBooks: [""],
      images: [""],
    });

  const PAGE_SIZE = 15;
  const packsCollection = useMemo(() => collection(db, "packs"), []);

  const formatPrice = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)}€` : "-";
  };

  const toHtva = (ttcValue) => {
    const n = Number(ttcValue);
    return Number.isFinite(n) ? +(n * 0.79).toFixed(2) : null;
  };

  const truncateText = (value, maxLength = 34) => {
    const text = String(value || "-");
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
  };

  const normalizePack = (docSnap) => {
    const p = docSnap.data();
    const priceIncludesTax = p.priceIncludesTax === true;
    const normalizedPrice = toTtcIfLegacy(p.price, priceIncludesTax);
    const normalizedPromo = p.promoPrice == null ? null : toTtcIfLegacy(p.promoPrice, priceIncludesTax);

    return {
      ...p,
      id: docSnap.id,
      price: normalizedPrice ?? 0,
      promoPrice: normalizedPromo,
      priceIncludesTax: true,
      images: Array.isArray(p.images) ? p.images : [""],
      includedBooks: Array.isArray(p.includedBooks) ? p.includedBooks : [""],
    };
  };

  const fetchPacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(packsCollection);
      const items = snap.docs.map(normalizePack);
      items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      setPacks(items);
    } catch (err) {
      console.error("Erreur chargement packs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [packsCollection]);

  const fetchOverview = useCallback(async () => {
    setIsOverviewLoading(true);
    try {
      const snap = await getDocs(packsCollection);
      const items = snap.docs.map(normalizePack);
      items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      setOverviewPacks(items);
    } catch (err) {
      console.error("Erreur count packs:", err);
    } finally {
      setIsOverviewLoading(false);
    }
  }, [packsCollection]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAdminUser(user));
    fetchPacks();
    fetchOverview();

    const unsubscribe = onSnapshot(
      packsCollection,
      (snap) => {
        const items = snap.docs.map(normalizePack);
        items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
        setPacks(items);
      },
      (err) => {
        console.error("Erreur abonnement packs:", err);
        fetchPacks();
      },
    );

    return () => {
      unsub();
      unsubscribe();
    };
  }, [fetchPacks, fetchOverview, packsCollection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setOpenActionsFor(null);
    setActionsMenuPosition(null);
  }, [searchTerm, currentPage]);

  const filteredPacks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const source = packsFilter === "promo" ? packs.filter((pack) => hasPromo(pack.promoPrice)) : packs;
    if (!term) return source;

    return source.filter((pack) =>
      [pack.title, pack.description, pack.language, ...(Array.isArray(pack.includedBooks) ? pack.includedBooks : [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [packs, packsFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredPacks.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const currentPacks = filteredPacks.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const toggleActionsMenu = (event, packId) => {
    if (openActionsFor === packId) {
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

    setActionsMenuPosition({top, left, openUpward});
    setOpenActionsFor(packId);
  };

  const totalPacks = overviewPacks.length || packs.length || 0;
  const promoPacks = overviewPacks.filter((pack) => hasPromo(pack.promoPrice)).length;
  const togglePacksFilter = (filter) => {
    setPacksFilter((prev) => (prev === filter ? "all" : filter));
  };
  const activeKpiStyle = (filter) =>
    packsFilter === filter
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

  const handleImageUpload = async (index, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "preset_public");

    try {
      const res = await fetch("https://api.cloudinary.com/v1_1/djukqnpbs/image/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const imgs = [...form.images];
      imgs[index] = {
        url: data.secure_url,
        public_id: data.public_id,
      };
      setForm({...form, images: imgs});
    } catch (err) {
      console.error("Erreur upload image pack:", err);
    }
  };

  const addImageSlot = () => {
    if (form.images.length >= 5) return;
    setForm({...form, images: [...form.images, ""]});
  };

  const removeImage = (index) => {
    if (form.images.length === 1) return;
    setForm({...form, images: form.images.filter((_, i) => i !== index)});
  };

  const addIncludedBook = () => {
    setForm({...form, includedBooks: [...form.includedBooks, ""]});
  };

  const updateIncludedBook = (index, value) => {
    const books = [...form.includedBooks];
    books[index] = value;
    setForm({...form, includedBooks: books});
  };

  const removeIncludedBook = (index) => {
    if (form.includedBooks.length === 1) return;
    setForm({...form, includedBooks: form.includedBooks.filter((_, i) => i !== index)});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adminUser) return alert("Acces refuse");
    setIsSubmitting(true);

    try {
      const payload = {
        ...form,
        price: Number(Number(form.price).toFixed(2)),
        promoPrice: form.promoPrice ? Number(Number(form.promoPrice).toFixed(2)) : null,
        priceIncludesTax: true,
        weight: Number(Number(form.weight).toFixed(2)),
        includedBooks: form.includedBooks.filter((b) => b.trim() !== ""),
        updatedAt: Timestamp.now(),
      };

      if (editId) {
        await updateDoc(doc(db, "packs", editId), payload);
      } else {
        await addDoc(packsCollection, {...payload, createdAt: Timestamp.now()});
      }

      setShowForm(false);
      setEditId(null);
      resetForm();
      setCurrentPage(1);
      fetchPacks();
      fetchOverview();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (pack) => {
    setEditId(pack.id);
    setForm({
      title: pack.title || "",
      description: pack.description || "",
      price: pack.price || "",
      promoPrice: pack.promoPrice || "",
      weight: pack.weight || "",
      language: pack.language || "",
      includedBooks: pack.includedBooks?.length ? pack.includedBooks : [""],
      images: pack.images?.length ? pack.images : [""],
    });
    setShowForm(true);
  };

  const handleDelete = async (pack) => {
    if (!window.confirm("Supprimer ce pack ?")) return;

    try {
      for (const img of pack.images || []) {
        const publicId = typeof img === "object" ? img?.public_id : null;
        if (publicId) {
          await fetch("/api/delete-cloudinary-image", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({public_id: publicId}),
          });
        }
      }

      await deleteDoc(doc(db, "packs", pack.id));
      fetchPacks();
      fetchOverview();
    } catch (err) {
      console.error("Erreur lors de la suppression du pack:", err);
    }
  };

  const closeDetailsModal = () => setDetailsPack(null);

  return (
    <div className="admin-page-container admin-books-page">
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Packs Premium</span>
          <h1>Packs Exclusifs</h1>
        </div>
        <button
          className="add-btn auth-submit-btn-premium"
          onClick={() => {
            setEditId(null);
            resetForm();
            setShowForm(true);
          }}
        >
          <FaPlus /> Nouveau Pack
        </button>
      </header>

      <div className="stats-mini-grid customers-kpi-grid">
        <div className="mini-stat-card customers-kpi-card">
          <div className="stat-icon"><FaBookOpen /></div>
          <div className="stat-info">
            <span className="stat-label">Packs Total</span>
            <span className="stat-value">{isOverviewLoading ? "..." : totalPacks}</span>
          </div>
        </div>
        <button
          type="button"
          className="mini-stat-card customers-kpi-card"
          onClick={() => togglePacksFilter("promo")}
          style={activeKpiStyle("promo")}
          title={packsFilter === "promo" ? "Afficher tous les packs" : "Filtrer les packs en promotion"}
          aria-pressed={packsFilter === "promo"}
        >
          <div className="stat-icon"><FaTag /></div>
          <div className="stat-info">
            <span className="stat-label">Packs en Promotion</span>
            <span className="stat-value">{isOverviewLoading ? "..." : promoPacks}</span>
          </div>
        </button>
      </div>

      <div className="inventory-card">
        <div className="card-header customers-card-header">
          <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
            <span className="auth-subtitle">Catalogue Packs</span>
          </div>
          <div className="action-cluster customers-actions-head">
            <div className="search-bar-premium customers-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Rechercher un pack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="customers-table-scroll">
          <table className="premium-table customers-table">
            <thead>
              <tr>
                <th style={{textAlign: "center"}}>Pack</th>
                <th style={{textAlign: "center"}}>Prix</th>
                <th style={{textAlign: "center"}}>Langue</th>
                <th style={{textAlign: "center"}}>Promotion</th>
                <th style={{textAlign: "center"}}>Poids</th>
                <th style={{textAlign: "center"}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="table-loader">Chargement...</td>
                </tr>
              ) : currentPacks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-table-msg">Aucun pack trouve.</td>
                </tr>
              ) : (
                currentPacks.map((p) => {
                  const menuOpen = openActionsFor === p.id;
                  const promoActive = hasPromo(p.promoPrice);

                  return (
                    <tr key={p.id} style={{height: "56px"}}>
                      <td style={{padding: "8px 12px", textAlign: "left"}}>
                        <div className="book-cell" style={{minWidth: "240px"}}>
                          <img src={imageSrc(p.images?.[0])} alt={p.title || "Pack"} />
                          <div>
                            <span className="b-title" title={p.title || ""}>{truncateText(p.title, 36)}</span>
                            <span className="b-author" title={p.description || ""}>{truncateText(p.description || "Sans description", 80)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="price-tag" style={{padding: "8px 12px", textAlign: "center"}}>
                        <div style={{display: "grid", gap: "3px"}}>
                          <span>{formatPrice(p.price)} TTC</span>
                          <span style={{fontSize: "0.78rem", opacity: 0.68}}>{formatPrice(toHtva(p.price))} HTVA</span>
                        </div>
                      </td>
                      <td style={{padding: "8px 12px", textAlign: "center"}}>
                        <span className="cat-pill"><FaGlobe /> {formatLanguageLabel(p.language) || "-"}</span>
                      </td>
                      <td style={{padding: "8px 12px", textAlign: "center"}}>
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
                          {promoActive ? formatPrice(p.promoPrice) : "Aucune"}
                        </span>
                      </td>
                      <td style={{padding: "8px 12px", textAlign: "center"}}>{Number(p.weight || 0).toFixed(2)} kg</td>
                      <td style={{padding: "8px 12px", textAlign: "center", position: "relative", minWidth: "120px"}}>
                        <button
                          className="page-btn"
                          style={{padding: "6px 10px", minWidth: "32px"}}
                          onClick={(event) => toggleActionsMenu(event, p.id)}
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
                            <button className="page-btn" onClick={() => { setDetailsPack(p); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                              Plus d'infos
                            </button>
                            <button className="page-btn" onClick={() => { handleEdit(p); setOpenActionsFor(null); setActionsMenuPosition(null); }}>
                              Modifier
                            </button>
                            <button
                              className="page-btn"
                              onClick={() => { setOpenActionsFor(null); setActionsMenuPosition(null); handleDelete(p); }}
                              style={{background: "#dc2626", color: "#ffffff", borderColor: "#dc2626"}}
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
          <button
            className="page-btn"
            disabled={clampedPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Précédent
          </button>
          <span style={{fontSize: "0.85rem", opacity: 0.7}}>
            Page {clampedPage} / {totalPages}
          </span>
          <button
            className="page-btn"
            disabled={clampedPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Suivant
          </button>
        </div>
      </div>

      {detailsPack ? (
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
            <div style={{padding: "14px 18px", borderBottom: "1px solid rgba(20,20,20,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <h2 style={{margin: 0, fontSize: "1.05rem"}}>Détails Pack</h2>
            </div>
            <div style={{padding: "16px 18px"}}>
              <div style={{display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px"}}>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Titre</strong><p style={{margin: "6px 0 0"}}>{detailsPack.title || "-"}</p></div>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Langue</strong><p style={{margin: "6px 0 0"}}>{formatLanguageLabel(detailsPack.language) || "-"}</p></div>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Prix TTC</strong><p style={{margin: "6px 0 0"}}>{formatPrice(detailsPack.price)}</p></div>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Prix promo TTC</strong><p style={{margin: "6px 0 0"}}>{hasPromo(detailsPack.promoPrice) ? formatPrice(detailsPack.promoPrice) : "-"}</p></div>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Prix HTVA</strong><p style={{margin: "6px 0 0"}}>{formatPrice(toHtva(detailsPack.price))}</p></div>
                <div style={{border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Poids</strong><p style={{margin: "6px 0 0"}}>{detailsPack.weight ? `${detailsPack.weight} kg` : "-"}</p></div>
                <div style={{gridColumn: "1 / -1", border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Description</strong><p style={{margin: "6px 0 0"}}>{detailsPack.description || "-"}</p></div>
                <div style={{gridColumn: "1 / -1", border: "1px solid rgba(20,20,20,0.1)", borderRadius: "8px", padding: "10px"}}><strong>Livres inclus</strong><p style={{margin: "6px 0 0"}}>{(Array.isArray(detailsPack.includedBooks) ? detailsPack.includedBooks : []).filter(Boolean).join(", ") || "-"}</p></div>
              </div>
              <div style={{marginTop: "14px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(20,20,20,0.1)", paddingTop: "12px"}}>
                <button className="page-btn" onClick={closeDetailsModal}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showForm && (
        <div className="popup-overlay">
          <form className="popup-card" onSubmit={handleSubmit}>
            <div className="popup-header">
              <h3>{editId ? "Modifier" : "Ajouter"} un pack</h3>
              <button type="button" className="close-btn" onClick={() => setShowForm(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="popup-form">
              <div className="input-group">
                <label>Titre</label>
                <input required value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} />
              </div>

              <div className="input-group">
                <label>Description</label>
                <textarea rows="3" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
              </div>

              <div className="form-row-split">
                <div className="input-group">
                  <label>Prix TTC</label>
                  <input type="number" step="0.01" required value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>Prix promo TTC</label>
                  <input type="number" step="0.01" value={form.promoPrice} onChange={(e) => setForm({...form, promoPrice: e.target.value})} />
                </div>
              </div>

              <div className="input-group">
                <label>Poids (kg)</label>
                <input type="number" step="0.01" required value={form.weight} onChange={(e) => setForm({...form, weight: e.target.value})} placeholder="ex: 0.45" />
              </div>

              <div className="input-group">
                <label>Langue</label>
                <select required value={form.language} onChange={(e) => setForm({...form, language: e.target.value})}>
                  <option value="">Langue</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{formatLanguageLabel(l)}</option>
                  ))}
                </select>
              </div>

              <div className="included-books-zone">
                <h4 style={{margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "8px"}}>
                  <FaBookOpen /> Livres inclus
                </h4>
                {form.includedBooks.map((book, i) => (
                  <div key={i} className="included-book-row">
                    <input style={{flex: 1}} placeholder="Nom du livre" value={book} onChange={(e) => updateIncludedBook(i, e.target.value)} />
                    <button type="button" onClick={() => removeIncludedBook(i)} className="delete-btn">
                      <FaTimes />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addIncludedBook} className="add-btn" style={{padding: "5px 12px", fontSize: "0.8rem"}}>
                  <FaPlus /> Ajouter un titre
                </button>
              </div>

              <div className="image-upload-zone">
                <h4 style={{width: "100%", margin: "0 0 1rem 0"}}>Galerie Photos</h4>
                {form.images.map((img, i) => (
                  <div key={i} className="image-slot">
                    {img ? (
                      <>
                        <img src={imageSrc(img)} alt="" />
                        <button type="button" onClick={() => removeImage(i)} className="remove-img-badge">
                          x
                        </button>
                      </>
                    ) : (
                      <label style={{cursor: "pointer", textAlign: "center"}}>
                        <FaImage style={{color: "#cbd5e1", fontSize: "1.5rem"}} />
                        <input type="file" hidden onChange={(e) => handleImageUpload(i, e)} />
                      </label>
                    )}
                  </div>
                ))}
                {form.images.length < 5 && (
                  <button type="button" onClick={addImageSlot} className="image-slot" style={{background: "none", cursor: "pointer"}}>
                    <FaPlus style={{color: "#cbd5e1"}} />
                  </button>
                )}
              </div>

              <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : (editId ? "Mettre a jour" : "Publier le pack")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPacks;
