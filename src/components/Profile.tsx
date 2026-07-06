import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../firebase";
import { useServer } from "../context/ServerContext";
import { motion, AnimatePresence } from "motion/react";
import {
  LogOut,
  User,
  Mail,
  Link as LinkIcon,
  ShieldAlert,
  Edit2,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Save,
} from "lucide-react";
import {
  signOut,
  updateEmail,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  updateProfile,
} from "firebase/auth";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { BrandedPageHeader, HeaderMetaPills } from "./BrandedPageHeader";
import { getPlanDisplayLabel } from "../utils/planDisplay";

export default function Profile() {
  const [user] = useAuthState(auth);
  const { discordProfile, tier, userTier, isTrial, userIsTrial, isBetaTester, isSharedServer } = useServer();

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [needsPasswordReauth, setNeedsPasswordReauth] = useState(false);
  const [passwordForReauth, setPasswordForReauth] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    async function load() {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data().displayName) {
            const data = snap.data();
            setDisplayName(data.displayName || user.displayName || "");
          } else {
            setDisplayName(user.displayName || "");
          }
        } catch (e) {
          setDisplayName(user.displayName || "");
        }
      }
    }
    load();
  }, [user]);

  const handleProfileUpdate = async (isRetry = false) => {
    if (!user) return;
    setProfileStatus("loading");
    setProfileMessage("");
    const updateData: { displayName?: string | null } = {};
    updateData.displayName = displayName || null;

    try {
      await updateProfile(user, updateData);
      await user.reload();
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        await setDoc(docRef, {
          email: user.email || "",
          createdAt: new Date().toISOString(),
          displayName,
        });
      } else {
        await setDoc(docRef, { displayName }, { merge: true });
      }
      setProfileStatus("success");
      setProfileMessage("Profile updated successfully");
      setTimeout(() => {
        setIsEditingProfile(false);
        setProfileStatus("idle");
        setProfileMessage("");
      }, 3000);
    } catch (err: any) {
      console.error(err);
      const isRecentLoginError = err.code === "auth/requires-recent-login" || (err.message && err.message.includes("auth/requires-recent-login"));
      if (isRecentLoginError && !isRetry) {
        const isGoogle = user.providerData.some((p) => p.providerId === "google.com");
        if (isGoogle) {
          try {
            const provider = new GoogleAuthProvider();
            await reauthenticateWithPopup(user, provider);
            await handleProfileUpdate(true);
            return;
          } catch (reauthErr) {
            setProfileStatus("error");
            setProfileMessage("Failed to re-authenticate with Google.");
            return;
          }
        } else {
          setProfileStatus("error");
          setProfileMessage("Please log out and log back in to update your profile.");
          return;
        }
      }
      
      setProfileStatus("error");
      setProfileMessage(err.message || "Failed to update profile");
      if (err.code?.includes("permission-denied") || err.message?.includes("Missing or insufficient permissions")) {
        try {
          handleFirestoreError(err, OperationType.WRITE, "users");
        } catch (firestoreErr) {
          throw firestoreErr;
        }
      }
    }
  };

  const handleEmailUpdate = async (overridePassword?: string) => {
    if (!user) return;
    if (!newEmail || newEmail === user.email) {
      setIsEditingEmail(false);
      setNeedsPasswordReauth(false);
      return;
    }

    setEmailStatus("loading");
    setEmailMessage("");
    try {
      if (needsPasswordReauth && passwordForReauth) {
        const cred = EmailAuthProvider.credential(
          user.email!,
          passwordForReauth,
        );
        await reauthenticateWithCredential(user, cred);
        setNeedsPasswordReauth(false);
        setPasswordForReauth("");
      }

      const actionCodeSettings = {
        url: `${window.location.origin}/profile`,
        handleCodeInApp: false,
      };
      await verifyBeforeUpdateEmail(user, newEmail, actionCodeSettings);

      setEmailStatus("success");
      setEmailMessage(
        "Verification link sent. Please check your spam/junk folder.",
      );
      setTimeout(() => {
        setIsEditingEmail(false);
        setEmailStatus("idle");
        setEmailMessage("");
        setNeedsPasswordReauth(false);
      }, 5000);
    } catch (error: any) {
      console.error(error);
      if (error.code === "auth/requires-recent-login" || (error.message && error.message.includes("auth/requires-recent-login"))) {
        const isGoogle = user.providerData.some(
          (p) => p.providerId === "google.com",
        );
        if (isGoogle) {
          try {
            const provider = new GoogleAuthProvider();
            await reauthenticateWithPopup(user, provider);
            await handleEmailUpdate(); // recursive call after auth
            return;
          } catch (reauthErr: any) {
            setEmailStatus("error");
            setEmailMessage("Failed to re-authenticate with Google.");
          }
        } else {
          setNeedsPasswordReauth(true);
          setEmailStatus("error");
          setEmailMessage("Please enter your password to confirm.");
        }
      } else if (error.code === "auth/invalid-credential") {
        setEmailStatus("error");
        setEmailMessage("Incorrect password. Please try again.");
      } else if (error.code === "auth/email-already-in-use" || (error.message && error.message.includes("auth/email-already-in-use"))) {
        setEmailStatus("error");
        setEmailMessage("This email is already registered to another account.");
      } else {
        setEmailStatus("error");
        setEmailMessage(error.message || "Failed to update email.");
      }
    }
  };

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 pb-32 w-full pt-4 sm:pt-8"
    >
      <BrandedPageHeader
        eyebrow="Account"
        title={displayName || user?.displayName || "User Profile"}
        description="Manage your account, Discord identity, subscription access, and preferences."
        icon={User}
        meta={
          <HeaderMetaPills
            planLabel={getPlanDisplayLabel({ tier, userTier, isBetaTester, isTrial: userIsTrial || isTrial, isSharedServer })}
            path={["Account"]}
          />
        }
        action={
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white/70 bg-white/20 text-3xl font-black text-white shadow-xl shadow-black/10 sm:h-24 sm:w-24">
            {discordProfile?.avatar ? (
              <img
                src={
                  discordProfile.avatar.startsWith("http")
                    ? discordProfile.avatar
                    : `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}${discordProfile.avatar.startsWith("a_") ? ".gif" : ".png"}?size=512`
                }
                alt={discordProfile.username}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {user.email?.[0].toUpperCase()}
              </div>
            )}
          </div>
        }
      />

      <div className="grid gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white/60 backdrop-blur-xl border border-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-on-surface">
              Account Details
            </h2>
          </div>
          <div className="flex flex-col gap-6 w-full min-w-0">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-6 relative group min-w-0 w-full">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest self-center shrink-0">
                Display Name
              </span>
              {isEditingProfile ? (
                 <div className="flex items-center gap-2">
                   <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter display name"
                      className="text-sm font-extrabold text-on-surface bg-surface-container px-4 py-2 rounded-xl border border-outline-variant/50 focus:border-primary outline-none transition-all duration-300 ease-out w-64 max-w-[200px] sm:max-w-xs"
                    />
                    <button
                      onClick={() => handleProfileUpdate()}
                      disabled={profileStatus === "loading"}
                      className="p-2.5 bg-success/10 text-success rounded-xl hover:bg-success/20 transition-colors duration-300 ease-out disabled:opacity-50"
                    >
                      {profileStatus === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setIsEditingProfile(false)}
                      disabled={profileStatus === "loading"}
                      className="p-2.5 bg-danger/10 text-danger rounded-xl hover:bg-danger/20 transition-colors duration-300 ease-out disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                 </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-extrabold text-on-surface px-4 py-2 bg-surface-container/30 rounded-xl truncate cursor-pointer" onClick={() => setIsEditingProfile(true)}>
                    {displayName || user?.displayName || "Not set"}
                  </span>
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="p-2 rounded-xl bg-surface-container/50 text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors duration-300 ease-out flex"
                    title="Edit Name"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <AnimatePresence>
              {profileMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`text-xs font-bold -mt-4 mb-2 ${profileStatus === "error" ? "text-danger flex items-center gap-1.5" : "text-success"} px-1 w-full text-right justify-end flex`}
                >
                  {profileStatus === "error" && <AlertTriangle className="w-3.5 h-3.5" />}
                  {profileMessage}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-2 border-b border-outline-variant/20 pb-6 relative group min-w-0 w-full">
              <div className="flex justify-between items-center w-full min-w-0">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest self-center shrink-0">
                  Email
                </span>
                {isEditingEmail ? (
                  <div className="flex flex-col gap-2 items-end">
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="New Email"
                        className="text-sm font-extrabold text-on-surface font-mono bg-surface-container px-4 py-2 rounded-xl border border-outline-variant/50 focus:border-primary outline-none transition-all duration-300 ease-out w-64 max-w-[200px] sm:max-w-xs"
                        autoFocus={!needsPasswordReauth}
                        disabled={needsPasswordReauth}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !needsPasswordReauth)
                            handleEmailUpdate();
                          if (e.key === "Escape") {
                            setIsEditingEmail(false);
                            setEmailStatus("idle");
                            setEmailMessage("");
                            setNeedsPasswordReauth(false);
                          }
                        }}
                      />
                      {!needsPasswordReauth && (
                        <button
                          onClick={() => handleEmailUpdate()}
                          disabled={emailStatus === "loading"}
                          className="p-2.5 bg-success/10 text-success rounded-xl hover:bg-success/20 transition-colors duration-300 ease-out disabled:opacity-50"
                        >
                          {emailStatus === "loading" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setIsEditingEmail(false);
                          setEmailStatus("idle");
                          setEmailMessage("");
                          setNeedsPasswordReauth(false);
                        }}
                        disabled={emailStatus === "loading"}
                        className="p-2.5 bg-danger/10 text-danger rounded-xl hover:bg-danger/20 transition-colors duration-300 ease-out disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {needsPasswordReauth && (
                      <div className="flex items-center gap-2 w-full justify-end">
                        <input
                          type="password"
                          value={passwordForReauth}
                          onChange={(e) => setPasswordForReauth(e.target.value)}
                          placeholder="Current Password"
                          className="text-sm font-extrabold text-on-surface font-mono bg-surface-container px-4 py-2 rounded-xl border border-outline-variant/50 focus:border-primary outline-none transition-all duration-300 ease-out w-64 max-w-[200px] sm:max-w-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEmailUpdate();
                            if (e.key === "Escape") {
                              setIsEditingEmail(false);
                              setEmailStatus("idle");
                              setEmailMessage("");
                              setNeedsPasswordReauth(false);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleEmailUpdate()}
                          disabled={
                            emailStatus === "loading" || !passwordForReauth
                          }
                          className="px-4 py-2 h-10 text-xs font-black uppercase tracking-wider bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors duration-300 ease-out disabled:opacity-50 flex items-center justify-center flex-shrink-0"
                        >
                          {emailStatus === "loading" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Confirm"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-extrabold text-on-surface font-mono bg-surface-container/30 px-4 py-2 rounded-xl transition-colors duration-300 ease-out cursor-pointer truncate"
                      onClick={() => {
                        setIsEditingEmail(true);
                        setNewEmail(user.email || "");
                      }}
                    >
                      {user.email}
                    </span>
                    <button
                      onClick={() => {
                        setIsEditingEmail(true);
                        setNewEmail(user.email || "");
                      }}
                      className="p-2 rounded-xl bg-surface-container/50 text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors duration-300 ease-out flex"
                      title="Edit Email"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <AnimatePresence>
                {emailMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`text-xs font-bold mt-1 ${emailStatus === "error" ? "text-danger flex items-center gap-1.5" : "text-success"} px-1 w-full text-right justify-end flex`}
                  >
                    {emailStatus === "error" && (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {emailMessage}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-6">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
                Status
              </span>
              <span
                className={`text-[10px] ${user.emailVerified ? "bg-success/10 border-success/20 text-success" : "bg-danger/10 border-danger/20 text-danger"} border font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-lg shadow-sm`}
              >
                {user.emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Pricing Plan
        </span>
        <span
          className={`text-[10px] px-4 py-2 rounded-xl font-black uppercase tracking-[0.2em] border shadow-sm ${userTier === "premium" || userTier === "pro_3" ? "bg-primary/10 text-primary border-primary/20 shadow-primary/10" : userTier === "pro_1" ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" : "bg-surface-container border-outline-variant/20 text-text-secondary"}`}
        >
          {userIsTrial
            ? "PRO Trial"
            : userTier === "premium" || userTier === "pro_3"
            ? "Premium"
            : userTier === "pro_1"
            ? "PRO"
            : "Free"}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold text-text-secondary leading-relaxed">
        Pro and Premium include the same features. Premium adds coverage for up to 3 servers.
      </p>
          </div>
        </motion.div>



        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/60 backdrop-blur-xl border border-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <LinkIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-on-surface">
              Connected Accounts
            </h2>
          </div>

          {discordProfile ? (
            <div className="flex items-center justify-between p-6 bg-white border border-outline-variant/10 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-4">
                {discordProfile.avatar ? (
                  <img
                    src={
                      discordProfile.avatar.startsWith("http")
                        ? discordProfile.avatar
                        : `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}${discordProfile.avatar.startsWith("a_") ? ".gif" : ".png"}`
                    }
                    alt={discordProfile.username}
                    className="w-12 h-12 rounded-[1.25rem] shadow-inner group-hover:scale-105 transition-transform duration-300 ease-out object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-[1.25rem] bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center text-[#5865F2] font-black text-lg shadow-inner group-hover:scale-105 transition-transform duration-300 ease-out">
                    {discordProfile.username[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-extrabold text-on-surface tracking-tight">
                    {discordProfile.username}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5865F2] mt-1">
                    Discord Connected
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#5865F2] px-4 py-2 bg-[#5865F2]/10 border border-[#5865F2]/20 rounded-xl">
                Active
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-6 bg-danger-container/30 border border-danger/10 rounded-[2rem] flex-col sm:flex-row gap-4 text-center sm:text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <ShieldAlert className="w-24 h-24 text-danger" />
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-[1.25rem] bg-danger/10 border border-danger/20 flex items-center justify-center text-danger shadow-inner">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-danger tracking-tight">
                    Discord not connected
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-danger/70 mt-1">
                    Link your Discord account to manage servers.
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 flex justify-center"
        >
          <button
            onClick={() => signOut(auth)}
            className="flex items-center px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-danger bg-white hover:bg-danger/5 rounded-[1.5rem] transition-all duration-300 ease-out border border-outline-variant/20 hover:border-danger/20 shadow-sm active:scale-95"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
