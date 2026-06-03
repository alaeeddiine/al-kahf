import React, { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FaSearch, FaStar, FaCalendarAlt, FaComments, FaCheckCircle, FaEyeSlash } from 'react-icons/fa';

const AdminReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // ---------- Fetch Reviews ----------
  const fetchReviews = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReviews(data);
    } catch (error) {
      console.error("Erreur récupération reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // ---------- Filtered Reviews ----------
  const filteredReviews = reviews.filter(r =>
    (r.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.review || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredReviewsByTime = filteredReviews.filter((r) => {
    if (statusFilter === "public") return r.active === true;
    if (statusFilter === "private") return r.active === false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredReviewsByTime.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const currentReviews = filteredReviewsByTime.slice(startIndex, startIndex + PAGE_SIZE);

  // ---------- Count Active ----------
  const activeCount = reviews.filter(r => r.active).length;

  // ---------- KPIs ----------
  const totalReviewsKpi = reviews.length;
  const activeReviewsKpi = reviews.filter(r => r.active).length;
  const privateReviewsKpi = reviews.filter(r => !r.active).length;

  // ---------- Toggle Active ----------
  const toggleActive = async (review) => {
    if (!review.active && activeCount >= 6) {
      alert("Maximum 6 avis actifs.");
      return;
    }

    try {
      const ref = doc(db, "reviews", review.id);
      await updateDoc(ref, {
        active: !review.active,
        updatedAt: serverTimestamp(),
      });

      setReviews(prev =>
        prev.map(r =>
          r.id === review.id ? { ...r, active: !r.active } : r
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="admin-page-container">
      {/* HEADER */}
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Gestion des Avis</span>
          <h1>Avis Clients</h1>
        </div>
        <div className="action-cluster">
          <div className="search-bar-premium">
            <FaSearch />
            <input
              type="text"
              placeholder="Rechercher un nom, email ou avis..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ marginLeft: "10px" }}>
            <span>{activeCount}/6 activées</span>
          </div>
        </div>
      </header>

      <div className="stats-mini-grid customers-kpi-grid">
        <div
          className="mini-stat-card customers-kpi-card"
          style={{ textAlign: "left" }}
          title="Total avis"
        >
          <div className="stat-icon">
            <FaComments />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Avis</span>
            <span className="stat-value">{totalReviewsKpi}</span>
          </div>
        </div>

        <div
          className="mini-stat-card customers-kpi-card"
          style={{ textAlign: "left" }}
          title="Total avis"
        >
          <div className="stat-icon">
            <FaCheckCircle />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Avis</span>
            <span className="stat-value">{activeReviewsKpi}</span>
          </div>
        </div>

        <div
          className="mini-stat-card customers-kpi-card"
          style={{ textAlign: "left" }}
          title="Total avis"
        >
          <div className="stat-icon">
            <FaEyeSlash />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Avis</span>
            <span className="stat-value">{privateReviewsKpi}</span>
          </div>
        </div>
      </div>

      {/* TABLE DES AVIS */}
      <div className="inventory-card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FaStar className="gold-text" />
            <span className="auth-subtitle"> Tableau des Avis</span>
          </div>
          <div className="filter-pill-group sort-wrapper" style={{ gap: "6px" }}>
            <button
              className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              Tous
            </button>
            <button
              className={`filter-pill ${statusFilter === "public" ? "active" : ""}`}
              onClick={() => setStatusFilter("public")}
            >
              Public
            </button>
            <button
              className={`filter-pill ${statusFilter === "private" ? "active" : ""}`}
              onClick={() => setStatusFilter("private")}
            >
              Privé
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Avis</th>
                <th>Note</th>
                <th>Date</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="table-loader">Chargement des Avis...</td>
                </tr>
              ) : filteredReviewsByTime.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-table-msg">Aucun avis trouvé.</td>
                </tr>
              ) : (
                currentReviews.map((rev) => (
                  <tr key={rev.id}>
                    <td>{rev.fullName}</td>
                    <td>{rev.email}</td>
                    <td>{rev.review}</td>
                    <td>
                      <div className="stars">
                        {[1,2,3,4,5].map(s => (
                          <span key={s} className={s <= rev.rating ? "star filled" : "star"}>★</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="date-cell-premium">
                        <FaCalendarAlt className="gold-text" size={12} />
                        {rev.createdAt?.toDate().toLocaleDateString('fr-FR') || '-'}
                      </div>
                    </td>
                    <td>
                      <button
                        className={`status-badge ${rev.active ? 'confirmed' : 'pending'}`}
                        onClick={() => toggleActive(rev)}
                        title={rev.active ? "Privé" : "Public"}
                      >
                        {rev.active ? "Public" : "Privé"}
                      </button>
                    </td>
                  </tr>
                ))
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
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
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
    </div>
  );
};

export default AdminReviews;
