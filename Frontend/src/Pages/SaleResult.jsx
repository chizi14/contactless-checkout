import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../API/Axios";

// This is where the customer's PHONE lands after paying on Paychangu.
// It asks our server to verify (the redirect itself is never trusted).
// The kiosk screen shows the receipt.
function SaleResult() {
  const [params] = useSearchParams();
  const txRef = params.get("tx_ref");
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState(null);

  const verify = async () => {
    if (!txRef) {
      setResult({ status: "error", message: "No payment reference found" });
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const res = await api.get(`/mobile-sales/verify/${encodeURIComponent(txRef)}`);
      setResult(res.data);
    } catch (err) {
      setResult(err.response?.data || { status: "error", message: "Could not check the payment" });
    }
    setChecking(false);
  };

  useEffect(() => {
    verify();
  }, []);

  const status = result?.status;
  const view =
    status === "completed"
      ? { title: "Payment received", color: "text-accent", text: "Thank you! Your receipt is on the kiosk screen." }
      : status === "pending"
      ? { title: "Payment not confirmed yet", color: "text-text-primary", text: "If you have paid, wait a moment and check again." }
      : { title: "Payment not completed", color: "text-danger", text: result?.message || "Something went wrong." };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4">
      <div className="bg-secondary rounded-xl border border-border shadow-card p-8 w-full max-w-md text-center">
        {checking ? (
          <>
            <h1 className="text-text-primary font-bold text-lg mb-2">Checking your payment</h1>
            <p className="text-text-muted text-sm">Please wait a moment...</p>
          </>
        ) : (
          <>
            <h1 className={`font-bold text-xl mb-2 ${view.color}`}>{view.title}</h1>
            <p className="text-text-secondary text-sm mb-5">{view.text}</p>
            {status === "completed" && result?.sale && (
              <p className="text-text-primary font-semibold mb-5">
                MWK {Number(result.sale.total_amount).toLocaleString()}
              </p>
            )}
            {(status === "pending" || status === "error") && (
              <button
                onClick={verify}
                className="bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-accent-light transition-colors"
              >
                Check again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SaleResult;