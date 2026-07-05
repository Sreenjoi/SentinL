import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Check, X, Loader2, Shield } from "lucide-react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebase";
import { toast } from "sonner";
import { Logo } from "./Logo";

import { loadRazorpayScript } from "../utils/loadRazorpayScript";

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const serverId = searchParams.get("server");
  const [loading, setLoading] = useState<string | false>(false);
  const navigate = useNavigate();
  const [user] = useAuthState(auth);

  useEffect(() => {
    if (!serverId) {
      toast("No Server ID provided.");
    }
  }, [serverId]);

  const handleSubscribe = async (plan: "pro_1" | "pro_3") => {
    const planName = plan === "pro_3" ? "SentinL Premium" : "SentinL Pro";
    const planDescription = plan === "pro_3"
      ? `Upgrade server ${serverId} to Premium with up to 3 server slots.`
      : `Upgrade server ${serverId} to Pro for 1 server.`;

    if (!user) {
      toast.error("Please log in first.");
      return;
    }
    
    if (!serverId) {
      toast("Missing Server ID in URL parameters.");
      return;
    }

    setLoading(plan);
    try {
      const isScriptLoaded = await loadRazorpayScript(
        "https://checkout.razorpay.com/v1/checkout.js",
      );
      if (!isScriptLoaded) {
        toast.error("Razorpay SDK failed to load. Are you online?");
        setLoading(false);
        return;
      }

      const token = await user?.getIdToken();
      const response = await fetch(`/api/create-razorpay-order`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          serverId: serverId,
          userId: user?.uid || "null",
          plan: plan,
        }),
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      
      if (!response.ok) {
        const errText = await response.text();
        let errData = {};
        try { if (isJson) errData = JSON.parse(errText); } catch(e) {}
        throw new Error((errData as any)?.error || errText.substring(0, 50) || "Failed to create order on server.");
      }

      const orderData = isJson ? await response.json() : null;
      if (!orderData) throw new Error("Server did not return order data in JSON format.");

      if (!orderData.order_id) {
        throw new Error("Failed to create Razorpay order.");
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: planName,
        description: planDescription,
        order_id: orderData.order_id,
        handler: async function (response: any) {
          try {
            const token = await user?.getIdToken();
            if (!token) {
              toast.error("Authentication error. Please log in again and retry.");
              return;
            }
            const verifyRes = await fetch(`/api/verify-razorpay-payment`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyText = await verifyRes.text();
            let verifyData: any = { success: false };
            try {
              if (verifyRes.headers.get("content-type")?.includes("application/json")) {
                verifyData = JSON.parse(verifyText);
              }
            } catch (e) {}

            if (verifyData.success) {
              navigate("/success");
            } else {
              toast.error("Payment verification failed! " + verifyData?.error);
            }
          } catch (err: any) {
            toast.error("Error verifying payment: " + err.message);
          }
        },
        prefill: {
          email: user?.email || "",
        },
        theme: {
          color: "#5865F2",
        },
      };

      // @ts-ignore
      const RazorpayCtor = (window as any).Razorpay;
      if (typeof RazorpayCtor !== 'function') {
        throw new Error("Razorpay SDK not loaded correctly (not a function).");
      }
      
      let rzp;
      try {
        rzp = new RazorpayCtor(options);
      } catch (e: any) {
        if (e.message?.includes('Illegal constructor')) {
          throw new Error("Razorpay SDK initialization failed: Illegal constructor. This can happen if the script is blocked or modified by an extension.");
        }
        throw e;
      }

      rzp.on("payment.failed", function (response: any) {
        toast.error("Payment Failed: " + response?.error?.description);
      });
      rzp.open();
    } catch (error) {
      console.error("Error calling checkout endpoint:", error);
      toast(
        "An error occurred. Please check your connection and try again: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setLoading(false);
    }
  };

  if (!serverId) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <h1 className="text-2xl font-black text-on-surface mb-2 tracking-tight">
          Invalid URL
        </h1>
        <p className="text-text-secondary">
          Missing server parameter in the URL.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto relative z-10 w-full animate-fade-in pb-24 lg:pb-8">
      <div className="mb-12 text-center max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-black text-on-surface mb-4 tracking-tight drop-shadow-sm">
          Server{" "}
          <span className="text-primary font-mono bg-primary/10 px-3 py-1 rounded-xl drop-shadow-none border border-primary/20">
            {serverId}
          </span>
        </h1>
        <p className="text-sm md:text-base font-bold text-text-secondary uppercase tracking-[0.2em]">
          Community Upgrade
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 max-w-4xl mx-auto">
        {/* Pro Plan */}
        <div className="relative group bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 hover:bg-white overflow-hidden">
          <div className="mb-8">
            <h3 className="text-3xl font-black text-on-surface mb-2 tracking-tight group-hover:text-primary transition-colors">
              Pro
            </h3>
            <p className="text-[11px] font-black uppercase text-text-secondary tracking-[0.2em]">
              Support 1 Server
            </p>
          </div>
          <div className="mb-8 flex items-baseline gap-2">
            <span className="text-5xl font-black text-on-surface tracking-tighter">
              $7.99
            </span>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              / mo
            </span>
          </div>

          <ul className="mb-8 space-y-3 text-sm font-semibold text-text-secondary">
            {[
              "2,000 AI checks/day for 1 server",
              "Mod queue, reports, and appeals",
              "Advanced actions, context, and training",
              "Leveling, giveaways, socials, and custom commands",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleSubscribe("pro_1")}
            disabled={loading !== false}
            className="w-full py-4 px-6 bg-surface-container hover:bg-primary text-on-surface hover:text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-300 ease-out flex items-center justify-center gap-3 border border-outline-variant/30 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(255,111,97,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
          >
            {loading === "pro_1" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing
              </>
            ) : (
              <>
                Subscribe to Pro
                <Logo className="w-4 h-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </>
            )}
          </button>
        </div>

        {/* Premium Plan */}
        <div className="relative group bg-gradient-to-b from-primary/10 to-transparent border border-primary/30 rounded-3xl p-8 hover:border-primary transition-all duration-300 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2 hover:bg-white overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

          <div className="absolute top-6 right-6 flex">
            <span className="bg-primary text-white text-[9px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full shadow-[0_0_15px_rgba(255,111,97,0.4)] ring-2 ring-white">
              Best Value
            </span>
          </div>

          <div className="mb-8">
            <h3 className="text-3xl font-black text-on-surface mb-2 tracking-tight group-hover:text-primary transition-colors">
              Premium
            </h3>
            <p className="text-[11px] font-black uppercase text-primary tracking-[0.2em]">
              Support Up To 3 Servers
            </p>
          </div>
          <div className="mb-8 flex items-baseline gap-2">
            <span className="text-5xl font-black text-on-surface tracking-tighter">
              $19.99
            </span>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              / mo
            </span>
          </div>

          <ul className="mb-8 space-y-3 text-sm font-semibold text-text-secondary">
            {[
              "2,000 AI checks/day per server",
              "Up to 3 linked server slots",
              "Pro controls on every linked server",
              "Manage multiple communities from one plan",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleSubscribe("pro_3")}
            disabled={loading !== false}
            className="w-full py-4 px-6 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-300 ease-out flex items-center justify-center gap-3 shadow-[0_10px_30px_-10px_rgba(255,111,97,0.5)] hover:shadow-[0_20px_40px_-10px_rgba(255,111,97,0.6)] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
          >
            {loading === "pro_3" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing
              </>
            ) : (
              <>
                Subscribe to Premium
                <Logo className="w-4 h-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
