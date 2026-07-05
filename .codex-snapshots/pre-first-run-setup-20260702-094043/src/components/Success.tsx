import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useServer } from "../context/ServerContext";
import { CheckCircle, Loader2 } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";

export default function Success() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedServerId } = useServer();
  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId || !selectedServerId) {
      setStatus("error");
      return;
    }

    // Listen to the subscription document to see when the webhook updates it
    const unsub = onSnapshot(
      doc(db, "subscriptions", selectedServerId),
      (docSnap) => {
        if (
          docSnap.exists() &&
          (docSnap.data().accessTier === "pro_1" ||
            docSnap.data().accessTier === "pro_3" ||
            docSnap.data().accessTier === "premium")
        ) {
          setStatus("success");
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate("/");
          }, 3000);
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `subscriptions/${selectedServerId}`)
    );

    // Timeout after 15 seconds if webhook hasn't fired
    const timeout = setTimeout(() => {
      if (status === "verifying") {
        setStatus("error");
      }
    }, 15000);

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [sessionId, selectedServerId, navigate, status]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 relative">
      {/* Blur effects */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10 mix-blend-multiply opacity-50 hidden md:block"></div>

      <div className="bg-white/60 backdrop-blur-2xl border border-white rounded-[3rem] shadow-2xl shadow-primary/10 p-16 max-w-lg w-full flex flex-col items-center">
        {status === "verifying" && (
          <>
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
              <Loader2 className="w-20 h-20 text-primary animate-spin relative z-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-on-surface mb-3 tracking-tight">
              Verifying Payment...
            </h2>
            <p className="text-sm font-bold text-text-secondary uppercase tracking-widest">
              Please wait while we confirm your subscription.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-success/20 rounded-full blur-xl animate-pulse"></div>
              <CheckCircle className="w-20 h-20 text-success relative z-10 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
            </div>
            <h2 className="text-3xl font-extrabold text-on-surface mb-3 tracking-tight">
              Upgrade Successful
            </h2>
            <p className="text-[13px] text-text-secondary font-medium mb-8 leading-relaxed">
              Your server has been successfully upgraded to Premium.
            </p>
            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-primary bg-primary/5 px-6 py-3 rounded-full border border-primary/10">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Redirecting to
              dashboard...
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-24 h-24 bg-danger-container/50 border border-danger/20 rounded-full flex items-center justify-center mb-8 relative shadow-[0_0_30px_rgba(248,113,113,0.2)]">
              <span className="text-danger text-4xl font-black font-mono">
                !
              </span>
            </div>
            <h2 className="text-3xl font-extrabold text-on-surface mb-3 tracking-tight">
              Verification Timeout
            </h2>
            <p className="text-[13px] text-text-secondary font-medium mb-8 leading-relaxed">
              We couldn't verify the payment immediately. Don't worry, it
              usually updates within a few minutes.
            </p>
            <button
              onClick={() => navigate("/")}
              className="px-8 py-4 bg-surface-container hover:bg-surface-container/80 border text-[11px] font-black tracking-[0.2em] uppercase border-outline-variant/20 rounded-2xl text-on-surface transition-all duration-300 ease-out active:scale-95 shadow-sm"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
