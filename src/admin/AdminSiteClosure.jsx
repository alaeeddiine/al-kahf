import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import {
  FaCalendarAlt,
  FaImage,
  FaPowerOff,
  FaSave,
  FaSpinner,
  FaVideo,
} from "react-icons/fa";
import { auth, db } from "../firebase/config";

const SETTINGS_COLLECTION = "site_settings";
const CLOSURE_DOC_ID = "temporary_closure";
const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/djukqnpbs/auto/upload";
const CLOUDINARY_PRESET = "preset_public";

const emptyForm = {
  title: "",
  subtitle: "",
  activationDate: "",
  mediaUrl: "",
  mediaType: "image",
  active: false,
  showActivationDate: true,
  showNewsletterInput: false,
  newsletterText: "",
};

const toInputDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const AdminSiteClosure = () => {
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  const settingsRef = useMemo(() => doc(db, SETTINGS_COLLECTION, CLOSURE_DOC_ID), []);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const data = snap.data();
          setForm({
            title: data.title || "",
            subtitle: data.subtitle || "",
            activationDate: toInputDate(data.activationDate),
            mediaUrl: data.mediaUrl || "",
            mediaType: data.mediaType || "image",
            active: Boolean(data.active),
            showActivationDate:
              typeof data.showActivationDate === "boolean" ? data.showActivationDate : true,
            showNewsletterInput:
              typeof data.showNewsletterInput === "boolean" ? data.showNewsletterInput : false,
            newsletterText: data.newsletterText || "",
          });
        }
      } catch (error) {
        console.error("Erreur chargement desactivation site:", error);
        setMessage("Impossible de charger les reglages.");
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [settingsRef]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage("");
  };

  const handleMediaUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      alert("Choisissez une image ou une video.");
      return;
    }

    const maxSize = isVideo ? 80 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(isVideo ? "Video max 80MB." : "Image max 8MB.");
      return;
    }

    setIsUploading(true);
    setMessage("");

    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("upload_preset", CLOUDINARY_PRESET);

      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        throw new Error("Upload Cloudinary refuse");
      }

      const data = await response.json();
      setForm((prev) => ({
        ...prev,
        mediaUrl: data.secure_url,
        mediaType: data.resource_type === "video" ? "video" : "image",
      }));
      setMessage("Media ajoute avec succes.");
    } catch (error) {
      console.error("Erreur upload media:", error);
      setMessage("Erreur pendant l'upload du media.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const clearImage = () => {
    setForm((prev) => ({ ...prev, mediaUrl: "", mediaType: "image" }));
    setMessage("Media retire.");
  };

  const formatActivationDateForAdmin = (value) => {
    const date = value?.toDate ? value.toDate() : value ? new Date(`${value}T12:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const saveSettings = async (activeValue) => {
    setIsSaving(true);
    setMessage("");

    try {
      await setDoc(
        settingsRef,
        {
          title: form.title.trim(),
          subtitle: form.subtitle.trim(),
          activationDate: form.activationDate
            ? Timestamp.fromDate(new Date(`${form.activationDate}T12:00:00`))
            : null,
          mediaUrl: form.mediaUrl.trim(),
          mediaType: form.mediaType,
          showActivationDate: Boolean(form.showActivationDate),
          showNewsletterInput: Boolean(form.showNewsletterInput),
          newsletterText: form.newsletterText ? form.newsletterText.trim() : "",
          active: activeValue,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      setForm((prev) => ({ ...prev, active: activeValue }));
      setMessage(activeValue ? "Site desactive temporairement." : "Site reactive.");
    } catch (error) {
      console.error("Erreur sauvegarde desactivation site:", error);
      if (error.code === "permission-denied") {
        const email = auth.currentUser?.email || "compte inconnu";
        setMessage(
          `Permission refusee pour ${email}. Utilisez le compte admin alkahf.be@gmail.com.`
        );
      } else {
        setMessage(`Impossible d'enregistrer les reglages. ${error.message || ""}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="admin-page-container">Chargement...</div>;
  }

  const activationDateLabel = form.activationDate
    ? formatActivationDateForAdmin(form.activationDate)
    : "Aucune date";

  return (
    <div className="admin-page-container site-closure-admin-page">
      <header className="hub-header-premium">
        <div className="title-group">
          <span className="overline">Site control</span>
          <h1>Fermeture temporaire</h1>
        </div>
        <span className={`closure-status ${form.active ? "active" : ""}`}>
          {form.active ? "Fermeture active" : "Site actif"}
        </span>
      </header>

      <div className="inventory-card closure-card-shell">
        <form className="closure-form-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="closure-form-intro">
            <div className="closure-card-heading">
              <span className="auth-subtitle">Configuration de la page de fermeture</span>
            </div>
            <span className={`closure-status ${form.active ? "active" : ""}`}>
              {form.active ? "En diffusion" : "Non publiee"}
            </span>
          </div>

          <div className="closure-main">
            <div className="closure-left">
              <section className="closure-section">
                <div className="closure-section-head">
                  <div>
                    <h2>Message public</h2>
                    <span>Le contenu visible par vos visiteurs</span>
                  </div>
                </div>
                <div className="closure-grid">
                  <label className="closure-field closure-field--wide">
                    <span>Titre</span>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) => handleChange("title", event.target.value)}
                      placeholder="Nous revenons bientot"
                    />
                  </label>

                  <label className="closure-field closure-field--wide">
                    <span>Sous titre</span>
                    <textarea
                      value={form.subtitle}
                      onChange={(event) => handleChange("subtitle", event.target.value)}
                      placeholder="Le site est temporairement ferme pour quelques jours."
                      rows={4}
                    />
                  </label>

                  <label className="closure-field closure-field--wide">
                    <span>Texte newsletter</span>
                    <input
                      type="text"
                      value={form.newsletterText}
                      onChange={(event) => handleChange("newsletterText", event.target.value)}
                      placeholder="Recevoir une alerte a la reouverture"
                    />
                  </label>
                </div>
              </section>

              <section className="closure-section">
                <div className="closure-section-head">
                  <div>
                    <h2>Parametres d'affichage</h2>
                    <span>Controlez les informations visibles sur la page publique</span>
                  </div>
                </div>

                <div className="closure-grid">
                  <label className="closure-field closure-field--wide">
                    <span>
                      <FaCalendarAlt /> Date activation
                    </span>
                    <div className="date-input-row">
                      <input
                        type="date"
                        value={form.activationDate}
                        onChange={(event) => handleChange("activationDate", event.target.value)}
                      />
                      <div
                        className="toggle-wrapper"
                        title={form.showActivationDate ? "Afficher la date" : "Masquer la date"}
                      >
                        <input
                          id="showDateToggle"
                          type="checkbox"
                          className="toggle-input"
                          checked={Boolean(form.showActivationDate)}
                          onChange={(e) => handleChange("showActivationDate", e.target.checked)}
                        />
                        <label htmlFor="showDateToggle" className="toggle-switch" aria-hidden />
                      </div>
                    </div>
                  </label>

                  <div className="closure-switch-card closure-field--wide">
                    <div>
                      <strong>Afficher le bloc newsletter</strong>
                      <p>Permet de garder un point de contact pendant la fermeture.</p>
                    </div>
                    <div
                      className="toggle-wrapper"
                      title={form.showNewsletterInput ? "Afficher le formulaire" : "Masquer le formulaire"}
                    >
                      <input
                        id="showNewsletterToggle"
                        type="checkbox"
                        className="toggle-input"
                        checked={Boolean(form.showNewsletterInput)}
                        onChange={(e) => handleChange("showNewsletterInput", e.target.checked)}
                      />
                      <label htmlFor="showNewsletterToggle" className="toggle-switch" aria-hidden />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="closure-right">
              <section className="closure-media-box">
                <div>
                  <span className="closure-media-title">
                    {form.mediaType === "video" ? <FaVideo /> : <FaImage />} Media de fond
                  </span>
                  <p>
                    Choisissez un visuel propre. Il occupe l'espace principal de la page publique.
                  </p>
                </div>

                <label className="closure-upload-button">
                  {isUploading ? <FaSpinner className="spin" /> : <FaImage />}
                  {isUploading ? "Upload..." : "Importer un media"}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleMediaUpload}
                    disabled={isUploading || isSaving}
                  />
                </label>
              </section>

              <div className={`closure-preview ${!form.mediaUrl ? "closure-preview-empty" : ""}`}>
                {form.mediaUrl ? (
                  <>
                    <button
                      type="button"
                      className="clear-media-btn"
                      onClick={clearImage}
                      aria-label="Supprimer le media"
                    >
                      x
                    </button>
                    {form.showActivationDate && form.activationDate ? (
                      <div className="preview-date-badge">{activationDateLabel}</div>
                    ) : null}
                    {form.mediaType === "video" ? (
                      <video src={form.mediaUrl} muted loop playsInline controls />
                    ) : (
                      <img src={form.mediaUrl} alt="Apercu fermeture site" />
                    )}
                  </>
                ) : (
                  <div className="closure-preview-empty-state">
                    <FaImage size={28} />
                    <strong>Aucun media configure</strong>
                    <p>L'apercu occupe ici un espace fixe et reste lisible une fois un media charge.</p>
                  </div>
                )}
              </div>
            </aside>
            <div className="closure-form-footer">
                <p className="closure-message">{message}</p>
                <div className="closure-actions">
                  <button
                    type="button"
                    className="closure-save-button secondary"
                    onClick={() => saveSettings(form.active)}
                    disabled={isSaving || isUploading}
                  >
                    {isSaving ? <FaSpinner className="spin" /> : <FaSave />}
                    Enregistrer
                  </button>
                  {form.active ? (
                    <button
                      type="button"
                      className="closure-save-button"
                      onClick={() => saveSettings(false)}
                      disabled={isSaving || isUploading}
                    >
                      {isSaving ? <FaSpinner className="spin" /> : <FaPowerOff />}
                      Reactiver le site
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="closure-save-button danger"
                      onClick={() => saveSettings(true)}
                      disabled={isSaving || isUploading}
                    >
                      {isSaving ? <FaSpinner className="spin" /> : <FaPowerOff />}
                      Activer la fermeture
                    </button>
                  )}
                </div>
              </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminSiteClosure;
