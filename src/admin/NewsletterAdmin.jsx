import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FaEnvelope, FaCalendarAlt, FaDownload, FaUserShield, FaSearch } from 'react-icons/fa';

const NewsletterAdmin = () => {
  const [subscribers, setSubscribers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const fetchSubscribers = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'newsletter'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSubscribers(data);
      } catch (error) {
        console.error("Erreur récupération newsletter:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscribers();
  }, []);

  const filteredSubscribers = subscribers.filter(sub => 
    sub.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, subscribers.length]);

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const currentSubscribers = filteredSubscribers.slice(startIndex, startIndex + PAGE_SIZE);

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Email,Date"].concat(subscribers.map(s => `${s.email},${s.createdAt?.toDate().toLocaleDateString()}`)).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "subscribers_list.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="admin-page-container">
      {/* HEADER SECTION */}
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Audience Insight</span>
          <h1>Abonnés Newsletter</h1>
        </div>
        
        <div className="action-cluster">
            <div className="search-bar-premium">
                <FaSearch />
                <input 
                    type="text" 
                    placeholder="Rechercher un email..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button className="add-btn" onClick={handleExport}>
                <FaDownload /> Exporter CSV
            </button>
        </div>
      </header>

      {/* STATS SUMMARY */}
      <div className="stats-mini-grid">
        <div className="mini-stat-card">
            <div className="stat-icon"><FaUserShield /></div>
            <div className="stat-info">
                <span className="stat-label">Total Abonnés</span>
                <span className="stat-value">{subscribers.length}</span>
            </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="inventory-card">
        <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FaEnvelope className="gold-text" />
                <span className="auth-subtitle">Base de données Emails</span>
            </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>Email Utilisateur</th>
                <th>Date d'adhésion</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="3" className="table-loader">Chargement des données...</td></tr>
              ) : filteredSubscribers.length === 0 ? (
                <tr><td colSpan="3" className="empty-table-msg">Aucun abonné trouvé.</td></tr>
              ) : (
                currentSubscribers.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div className="email-cell">
                        <div className="email-icon-bg"><FaEnvelope /></div>
                        <span className="b-title">{sub.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="date-cell-premium">
                        <FaCalendarAlt className="gold-text" size={12} />
                        {sub.createdAt?.toDate().toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'long', year: 'numeric'
                        }) || '-'}
                      </div>
                    </td>
                    <td>
                      <span className="status-badge confirmed">Actif</span>
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

export default NewsletterAdmin;
