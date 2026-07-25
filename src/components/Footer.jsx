import React from "react";
import { Link } from "react-router-dom";
import {
  FaInstagram,
  FaEnvelope,
  // FaPhone,
  FaMapMarkerAlt,
  FaChevronRight,
  FaStore,
} from "react-icons/fa";

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1771019939/logo_4_ysrb3w.png";

const Footer = () => {
  return (
    <footer className="footer-premium">
      <div className="container-inner footer-grid">
        {/* Brand */}
        <div className="footer-brand">
          <Link to="/" className="footer-logo">
            <img src={logo} alt="Alkahf Logo" />
            <span>AL KAHF</span>
          </Link>
          <p className="footer-desc">
            La caverne fut un Refuge pour les Croyants.
          </p>
        </div>

        {/* Quick Links */}
        <div className="footer-links">
          <h4>Navigation</h4>
          <div className="gold-underline"></div>
          <ul>
            <li><Link to="/books"><FaChevronRight /> Livres adultes</Link></li>
            <li><Link to="/kids"><FaChevronRight /> Livres enfants</Link></li>
            <li><Link to="/packs"><FaChevronRight /> Packs Exclusifs</Link></li>
            <li><Link to="/about"><FaChevronRight /> À Propos</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div className="footer-contact">
          <h4>Contactez-nous</h4>
          <div className="gold-underline"></div>
          <div className="contact-list">
            <div className="contact-item">
              <FaMapMarkerAlt className="c-icon" />
              <p>Belgique</p>
            </div>
            {/* <div className="contact-item">
              <FaPhone className="c-icon" />
              <p>+32 492 43 44 57</p>
            </div> */}
            <div className="contact-item">
              <FaEnvelope className="c-icon" />
              <p>contact@alkahf.be</p>
            </div>
          </div>
        </div>

        {/* Social Media */}
        <div className="footer-social">
          <h4>Suivez-nous</h4>
          <div className="gold-underline"></div>
          <div className="social-links-row">
            <a href="mailto:contact@alkahf.be" className="social-circle"><FaEnvelope /></a>
            <a href="https://www.instagram.com/alkahf.be/" className="social-circle"><FaInstagram /></a>
            <a href="https://www.vinted.be/member/271277738-maktaba-al-kahf" className="social-circle"><FaStore /></a>
          </div>
        </div>  
      </div> <br />

      <div className="footer-copyright">
        <div className="container-inner copyright-flex">
          <p>&copy; {new Date().getFullYear()} <strong>Alkahf</strong>. Tous droits réservés.</p>
          <div className="footer-legal">
            <a href="/LegalNotice">Mentions Légales</a>
            <span className="footer-legal-sep">-</span>
            <a href="/PrivacyPolicy">confidentialité & cookies</a>
            <span className="footer-legal-sep">-</span>
            <a href="/TermsOfUse">Conditions d’utilisation</a>
            <span className="footer-legal-sep">-</span>
            <a href="/TermsOfSale">Conditions de vente</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
