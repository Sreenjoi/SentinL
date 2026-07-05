import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady, firebaseInitError } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import { Mail, RefreshCw, AlertTriangle } from "lucide-react";
import { Logo } from "./Logo";
import { useAuthState } from "react-firebase-hooks/auth";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { toast } from "sonner";

const dummyAuth = {
  onIdTokenChanged: () => () => {},
  onAuthStateChanged: () => () => {},
  currentUser: null,
};

export default function Login() {
  const [user, authLoading] = useAuthState((auth as any) || dummyAuth);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      if (!firebaseReady || !auth) return;
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          await setDoc(
            doc(db, "users", result.user.uid),
            {
              email: result.user.email,
              createdAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
      } catch (err: any) {
        console.error("Google Auth redirect error:", err);
        let errorMessage = err.message || "Failed to sign in with Google";
        if (err.code === "auth/email-already-in-use" || err.code === "auth/account-exists-with-different-credential") {
          errorMessage = "An account with this email already exists. Please sign in with the original method.";
        } else if (err.code === "auth/argument-error") {
          errorMessage = "Google sign-in is not set up correctly yet. Check the Firebase web app values in your environment settings.";
        }
        setError(errorMessage);
      }
    };
    handleRedirect();
  }, []);

  useEffect(() => {
    const handleNavigation = async () => {
      if (user) {
        if (user.emailVerified) {
          // Force token refresh to pick up the email_verified claim
          if (auth.currentUser) {
            await auth.currentUser.getIdToken(true); // true = force refresh
          }
          navigate("/");
        } else {
          setVerificationPending(true);
        }
      }
    };
    handleNavigation();
  }, [user, navigate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (verificationPending && user) {
      interval = setInterval(async () => {
        await user.reload();
        if (user.emailVerified) {
          await user.getIdToken(true);
          setVerificationPending(false);
          navigate("/");
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [verificationPending, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseReady || !auth) return;
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await setDoc(
          doc(db, "users", userCred.user.uid),
          {
            email: userCred.user.email,
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );
        await sendEmailVerification(userCred.user);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let errorMessage = err.message || (isLogin ? "Failed to sign in" : "Failed to create account");
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "An account with this email already exists.";
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  
  const handleGoogleSignIn = async () => {
    if (!firebaseReady || !auth) return;
    setError("");
    setIsGoogleLoading(true);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCred = await signInWithPopup(auth, provider);
      await setDoc(
        doc(db, "users", userCred.user.uid),
        {
          email: userCred.user.email,
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (err: any) {
      const errorStr = String(err.code || err.message || "");
      
      const isCancelled = errorStr.includes("auth/popup-closed-by-user") || errorStr.includes("auth/cancelled-popup-request");
      if (isCancelled) {
        setIsGoogleLoading(false);
        setLoading(false);
        return;
      }

      const fallbackErrors = [
        "auth/popup-blocked",
        "Cross-Origin-Opener-Policy"
      ];

      const shouldFallback = fallbackErrors.some(e => errorStr.includes(e));

      if (shouldFallback) {
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
          return; // Redirecting...
        } catch (redirectErr: any) {
           console.error("Google Auth redirect fallback error:", redirectErr);
           let errMsg = redirectErr.message || "Failed to sign in with Google";
           if (String(redirectErr.code).includes("auth/argument-error")) {
             errMsg = "Google sign-in is not set up correctly yet. Check the Firebase web app values in your environment settings.";
           }
           setError(errMsg);
           setIsGoogleLoading(false);
           setLoading(false);
           return;
        }
      }

      console.error("Google Auth error:", err);
      if (err.message?.includes("Missing or insufficient permissions")) {
         handleFirestoreError(err, OperationType.WRITE, `users`);
      }
      let errorMessage = err.message || "Failed to sign in with Google";
      if (errorStr.includes("auth/email-already-in-use") || errorStr.includes("auth/account-exists-with-different-credential")) {
        errorMessage = "An account with this email already exists. Please sign in with the original method.";
      } else if (errorStr.includes("auth/argument-error")) {
        errorMessage = "Google sign-in is not set up correctly yet. Check the Firebase web app values in your environment settings.";
      }
      setError(errorMessage);
      setIsGoogleLoading(false);
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (user) {
      try {
        await sendEmailVerification(user);
        toast("Verification email resent!");
      } catch (err: any) {
        console.error("Failed to resend verification email:", err);
        const errorStr = String(err.code || "");
        if (errorStr === "auth/too-many-requests") {
          toast("Please wait a moment before requesting another email.");
        } else {
          toast.error("Failed to resend email.");
        }
      }
    }
  };

  const handleCancelVerification = async () => {
    await signOut(auth);
    setVerificationPending(false);
    setLoading(false);
  };

  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="w-full max-w-[400px] bg-surface rounded-[32px] p-8 shadow-sm border border-outline-variant/30 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-error" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-3">Setup Required</h2>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            {firebaseInitError?.message || "The app is missing its Firebase setup values."}
          </p>
          <div className="w-full p-4 rounded-xl bg-surface-container/50 border border-outline-variant/30 text-left text-[13px] text-text-secondary">
            <p className="font-medium text-on-surface mb-2">How to fix this:</p>
            <ol className="list-decimal pl-4 space-y-2">
              <li>Open your Firebase Console</li>
              <li>Go to Project Settings &gt; General</li>
              <li>Copy the Web App setup values</li>
              <li>Add them to your environment variables, or use <code className="bg-surface-container px-1 py-0.5 rounded text-primary">firebase-applet-config.json</code> in preview</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary">
        Loading...
      </div>
    );
  }

  if (verificationPending) {
    return (
      <div className="min-h-screen bg-surface-container/30 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-on-surface relative">
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10 mix-blend-multiply opacity-50 hidden md:block"></div>
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white/60 backdrop-blur-2xl py-10 px-6 border-2 border-white shadow-xl shadow-primary/10 rounded-[3rem] text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-primary/10 rounded-[1.5rem] flex items-center justify-center mb-8 shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/20 blur-xl"></div>
              <Mail className="w-10 h-10 text-primary relative z-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-on-surface mb-3 tracking-tight">
              Verify your email
            </h2>
            <p className="text-[13px] text-text-secondary mb-8 leading-relaxed font-medium">
              We've sent a verification link to <br />
              <span className="font-extrabold text-primary px-2 py-1 bg-primary/5 rounded-lg mt-1 inline-block">
                {user?.email || email}
              </span>
              .<br />
              <br />
              Please click the link to activate your account.
            </p>
            <div className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-primary mb-10 bg-primary/5 px-6 py-3 rounded-full border border-primary/10">
              <RefreshCw className="w-4 h-4 animate-spin shadow-[0_0_10px_rgba(56,114,255,0.2)]" />
              Waiting for verification...
            </div>

            <div className="flex flex-col w-full gap-4">
              <button
                onClick={handleResendEmail}
                className="w-full py-4 px-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] border border-outline-variant/20 text-on-surface hover:bg-surface-container transition-all duration-300 ease-out active:scale-95 shadow-sm"
              >
                Resend Email
              </button>
              <button
                onClick={handleCancelVerification}
                className="w-full py-4 px-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary hover:text-on-surface transition-all duration-300 ease-out hover:bg-white/50 active:scale-95"
              >
                Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-on-surface relative">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary-container/20 blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary-container/20 blur-[120px] pointer-events-none"></div>
      </div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center items-center gap-4 font-extrabold text-4xl tracking-tight mb-2 font-sans">
          <Logo className="w-12 h-12 text-primary drop-shadow-sm flex-shrink-0" />
          <span className="text-on-surface">
            SentinL
          </span>
        </div>
        <h2 className="mt-2 text-center text-sm font-medium text-text-secondary">
          {isLogin ? "Sign in to the Admin Dashboard" : "Create a new account"}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-surface/80 backdrop-blur-xl border border-outline-variant/50 p-8 sm:p-10 w-full max-w-md shadow-2xl shadow-primary/5 rounded-[2rem]">
          {/* Tabs */}
          <div className="flex mb-8 bg-surface-variant/40 p-1 rounded-xl border border-outline-variant/30">
            <button
              type="button"
              className={`flex-1 py-2.5 text-xs font-bold tracking-wide rounded-lg transition-all duration-200 ease-out ${isLogin ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-on-surface hover:bg-surface/50"}`}
              onClick={() => {
                setIsLogin(true);
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`flex-1 py-2.5 text-xs font-bold tracking-wide rounded-lg transition-all duration-200 ease-out ${!isLogin ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-on-surface hover:bg-surface/50"}`}
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
            >
              Sign Up
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl text-xs font-medium text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 pl-1">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="bg-surface-variant/30 border border-outline-variant/50 rounded-xl px-4 py-3 text-sm font-medium text-on-surface placeholder:text-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 w-full transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 pl-1">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="bg-surface-variant/30 border border-outline-variant/50 rounded-xl px-4 py-3 text-sm font-medium text-on-surface placeholder:text-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 w-full transition-all duration-200"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold tracking-wide bg-primary text-white hover:bg-primary/90 transition-all duration-200 ease-out items-center shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-white" />
                ) : isLogin ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/30" />
              </div>
              <div className="relative flex justify-center text-xs font-medium">
                <span className="px-3 bg-surface text-text-muted">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                type="button"
                className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-semibold tracking-wide border border-outline-variant/80 text-on-surface bg-surface-container/50 hover:bg-surface-variant/80 transition-all duration-200 ease-out disabled:opacity-50 items-center active:scale-[0.98]"
              >
                {isGoogleLoading ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin text-text-secondary" />
                ) : (
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                {isGoogleLoading ? "Signing in..." : "Google"}
              </button>
            </div>
            
            <p className="mt-8 text-xs text-center text-text-muted leading-relaxed">
              By continuing you agree to SentinL's{" "}
              <Link to="/terms" className="text-primary hover:underline font-semibold">Terms of Service</Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:underline font-semibold">Privacy Policy</Link>.
            </p>
          </div>
        </div>
        
        {/* Footer Links */}
        <div className="mt-8 text-center text-xs font-medium text-text-muted flex items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span className="opacity-30">&middot;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

