import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import { app, db } from "../firebase/config";
import {
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  FaLock,
  FaChevronLeft,
  FaRegEdit,
  FaTruck,
  FaCreditCard
} from "react-icons/fa";
import shippingRules from "../data/shippingRules.json";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

const fallbackEuropeanCountries = [
  "France", "Germany", "Italy", "Spain", "Portugal", "Belgium", "Netherlands", "Luxembourg",
  "Switzerland", "Austria", "Denmark", "Sweden", "Norway", "Finland", "Poland", "Czech Republic",
  "Hungary", "Slovakia", "Greece", "Ireland", "United Kingdom", "Croatia", "Slovenia", "Estonia",
  "Latvia", "Lithuania", "Malta", "Cyprus", "Bulgaria", "Romania"
];

const shippingProviders = shippingRules?.shippingProviders ?? shippingRules ?? {};

const europeanCountries = (() => {
  const countries = new Set();

  const bpostZones = shippingProviders?.bpost?.zones;
  if (bpostZones && typeof bpostZones === "object") {
    Object.values(bpostZones).forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((country) => countries.add(country));
    });
  }

  const mondialRelayCountries = shippingProviders?.mondialRelay?.countries;
  if (Array.isArray(mondialRelayCountries)) {
    mondialRelayCountries.forEach((country) => countries.add(country));
  }

  const mondialRelayPricesPerCountry = shippingProviders?.mondialRelay?.pricesPerCountry;
  if (mondialRelayPricesPerCountry && typeof mondialRelayPricesPerCountry === "object") {
    Object.keys(mondialRelayPricesPerCountry).forEach((country) => countries.add(country));
  }

  const list = [...countries]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  return list.length ? list : fallbackEuropeanCountries;
})();

const countryIsoMap = {
  France: "fr",
  Germany: "de",
  Italy: "it",
  Spain: "es",
  Portugal: "pt",
  Belgium: "be",
  Netherlands: "nl",
  Luxembourg: "lu",
  Switzerland: "ch",
  Austria: "at",
  Denmark: "dk",
  Sweden: "se",
  Norway: "no",
  Finland: "fi",
  Poland: "pl",
  "Czech Republic": "cz",
  Hungary: "hu",
  Slovakia: "sk",
  Greece: "gr",
  Ireland: "ie",
  "United Kingdom": "gb",
  Croatia: "hr",
  Slovenia: "si",
  Estonia: "ee",
  Latvia: "lv",
  Lithuania: "lt",
  Malta: "mt",
  Cyprus: "cy",
  Bulgaria: "bg",
  Romania: "ro"
};

const TAX_RATE = 21;
const priceWithTax = (price) => +Number(price ?? 0).toFixed(2);
const MAX_SHIPPING_WEIGHT = 30;
const FREE_SHIPPING_THRESHOLD = 100;

const normalizeCountryToken = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseUpperKgFromKey = (key) => {
  const maxMatch = /^max_(\d+(?:\.\d+)?)kg$/i.exec(String(key));
  if (maxMatch) return Number(maxMatch[1]);

  const rangeMatch = /^(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)kg$/i.exec(String(key));
  if (rangeMatch) return Number(rangeMatch[2]);

  return null;
};

const normalizeKeyedWeightBrackets = (brackets) => {
  if (!Array.isArray(brackets)) return [];

  const normalized = [];
  brackets.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;

    Object.keys(entry).forEach((key) => {
      if (key === "description") return;
      const upperKg = parseUpperKgFromKey(key);
      if (upperKg == null) return;
      const price = Number(entry[key]);
      if (!Number.isFinite(price)) return;
      normalized.push({ max: upperKg, price });
    });
  });

  return normalized.sort((a, b) => a.max - b.max);
};

const getMaxWeightKgFromBrackets = (brackets) => {
  if (!Array.isArray(brackets) || brackets.length === 0) return null;

  if (brackets.some((b) => b && typeof b === "object" && ("max" in b || "maxKg" in b) && "price" in b)) {
    const maxes = brackets
      .map((b) => Number(b?.max ?? b?.maxKg))
      .filter((value) => Number.isFinite(value));
    return maxes.length ? Math.max(...maxes) : null;
  }

  const normalized = normalizeKeyedWeightBrackets(brackets);
  if (normalized.length === 0) return null;
  return normalized[normalized.length - 1].max;
};

const getPriceByWeight = (weightKg, brackets) => {
  if (!Array.isArray(brackets)) return null;

  // Legacy schemas:
  // - [{ max: number, price: number }, ...]
  // - [{ maxKg: number, price: number }, ...]
  if (brackets.some((b) => b && typeof b === "object" && ("max" in b || "maxKg" in b) && "price" in b)) {
    const normalized = brackets
      .map((b) => {
        if (!b || typeof b !== "object") return null;
        const max = Number(b.max ?? b.maxKg);
        const price = Number(b.price);
        if (!Number.isFinite(max) || !Number.isFinite(price)) return null;
        return { max, price };
      })
      .filter(Boolean)
      .sort((a, b) => a.max - b.max);

    if (normalized.length === 0) return null;

    const match = normalized.find((b) => weightKg <= b.max);
    return match ? match.price : null;
  }

  // New schema: [{ max_1kg: 6.6 }, { "2_5kg": 18.1, description: "..." }, ...]
  const normalized = normalizeKeyedWeightBrackets(brackets);
  if (normalized.length === 0) return null;

  const match = normalized.find((b) => weightKg <= b.max);
  return match ? match.price : null;
};

const hasAnyValidBrackets = (brackets) => {
  if (!Array.isArray(brackets)) return false;
  if (brackets.some((b) => b && typeof b === "object" && ("max" in b || "maxKg" in b) && "price" in b)) {
    return true;
  }
  return normalizeKeyedWeightBrackets(brackets).length > 0;
};

const getMondialRelayBracketsForCountry = (country) => {
  const provider = shippingProviders?.mondialRelay;
  const byCountry = provider?.pricesPerCountry;
  if (byCountry && typeof byCountry === "object" && Array.isArray(byCountry?.[country])) return byCountry[country];

  const grouped = provider?.prices_points_relais;
  if (grouped && typeof grouped === "object") return findMondialRelayBracketsForCountry(country, grouped);

  return null;
};

const getBpostBracketsForCountry = (country) => {
  const provider = shippingProviders?.bpost;

  const byCountry = provider?.pricesPerCountry;
  if (byCountry && typeof byCountry === "object" && Array.isArray(byCountry?.[country])) return byCountry[country];

  if (provider?.zones && provider?.prices) {
    const zone = Object.keys(provider.zones).find((zoneName) => provider.zones[zoneName]?.includes?.(country));
    if (!zone) return null;
    return provider.prices[zone];
  }

  return null;
};

