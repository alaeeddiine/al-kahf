import React, { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";

const RelayPoint = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const country = location.state?.country || "FR";

  useEffect(() => {
    if (window.jQuery && window.jQuery.fn.MR_ParcelShopPicker) {
      setTimeout(() => {
        window.jQuery("#Zone_Widget").MR_ParcelShopPicker({
          Target: "#Retour_Widget",
          Brand: "CC23K35Q",
          Country: country === "Belgium" ? "BE" : "FR",
          ShowResultsOnMap: true,
          MaxResults: 5
        });
      }, 100);
    }
  }, [country]);

  const handleConfirm = () => {
    const relayInput = document.getElementById("Retour_Widget");
    if (!relayInput || !relayInput.value) {
      return alert("Veuillez selectionner un point relais !");
    }
    sessionStorage.setItem("relayPoint", relayInput.value);
    navigate("/checkout");
  };

  return (
    <div className="relay-overlay" role="dialog" aria-modal="true">
      <div className="relay-modal">
        <header className="relay-modal-header">
          <h1 className="details-title">
            Choisir un <span className="gold-text">Point Relais</span>
          </h1>
          <button type="button" className="close-btn" onClick={() => navigate(-1)}>
            x
          </button>
        </header>

        <div className="checkout-section-card">
          <div className="relay-widget">
            <div id="Zone_Widget"></div>
          </div>
          <input type="hidden" id="Retour_Widget" />

          <div className="relay-actions">
            <button type="button" className="tool-btn relay-btn" onClick={handleConfirm}>
              Confirmer le point relais
            </button>
            <Link to="/checkout" className="back-link">
              Annuler
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelayPoint;
