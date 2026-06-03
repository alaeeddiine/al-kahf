import React, { useCallback, useEffect, useState } from "react";
import { db } from "../firebase/config";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { 
  FaPlus, FaEdit, FaTrash, FaTicketAlt, FaCalendarAlt, 
  FaPercent, FaToggleOn, FaToggleOff, FaTimes 
} from "react-icons/fa";

const AdminPromos = () => {
  const [promos, setPromos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [promoData, setPromoData] = useState({
    title: "", type: "general", code: "", appliesTo: "all",
    amount: "", startDate: "", endDate: "", active: true
  });

  const promosCollection = collection(db, "promos");

  const loadPromos = useCallback(async () => {
    const snap = await getDocs(promosCollection);
    setPromos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, [promosCollection]);

  useEffect(() => { loadPromos(); }, [loadPromos]);

  const handleChange = e => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setPromoData({ ...promoData, [e.target.name]: value });
  };

  const openModal = (promo = null) => {
    if (promo) {
      setEditingId(promo.id);
      setPromoData({ ...promo });
    } else {
      setEditingId(null);
      setPromoData({
        title: "", type: "general", code: "", appliesTo: "all",
        amount: "", startDate: "", endDate: "", active: true
      });
    }
    setShowModal(true);
  };

  const formattedPromo = {
    ...promoData,
    amount: Number(promoData.amount) 
  };
  
  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "promos", editingId), formattedPromo);
      } else {
        await addDoc(promosCollection, { ...formattedPromo, createdAt: serverTimestamp() });
      }
      setShowModal(false);
      loadPromos();
    } catch (error) {
      console.error(error);
    }
  };

  const toggleStatus = async (promo) => {
    const ref = doc(db, "promos", promo.id);
    await updateDoc(ref, { active: !promo.active });
    loadPromos();
  };

  const deletePromo = async id => {
    if (window.confirm("Supprimer cette promotion ?")) {
      await deleteDoc(doc(db, "promos", id));
      loadPromos();
    }
  };

  const translateAppliesTo = (value) => {
    switch (value) {
      case "all": return "Tout le site";
      case "books": return "Livres";
      case "packs": return "Packs";
      default: return value;
    }
  };

  return (
    <div className="admin-page-container">
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Marketing Hub</span>
          <h1>Gestion des Promotions</h1>
        </div>
        <button className="add-btn" onClick={() => openModal()}>
          <FaPlus /> Nouvelle Promo
        </button>
      </header>

      <div className="promo-grid">
        {promos.length === 0 ? (
          <div className="empty-state">Aucune promotion active actuellement.</div>
        ) : (
          promos.map(promo => (
            <div key={promo.id} className={`promo-coupon-card ${!promo.active ? 'is-disabled' : ''}`}>
              <div className="coupon-left">
                {promo.type !== "announce" && (
                  <div className="promo-value">
                    {promo.amount}<span>%</span>
                  </div>
                )}
                <div className="promo-type-tag">
                  {promo.type === 'code' ? 'COUPON' : promo.type === 'announce' ? 'ANNONCE' : 'OFFRE'}
                </div>
              </div>
              
              <div className="coupon-right">
                <div className="promo-main-info">
                  <h3 className="b-title">{promo.title}</h3>
                  {promo.type === 'code' && <div className="promo-code-display">{promo.code}</div>}
                  {promo.type !== 'announce' && (
                    <span className="promo-scope">
                      Applicable sur: <strong>{translateAppliesTo(promo.appliesTo)}</strong>
                    </span>
                  )}
                </div>
                
                {promo.type !== 'announce' && (
                  <div className="promo-dates">
                    <FaCalendarAlt /> {promo.startDate || '∞'} — {promo.endDate || '∞'}
                  </div>
                )}

                <div className="promo-actions-row">
                  <button 
                    className={`status-toggle-btn ${promo.active ? 'active' : ''}`}
                    onClick={() => toggleStatus(promo)}
                    title={promo.active ? "Désactiver" : "Activer"}
                  >
                    {promo.active ? <FaToggleOn size={24} /> : <FaToggleOff size={24} />}
                  </button>
                  <button className="edit-btn" onClick={() => openModal(promo)}><FaEdit /></button>
                  <button className="delete-btn" onClick={() => deletePromo(promo.id)}><FaTrash /></button>
                </div>
              </div>
              <div className="coupon-perforation"></div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="popup-overlay">
          <div className="popup-card">
            <div className="popup-header">
              <h2 className="auth-title">{editingId ? 'Modifier' : 'Créer'} <span className="gold-text">Promotion</span></h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><FaTimes /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="popup-form">
              <div className="input-group">
                <label>Nom de la Promotion / Annonce</label>
                <input type="text" name="title" value={promoData.title} onChange={handleChange} required placeholder="Ex: Soldes d'Hiver ou Nouvelle Annonce" />
              </div>

              <div className="form-row-split">
                <div className="input-group">
                  <label>Type</label>
                  <select name="type" value={promoData.type} onChange={handleChange}>
                    <option value="general">Générale</option>
                    <option value="code">Code Promo</option>
                    <option value="announce">Annonce</option>
                  </select>
                </div>

                {promoData.type !== "announce" && (
                  <div className="input-group">
                    <label>Cible</label>
                    <select name="appliesTo" value={promoData.appliesTo} onChange={handleChange}>
                      <option value="all">Tout</option>
                      <option value="books">Livres</option>
                      <option value="packs">Packs</option>
                    </select>
                  </div>
                )}
              </div>

              {promoData.type !== "announce" && promoData.type === "code" && (
                <div className="input-group">
                  <label><FaTicketAlt /> Code Promo Unique</label>
                  <input type="text" name="code" value={promoData.code} onChange={handleChange} required className="code-input" placeholder="Ex: WINTER20" />
                </div>
              )}

              {promoData.type !== "announce" && (
                <>
                  <div className="input-group">
                    <label><FaPercent /> Valeur de réduction</label>
                    <input
                      type="number"
                      name="amount"
                      value={promoData.amount}
                      onChange={handleChange}
                      required
                      min="1"
                      max="100"
                      placeholder="Ex: 20"
                    />
                  </div>

                  <div className="form-row-split">
                    <div className="input-group">
                      <label>Date Début</label>
                      <input type="date" name="startDate" value={promoData.startDate} onChange={handleChange} />
                    </div>
                    <div className="input-group">
                      <label>Date Fin</label>
                      <input type="date" name="endDate" value={promoData.endDate} onChange={handleChange} />
                    </div>
                  </div>
                </>
              )}

              <button type="submit" className="submit-action-btn">
                {editingId ? "Enregistrer les modifications" : "Lancer la promotion / annonce"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPromos;
