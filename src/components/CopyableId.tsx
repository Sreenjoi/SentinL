import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyableId({ id, className = "" }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopyTextToClipboard(id));
    } catch (err) {
      fallbackCopyTextToClipboard(id);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer group active:scale-95 ${className}`}
      title="Copy to clipboard"
    >
      {id}
      {copied ? (
        <Check className="w-3 h-3 text-success" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}
