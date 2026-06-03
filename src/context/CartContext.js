import React, { createContext, useState, useEffect, useCallback } from "react";

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const stored = sessionStorage.getItem("cart");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    sessionStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  const getStockLimit = useCallback((item) => {
    const stock = Number(item?.stock);
    return Number.isFinite(stock) && stock > 0 ? stock : null;
  }, []);

  const clampQuantityToStock = useCallback((item, requestedQty) => {
    const safeQty = Math.max(1, Number(requestedQty) || 1);
    const stockLimit = getStockLimit(item);
    return stockLimit ? Math.min(safeQty, stockLimit) : safeQty;
  }, [getStockLimit]);

  const addToCart = useCallback((product, overrideQuantity = false) => {
    setCartItems((prev) => {
      const exist = prev.find((i) => i.id === product.id);

      if (exist) {
        const merged = { ...exist, ...product };

        if (overrideQuantity) {
          const nextQty = clampQuantityToStock(
            merged,
            product.quantity ?? exist.quantity
          );
          return prev.map((i) =>
            i.id === product.id ? { ...merged, quantity: nextQty } : i
          );
        }

        const increment = Number(product.quantity || 1);
        const nextQty = clampQuantityToStock(
          merged,
          (exist.quantity || 0) + increment
        );

        return prev.map((i) =>
          i.id === product.id ? { ...merged, quantity: nextQty } : i
        );
      }

      const nextQty = clampQuantityToStock(product, product.quantity || 1);
      return [...prev, { ...product, quantity: nextQty }];
    });
  }, [clampQuantityToStock]);

  const removeFromCart = useCallback((id) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id, quantity) => {
    setCartItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, quantity: clampQuantityToStock(i, quantity) }
          : i
      )
    );
  }, [clampQuantityToStock]);

  const clearCart = useCallback(() => {
    setCartItems([]);
    sessionStorage.removeItem("cart");
  }, []);

  const cartCount = cartItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalPrice = cartItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
