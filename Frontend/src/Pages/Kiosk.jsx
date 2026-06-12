import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../API/Axios";
import Cart from "../Components/Cart";
import PaymentStatus from "../Components/PaymentStatus";

function Kiosk() {
  const [cart, setCart] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [paymentState, setPaymentState] = useState("idle");
  const [transactionData, setTransactionData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.barcode === product.barcode);
      if (existing) {
        return prev.map((i) =>
          i.barcode === product.barcode
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setError("");
  };

  const removeFromCart = (barcode) => {
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));
  };

  const clearCart = () => {
    setCart([]);
    setPaymentState("idle");
    setTransactionData(null);
    setError("");
  };

  const handlePayment = async (uid) => {
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }

    setPaymentState("processing");

    try {
      const verifyRes = await api.post("/cards/verify", { uid });

      if (!verifyRes.data.verified) {
        setPaymentState("denied");
        return;
      }

      const items = cart.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      }));

      const transactionRes = await api.post("/transactions", {
        card_id: verifyRes.data.card_id,
        items,
        total_amount: total,
      });

      setTransactionData({
        owner: verifyRes.data.owner,
        ...transactionRes.data,
      });
      setPaymentState("approved");
    } catch (err) {
      setPaymentState("denied");
    }
  };

  // Simulate card tap for testing (remove when ESP32 is connected)
  const simulateCardTap = () => {
    handlePayment("A3F211CC");
  };

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header
        className="bg-secondary border-b border-border px-6 py-4 
                         flex items-center justify-between shadow-card"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 bg-accent-lighter rounded-lg flex items-center 
                          justify-center"
          >
            <svg
              className="w-5 h-5 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 
                       2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 
                       2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-text-primary font-bold text-lg leading-none">
              Self Checkout
            </h1>
            <p className="text-text-muted text-xs">Scan items to begin</p>
          </div>
        </div>

        <button
          onClick={() => navigate("/login")}
          className="text-text-secondary text-sm hover:text-text-primary 
                     transition-colors"
        >
          Admin
        </button>
      </header>

      {paymentState !== "idle" ? (
        <PaymentStatus
          state={paymentState}
          data={transactionData}
          onReset={clearCart}
        />
      ) : (
        <div className="flex h-[calc(100vh-65px)]">
          {/* Left panel — scanner + product search */}
          <div className="flex-1 p-6 overflow-y-auto border-r border-border">
            <div className="max-w-lg mx-auto">
              <h2 className="text-text-primary font-semibold text-base mb-4">
                Scan Item
              </h2>

              {/* Scanner box */}
              <div
                className="bg-secondary border-2 border-dashed border-border 
                              rounded-2xl p-8 text-center mb-6"
              >
                <div
                  className="w-16 h-16 bg-accent-lighter rounded-2xl 
                                flex items-center justify-center mx-auto mb-4"
                >
                  <svg
                    className="w-8 h-8 text-accent"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 
                          0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 
                          001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 
                          0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 
                          0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 
                          00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                </div>
                <p className="text-text-primary font-medium">
                  Point phone camera at barcode
                </p>
                <p className="text-text-muted text-sm mt-1">
                  Open scanner on your phone browser
                </p>
                <div
                  className="mt-4 bg-surface rounded-xl px-4 py-2 
                                inline-block"
                >
                  <p className="text-text-secondary text-sm font-mono">
                    localhost:5173/scanner
                  </p>
                </div>
              </div>

              {error && (
                <div
                  className="bg-danger-light border border-danger 
                                border-opacity-20 rounded-xl px-4 py-3 mb-4"
                >
                  <p className="text-danger text-sm">{error}</p>
                </div>
              )}

              {/* Test button — remove before final demo or keep for testing */}
              <div className="bg-surface rounded-xl p-4 border border-border">
                <p
                  className="text-text-muted text-xs mb-3 font-medium uppercase 
                               tracking-wide"
                >
                  Development Testing
                </p>
                <button
                  onClick={simulateCardTap}
                  disabled={cart.length === 0}
                  className="w-full bg-accent text-white text-sm font-medium 
                             py-2.5 rounded-lg hover:bg-accent-light 
                             transition-colors disabled:opacity-40 
                             disabled:cursor-not-allowed"
                >
                  Simulate Card Tap
                </button>
                <p className="text-text-muted text-xs mt-2 text-center">
                  Uses test UID: A3F211CC
                </p>
              </div>
            </div>
          </div>

          {/* Right panel — cart */}
          <div className="w-96 flex flex-col bg-secondary">
            <Cart
              cart={cart}
              total={total}
              onRemove={removeFromCart}
              onClear={clearCart}
              onPay={simulateCardTap}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Kiosk;
