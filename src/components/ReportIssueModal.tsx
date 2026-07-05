import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Send, Bug, Lightbulb, MessageSquare, Loader2 } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { toast } from "sonner";

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportIssueModal({ isOpen, onClose }: ReportIssueModalProps) {
  const [type, setType] = useState<"bug" | "feature" | "general">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!auth.currentUser) {
      toast.error("You must be logged in to submit feedback.");
      return;
    }

    setIsSubmitting(true);
    const submitToast = toast.loading("Submitting your feedback...");

    try {
      await addDoc(collection(db, "feedback"), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        type,
        title: title.trim(),
        description: description.trim(),
        status: "open",
        createdAt: serverTimestamp(),
      });

      toast.success("Thank you! Your feedback has been submitted.", { id: submitToast });
      setTitle("");
      setDescription("");
      onClose();
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback. Please try again.", { id: submitToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-container/30 flex items-center justify-center text-primary shadow-inner border border-primary/10">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-on-surface tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-on-surface to-on-surface/70">
                      Submit Feedback
                    </h2>
                    <p className="text-[11px] font-bold text-text-secondary uppercase tracking-widest mt-1">
                      Help us improve SentinL
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-text-secondary hover:text-on-surface hover:bg-surface-variant/50 rounded-full transition-colors active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <form id="feedback-form" onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-widest text-text-secondary mb-3">
                      Feedback Type
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setType("bug")}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 ${
                          type === "bug"
                            ? "bg-danger/10 border-danger/30 text-danger shadow-inner"
                            : "bg-surface-container/30 border-outline-variant/20 text-text-secondary hover:bg-surface-container hover:text-on-surface"
                        }`}
                      >
                        <Bug className="w-5 h-5 mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Bug Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setType("feature")}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 ${
                          type === "feature"
                            ? "bg-primary/10 border-primary/30 text-primary shadow-inner"
                            : "bg-surface-container/30 border-outline-variant/20 text-text-secondary hover:bg-surface-container hover:text-on-surface"
                        }`}
                      >
                        <Lightbulb className="w-5 h-5 mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Feature</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setType("general")}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 ${
                          type === "general"
                            ? "bg-secondary/10 border-secondary/30 text-secondary shadow-inner"
                            : "bg-surface-container/30 border-outline-variant/20 text-text-secondary hover:bg-surface-container hover:text-on-surface"
                        }`}
                      >
                        <MessageSquare className="w-5 h-5 mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">General</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-widest text-text-secondary mb-2">
                      Title <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full bg-surface-container-high text-on-surface p-4 rounded-2xl border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 outline-none text-sm font-medium"
                      placeholder="e.g., Cannot resolve moderation flag"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-widest text-text-secondary mb-2">
                      Description <span className="text-danger">*</span>
                    </label>
                    <textarea
                      className="w-full bg-surface-container-high text-on-surface p-4 rounded-2xl border border-outline-variant/20 focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200 outline-none resize-none custom-scrollbar text-sm font-medium"
                      rows={5}
                      placeholder="Please provide as much detail as possible..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      maxLength={1000}
                    />
                    <div className="flex justify-end mt-1 text-[10px] font-bold text-text-secondary">
                      {description.length}/1000
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-outline-variant/20 bg-surface/50 backdrop-blur-md flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-text-secondary hover:text-on-surface hover:bg-surface-container transition-all"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="feedback-form"
                  disabled={isSubmitting || !title.trim() || !description.trim()}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
