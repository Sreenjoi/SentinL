import fs from 'fs';

let content = fs.readFileSync('src/components/ModQueue.tsx', 'utf8');

const anchor1 = `      // 1. Update Firestore`;
const anchor2 = `      // 2. Call Discord API if it's a real message`;
const endAnchor = `          if (action === "warned") {
             toast.success("Warning sent to user via Discord DMs.");
          } else if (action === "deleted") {
             toast.success("Message deleted from Discord.");
          } else if (action === "timeout") {
             toast.success("User has been timed out.");
          }
        }
      }`;

const startIndex = content.indexOf(anchor1);
const endIndex = content.indexOf(endAnchor) + endAnchor.length;

if (startIndex !== -1 && endIndex !== -1) {
   const newBlock = `      // 1. Call Discord API if it's a real message
      if (
        (action === "deleted" || action === "warned" || action === "timeout") &&
        msg.messageId &&
        !msg.messageId.startsWith("sim_")
      ) {
        const token = await user?.getIdToken();
        const res = await fetch("/api/mod-action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: \`Bearer \${token}\`,
          },
          body: JSON.stringify({
            serverId: msg.serverId,
            channelId: msg.channelId,
            messageId: msg.messageId,
            action: action === "deleted" ? "delete" : action === "timeout" ? "timeout" : "warn",
            authorId: msg.authorId,
            reason: msg.reason,
          }),
        });
        
        let data;
        const text = await res.text();
        try {
          data = res.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : { error: text };
        } catch (e) {
          data = { error: text };
        }

        if (!res.ok) {
           const errText = data?.error || data?.message || text || "Failed to perform Discord action";
           console.error("Failed to perform Discord action:", errText);
           toast.error("Discord Action Failed:\\n" + String(errText));
           setProcessing(null);
           return;
        } else {
          if (action === "warned") {
             toast.success("Warning sent to user via Discord DMs.");
          } else if (action === "deleted") {
             toast.success("Message deleted from Discord.");
          } else if (action === "timeout") {
             toast.success("User has been timed out.");
          }
        }
      }

      // Add a 500ms delay so the moderator sees the success toast/state before the item vanishes
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. Update Firestore
      const updateData: any = { actionTaken: action };
      
      // Preserve "auto_deleted" state if it was originally auto_deleted
      if (msg.actionTaken === "auto_deleted" && (action === "warned" || action === "timeout")) {
        updateData.actionTaken = "auto_deleted";
      }

      if (action === "deleted") updateData.isDeleted = true;
      else if (action === "warned") {
        updateData.isWarned = true;
        if (msg.actionTaken === "auto_deleted" || msg.isDeleted) updateData.isDeleted = true;
      }
      else if (action === "approved") updateData.isApproved = true;
      else if (action === "timeout") {
        if (msg.actionTaken === "auto_deleted" || msg.isDeleted) updateData.isDeleted = true;
      }
      
      await updateDoc(doc(db, "flaggedMessages", msg.id), updateData);`;
      
   content = content.substring(0, startIndex) + newBlock + content.substring(endIndex);
   fs.writeFileSync('src/components/ModQueue.tsx', content);
   console.log("Updated ModQueue.tsx successfully.");
} else {
    console.log("Could not find anchors", startIndex, endIndex);
}
