import React from "react";

const PrivacyPolicy = () => {
  return (
    <section className="legal-section beige-bg">
      <div className="container-inner legal-container">

        <header className="legal-header">
          <span className="gold-label">Protection des données</span>
          <h1>Politique de confidentialité</h1>
          <p className="legal-subtitle">
            Conformité RGPD – Règlement (UE) 2016/679
          </p>
        </header>

        <div className="legal-card">
          <h2>Données collectées</h2>
          <ul>
            <li>Nom et prénom</li>
            <li>Adresse email</li>
            <li>Adresse postale</li>
            <li>Données de commande</li>
            <li>Adresse IP</li>
          </ul>
        </div>

        <div className="legal-card">
          <h2>Finalité du traitement</h2>
          <ul>
            <li>Gestion des commandes</li>
            <li>Livraison des livres</li>
            <li>Service client</li>
            <li>Obligations légales et fiscales</li>
          </ul>
        </div>

        <div className="legal-card">
          <h2>Base légale</h2>
          <p>
            Le traitement repose sur l’exécution du contrat, le respect
            d’obligations légales et le consentement de l’utilisateur.
          </p>
        </div>

        <div className="legal-card">
          <h2>Durée de conservation</h2>
          <p>
            Les données sont conservées selon les délais légaux belges
            applicables en matière commerciale et fiscale.
          </p>
        </div>

        <div className="legal-card">
          <h2>Droits des utilisateurs</h2>
          <ul>
            <li>Droit d’accès</li>
            <li>Droit de rectification</li>
            <li>Droit à l’effacement</li>
            <li>Droit d’opposition</li>
            <li>Droit à la portabilité</li>
          </ul>
        </div>

        <div className="legal-card">
          <h2>Contact RGPD</h2>
          <p>
            Email : <strong>alkahf.be@gmail.com</strong>
          </p>
        </div>

      </div>
    </section>
  );
};

export default PrivacyPolicy;
