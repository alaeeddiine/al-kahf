import { useEffect, useMemo, useState } from "react";

const COOKIE_CONSENT_KEY = "cookie-consent-v1";

const defaultConsent = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
  choice: "custom",
  updatedAt: "",
};

const readConsent = () => {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...defaultConsent,
      ...parsed,
      necessary: true,
    };
  } catch {
    return null;
  }
};

const persistConsent = (payload) => {
  const nextConsent = {
    ...defaultConsent,
    ...payload,
    necessary: true,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(nextConsent));
  window.dispatchEvent(
    new CustomEvent("cookie-consent-updated", { detail: nextConsent })
  );
};

const CookieBanner = () => {
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setVisible(true);
      return;
    }

    setPreferences({
      functional: Boolean(existing.functional),
      analytics: Boolean(existing.analytics),
      marketing: Boolean(existing.marketing),
    });
  }, []);

  const categories = useMemo(
    () => [
      {
        id: "necessary",
        title: "Essentiels (toujours actifs)",
        description:
          "Requis pour le panier, le checkout, la sécurité Stripe et la stabilité du site.",
        locked: true,
      },
      {
        id: "functional",
        title: "Fonctionnels",
        description:
          "Améliorent l'expérience (ex: mémorisation de certaines préférences de navigation).",
      },
      {
        id: "analytics",
        title: "Mesure d'audience",
        description:
          "Aident à mesurer l'utilisation du site. Aucun outil analytics actif pour l'instant.",
      },
      {
        id: "marketing",
        title: "Marketing",
        description:
          "Servent à personnaliser des contenus/publicités. Aucun cookie marketing actif pour l'instant.",
      },
    ],
    []
  );

  const acceptAll = () => {
    persistConsent({
      functional: true,
      analytics: true,
      marketing: true,
      choice: "accept_all",
    });
    setVisible(false);
    setShowPreferences(false);
  };

  const rejectOptional = () => {
    persistConsent({
      functional: false,
      analytics: false,
      marketing: false,
      choice: "reject_all",
    });
    setVisible(false);
    setShowPreferences(false);
  };

  const saveCustomPreferences = () => {
    persistConsent({
      ...preferences,
      choice: "custom",
    });
    setVisible(false);
    setShowPreferences(false);
  };

  if (!visible) return null;

  return (
    <>
      <div className="cookie-banner-overlay" />
      <div className="cookie-banner" role="dialog" aria-label="Préférences cookies">
        <div className="cookie-main-row">
          <p>
            Pour vous offrir la meilleure expérience possible, nous utilisons des cookies nécessaires au bon fonctionnement du site. Vous pouvez accepter, refuser ou gérer vos préférences.
            En savoir plus :
            {" "}
            <a href="/LegalNotice">Mentions légales</a>
            {" "}
            et
            {" "}
            <a href="/PrivacyPolicy">Politique de confidentialité & cookies.</a>.
          </p>

          <div className="cookie-buttons">
            <button className="refuse" onClick={rejectOptional}>
              Refuser
            </button>
            <button className="accept" onClick={acceptAll}>
              Accepter
            </button>
            <button
              type="button"
              className="cookie-manage-link"
              onClick={() => setShowPreferences((v) => !v)}
            >
              Gérer vos préférences
            </button>
          </div>
        </div>

        {showPreferences && (
          <div className="cookie-preferences">
            {categories.map((category) => (
              <label key={category.id} className="cookie-pref-item">
                <div className="cookie-pref-head">
                  <span className="cookie-pref-title">{category.title}</span>
                  <input
                    type="checkbox"
                    checked={
                      category.id === "necessary"
                        ? true
                        : Boolean(preferences[category.id])
                    }
                    disabled={Boolean(category.locked)}
                    onChange={(e) =>
                      setPreferences((prev) => ({
                        ...prev,
                        [category.id]: e.target.checked,
                      }))
                    }
                  />
                </div>
                <span className="cookie-pref-desc">{category.description}</span>
              </label>
            ))}
            <button className="cookie-save" onClick={saveCustomPreferences}>
              Enregistrer mes préférences
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default CookieBanner;
