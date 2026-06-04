import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const logo =
  "https://res.cloudinary.com/djukqnpbs/image/upload/v1771250339/Design_sans_titre_4_dnw65w.png";
const CLOUDINARY_IMAGE_UPLOAD_MARKER = "/image/upload/";
const CLOUDINARY_IMAGE_TRANSFORM = "f_auto,q_auto,w_1920,c_fill,g_auto";

const optimizeCloudinaryImageUrl = (url) => {
  if (
    !url ||
    !url.includes("res.cloudinary.com") ||
    !url.includes(CLOUDINARY_IMAGE_UPLOAD_MARKER) ||
    url.includes(CLOUDINARY_IMAGE_TRANSFORM)
  ) {
    return url;
  }

  return url.replace(
    CLOUDINARY_IMAGE_UPLOAD_MARKER,
    `${CLOUDINARY_IMAGE_UPLOAD_MARKER}${CLOUDINARY_IMAGE_TRANSFORM}/`
  );
};

const formatActivationDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const SiteClosurePage = ({ settings }) => {
  const title = settings?.title || "Nous revenons bientot";
  const subtitle =
    settings?.subtitle ||
    "Le site est temporairement ferme. Merci pour votre patience.";
  const activationDate = formatActivationDate(settings?.activationDate);
  const showActivationDate = settings?.showActivationDate ?? true;
  const showNewsletterInput = settings?.showNewsletterInput ?? false;
  const newsletterText = settings?.newsletterText || "";
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!newsletterEmail || !newsletterEmail.includes("@")) {
      setNewsletterMessage("Veuillez entrer une adresse email valide.");
      return;
    }

    try {
      await addDoc(collection(db, "newsletter"), {
        email: newsletterEmail,
        createdAt: serverTimestamp(),
      });
      setNewsletterMessage("Merci ! Votre email a été enregistré.");
      setNewsletterEmail("");
    } catch (err) {
      console.error("Erreur enregistrement newsletter:", err);
      setNewsletterMessage("Une erreur est survenue. Veuillez réessayer.");
    }
  };
  const mediaUrl = settings?.mediaUrl || "";
  const mediaType = settings?.mediaType || "image";
  const optimizedMediaUrl =
    mediaType === "video" ? mediaUrl : optimizeCloudinaryImageUrl(mediaUrl);

  return (
    <main className="site-closure-page">
      {mediaUrl && mediaType === "video" ? (
        <video
          className="site-closure-media"
          src={mediaUrl}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <div
          className="site-closure-media"
          style={
            optimizedMediaUrl
              ? { backgroundImage: `url(${optimizedMediaUrl})` }
              : undefined
          }
          aria-hidden="true"
        />
      )}
      <div className="site-closure-overlay" />
      <section className="site-closure-content" aria-live="polite">
        <div className="site-closure-brand">
          <span className="site-closure-logo-wrap">
            <img className="site-closure-logo-base" src={logo} alt="ALKAHF" />
            <img className="site-closure-logo-text" src={logo} alt="" aria-hidden="true" />
          </span>
        </div>

        <div className="site-closure-card">
          <h1>{title}</h1>
          <p>{subtitle}</p>

          {showActivationDate && activationDate && (
            <div className="site-closure-date">
              Retour prevu le <strong>{activationDate}</strong>
            </div>
          )}

          {showNewsletterInput && (
            <div className="site-closure-newsletter-block">
              {newsletterText && (
                <p className="site-closure-newsletter-text">{newsletterText}</p>
              )}
              <form className="site-closure-newsletter" onSubmit={handleNewsletterSubmit}>
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder={"Votre email"}
                  aria-label="Inscription newsletter"
                  required
                />
                <button type="submit">OK</button>
              </form>
              {newsletterMessage && <p className="newsletter-message">{newsletterMessage}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default SiteClosurePage;
