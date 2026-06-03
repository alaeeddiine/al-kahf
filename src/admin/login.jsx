import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/config";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FaLock, FaEnvelope, FaShieldAlt, FaArrowRight, FaFingerprint } from "react-icons/fa";

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1771250339/Design_sans_titre_4_dnw65w.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.setItem("adminLogged", "true");
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError("Accès refusé. Identifiants non reconnus.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth-container">
      {/* Immersive Background */}
      <div className="auth-bg-overlay"></div>
      
      <div className="login-card-premium">
        <div className="login-header-premium">
          <div className="logo-wrapper-auth">
             <img src={logo} alt="Logo" className="auth-logo-img" />
             <div className="gold-divider"></div>
          </div>
          <h1 className="auth-title">CENTRAL <span className="gold-text">COMMAND</span></h1>
          <p className="auth-subtitle">Terminal de Gestion Sécurisé ALKAHF</p>
        </div>

        {error && (
          <div className="error-badge-premium">
            <FaShieldAlt className="err-icon" /> {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="auth-form-premium">
          <div className="premium-input-group">
            <label>Identifiant Administrateur</label>
            <div className="input-field-wrapper">
              <FaEnvelope className="field-icon" />
              <input
                type="email"
                placeholder="admin@alkahf.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="premium-input-group">
            <label>Clef de Sécurité</label>
            <div className="input-field-wrapper">
              <FaLock className="field-icon" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn-premium" disabled={loading}>
            {loading ? (
              <span className="loader-text">Validation...</span>
            ) : (
              <>
                <FaFingerprint className="btn-icon" /> Initialiser la Session <FaArrowRight className="btn-arrow" />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer-premium">
          <div className="security-line">
            <span className="dot"></span>
            <p className="premium-tag">Connexion Cryptée AES-256</p>
          </div>
          <p className="copyright-text">© {new Date().getFullYear()} ALKAHF — V.2.5.0</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
