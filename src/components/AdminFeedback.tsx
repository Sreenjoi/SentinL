import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bug, Lightbulb, MessageSquare, Clock, CheckCircle, Trash2, AlertTriangle } from "lucide-react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { toast } from "sonner";
import { useAuthState } from "react-firebase-hooks/auth";
import { BrandedPageHeader } from "./BrandedPageHeader";

interface FeedbackEvent {
  id: string;
  type: "bug" | "feature" | "general";
  title: string;
  description: string;
  status: string;
  createdAt: any;
  userEmail: string;
}

export default function AdminFeedback() {
  const [user] = useAuthState(auth);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!user) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const checkAdmin = async () => {
      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (!adminDoc.exists()) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const fbData: FeedbackEvent[] = [];
          snapshot.forEach((doc) => {
            fbData.push({ id: doc.id, ...doc.data() } as FeedbackEvent);
          });
          setFeedback(fbData);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching feedback:", error);
          if (error.code === 'permission-denied') {
            setAccessDenied(true);
          } else {
            toast.error("Failed to load feedback.");
          }
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("Admin check failed", err);
        setAccessDenied(true);
        setLoading(false);
      }
    };
    
    checkAdmin();
  }, [user]);

  const handleResolve = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "resolved" ? "open" : "resolved";
      await updateDoc(doc(db, "feedback", id), { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this feedback?")) return;
    try {
      await deleteDoc(doc(db, "feedback", id));
      toast.success("Feedback deleted");
    } catch (e) {
      toast.error("Failed to delete feedback");
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === "bug") return <Bug className="w-5 h-5 text-danger" />;
    if (type === "feature") return <Lightbulb className="w-5 h-5 text-primary" />;
    return <MessageSquare className="w-5 h-5 text-secondary" />;
  };

  if (loading) {
    return <div className="text-center mt-20 text-text-secondary">Loading feedback...</div>;
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <AlertTriangle className="w-16 h-16 text-danger mb-4" />
        <h2 className="text-2xl font-bold text-on-surface">Access Denied</h2>
        <p className="text-text-secondary mt-2">You must be a superadmin to view this page.</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-4xl mx-auto py-8"
    >
      <BrandedPageHeader
        eyebrow="Admin"
        title="User Feedback"
        description="Manage bug reports and feature requests from your users."
        icon={MessageSquare}
        meta={
          <div className="inline-flex items-center rounded-full border border-white/25 bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/85 backdrop-blur-md">
            <span className="px-3 py-1.5">Admin</span>
            <span className="h-4 w-px bg-white/25" />
            <span className="px-3 py-1.5">{feedback.length} item{feedback.length === 1 ? "" : "s"}</span>
          </div>
        }
      />

      {feedback.length === 0 ? (
        <div className="bg-surface-container/30 border border-outline-variant/20 rounded-3xl p-12 text-center">
          <MessageSquare className="w-12 h-12 text-text-secondary/50 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-on-surface">No feedback yet</h3>
          <p className="text-sm text-text-secondary mt-1">When users submit feedback, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={item.id}
              className={`bg-white/95 backdrop-blur-xl border rounded-[1.5rem] p-6 shadow-sm transition-all duration-300 ${
                item.status === 'resolved' ? 'border-success/30 opacity-70 bg-success/5' : 'border-outline-variant/30 hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                  item.type === 'bug' ? 'bg-danger/10 border border-danger/20' : 
                  item.type === 'feature' ? 'bg-primary/10 border border-primary/20' : 
                  'bg-secondary/10 border border-secondary/20'
                }`}>
                  {getTypeIcon(item.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`text-lg font-bold truncate ${item.status === 'resolved' ? 'text-on-surface/70 line-through' : 'text-on-surface'}`}>
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2">
                       <button
                        onClick={() => handleResolve(item.id, item.status)}
                        className={`p-2 rounded-xl transition-all ${
                          item.status === 'resolved' 
                          ? 'bg-success/20 text-success hover:bg-success/30' 
                          : 'bg-surface-container hover:bg-success/10 hover:text-success text-text-secondary'
                        }`}
                        title={item.status === 'resolved' ? "Reopen" : "Mark resolved"}
                      >
                        <CheckCircle className="w-4 h-4" />
                       </button>
                       <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-xl bg-surface-container hover:bg-danger/10 hover:text-danger text-text-secondary transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-text-secondary leading-relaxed mb-4 whitespace-pre-wrap">
                    {item.description}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" />
                      {item.userEmail || "Anonymous"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {item.createdAt?.toDate?.()?.toLocaleDateString() || "Unknown"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md border ${
                       item.status === 'resolved' ? 'bg-success/10 border-success/20 text-success' : 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                    }`}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
