import React, { useState } from "react";
import { useServer } from "../context/ServerContext";
import { Check, X, Loader2, CreditCard } from "lucide-react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

import { loadRazorpayScript } from "../utils/loadRazorpayScript";
import { BrandedPageHeader, HeaderMetaPills } from "./BrandedPageHeader";
import { getPlanDisplayLabel } from "../utils/planDisplay";

export default function Pricing() {
  const { isPro, selectedServerId, tier, isBetaTester, userTier, refreshAccess, isSharedServer, isTrial } = useServer();
  const [user] = useAuthState(auth);
  const [loading, setLoading] = useState<string | false>(false);
  const [userSub, setUserSub] = useState<any>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<"trial" | "pro_1" | "pro_3" | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      getDoc(doc(db, "subscriptions", user.uid)).then((snap) => {
        if (snap.exists()) setUserSub(snap.data());
      }).catch((e) => {
        handleFirestoreError(e, OperationType.GET, `subscriptions/${user.uid}`);
      });
    }
  }, [user]);
  const parseDateLike = (value: any): Date | null => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const trialEnd = parseDateLike(userSub?.trialEnd);
  const isTrialActive = userSub?.status === "trial" && !!trialEnd && trialEnd.getTime() > Date.now();

  const handleStartTrial = async () => {
    if (!user) {
      toast.error("Please log in first.");
      return;
    }
    
    if (!selectedServerId) {
      toast("Please select a server.");
      return;
    }

    if (userSub?.trialUsed) {
      toast("You have already used your free trial on this account.");
      return;
    }

    setLoading("trial");
    try {
      const token = await user?.getIdToken();
      const response = await fetch("/api/start-trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ serverId: selectedServerId }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData?.error || "Failed to start trial");
      }

      toast("🎉 Your 14-day Pro trial has started!");
      if (refreshAccess) await refreshAccess();
    } catch (e: any) {
      toast.error("Failed to start trial: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan: "pro_1" | "pro_3") => {
    if (!user) {
      toast.error("Please log in first.");
      return;
    }

    if (!selectedServerId) {
      toast("Please select a server.");
      return;
    }

    setLoading(plan);
    try {
      const isScriptLoaded = await loadRazorpayScript(
        "https://checkout.razorpay.com/v1/checkout.js",
      );
      if (!isScriptLoaded) {
        toast.error("The payment window could not load. Check your connection or disable browser blockers, then try again.");
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
          serverId: selectedServerId,
          userId: user.uid,
          plan,
        }),
      });

      const responseText = await response.text();
      let orderData: any = {};
      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (isJson) {
        try { orderData = JSON.parse(responseText); } catch(e) {}
      }

      if (!response.ok) {
        throw new Error(orderData?.error || orderData?.message || responseText.substring(0, 50) || "Failed to create order");
      }

      if (!orderData.order_id) {
        throw new Error("Failed to create Razorpay order.");
      }

      const planName = plan === "pro_3" ? "SentinL Premium" : "SentinL Pro";
      const planDescription = plan === "pro_3"
        ? "Upgrade your account to Premium for up to 3 server slots."
        : "Upgrade your account to Pro for 1 server.";

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: planName,
        description: planDescription,
        order_id: orderData.order_id,
        handler: async function (response: any) {
          try {
            const token = await user?.getIdToken?.();
            if (!token) {
              toast.error("Authentication error. Please log in again.");
              return;
            }
            // Verify payment
            const verifyRes = await fetch("/api/verify-razorpay-payment", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                ...response,
                serverId: selectedServerId,
                userId: user.uid,
              }),
            });

            const verifyText = await verifyRes.text();
            let verifyData: any = { success: false };
            const verifyContentType = verifyRes.headers.get("content-type");
            if (verifyContentType && verifyContentType.includes("application/json")) {
              try { verifyData = JSON.parse(verifyText); } catch(e) {}
            }

            if (!verifyRes.ok) {
              throw new Error(verifyData?.error || verifyData?.message || verifyText.substring(0, 50) || "Verification failed");
            }

            if (verifyData.success) {
              navigate("/success");
            } else {
              toast.error("We could not confirm your payment yet. If money was deducted, please contact support before trying again.");
            }
          } catch (err: any) {
            toast.error("We could not confirm your payment yet. If money was deducted, please contact support before trying again.");
          }
        },
        prefill: {
          email: user.email,
        },
        theme: {
          color: "#5865F2",
        },
      };

      // @ts-ignore
      const RazorpayCtor = (window as any).Razorpay;
      if (typeof RazorpayCtor !== 'function') {
        throw new Error("The payment window could not load.");
      }
      
      let rzp;
      try {
        rzp = new RazorpayCtor(options);
      } catch (e: any) {
        if (e.message?.includes('Illegal constructor')) {
          throw new Error("The payment window was blocked or modified by the browser.");
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
        "Something went wrong while starting checkout. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="max-w-7xl mx-auto py-8 sm:py-16 px-4 sm:px-6 lg:px-8 pb-20 sm:pb-32"
    >
      <BrandedPageHeader
        eyebrow="Plans"
        title="Pricing Plans"
        description="Upgrade your server's intelligence. Pro and Premium include the same features; Premium simply adds coverage for up to 3 servers."
        icon={CreditCard}
        className="mb-12 sm:mb-16"
        meta={
          <HeaderMetaPills
            planLabel={getPlanDisplayLabel({ tier, userTier, isBetaTester, isTrial: isTrial || isTrialActive, isSharedServer })}
            path={["Pricing"]}
          />
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Free Plan */}
        <div className="glass-panel rounded-[2rem] sm:rounded-[2.5rem] flex flex-col p-6 sm:p-10 relative overflow-hidden group shadow-xl">
          <div className="mb-8">
            <h3 className="text-2xl font-extrabold text-on-surface tracking-tight mb-2">
              Free
            </h3>
            <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest">
              For growing communities.
            </p>
          </div>
          <div className="mb-10">
            <span className="text-5xl font-extrabold text-on-surface tracking-tighter">
              $0
            </span>
            <span className="text-sm font-bold text-text-secondary uppercase tracking-widest ml-1">
              /mo
            </span>
          </div>
          <ul className="flex-1 space-y-4 mb-10">
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                300 AI checks/day per server
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                Mod Hub (Queue, Reports & Appeals)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                Chat Summaries (5 summaries/week)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                Reaction Roles (Limit: 5)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                Custom Rules & Keyword Filters
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-success shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-primary">
                Basic Community Health
              </span>
            </li>
            <li className="flex items-start opacity-40">
              <X className="w-5 h-5 text-danger shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-secondary line-through">
                Advanced Actions (Delete, Warn, Timeout)
              </span>
            </li>
            <li className="flex items-start opacity-40">
              <X className="w-5 h-5 text-danger shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-secondary line-through">
                Community & Socials (Leveling, Giveaways, YT, Twitch)
              </span>
            </li>
            <li className="flex items-start opacity-40">
              <X className="w-5 h-5 text-danger shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-secondary line-through">
                Context Reading, Extra Review & Training
              </span>
            </li>
            <li className="flex items-start opacity-40">
              <X className="w-5 h-5 text-danger shrink-0 mr-3" />
              <span className="text-sm font-semibold text-text-secondary line-through">
                Community DNA (Rule Recommendations)
              </span>
            </li>
            <li className="flex items-start mt-6 pt-6 border-t border-outline-variant/20">
              <span className="text-sm font-extrabold text-on-surface">
                Limit: 1 Server
              </span>
            </li>
          </ul>
          {userSub?.trialUsed !== true && userTier !== "pro_1" && userTier !== "pro_3" && userTier !== "premium" ? (
            <button
              onClick={() => {
                setPendingPlan("trial");
                setTermsAgreed(false);
                setShowTerms(true);
              }}
              disabled={loading === "trial" || !selectedServerId}
              className="w-full py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest bg-on-surface text-bg-base hover:bg-on-surface/90 transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 flex justify-center items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              {loading === "trial" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Start 14-Day Free Trial"
              )}
            </button>
          ) : (
            <button
              disabled
              className="w-full py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest border-2 border-outline-variant/20 text-text-secondary bg-surface-container/50 cursor-not-allowed"
            >
              {userTier === "free"
                  ? "Current Plan"
                  : isTrialActive
                    ? "Included in Trial"
                    : "Included"}
            </button>
          )}
        </div>

        {/* Pro Plan 1 Server */}
        <div className="glass-panel border-primary/20 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col p-6 sm:p-10 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 ease-out">
          <div className="mb-8">
            <h3 className="text-2xl font-extrabold text-primary tracking-tight mb-2">
              Pro
            </h3>
            <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest">
              Full autonomous features for 1 server.
            </p>
          </div>
          <div className="mb-10">
            <span className="text-5xl font-extrabold text-on-surface tracking-tighter">
              $7.99
            </span>
            <span className="text-sm font-bold text-text-secondary uppercase tracking-widest ml-1">
              /mo
            </span>
          </div>
          <ul className="flex-1 space-y-4 mb-10">
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                2,000 AI checks/day for 1 server
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Mod Hub (Queue, Reports & Appeals)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Higher daily summary limit
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Reaction Roles (Unlimited)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Custom Rules & Keyword Filters
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Advanced Community Health (Widgets & Rewards)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Advanced Actions (Delete, Warn, Timeout)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Community & Socials (Leveling, Giveaways, YT, Twitch)
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Context Reading, Extra Review & Training
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-primary shrink-0 mr-3" />
              <span className="text-sm font-semibold text-on-surface">
                Custom Commands & Rule Recommendations
              </span>
            </li>
            <li className="flex items-start mt-6 pt-6 border-t border-outline-variant/20">
              <span className="text-sm font-extrabold text-on-surface">
                Limit: 1 Server
              </span>
            </li>
          </ul>
          {isTrialActive && (
            <div className="text-center mb-3 mt-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">Trial Active</span>
            </div>
          )}
          <button
            onClick={() => {
              if (userTier !== "pro_1" && userTier !== "pro_3" && userTier !== "premium") {
                setPendingPlan("pro_1");
                setTermsAgreed(false);
                setShowTerms(true);
              }
            }}
            disabled={
              loading !== false ||
              userTier === "pro_1" ||
              userTier === "pro_3" ||
              userTier === "premium"
            }
            className={`w-full py-4 px-6 rounded-2xl text-xs font-black tracking-[0.16em] uppercase transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 flex justify-center items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
              userTier === "pro_1"
                ? "border-2 border-primary/20 text-primary bg-primary/5 cursor-default"
                : userTier === "pro_3" || userTier === "premium"
                  ? "border-2 border-outline-variant/20 text-text-secondary bg-surface-container/50 cursor-default"
                  : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/30 active:scale-95"
            }`}
          >
            {loading === "pro_1" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : userTier === "pro_1" ? (
              isTrialActive ? "Trial Active" : "Current Plan"
            ) : userTier === "pro_3" || userTier === "premium" ? (
              "Included"
            ) : (
              "Subscribe"
            )}
          </button>
        </div>

        {/* Pro Plan 3 Servers */}
        <div className="bg-primary backdrop-blur-xl border border-primary/50 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl shadow-primary/20 flex flex-col p-6 sm:p-10 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 ease-out">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-[100px] -z-10"></div>
          <div className="mb-8">
            <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">
              Premium
            </h3>
            <p className="text-[11px] font-black text-white/70 uppercase tracking-widest">
              Multi-server autonomous AI moderation.
            </p>
          </div>
          <div className="mb-10">
            <span className="text-5xl font-extrabold text-white tracking-tighter">
              $19.99
            </span>
            <span className="text-sm font-bold text-white/70 uppercase tracking-widest ml-1">
              /mo
            </span>
          </div>
          <ul className="flex-1 space-y-4 mb-10">
            <li className="flex items-start">
              <Check className="w-5 h-5 text-white shrink-0 mr-3" />
              <span className="text-sm font-semibold text-white">
                2,000 AI checks/day per server, up to 3 servers
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-white shrink-0 mr-3" />
              <span className="text-sm font-semibold text-white">
                Up to 3 linked server slots
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-white shrink-0 mr-3" />
              <span className="text-sm font-semibold text-white">
                Pro controls on every linked server
              </span>
            </li>
            <li className="flex items-start">
              <Check className="w-5 h-5 text-white shrink-0 mr-3" />
              <span className="text-sm font-semibold text-white">
                Manage multiple communities from one plan
              </span>
            </li>
            <li className="flex items-start mt-6 pt-6 border-t border-white/20">
              <span className="text-sm font-extrabold text-white">
                Limit: Up to 3 Servers
              </span>
            </li>
          </ul>
          <div className="mt-auto flex flex-col gap-3 pt-4">
            {isTrialActive && userTier === "pro_3" && (
              <div className="text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-white bg-white/20 px-3 py-1 rounded-full">Trial Active</span>
              </div>
            )}
            <button
              onClick={() => {
                if (userTier !== "pro_3" && userTier !== "premium") {
                  setPendingPlan("pro_3");
                  setTermsAgreed(false);
                  setShowTerms(true);
                }
              }}
              disabled={
                loading !== false || userTier === "pro_3" || userTier === "premium"
              }
            className={`w-full py-4 px-6 rounded-2xl text-xs font-black tracking-[0.16em] uppercase transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 flex justify-center items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${
                userTier === "pro_3" || userTier === "premium"
                  ? "border-2 border-white/30 text-white bg-white/10 cursor-default"
                  : "bg-white text-primary hover:bg-white/90 shadow-xl shadow-black/10 active:scale-95"
              }`}
            >
              {loading === "pro_3" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : userTier === "pro_3" || userTier === "premium" ? (
                "Current Plan"
              ) : (
                "Subscribe"
              )}
            </button>
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-outline-variant/30 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative">
            <button
              onClick={() => setShowTerms(false)}
              aria-label="Close terms dialog"
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface-container/50 text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black text-on-surface tracking-tight mb-2">Terms & Fair Use</h3>
            <p className="text-xs text-text-secondary font-medium mb-6">Please agree to our terms before proceeding with your purchase.</p>
            
            <div className="bg-surface-container/30 border border-outline-variant/30 rounded-2xl p-5 mb-6 max-h-[300px] overflow-y-auto w-full">
              <div className="text-sm text-text-secondary space-y-4">
                <p><strong>1. Access Pass Summary</strong><br/>
                Depending on your selection, you are purchasing a Trial, Pro, or Premium 30-day access pass. Rates and features are subject to change as per our evolving policies.</p>

                <p><strong>2. Fair Use & Rate Limits</strong><br/>
                To keep SentinL reliable for everyone, AI features are subject to fair use limits. Excessive or abusive requests may be slowed down or blocked.</p>
                
                <p><strong>3. Content Moderation Guidelines</strong><br/>
                Your use of SentinL must not violate community safety guidelines. We reserve the right to suspend accounts that facilitate illegal content, severe harassment, or intentional evasion of safety systems.</p>
                
                <p><strong>4. One-Time Payment</strong><br/>
                This is a one-time payment for a 30-day access pass. There are no automatic renewals or recurring billing charges.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group mb-8">
              <div className="relative pt-0.5">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:border-orange-500 peer-checked:bg-orange-500 transition-all flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
              </div>
              <span className="text-sm font-semibold text-text-secondary group-hover:text-on-surface transition-colors select-none">
                I have read and agree to the Terms of Service, Fair Use Policy, and Billing terms.
              </span>
            </label>

            <button
              onClick={() => {
                setShowTerms(false);
                if (pendingPlan === "trial") {
                  handleStartTrial();
                } else if (pendingPlan === "pro_1") {
                  handleSubscribe("pro_1");
                } else if (pendingPlan === "pro_3") {
                  handleSubscribe("pro_3");
                }
              }}
              disabled={!termsAgreed}
              className={`w-full py-4 px-6 rounded-2xl text-[11px] font-black tracking-[0.2em] uppercase transition-all duration-300 flex justify-center items-center ${
                termsAgreed
                  ? "bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-95"
                  : "bg-surface-variant text-text-muted cursor-not-allowed border border-outline-variant/30"
              }`}
            >
              Agree & Proceed
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
