import React from "react";

const TermsOfSale = () => {
  return (
    <section className="legal-section">
      <div className="container-inner legal-container">

        <header className="legal-header">
          <span className="gold-label">Vente</span>
          <h1>Conditions Générales de Vente</h1>
          <p className="legal-subtitle">Al Kahf</p>
        </header>

        <div className="legal-card">
          <h2>Objet</h2>
          <p>
            Les présentes CGV régissent les ventes réalisées sur le site Al Kahf.
          </p>
        </div>

        <div className="legal-card">
          <h2>Produits et prix</h2>
          <p>
            Les prix sont indiqués en euros TTC.
            Al Kahf se réserve le droit de modifier ses prix à tout moment.
          </p>
        </div>

        <div className="legal-card">
          <h2>Paiement</h2>
          <p>
            Le paiement est sécurisé et exigible à la commande.
          </p>
        </div>

        <div className="legal-card">
          <h2>Droit de rétractation</h2>
          <p>
            Conformément à la loi, l’acheteur dispose de 14 jours pour exercer
            son droit de rétractation.
          </p>
        </div>

      </div>
    </section>
  );
};

export default TermsOfSale;