const getMaxWeightKgForMethod = (method, country) => {
  if (!method || !country) return null;
  if (method === "mondial_relay") return getMaxWeightKgFromBrackets(getMondialRelayBracketsForCountry(country));
  if (method === "bpost") return getMaxWeightKgFromBrackets(getBpostBracketsForCountry(country));
  return null;
};

const findMondialRelayBracketsForCountry = (country, groupedBrackets) => {
  if (!country || !groupedBrackets || typeof groupedBrackets !== "object") return null;

  if (Array.isArray(groupedBrackets[country])) return groupedBrackets[country];

  const token = normalizeCountryToken(country);
  const keys = Object.keys(groupedBrackets);
  const matchedKey = keys.find((key) => {
    const normalizedKey = normalizeCountryToken(key);
    return new RegExp(`(^|_)${escapeRegex(token)}(_|$)`).test(normalizedKey);
  });

  return groupedBrackets[matchedKey] ?? null;
};

const calculateMondialRelayShipping = (weightKg, country) => {
  if (!country) return null;

  // Current schema: shippingProviders.mondialRelay.pricesPerCountry[country] -> [{ maxKg, price }, ...]
  // Legacy schema: shippingProviders.mondialRelay.prices_points_relais[groupKey] -> [{ max_0.5kg: 4.6 }, ...]
  const brackets = getMondialRelayBracketsForCountry(country);
  if (brackets) {
    const price = getPriceByWeight(weightKg, brackets);
    return price == null ? "unsupported" : price;
  }

  // Legacy fallback
  const zones = shippingRules?.zones;
  const prices = shippingRules?.prices?.mondialRelay;
  if (!zones || !prices) return "unsupported";

  const zone = Object.keys(zones).find((zoneName) => zones[zoneName]?.includes?.(country));
  const legacyBrackets = prices[zone || "EU_ZONE"];
  const price = getPriceByWeight(weightKg, legacyBrackets);
  return price == null ? "unsupported" : price;
};

const calculateBpostShipping = (weightKg, country) => {
  if (!country) return null;

  // Current schema: shippingProviders.bpost.pricesPerCountry[country] -> [{ maxKg, price }, ...]
  const brackets = getBpostBracketsForCountry(country);
  if (brackets) {
    const price = getPriceByWeight(weightKg, brackets);
    return price == null ? "unsupported" : price;
  }

  // Legacy fallback
  const code = shippingRules?.countryCodes?.[country] || "OTHER";
  const legacyBrackets = shippingRules?.prices?.bpost?.[code];
  const price = getPriceByWeight(weightKg, legacyBrackets);
  return price == null ? "unsupported" : price;
};

const stepMeta = [
  { id: 1, title: "Infos personnelles", icon: <FaRegEdit /> },
  { id: 2, title: "Adresse livraison", icon: <FaTruck /> },
  { id: 3, title: "Paiement", icon: <FaCreditCard /> }
];

const stripePublicKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;
const stripeFunctionsRegion = process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || "europe-west1";
const stripePaymentIntentUrl = process.env.REACT_APP_STRIPE_PAYMENT_INTENT_URL || "";
const checkoutRecoveryKey = "checkout_recovery_items";

const mapStripeInitErrorToMessage = (error) => {
  const rawMessage = String(error?.message || "");
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes("invalid api key") ||
    lower.includes("invalid stripe_secret configuration on server")
  ) {
    return "Configuration Stripe serveur invalide. Contactez le support.";
  }
  return rawMessage || "Erreur lors de l'initialisation du paiement Stripe.";
};

const StripePaymentForm = ({ disabled, isProcessing, onSuccess, onError, setIsProcessing }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disabled || !stripe || !elements) return;
    setIsProcessing(true);
    onError("");

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (result.error) {
        onError(result.error.message || "Le paiement Stripe a échoué.");
        return;
      }

      const status = result.paymentIntent?.status;
      if (status === "succeeded") {
        await onSuccess(result.paymentIntent || null);
      } else if (status === "processing") {
        onError("Paiement en cours de traitement. Veuillez patienter puis verifier le statut.");
      } else {
        onError("Paiement non finalise. Veuillez reessayer.");
      }
    } catch (err) {
      onError(err?.message || "Erreur Stripe inattendue.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      <PaymentElement onReady={() => setIsPaymentElementReady(true)} />
      <button
        type="submit"
        className="flow-btn primary"
        style={{ marginTop: "1rem", width: "100%" }}
        disabled={disabled || !stripe || !elements || isProcessing || !isPaymentElementReady}
      >
        {isProcessing
          ? "Paiement en cours..."
          : !isPaymentElementReady
            ? "Chargement du formulaire..."
            : "Payer maintenant"}
      </button>
    </form>
  );
};

