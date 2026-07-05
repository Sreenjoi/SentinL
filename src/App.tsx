/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db, firebaseReady, firebaseInitError } from "./firebase";
import { Logo } from "./components/Logo";
import {
  ListChecks,
  Settings as SettingsIcon,
  LogOut,
  CreditCard,
  BarChart3,
  Link as LinkIcon,
  Loader2,
  User,
  ChevronLeft,
  Menu,
  Unlink,
  Trophy,
  FileText,
  Flag,
  ChevronDown,
  Users as UsersIcon,
  Check,
  RefreshCw,
  Search,
  Terminal,
  LayoutDashboard,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { collection, query, where, doc, setDoc, onSnapshot, limit } from "firebase/firestore";
import { ServerProvider, useServer } from "./context/ServerContext";
import { motion, AnimatePresence } from "motion/react";
import { handleFirestoreError, OperationType } from "./utils/firestoreErrorHandler";
import ReportIssueModal from "./components/ReportIssueModal";
import { DiscordConnect, ServerSelector } from "./components/DiscordConnect";
import { SentinLLoading } from "./components/SentinLLoading";

const Login = lazy(() => import("./components/Login"));
const Success = lazy(() => import("./components/Success"));
const Profile = lazy(() => import("./components/Profile"));
const Checkout = lazy(() => import("./components/Checkout"));
const PrivacyPolicy = lazy(() => import("./components/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./components/TermsOfService"));
const ConnectPage = lazy(() => import("./components/ConnectPage"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const SummariesFeature = lazy(() => import("./components/SummariesFeature").then(m => ({ default: m.SummariesFeature })));

const Dashboard = lazy(() => import("./components/Dashboard"));
const ContentModeration = lazy(() => import("./components/ContentModeration"));
const BotSettings = lazy(() => import("./components/BotSettings"));
const LevelingManager = lazy(() => import("./components/LevelingManager"));
const Pricing = lazy(() => import("./components/Pricing"));
const AdvancedAnalytics = lazy(() => import("./components/AdvancedAnalytics"));
const Integrations = lazy(() => import("./components/Integrations"));
const AdminFeedback = lazy(() => import("./components/AdminFeedback"));
const CommandsGuide = lazy(() => import("./components/CommandsGuide"));

const dummyAuth = {
  onIdTokenChanged: () => () => {},
  onAuthStateChanged: () => () => {},
  currentUser: null,
};

const NotFound = () => {
  const [user] = useAuthState((auth as any) || dummyAuth);
  
  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-20 px-4 text-center">
      <div className="bg-surface-variant/30 w-24 h-24 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-12 h-12 text-danger opacity-80" />
      </div>
      <h1 className="text-4xl font-extrabold text-on-surface tracking-tight mb-3">404</h1>
      <h2 className="text-xl font-medium text-text-primary mb-2">Page Not Found</h2>
      <p className="text-text-secondary max-w-md mx-auto mb-8">
        The page you are looking for doesn't exist, has been moved, or you don't have permission to view it.
      </p>
      {user ? (
        <Link
          to="/dashboard"
          className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl font-semibold tracking-wide transition-all shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex items-center gap-2"
        >
          <LayoutDashboard className="w-5 h-5" /> Back to Dashboard
        </Link>
      ) : (
        <Link
          to="/login"
          className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl font-semibold tracking-wide transition-all shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex items-center gap-2"
        >
          <LogOut className="w-5 h-5" /> Log In
        </Link>
      )}
    </div>
  );
};

function Layout({ children, isCatchAll = false }: { children: React.ReactNode, isCatchAll?: boolean }) {
  const location = useLocation();
  const [user, loading] = useAuthState((auth as any) || dummyAuth);
  const { isPro, selectedServerId, pendingFlagsCount, pendingReportsCount, isBetaTester, isTrial, tier } = useServer();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const totalPendingModeration = pendingFlagsCount + pendingReportsCount;

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // Adjust to standard tablet breakpoint
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  if (loading)
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary">
        Loading...
      </div>
    );
  if (!isCatchAll && (!user || !user.emailVerified)) return <Navigate to="/login" />;

  const navSections = [
    { id: "core", label: "Core" },
    { id: "tools", label: "Tools" },
    { id: "account", label: "Account" },
  ];

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true, section: "core" },
    { path: "/moderation", label: "Content Moderation", icon: ListChecks, show: true, section: "core" },
    {
      path: "/settings",
      label: "Bot Settings",
      icon: SettingsIcon,
      show: true,
      section: "core",
    },
    {
      path: "/integrations",
      label: "Integrations",
      icon: LinkIcon,
      show: true,
      locked: !isPro,
      section: "tools",
    },
    {
      path: "/leveling",
      label: "Leveling & XP",
      icon: Trophy,
      show: true,
      locked: !isPro,
      section: "tools",
    },
    {
      path: "/analytics",
      label: "Analytics",
      icon: BarChart3,
      show: true,
      locked: !isPro,
      section: "tools",
    },
    {
      path: "/summaries",
      label: "Summaries",
      icon: FileText,
      show: true,
      section: "tools",
    },
    {
      path: "/pricing",
      label: "Pricing & Upgrade",
      icon: CreditCard,
      show: true,
      section: "account",
    },
  ];

  const sidebarContent = (
    <div className="sentinl-orange-sidebar flex h-full flex-col overflow-hidden text-white">
      <div className="pointer-events-none absolute -right-24 -top-20 h-56 w-56 rounded-full border border-white/20" />
      <div className="pointer-events-none absolute -bottom-28 right-10 h-52 w-52 rounded-full bg-white/10 blur-2xl" />

      <div className="relative z-10 mb-4 flex items-center justify-between shrink-0 px-2">
        <div className="flex items-center gap-3">
          <Logo className="w-11 h-11 text-white shrink-0 drop-shadow-md" />
          <div className="flex flex-col">
            <span className="font-sans font-extrabold text-2xl tracking-tight text-white leading-none">
              SentinL
            </span>
            <span className="text-[9px] font-black text-white/70 uppercase tracking-[0.2em] mt-1">
              Command Center
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
        className="relative z-10 mb-3 flex h-10 w-full items-center justify-between rounded-2xl border border-white/25 bg-white/15 px-3 text-left text-white/85 shadow-[inset_0_1px_1px_rgba(255,255,255,0.22)] backdrop-blur-xl transition-colors hover:bg-white/20 hover:text-white group"
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
          <span className="text-sm font-bold">Search...</span>
        </div>
        <div className="flex flex-row justify-center items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-white/70">
          <span className="px-2 py-1 bg-white/15 rounded-lg">Ctrl K</span>
        </div>
      </button>

      <div className="relative z-30 sidebar-server-surface">
        <ServerSelector />
      </div>

      <div className="relative z-10 sidebar-discord-surface">
        <DiscordConnect userEmail={user?.email || ""} />
      </div>

      <nav className="relative z-10 flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 custom-scrollbar pr-1 pb-2">
        {navSections.map((section) => {
          const sectionItems = navItems.filter((item) => item.show && item.section === section.id);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3 px-3 pb-1.5">
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-white/75">
                  {section.label}
                </span>
                <span className="h-px flex-1 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
              </div>
              {sectionItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <motion.div
                    key={item.path}
                    whileHover={{ x: 4 }}
                    className="motion-reduce:transform-none"
                  >
                    <Link
                      to={item.path}
                      aria-label={`${item.locked ? "Locked: " : ""}${item.label}`}
                      className={`flex h-11 items-center text-[13px] font-bold rounded-2xl transition-all px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${
                        isActive
                          ? "text-primary bg-white shadow-xl shadow-black/10"
                          : item.locked
                            ? "text-white/65 hover:text-white hover:bg-white/12"
                            : "text-white/86 hover:text-white hover:bg-white/12"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 mr-3 ${isActive ? "text-primary" : item.locked ? "text-white/55" : "text-white/80"}`}
                      />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.path === "/moderation" && totalPendingModeration > 0 && (
                        <motion.span
                          key={totalPendingModeration}
                          initial={{ scale: 1 }}
                          animate={{ scale: [1, 1.15, 1], boxShadow: ["0px 0px 0px rgba(0,0,0,0)", "0px 0px 10px rgba(var(--color-primary), 0.5)", "0px 0px 0px rgba(0,0,0,0)"] }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-md motion-reduce:animate-none ${
                            isActive
                              ? "bg-primary text-white"
                              : "bg-white text-primary shadow-sm shadow-black/10"
                          }`}
                        >
                          {totalPendingModeration >= 100 ? "99+" : totalPendingModeration}
                        </motion.span>
                      )}
                      {item.locked && (
                        <span
                          className={`ml-auto text-[8px] px-1.5 py-0.5 rounded font-bold ${
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "bg-white/14 text-white/80"
                          }`}
                        >
                          PRO
                        </span>
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="relative z-10 mt-4 pt-3 border-t border-white/20 space-y-2 shrink-0">
        <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
          <Link
            to="/profile"
            className="flex h-10 items-center w-full text-sm font-bold text-white transition-colors group rounded-2xl border border-white/25 bg-white/15 px-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)] backdrop-blur-xl hover:bg-white/20"
          >
            <User className="w-4 h-4 text-white/80 group-hover:text-white transition-colors shrink-0 mr-2" />
            My Profile
          </Link>
        </motion.div>
        <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
          <button
            onClick={() => signOut(auth)}
            className="flex h-9 items-center w-full text-sm font-bold text-white/72 hover:text-white hover:bg-white/10 transition-colors rounded-2xl px-3"
          >
            <LogOut className="w-4 h-4 shrink-0 mr-2" />
            Sign Out
          </button>
        </motion.div>
        <div className="flex items-center justify-center pt-1 gap-2 text-[9px] font-black text-white/50 mt-2 whitespace-nowrap uppercase tracking-wider">
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <Link to="/terms" className="hover:text-white transition-colors">TOS</Link>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <button onClick={() => setIsReportModalOpen(true)} className="hover:text-white transition-colors">Report</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-bg-base flex text-text-primary overflow-hidden relative">
      {/* Solaris Blur Blobs */}
      <div className="fixed top-[-10%] right-[-5%] w-64 h-64 md:w-[40vw] md:h-[40vw] rounded-full bg-primary-container/10 blur-3xl pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-80 h-80 md:w-[50vw] md:h-[50vw] rounded-full bg-primary-container/10 blur-3xl pointer-events-none z-0"></div>

      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobile && isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      {!isMobile && (
        <div className="sentinl-sidebar-frame w-72 bg-primary flex flex-col px-4 py-4 relative z-50 shrink-0 shadow-2xl overflow-hidden">
          {sidebarContent}
        </div>
      )}

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {isMobile && isMobileMenuOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 200 }}
            className="sentinl-sidebar-frame fixed inset-y-0 left-0 w-72 max-w-[86vw] h-full bg-primary flex flex-col px-4 py-4 z-50 md:hidden shadow-2xl overflow-hidden"
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-bg-base flex flex-col h-full relative z-10">
        {/* Mobile Header */}
        {isMobile && (
          <header className="bg-surface/95 backdrop-blur-md border-b border-outline-variant/30 px-4 py-3 flex items-center justify-between z-30 shrink-0">
            <div className="flex items-center gap-2 font-bold text-lg">
              <Logo className="w-7 h-7 text-primary drop-shadow-sm shrink-0" />
              <span className="font-sans text-primary font-extrabold tracking-tight">
                SentinL
              </span>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-2 -mr-2 rounded-md hover:bg-surface-container transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <Menu className="w-6 h-6 text-text-secondary" />
            </button>
          </header>
        )}

        <main
          key={location.pathname + (selectedServerId || "")}
          className="p-4 sm:p-6 md:p-10 lg:p-12 2xl:px-16 mx-auto flex flex-col gap-6 md:gap-12 w-full"
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8 w-full h-full">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>

      <ReportIssueModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />
    </div>
  );
}

export default function App() {
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

  return (
    <ServerProvider>
      <Toaster position="bottom-right" richColors theme="system" />
      <Router>
        <Suspense fallback={<SentinLLoading fullScreen />}>
          <CommandPalette />
            <Routes>
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="/dashboard"
              element={
                <Layout>
                  <Dashboard />
                </Layout>
              }
            />
            <Route
              path="/connect"
              element={
                <Layout>
                  <ConnectPage />
                </Layout>
              }
            />
            <Route
              path="/moderation"
              element={
                <Layout>
                  <ContentModeration />
                </Layout>
              }
            />
            <Route
              path="/settings"
              element={
                <Layout>
                  <BotSettings />
                </Layout>
              }
            />
            <Route
              path="/leveling"
              element={
                <Layout>
                  <LevelingManager />
                </Layout>
              }
            />
            <Route
              path="/analytics"
              element={
                <Layout>
                  <AdvancedAnalytics />
                </Layout>
              }
            />
            <Route
              path="/pricing"
              element={
                <Layout>
                  <Pricing />
                </Layout>
              }
            />
            <Route
              path="/summaries"
              element={
                <Layout>
                  <SummariesFeature />
                </Layout>
              }
            />
            <Route path="/checkout" element={<Checkout />} />
            <Route
              path="/success"
              element={
                <Layout>
                  <Success />
                </Layout>
              }
            />
            <Route
              path="/profile"
              element={
                <Layout>
                  <Profile />
                </Layout>
              }
            />
            <Route
              path="/integrations"
              element={
                <Layout>
                  <Integrations />
                </Layout>
              }
            />
            <Route
              path="/commands-guide"
              element={
                <Layout>
                  <CommandsGuide />
                </Layout>
              }
            />
            <Route
              path="/admin/feedback"
              element={
                <Layout>
                  <AdminFeedback />
                </Layout>
              }
            />
            <Route
              path="*"
              element={
                <Layout isCatchAll>
                  <NotFound />
                </Layout>
              }
            />
          </Routes>
        </Suspense>
      </Router>
    </ServerProvider>
  );
}


