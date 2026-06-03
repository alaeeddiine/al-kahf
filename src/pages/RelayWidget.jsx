import { useEffect, useRef } from "react";

const RelayWidget = ({ zipCode, onSelect }) => {
  const zoneRef = useRef(null);

  useEffect(() => {
    // Assure que jQuery et le plugin sont chargés
    if (window.$ && window.$.fn.MR_ParcelShopPicker && zoneRef.current) {
      window.$(zoneRef.current).MR_ParcelShopPicker({
        Brand: "CC23K35Q",          // ton code client Mondial Relay
        Country: "FR",
        PostCode: zipCode,          // code postal
        Target: "#relayResultInput", // pas obligatoire, utile si tu veux un champ caché
        OnParcelShopSelected: function (data) {
          // data contient les infos du point relais
          onSelect({
            number: data.ID,
            name: data.Nom,
            address: data.Adresse1 + " " + data.Adresse2,
            zipCode: data.CP,
            city: data.Ville,
            country: data.Pays
          });
        }
      });
    }
  }, [zipCode, onSelect]);

  return <div ref={zoneRef} id="Zone_Widget"></div>;
};

export default RelayWidget;
