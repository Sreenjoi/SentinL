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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="pb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Logo className="w-9 h-9 text-primary shrink-0 drop-shadow-sm" />
          {true && (
            <div className="flex flex-col">
              <span className="font-sans font-extrabold text-xl tracking-tight text-primary leading-none">
                SentinL
              </span>
              <span className="text-[10px] font-bold text-primary/80 uppercase tracking-widest mt-1">
                Command Center
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
        className="flex items-center justify-between px-3 py-2 mb-4 rounded-xl bg-surface-container/50 border border-outline-variant/30 text-text-secondary hover:text-on-surface hover:bg-surface-variant/50 transition-colors w-full group"
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
          <span className="text-sm font-medium">Search...</span>
        </div>
        <div className="flex flex-row justify-center items-center gap-0.5 text-[9px] font-black uppercase tracking-widest opacity-60">
          <span className="px-1 py-0.5 bg-on-surface/5 rounded">Ctrl K</span>
        </div>
      </button>

      <ServerSelector />

      <DiscordConnect userEmail={user?.email || ""} />

      <nav className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 custom-scrollbar pr-2 pb-2">
        {navSections.map((section) => {
          const sectionItems = navItems.filter((item) => item.show && item.section === section.id);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.id} className="flex flex-col gap-1">
              <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                {section.label}
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
                      className={`flex items-center text-[13px] font-semibold rounded-xl transition-all px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                        isActive
                          ? "text-white bg-primary shadow-lg shadow-primary/30"
                          : item.locked
                            ? "text-text-secondary hover:text-primary/80 hover:bg-primary/5"
                            : "text-text-secondary hover:text-primary hover:bg-surface-container"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 mr-3 ${isActive ? "text-white" : item.locked ? "text-text-secondary/60" : "text-text-secondary"}`}
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
                              ? "bg-white text-primary"
                              : "bg-danger text-white shadow-sm shadow-danger/20"
                          }`}
                        >
                          {totalPendingModeration >= 100 ? "99+" : totalPendingModeration}
                        </motion.span>
                      )}
                      {item.locked && (
                        <span
                          className={`ml-auto text-[8px] px-1.5 py-0.5 rounded font-bold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-surface-variant/50 text-text-secondary/80"
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
      <div className="mt-4 pt-4 border-t border-white/40 space-y-1 shrink-0">
        <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
          <Link
            to="/profile"
            className="flex items-center w-full text-sm font-medium text-text-primary hover:text-accent transition-colors group rounded-xl hover:bg-surface-container py-2 px-3"
          >
            <User className="w-4 h-4 text-text-secondary group-hover:text-accent transition-colors shrink-0 mr-2" />
            My Profile
          </Link>
        </motion.div>
        <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center w-full text-sm font-medium text-danger hover:text-danger/80 hover:bg-danger/10 transition-colors rounded-xl py-2 px-3"
          >
            <LogOut className="w-4 h-4 shrink-0 mr-2" />
            Sign Out
          </button>
        </motion.div>
        <div className="flex items-center justify-center pt-2 gap-1.5 text-[9px] font-bold text-text-muted mt-2 whitespace-nowrap">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span className="opacity-30">&middot;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">TOS</Link>
          <span className="opacity-30">&middot;</span>
          <button onClick={() => setIsReportModalOpen(true)} className="hover:text-primary transition-colors">Report Issue</button>
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
        <div className="w-64 bg-surface backdrop-blur-xl border-r border-outline-variant/30 flex flex-col px-4 py-4 relative z-50 shrink-0 shadow-2xl">
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
            className="fixed inset-y-0 left-0 w-64 h-full bg-surface backdrop-blur-xl border-r border-outline-variant/30 flex flex-col px-4 py-4 z-50 md:hidden shadow-2xl"
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
            {firebaseInitError?.message || "Firebase configuration is missing."}
          </p>
          <div className="w-full p-4 rounded-xl bg-surface-container/50 border border-outline-variant/30 text-left text-[13px] text-text-secondary">
            <p className="font-medium text-on-surface mb-2">How to fix this:</p>
            <ol className="list-decimal pl-4 space-y-2">
              <li>Open your Firebase Console</li>
              <li>Go to Project Settings &gt; General</li>
              <li>Copy your Web App configuration</li>
              <li>Add it to your environment variables (or <code className="bg-surface-container px-1 py-0.5 rounded text-primary">firebase-applet-config.json</code> in preview)</li>
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


