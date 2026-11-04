import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../API/Axios";

const money = (n) => Number(n || 0).toLocaleString();

function TopupResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const txRef = params.get("tx_ref");

  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState(null);

  // We never trust the redirect. Our server asks Paychangu what really happened.
  const verify = async () => {
    if (!txRef) {
      setResult({ status: "error", message: "No payment reference found" });
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const res = await api.get(`/topups/verify/${encodeURIComponent(txRef)}`);
      setResult(res.data);
    } catch (err) {
      setResult(
        err.response?.data || { status: "error", message: "Could not check the payment" }
      );
    }
    setChecking(false);
  };

  useEffect(() => {
    verify();
  }, []);

  const status = result?.status;

  const styles = {
    completed: { title: "Top-up successful", color: "text-accent" },
    failed: { title: "Payment not completed", color: "text-danger" },
    pending: { title: "Payment not confirmed yet", color: "text-text-primary" },
    not_found: { title: "Top-up not found", color: "text-danger" },
    error: { title: "Something went wrong", color: "text-danger" },
  };
  const view = styles[status] || styles.error;

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4">
      <div className="bg-secondary rounded-xl border border-border shadow-card p-8 w-full max-w-md text-center">
        {checking ? (
          <>
            <h1 className="text-text-primary font-bold text-lg mb-2">
              Checking your payment
            </h1>
            <p className="text-text-muted text-sm">Please wait a moment...</p>
          </>
        ) : (
          <>
            <h1 className={`font-bold text-xl mb-2 ${view.color}`}>{view.title}</h1>
            <p className="text-text-secondary text-sm mb-5">{result?.message}</p>

            {status === "completed" && (
              <div className="bg-surface rounded-lg p-4 mb-5 text-sm space-y-1">
                <p className="text-text-secondary">
                  Card: <span className="text-text-primary font-medium">{result.owner}</span>
                </p>
                <p className="text-text-secondary">
                  Amount added:{" "}
                  <span className="text-text-primary font-medium">
                    MWK {money(result.amount)}
                  </span>
                </p>
                <p className="text-text-secondary">
                  New balance:{" "}
                  <span className="text-text-primary font-semibold">
                    MWK {money(result.balance)}
                  </span>
                </p>
              </div>
            )}

            {txRef && (
              <p className="text-text-muted text-xs mb-5 break-all">Reference: {txRef}</p>
            )}

            <div className="flex gap-3 justify-center">
              {(status === "pending" || status === "error") && (
                <button
                  onClick={verify}
                  className="bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-accent-light transition-colors"
                >
                  Check again
                </button>
              )}
              <button
                onClick={() => navigate("/admin")}
                className="bg-surface text-text-primary text-sm font-medium px-5 py-2.5 rounded-lg border border-border hover:opacity-70"
              >
                Back to Admin
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TopupResult;