const Checkout = () => {
  const { cartItems, clearCart } = useContext(CartContext);
  const location = useLocation();
  const navigate = useNavigate();

  const bookFromState = useMemo(() => {
    const stateBook = location.state?.book;
    const stateQty = location.state?.quantity;
    if (!stateBook || !stateQty) return [];
    return [{ ...stateBook, quantity: stateQty, weight: stateBook.weight ?? 0 }];
  }, [location.state?.book, location.state?.quantity]);

  const [recoveryItems, setRecoveryItems] = useState(() => {
    try {
      const raw = sessionStorage.getItem(checkoutRecoveryKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const items =
    cartItems.length > 0
      ? cartItems
      : bookFromState.length > 0
        ? bookFromState
        : recoveryItems;
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  useEffect(() => {
    const checkoutItems =
      cartItems.length > 0
        ? cartItems
        : bookFromState.length > 0
          ? bookFromState
          : [];

    if (!Array.isArray(checkoutItems) || checkoutItems.length === 0) return;

    setRecoveryItems(checkoutItems);
    sessionStorage.setItem(checkoutRecoveryKey, JSON.stringify(checkoutItems));
  }, [cartItems, bookFromState]);

  const frozenItemsRef = useRef(safeItems);
  useEffect(() => {
    frozenItemsRef.current = safeItems;
  }, [safeItems]);

  const [formData, setFormData] = useState({
    lastName: "",
    firstName: "",
    email: "",
    phone: "",
    housingType: "",
    street: "",
    houseNumber: "",
    city: "",
    country: "",
    zipCode: "",
    promoCode: ""
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [paymentErrorMessage, setPaymentErrorMessage] = useState("");
  const [promoPercent, setPromoPercent] = useState(0);
  const [promoDiscountValue, setPromoDiscountValue] = useState(0);
  const [promoMessage, setPromoMessage] = useState({ text: "", type: "" });
  const [totals, setTotals] = useState({ subtotal: 0, shipping: 0, tax: 0, grandTotal: 0, freeShippingApplied: false });
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [shippingMethod, setShippingMethod] = useState("");
  const [stripeClientSecret, setStripeClientSecret] = useState("");
  const [isPreparingStripe, setIsPreparingStripe] = useState(false);
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);
  const [relayDetails, setRelayDetails] = useState(null);
  const [relayCandidate, setRelayCandidate] = useState(null);
  const [addressLookupMessage, setAddressLookupMessage] = useState("");
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestionSource, setSuggestionSource] = useState("");
  const lastEditedFieldRef = useRef("");
  const lookupRequestRef = useRef(0);
  const lastLookupKeyRef = useRef("");
  const checkoutTopRef = useRef(null);
  const functions = useMemo(() => getFunctions(app, stripeFunctionsRegion), []);
  const createStripePaymentIntent = useMemo(
    () => httpsCallable(functions, "createPaymentIntent"),
    [functions]
  );
  const finalizeOrderAfterPayment = useMemo(
    () => httpsCallable(functions, "finalizeOrderAfterPayment"),
    [functions]
  );

  const fullAddress = useMemo(
    () => [formData.street.trim(), formData.houseNumber.trim()].filter(Boolean).join(" ").trim(),
    [formData.street, formData.houseNumber]
  );

  const isMondialRelayAvailableForCountry = useMemo(() => {
    if (!formData.country) return true;
    const brackets = getMondialRelayBracketsForCountry(formData.country);
    return hasAnyValidBrackets(brackets);
  }, [formData.country]);

  const isBpostAvailableForCountry = useMemo(() => {
    if (!formData.country) return true;
    const brackets = getBpostBracketsForCountry(formData.country);
    return hasAnyValidBrackets(brackets);
  }, [formData.country]);

  useEffect(() => {
    if (shippingMethod !== "mondial_relay") return;
    if (!formData.country) return;
    if (isMondialRelayAvailableForCountry) return;

    setShippingMethod(isBpostAvailableForCountry ? "bpost" : "");
    setRelayDetails(null);
    setRelayCandidate(null);
    sessionStorage.removeItem("relayDetails");
    setFieldErrors((prev) => ({
      ...prev,
      shippingMethod: "Mondial Relay n'est pas disponible pour ce pays."
    }));
  }, [shippingMethod, formData.country, isMondialRelayAvailableForCountry, isBpostAvailableForCountry]);

  useEffect(() => {
    if (shippingMethod !== "bpost") return;
    if (!formData.country) return;
    if (isBpostAvailableForCountry) return;

    setShippingMethod(isMondialRelayAvailableForCountry ? "mondial_relay" : "");
    setFieldErrors((prev) => ({
      ...prev,
      shippingMethod: "Bpost n'est pas disponible pour ce pays."
    }));
  }, [shippingMethod, formData.country, isBpostAvailableForCountry, isMondialRelayAvailableForCountry]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const redirectStatus = params.get("redirect_status");
    const paymentIntentClientSecret = params.get("payment_intent_client_secret");

    if (!redirectStatus && !paymentIntentClientSecret) {
      return;
    }

    let cancelled = false;
    const handleRedirectResult = async () => {
      try {
        const stripe = stripePromise ? await stripePromise : null;
        const result = paymentIntentClientSecret && stripe ?
          await stripe.retrievePaymentIntent(paymentIntentClientSecret) :
          null;
        const status = result?.paymentIntent?.status;

      if (status === "succeeded") {
        if (!cancelled) {
          try {
            const paymentIntentId = result?.paymentIntent?.id || params.get("payment_intent");
            if (paymentIntentId) {
              await finalizeOrderAfterPayment({ paymentIntentId });
            }
          } catch (finalizeError) {
            console.error("Order finalize callable error (redirect flow):", finalizeError);
          }
          setOrderSuccess(true);
          clearCart();
          setRecoveryItems([]);
          sessionStorage.removeItem(checkoutRecoveryKey);
          setStripeClientSecret("");
          }
          return;
        }

        if (
          redirectStatus === "failed" ||
          status === "requires_payment_method" ||
          status === "canceled"
        ) {
          if (!cancelled) {
            setCurrentStep(1);
            setStripeClientSecret("");
            const refusalMessage = "Paiement refuse. Votre panier est conserve. Veuillez verifier vos informations et reessayer.";
            setPaymentErrorMessage(refusalMessage);
            setGlobalError(refusalMessage);
            window.alert(refusalMessage);
          }
          return;
        }

        if (redirectStatus === "processing" || status === "processing") {
          if (!cancelled) {
            setCurrentStep(3);
            setGlobalError("Paiement en cours de confirmation Stripe.");
          }
          return;
        }

        if (!cancelled) {
          setGlobalError("Paiement en attente de confirmation Stripe.");
        }
      } catch (error) {
        if (!cancelled) {
          setCurrentStep(3);
          setPaymentErrorMessage("Impossible de verifier le paiement. Veuillez reessayer.");
          setGlobalError(
            error?.message ||
            "Impossible de verifier le statut du paiement."
          );
        }
      } finally {
        window.history.replaceState(window.history.state, "", location.pathname);
      }
    };

    handleRedirectResult();

    return () => {
      cancelled = true;
    };
  }, [location.search, location.pathname, clearCart, finalizeOrderAfterPayment]);

  const prefillMondialRelayWidget = (zipCode, city) => {
    const widgetRoot = document.getElementById("Zone_Widget");
    if (!widgetRoot) return;

    const normalizedZip = (zipCode || "").trim();
    const normalizedCity = (city || "").trim();
    if (!normalizedZip && !normalizedCity) return;

    const fillInput = (selector, value) => {
      if (!value) return false;
      const input = widgetRoot.querySelector(selector);
      if (!input) return false;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };

    const zipFilled =
      fillInput('input[name="PostCode"]', normalizedZip) ||
      fillInput('input[name="postalcode"]', normalizedZip) ||
      fillInput('input[name="CP"]', normalizedZip) ||
      fillInput('input[id*="CP"]', normalizedZip) ||
      fillInput('input[id*="PostCode"]', normalizedZip);

    const cityFilled =
      fillInput('input[name="City"]', normalizedCity) ||
      fillInput('input[name="Ville"]', normalizedCity) ||
      fillInput('input[name="city"]', normalizedCity) ||
      fillInput('input[id*="Ville"]', normalizedCity) ||
      fillInput('input[id*="City"]', normalizedCity);

    if (zipFilled || cityFilled) {
      const searchButton =
        widgetRoot.querySelector('button[type="submit"]') ||
        widgetRoot.querySelector('button[id*="Search"]') ||
        widgetRoot.querySelector('button[class*="search"]') ||
        widgetRoot.querySelector('input[type="submit"]');
      if (searchButton) {
        searchButton.click();
      }
    }
  };

  useEffect(() => {
    if (
      shippingMethod === "mondial_relay" &&
      window.jQuery &&
      window.jQuery.fn.MR_ParcelShopPicker &&
      (currentStep === 2 || currentStep === 3)
    ) {
      setTimeout(() => {
        const zoneWidget = document.getElementById("Zone_Widget");
        if (zoneWidget) {
          zoneWidget.innerHTML = "";
        }
        const isMobile = window.matchMedia("(max-width: 768px)").matches;
        window.jQuery("#Zone_Widget").MR_ParcelShopPicker({
          Target: "#Retour_Widget",
          Brand: "CC23K35Q",
          Country: (countryIsoMap[formData.country] || "fr").toUpperCase(),
          PostCode: formData.zipCode?.trim() || undefined,
          CP: formData.zipCode?.trim() || undefined,
          City: formData.city?.trim() || undefined,
          Ville: formData.city?.trim() || undefined,
          ShowResultsOnMap: !isMobile,
          MaxResults: 5,
          OnParcelShopSelected: function (data) {
            const details = {
              number: data?.ID || null,
              name: data?.Nom || null,
              address1: data?.Adresse1 || null,
              address2: data?.Adresse2 || null,
              zipCode: data?.CP || null,
              city: data?.Ville || null,
              country: data?.Pays || null
            };
            setRelayCandidate(details);
            setRelayDetails(null);
            setFieldErrors((prev) => ({ ...prev, relayPoint: undefined }));
            sessionStorage.removeItem("relayDetails");
          }
        });

        setTimeout(() => {
          prefillMondialRelayWidget(formData.zipCode, formData.city);
        }, 250);
      }, 100);
    }
  }, [shippingMethod, formData.country, formData.city, formData.zipCode, currentStep, relayDetails]);

  useEffect(() => {
    const saved = sessionStorage.getItem("relayDetails");
    if (saved) {
      try {
        setRelayDetails(JSON.parse(saved));
      } catch {
        sessionStorage.removeItem("relayDetails");
      }
    }
  }, []);

  useEffect(() => {
    if (shippingMethod !== "mondial_relay") return;
    setRelayCandidate(null);
    setRelayDetails(null);
    sessionStorage.removeItem("relayDetails");
  }, [shippingMethod, formData.country, formData.city, formData.zipCode]);

  const handleConfirmRelayPoint = () => {
    if (!relayCandidate) return;
    setRelayDetails(relayCandidate);
    sessionStorage.setItem("relayDetails", JSON.stringify(relayCandidate));
    setFieldErrors((prev) => ({ ...prev, relayPoint: undefined }));
  };

  const handleResetRelayPoint = () => {
    setRelayDetails(null);
    setRelayCandidate(null);
    sessionStorage.removeItem("relayDetails");
  };

  useEffect(() => {
    if (safeItems.length === 0) {
      setTotals({ subtotal: 0, shipping: 0, tax: 0, grandTotal: 0, freeShippingApplied: false });
      return;
    }

    const subtotal = safeItems.reduce(
      (sum, item) => sum + priceWithTax(item.promoPrice ?? item.price ?? 0) * item.quantity,
      0
    );

    const totalWeight = safeItems.reduce((acc, item) => acc + (item.weight ?? 0) * item.quantity, 0);

    let shipping = null;
    const totalAfterDiscount = subtotal - promoDiscountValue;
    const isEligibleForFreeShipping = totalAfterDiscount >= FREE_SHIPPING_THRESHOLD;
    let freeShippingApplied = false;
    const tax = totalAfterDiscount * (TAX_RATE / (100 + TAX_RATE));

    // Weight limits can be enforced even before the address is complete.
    if (totalWeight > MAX_SHIPPING_WEIGHT) {
      shipping = "weight_limit";
    } else if (formData.country) {
      const methodLimit = getMaxWeightKgForMethod(shippingMethod, formData.country);
      if (Number.isFinite(methodLimit) && totalWeight > methodLimit) {
        shipping = "weight_limit";
      }
    }

    const isAddressComplete = formData.country && fullAddress && formData.city && formData.zipCode;

    // If the cart qualifies for free shipping, show it immediately in the summary (even before address),
    // then override later if the address/method is unsupported.
    if (shipping !== "weight_limit" && isEligibleForFreeShipping && !isAddressComplete) {
      shipping = 0;
      freeShippingApplied = true;
    }

    if (shipping !== "weight_limit" && isAddressComplete) {
      if (shippingMethod === "mondial_relay") {
        const baseShipping = calculateMondialRelayShipping(totalWeight, formData.country);
        if (baseShipping === "unsupported") {
          shipping = "unsupported";
        } else if (isEligibleForFreeShipping) {
          shipping = 0;
          freeShippingApplied = true;
        } else {
          shipping = baseShipping;
        }
      } else if (shippingMethod === "bpost") {
        const baseShipping = calculateBpostShipping(totalWeight, formData.country);
        if (baseShipping === "unsupported") {
          shipping = "unsupported";
        } else if (isEligibleForFreeShipping) {
          shipping = 0;
          freeShippingApplied = true;
        } else {
          shipping = baseShipping;
        }
      }
    }

    const nextTotals = {
      subtotal,
      shipping,
      tax,
      grandTotal: shipping === "weight_limit" || shipping === "unsupported"
        ? null
        : shipping === null
          ? (isEligibleForFreeShipping ? totalAfterDiscount : null)
          : totalAfterDiscount + shipping,
      freeShippingApplied
    };

    setTotals((prev) => {
      if (
        prev.subtotal === nextTotals.subtotal &&
        prev.shipping === nextTotals.shipping &&
        prev.tax === nextTotals.tax &&
        prev.grandTotal === nextTotals.grandTotal &&
        prev.freeShippingApplied === nextTotals.freeShippingApplied
      ) {
        return prev;
      }
      return nextTotals;
    });
  }, [safeItems, promoDiscountValue, formData.country, fullAddress, formData.city, formData.zipCode, shippingMethod]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "city" || name === "zipCode") {
      lastEditedFieldRef.current = name;
      lastLookupKeyRef.current = "";
      setAddressSuggestions([]);
    }
    if (name === "country") {
      setAddressSuggestions([]);
      setSuggestionSource("");
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
    setGlobalError("");
    setAddressLookupMessage("");
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const extractCityFromAddress = useCallback((address) =>
    address?.city ||
    address?.town ||
    address?.village ||
    address?.municipality ||
    address?.county ||
    "", []);

  const buildAddressPairs = useCallback((results) => {
    if (!Array.isArray(results)) return [];

    const pairs = results
      .map((item) => {
        const address = item?.address || {};
        const city = (
          extractCityFromAddress(address) ||
          address?.city_district ||
          address?.hamlet ||
          address?.suburb ||
          item?.name ||
          item?.display_name?.split(",")?.[0] ||
          ""
        ).trim();
        const zipCode = (item?.address?.postcode || "").split(";")[0].trim();
        return { city, zipCode };
      })
      .filter((item) => item.city || item.zipCode);

    const unique = new Map();
    for (const pair of pairs) {
      const key = `${pair.city.toLowerCase()}|${pair.zipCode.toLowerCase()}`;
      if (!unique.has(key)) {
        unique.set(key, pair);
      }
    }
    return Array.from(unique.values()).slice(0, 60);
  }, [extractCityFromAddress]);

  const normalizeForMatch = useCallback((value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim(), []);

  const resultMatchesCityPrefix = useCallback((item, normalizedInput) => {
    const address = item?.address || {};
    const candidates = [
      address?.city,
      address?.town,
      address?.village,
      address?.municipality,
      address?.county,
      address?.city_district,
      address?.hamlet,
      address?.suburb,
      item?.name,
      item?.display_name?.split(",")?.[0]
    ];

    const namedetailsValues = Object.values(item?.namedetails || {});
    const allNames = [...candidates, ...namedetailsValues]
      .filter(Boolean)
      .map((v) => normalizeForMatch(v));

    return allNames.some((name) => name.startsWith(normalizedInput));
  }, [normalizeForMatch]);

  const resolveAddressSuggestions = useCallback(async (sourceField, cityValue, zipValue, countryCode) => {
    if (sourceField === "city") {
      const cityStructuredUrl =
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&accept-language=fr,nl,en&dedupe=0&limit=120&countrycodes=${countryCode}&city=${encodeURIComponent(cityValue)}`;
      const structuredResp = await fetch(cityStructuredUrl);
      if (!structuredResp.ok) throw new Error("lookup_failed");
      const structuredData = await structuredResp.json();

      const cityFreeTextUrl =
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&accept-language=fr,nl,en&dedupe=0&limit=120&countrycodes=${countryCode}&q=${encodeURIComponent(cityValue)}`;
      const freeResp = await fetch(cityFreeTextUrl);
      if (!freeResp.ok) throw new Error("lookup_failed");
      const freeData = await freeResp.json();

      const normalizedInput = normalizeForMatch(cityValue);
      const merged = [...(Array.isArray(structuredData) ? structuredData : []), ...(Array.isArray(freeData) ? freeData : [])];
      const matched = merged.filter((item) => resultMatchesCityPrefix(item, normalizedInput));
      return buildAddressPairs(matched).filter((item) => item.zipCode);
    }

    const zipUrl =
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&accept-language=fr,nl,en&dedupe=0&limit=120&countrycodes=${countryCode}&postalcode=${encodeURIComponent(zipValue)}`;
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error("lookup_failed");
    const data = await response.json();
    const suggestions = buildAddressPairs(data).filter((item) => item.city);
    const normalizedZip = normalizeForMatch(zipValue);
    return suggestions.filter((item) => normalizeForMatch(item.zipCode).startsWith(normalizedZip));
  }, [buildAddressPairs, normalizeForMatch, resultMatchesCityPrefix]);

  const handleSelectAddressSuggestion = (item) => {
    setFormData((prev) => ({
      ...prev,
      city: item.city || prev.city,
      zipCode: item.zipCode || prev.zipCode
    }));
    setAddressSuggestions([]);
    setSuggestionSource("");
    setAddressLookupMessage("");
    setFieldErrors((prev) => ({ ...prev, city: undefined, zipCode: undefined }));
  };

  useEffect(() => {
    if (currentStep !== 2) return;

    const sourceField = lastEditedFieldRef.current;
    if (sourceField !== "city" && sourceField !== "zipCode") return;

    const countryCode = countryIsoMap[formData.country];
    if (!countryCode) {
      if (formData.city.trim() || formData.zipCode.trim()) {
        setAddressLookupMessage("Selectionnez d'abord le pays pour la detection automatique.");
      }
      setAddressSuggestions([]);
      return;
    }

    const city = formData.city.trim();
    const zipCode = formData.zipCode.trim();

    if (sourceField === "city" && city.length < 2) {
      setAddressSuggestions([]);
      return;
    }
    if (sourceField === "zipCode" && zipCode.length < 2) {
      setAddressSuggestions([]);
      return;
    }

    const queryValue = sourceField === "city" ? city.toLowerCase() : zipCode.toLowerCase();
    const lookupKey = `${sourceField}|${countryCode}|${queryValue}`;
    if (lookupKey === lastLookupKeyRef.current) return;

    const timeoutId = setTimeout(async () => {
      const requestId = ++lookupRequestRef.current;
      lastLookupKeyRef.current = lookupKey;
      setAddressLookupMessage("");
      setIsResolvingAddress(true);

      try {
        const suggestions = await resolveAddressSuggestions(sourceField, city, zipCode, countryCode);
        if (requestId !== lookupRequestRef.current) return;

        const filteredSuggestions = [...suggestions].sort((a, b) => {
          const aValue = sourceField === "city" ? normalizeForMatch(a.zipCode) : normalizeForMatch(a.city);
          const bValue = sourceField === "city" ? normalizeForMatch(b.zipCode) : normalizeForMatch(b.city);
          return aValue.localeCompare(bValue);
        });

        if (filteredSuggestions.length === 0) {
          setAddressSuggestions([]);
          setSuggestionSource(sourceField);
          setAddressLookupMessage(
            sourceField === "city"
              ? "Code postal introuvable pour cette ville."
              : "Ville introuvable pour ce code postal."
          );
          return;
        }

        setAddressSuggestions(filteredSuggestions);
        setSuggestionSource(sourceField);
        setFieldErrors((prev) => ({ ...prev, city: undefined, zipCode: undefined }));
      } catch {
        if (requestId === lookupRequestRef.current) {
          setAddressSuggestions([]);
          setAddressLookupMessage("Impossible de detecter automatiquement la ville ou le code postal.");
        }
      } finally {
        if (requestId === lookupRequestRef.current) {
          setIsResolvingAddress(false);
        }
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [formData.city, formData.zipCode, formData.country, currentStep, normalizeForMatch, resolveAddressSuggestions]);
  const validatePersonalInfo = useCallback(() => {
    const errors = {};
    if (!formData.lastName.trim()) errors.lastName = "Le nom est obligatoire.";
    if (!formData.firstName.trim()) errors.firstName = "Le prénom est obligatoire.";
    if (!formData.phone.trim()) errors.phone = "Le numéro de téléphone est obligatoire.";
    if (!/^[0-9+\s().-]{8,}$/.test(formData.phone.trim())) errors.phone = "Numéro de téléphone invalide.";
    if (!formData.email.trim()) errors.email = "L'email est obligatoire.";
    if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) errors.email = "Adresse email invalide.";
    return errors;
  }, [formData.lastName, formData.firstName, formData.phone, formData.email]);

  const validateAddressInfo = useCallback((requireRelay) => {
    const errors = {};
    if (!formData.street.trim()) errors.street = "La rue est obligatoire.";
    if (!formData.houseNumber.trim()) errors.houseNumber = "Le numéro est obligatoire.";
    if (!formData.city.trim()) errors.city = "La ville est obligatoire.";
    if (!formData.zipCode.trim()) errors.zipCode = "Le code postal est obligatoire.";
    if (!formData.country) errors.country = "Le pays est obligatoire.";
    if (!shippingMethod) errors.shippingMethod = "Choisissez une méthode de livraison.";
    if (requireRelay && shippingMethod === "mondial_relay" && !relayDetails) {
      errors.relayPoint = "Veuillez confirmer le point relais choisi.";
    }
    return errors;
  }, [
    formData.street,
    formData.houseNumber,
    formData.city,
    formData.zipCode,
    formData.country,
    shippingMethod,
    relayDetails
  ]);

  const goToStep = (nextStep) => {
    if (nextStep < currentStep) {
      setCurrentStep(nextStep);
      return;
    }
    if (currentStep === 1) {
      const errors = validatePersonalInfo();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setGlobalError("Corrigez les champs personnels avant de continuer.");
        return;
      }
    }
    if (currentStep === 2) {
      const errors = validateAddressInfo(false);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setGlobalError("Corrigez les champs d'adresse avant de continuer.");
        return;
      }
    }
    setGlobalError("");
    setCurrentStep(nextStep);
  };

  useEffect(() => {
    if (checkoutTopRef.current) {
      checkoutTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const handleApplyPromo = async () => {
    if (!formData.promoCode.trim()) return;
    try {
      const q = query(
        collection(db, "promos"),
        where("code", "==", formData.promoCode.trim()),
        where("active", "==", true)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setPromoPercent(0);
        setPromoDiscountValue(0);
        setPromoMessage({ text: "Code invalide.", type: "error" });
        return;
      }

      const promo = snap.docs[0].data();
      const percent = Number(promo.amount || 0);
      if (percent <= 0 || percent > 100) {
        setPromoMessage({ text: "Promotion invalide.", type: "error" });
        return;
      }

      const subtotal = safeItems.reduce(
        (sum, item) => sum + priceWithTax(item.promoPrice ?? item.price ?? 0) * (item.quantity ?? 1),
        0
      );
      const discountValue = +(subtotal * (percent / 100)).toFixed(2);
      setPromoPercent(percent);
      setPromoDiscountValue(discountValue);
      setPromoMessage({ text: `Réduction de ${percent}% appliquée !`, type: "success" });
    } catch (error) {
      console.error(error);
      setPromoMessage({ text: "Erreur serveur.", type: "error" });
    }
  };

  const handlePrepareStripePayment = useCallback(async () => {
    if (stripeClientSecret) return;

    const personalErrors = validatePersonalInfo();
    const addressErrors = validateAddressInfo(true);
    const errors = { ...personalErrors, ...addressErrors };
    let validationError = null;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      validationError = "Merci de remplir tous les champs obligatoires correctement.";
    } else if (totals.shipping === "unsupported") {
      validationError = "La livraison n'est pas disponible pour ce pays.";
    } else if (totals.shipping === "weight_limit") {
      validationError = "Poids total > 30 kg. Livraison non disponible.";
    } else if (safeItems.length === 0) {
      validationError = "Votre panier est vide.";
    } else if (totals.grandTotal === null) {
      validationError = "Completez votre adresse pour calculer la livraison.";
    }

    if (validationError) {
      setGlobalError(validationError);
      return;
    }

    try {
      setIsPreparingStripe(true);
      setGlobalError("");
      setPaymentErrorMessage("");

      const payload = {
        amount: Math.round(Number(totals.grandTotal || 0) * 100),
        currency: "eur",
        order: {
          items: frozenItemsRef.current.map((item) => ({
            id: item.id,
            title: item.title || "",
            quantity: Math.max(1, Number(item.quantity || 1)),
            price: priceWithTax(item.promoPrice ?? item.price ?? 0),
            weight: Number(item.weight || 0)
          })),
          shippingMethod,
          relayPoint: shippingMethod === "mondial_relay" ? relayDetails : null,
          buyer: {
            ...(() => {
              const { firstName, lastName, ...rest } = formData;
              return rest;
            })(),
            name: `${formData.firstName} ${formData.lastName}`.trim(),
            address: fullAddress
          },
          totals: {
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            grandTotal: totals.grandTotal,
            promoDiscountValue
          }
        }
      };

      let clientSecret = "";
      let callableError = null;

      try {
        const response = await createStripePaymentIntent(payload);
        clientSecret = response?.data?.clientSecret || "";
      } catch (err) {
        callableError = err;
        console.warn("Callable Stripe init failed, trying HTTP fallback:", err);
      }

      if (!clientSecret && stripePaymentIntentUrl) {
        const httpResponse = await fetch(stripePaymentIntentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!httpResponse.ok) {
          const errorText = await httpResponse.text();
          throw new Error(errorText || "HTTP Stripe init failed.");
        }

        const httpData = await httpResponse.json();
        clientSecret =
          httpData?.clientSecret ||
          httpData?.data?.clientSecret ||
          httpData?.client_secret ||
          "";
      }

      if (!clientSecret && callableError) {
        throw callableError;
      }

      if (!clientSecret) {
        setGlobalError(
          stripePaymentIntentUrl
            ? "Impossible d'initialiser le paiement Stripe."
            : "Impossible d'initialiser Stripe. Configurez REACT_APP_STRIPE_PAYMENT_INTENT_URL ou corrigez la Cloud Function callable."
        );
        return;
      }

      setStripeClientSecret(clientSecret);
    } catch (err) {
      console.error("Stripe init error:", err);
      setGlobalError(mapStripeInitErrorToMessage(err));
    } finally {
      setIsPreparingStripe(false);
    }
  }, [
    stripeClientSecret,
    validatePersonalInfo,
    validateAddressInfo,
    shippingMethod,
    relayDetails,
    formData,
    fullAddress,
    totals.grandTotal,
    totals.subtotal,
    totals.shipping,
    promoDiscountValue,
    createStripePaymentIntent,
    safeItems.length
  ]);

  const handleStripePaymentSuccess = async (paymentIntent) => {
    try {
      setGlobalError("");
      setPaymentErrorMessage("");
      if (!paymentIntent?.id) {
        throw new Error("Paiement confirme, mais identifiant introuvable.");
      }

      await finalizeOrderAfterPayment({ paymentIntentId: paymentIntent.id });
      // Conversion Google Ads
      if (window.gtag) {
        window.gtag('event', 'conversion', {
          send_to: 'AW-18141877804/T-0BCJDLg7QcEKys3MpD',
          value: Number(totals.grandTotal || 0),
          currency: 'EUR',
          transaction_id: paymentIntent.id
        });
      }
      setOrderSuccess(true);
      clearCart();
      
      setRecoveryItems([]);
      sessionStorage.removeItem(checkoutRecoveryKey);
      setStripeClientSecret("");
    } catch (err) {
      console.error("Order finalize error:", err);
      setGlobalError(
        err?.message ||
        "Paiement recu, mais la finalisation de la commande a echoue. Contactez le support."
      );
    }
  };

  useEffect(() => {
    setStripeClientSecret("");
  }, [
    totals.grandTotal,
    totals.shipping,
    shippingMethod,
    relayDetails,
    promoDiscountValue,
    fullAddress,
    formData.city,
    formData.zipCode,
    formData.country
  ]);

  const canPay = totals.grandTotal !== null && totals.shipping !== "weight_limit" && totals.shipping !== "unsupported";

  useEffect(() => {
    if (currentStep !== 3) return;
    if (stripeClientSecret) return;
    if (!stripePublicKey) return;
    if (!canPay) return;
    handlePrepareStripePayment();
  }, [currentStep, stripeClientSecret, canPay, handlePrepareStripePayment]);

  if (safeItems.length === 0 && !orderSuccess) {
    return (
      <div className="empty-checkout">
        <div className="empty-content">
          <h2 className="details-title">Votre panier est vide</h2>
          <p>La quête du savoir commence par un premier ouvrage.</p>
          <br />
          <Link to="/books" className="buy-btn-large">Parcourir la collection</Link>
        </div>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="checkout-success">
        <h2>Merci !</h2>
        <p>Votre commande a bien été passée.</p>
        <div className="checkout-success-announcement">
          Vous recevrez un email de confirmation avec les détails de votre commande.
        </div>
        <Link to="/" className="buy-btn-large">Retour à l'accueil</Link>
      </div>
    );
  }

  const progressPercent = ((currentStep - 1) / (stepMeta.length - 1)) * 100;

  return (
    <div className="checkout-page">
      <div ref={checkoutTopRef} />
      <div className="checkout-container">
        <header className="checkout-header">
          <Link to="#" className="back-link" onClick={(e) => { e.preventDefault(); navigate(-1); }}>
            <FaChevronLeft /> Retour
          </Link>
          <h1 className="details-title">Finaliser la <span className="gold-text">Commande</span></h1>
        </header>

        <div className="checkout-progress-shell">
          <div className="checkout-progress-line">
            <span className="checkout-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="checkout-steps-row">
            {stepMeta.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`checkout-step-pill ${currentStep === step.id ? "is-current" : ""} ${currentStep > step.id ? "is-done" : ""}`}
                onClick={() => goToStep(step.id)}
              >
                <span className="step-pill-icon">{step.icon}</span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="checkout-grid-layout">
          <section className="checkout-main-content">
            <div className="checkout-section-card flow-card">
              {globalError && <div className="form-alert-error">{globalError}</div>}

              {currentStep === 1 && (
                <>
                  <h2 className="flow-title">1. Validation des informations personnelles</h2>
                  <div className="form-grid">
                    <div className="field-block">
                      <label htmlFor="lastName">Nom *</label>
                      <input
                        id="lastName"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        placeholder="Votre nom"
                        autoComplete="family-name"
                      />
                      {fieldErrors.lastName && <p className="field-error">{fieldErrors.lastName}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="firstName">Prénom *</label>
                      <input
                        id="firstName"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        placeholder="Votre prénom"
                        autoComplete="given-name"
                      />
                      {fieldErrors.firstName && <p className="field-error">{fieldErrors.firstName}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="phone">Numéro téléphone *</label>
                      <input id="phone" name="phone" value={formData.phone} onChange={handleInputChange} type="tel" placeholder="+32..." />
                      {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                    </div>
                    <div className="field-block full-width">
                      <label htmlFor="email">Email *</label>
                      <input id="email" name="email" value={formData.email} onChange={handleInputChange} type="email" placeholder="vous@email.com" />
                      {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                    </div>
                  </div>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <h2 className="flow-title">2. Adresse de livraison</h2>
                  <div className="form-grid">
                    <div className="field-block">
                      <label htmlFor="housingType">Type logement</label>
                      <input
                        id="housingType"
                        name="housingType"
                        value={formData.housingType}
                        onChange={handleInputChange}
                        placeholder="Appartement, Maison,... (facultatif)"
                      />
                      {fieldErrors.housingType && <p className="field-error">{fieldErrors.housingType}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="street">Rue *</label>
                      <input id="street" name="street" value={formData.street} onChange={handleInputChange} placeholder="Nom de rue" />
                      {fieldErrors.street && <p className="field-error">{fieldErrors.street}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="houseNumber">N° *</label>
                      <input id="houseNumber" name="houseNumber" value={formData.houseNumber} onChange={handleInputChange} placeholder="Ex: 14B" />
                      {fieldErrors.houseNumber && <p className="field-error">{fieldErrors.houseNumber}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="city">Ville *</label>
                      <input id="city" name="city" value={formData.city} onChange={handleInputChange} />
                      {fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="zipCode">Code postal *</label>
                      <input id="zipCode" name="zipCode" value={formData.zipCode} onChange={handleInputChange} />
                      {fieldErrors.zipCode && <p className="field-error">{fieldErrors.zipCode}</p>}
                    </div>
                    <div className="field-block">
                      <label htmlFor="country">Pays *</label>
                      <select id="country" name="country" value={formData.country} onChange={handleInputChange}>
                        <option value="">Sélectionnez votre pays</option>
                        {europeanCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {fieldErrors.country && <p className="field-error">{fieldErrors.country}</p>}
                    </div>
                  </div>
                  {isResolvingAddress && <p className="promo-msg">Détection adresse en cours...</p>}
                  {addressSuggestions.length > 0 && (
                    <div className="address-suggestion-box">
                      <p className="address-suggestion-title">
                        {suggestionSource === "city"
                          ? "Resultats trouves: choisissez un code postal pour cette ville."
                          : "Resultats trouves: choisissez une ville pour ce code postal."}
                      </p>
                      <div className="address-suggestion-list">
                        {addressSuggestions.map((item, idx) => (
                          <button
                            key={`${item.city}-${item.zipCode}-${idx}`}
                            type="button"
                            className="address-suggestion-item"
                            onClick={() => handleSelectAddressSuggestion(item)}
                          >
                            <span>{item.city || "Ville inconnue"}</span>
                            <strong>{item.zipCode || "CP inconnu"}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {addressLookupMessage && <p className="field-error">{addressLookupMessage}</p>}

                  <div className="shipping-methods">
                    <p className="shipping-label">Méthode de livraison *</p>
                    <div className="shipping-options">
                      <label className={`ship-option ${shippingMethod === "bpost" ? "is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="shippingMethod"
                          value="bpost"
                          checked={shippingMethod === "bpost"}
                          disabled={!!formData.country && !isBpostAvailableForCountry}
                          onChange={(e) => {
                            setShippingMethod(e.target.value);
                            setRelayDetails(null);
                            setFieldErrors((prev) => ({ ...prev, shippingMethod: undefined, relayPoint: undefined }));
                          }}
                        />
                        <span className="ship-logo"><img src="https://res.cloudinary.com/djukqnpbs/image/upload/v1771074259/bpost_a4vqyk.png" alt="Bpost" loading="lazy" /></span>
                        <span className="ship-text">
                          <span className="ship-title">Bpost</span>
                          <span className="ship-sub">
                            {!!formData.country && !isBpostAvailableForCountry
                              ? `Non disponible pour ${formData.country}`
                              : "Livraison à domicile"}
                          </span>
                        </span>
                      </label>
                      <label className={`ship-option ${shippingMethod === "mondial_relay" ? "is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="shippingMethod"
                          value="mondial_relay"
                          checked={shippingMethod === "mondial_relay"}
                          disabled={!!formData.country && !isMondialRelayAvailableForCountry}
                          onChange={(e) => {
                            setShippingMethod(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, shippingMethod: undefined }));
                          }}
                        />
                        <span className="ship-logo"><img src="https://res.cloudinary.com/djukqnpbs/image/upload/v1771074258/mondial-relay_hxddf5.jpg" alt="Mondial Relay" loading="lazy" /></span>
                        <span className="ship-text">
                          <span className="ship-title">Mondial Relay</span>
                          <span className="ship-sub">
                            {!!formData.country && !isMondialRelayAvailableForCountry
                              ? `Non disponible pour ${formData.country}`
                              : "Point relais"}
                          </span>
                        </span>
                      </label>
                    </div>
                    {fieldErrors.shippingMethod && <p className="field-error">{fieldErrors.shippingMethod}</p>}
                  </div>

                  {shippingMethod === "mondial_relay" && (
                    <div className="relay-widget">
                      {!relayDetails && (
                        <>
                          <div id="Zone_Widget"></div>
                          <input type="hidden" id="Retour_Widget" />
                        </>
                      )}
                      {relayDetails ? (
                        <div className="relay-confirm-box">
                          <p className="relay-confirm-text">
                            Point relais confirme: {relayDetails.name || "Point relais"} {relayDetails.zipCode ? `(${relayDetails.zipCode})` : ""}
                          </p>
                          <button
                            type="button"
                            className="flow-btn secondary relay-confirm-btn"
                            onClick={handleResetRelayPoint}
                          >
                            Changer le point relais
                          </button>
                        </div>
                      ) : relayCandidate ? (
                        <div className="relay-confirm-box">
                          <p className="relay-confirm-text">
                            Point choisi: {relayCandidate.name || "Point relais"} {relayCandidate.zipCode ? `(${relayCandidate.zipCode})` : ""}
                          </p>
                          <button
                            type="button"
                            className="flow-btn primary relay-confirm-btn"
                            onClick={handleConfirmRelayPoint}
                          >
                            Choisir ce point relais
                          </button>
                        </div>
                      ) : null}
                      {fieldErrors.relayPoint && <p className="field-error">{fieldErrors.relayPoint}</p>}
                    </div>
                  )}
                </>
              )}

              {currentStep === 3 && (
                <>
                  {paymentErrorMessage && (
                    <div className="form-alert-error" style={{ marginBottom: "0.75rem" }}>
                      {paymentErrorMessage}
                    </div>
                  )}
                  <h2 className="flow-title">3. Paiement et récapitulatif</h2>
                  <div className="promo-flex">
                    <input name="promoCode" placeholder="Code promo" value={formData.promoCode} onChange={handleInputChange} />
                    <button type="button" className="tool-btn" onClick={handleApplyPromo}>Appliquer</button>
                  </div>
                  {promoMessage.text && <p className={`promo-msg ${promoMessage.type}`}>{promoMessage.text}</p>}
                  <div className="payment-security-note">
                    <FaLock /> Paiement 100% sécurisé
                  </div>
                  <div className="paypal-buttons-container">
                    {!stripePublicKey && (
                      <p className="field-error">
                        Clé Stripe manquante. Ajoutez REACT_APP_STRIPE_PUBLISHABLE_KEY.
                      </p>
                    )}

                    {!stripeClientSecret ? (
                      <p className="promo-msg">
                        {isPreparingStripe ? "Initialisation Stripe..." : "Chargement du formulaire Stripe..."}
                      </p>
                    ) : (
                      <Elements
                        stripe={stripePromise}
                        options={{
                          clientSecret: stripeClientSecret,
                          appearance: {
                            theme: "stripe",
                          },
                        }}
                      >
                        <StripePaymentForm
                          disabled={!canPay}
                          isProcessing={isProcessingStripe}
                          setIsProcessing={setIsProcessingStripe}
                          onError={(msg) => {
                            if (!msg) {
                              setPaymentErrorMessage("");
                              setGlobalError("");
                              return;
                            }
                            setPaymentErrorMessage(msg);
                            setGlobalError(msg);
                            window.alert(msg);
                            if (!msg.toLowerCase().includes("en cours de traitement")) {
                              setCurrentStep(1);
                            }
                          }}
                          onSuccess={handleStripePaymentSuccess}
                        />
                      </Elements>
                    )}
                  </div>
                </>
              )}

              <div className="flow-actions">
                <button type="button" className="flow-btn secondary" onClick={() => goToStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>
                  Précédent
                </button>
                {currentStep < 3 && (
                  <button type="button" className="flow-btn primary" onClick={() => goToStep(currentStep + 1)}>
                    Continuer
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="checkout-summary-sidebar">
            <div className="summary-sticky-card">
              <h3 className="summary-title">Résumé commande</h3>

              {safeItems.map((item) => (
                <div key={item.id} className="mini-item-card">
                  <img src={item.images?.[0]} alt={item.title} className="mini-img" />
                  <div className="mini-details">
                    <p className="mini-title">{item.title}</p>
                    <p className="mini-meta">Qté: {item.quantity} • {priceWithTax(item.promoPrice ?? item.price).toFixed(2)}€</p>
                  </div>
                  <span className="mini-total">{(priceWithTax(item.promoPrice ?? item.price) * item.quantity).toFixed(2)}€</span>
                </div>
              ))}

              <div className="summary-calculation">
                <div className="calc-row"><span>Sous-total (TTC)</span><span>{totals.subtotal.toFixed(2)}€</span></div>
                <div className="calc-row">
                  <span>Frais de livraison</span>
                  <span>
                    {totals.shipping === "weight_limit"
                      ? (() => {
                        const limit = getMaxWeightKgForMethod(shippingMethod, formData.country) ?? MAX_SHIPPING_WEIGHT;
                        return `Poids > ${limit} kg`;
                      })()
                      : totals.shipping === "unsupported"
                        ? "Non disponible"
                        : totals.shipping === null
                          ? "À calculer"
                          : totals.shipping === 0 && totals.freeShippingApplied
                            ? "Offert"
                          : `${totals.shipping.toFixed(2)}€`}
                  </span>
                </div>
                {promoDiscountValue > 0 && (
                  <div className="calc-row discount-row"><span>Réduction ({promoPercent}%)</span><span>-{promoDiscountValue.toFixed(2)}€</span></div>
                )}
                <div className="calc-row grand-total-row">
                  <span>Total</span>
                  <span>{totals.grandTotal === null ? "À calculer" : `${totals.grandTotal.toFixed(2)}€`}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
