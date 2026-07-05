const fs = require('fs');
let code = fs.readFileSync('src/discordBot.ts', 'utf8');

const targetObj = `  const coalesceMap = new Map<string, { timer: NodeJS.Timeout, requests: QueueRequest[] }>();

  function coalesceModerationRequest(req: QueueRequest) {
    const coalesceKey = \`\${req.serverId}-\${req.message.channelId}\`;
    if (!coalesceMap.has(coalesceKey)) {
      coalesceMap.set(coalesceKey, {
        requests: [],
        timer: setTimeout(() => {
          const entry = coalesceMap.get(coalesceKey);
          coalesceMap.delete(coalesceKey);
          if (entry && entry.requests.length > 0) {
            const batch = entry.requests;
            const baseReq = batch[batch.length - 1]; // Use the most recent message as the representative message
            if (batch.length > 1) {
              baseReq.coalescedMessages = batch.map(r => r.message);
            }
            enqueueModerationRequest(baseReq);
          }
        }, 3000)
      });
    }
    coalesceMap.get(coalesceKey)!.requests.push(req);
  }

  function enqueueModerationRequest(req: QueueRequest) {
    if (req.isPremium) {
      if (premiumQueue.length < 5000) premiumQueue.push(req);
      else console.warn("[Queue] Premium queue full, dropping request");
    } else {
      if (freeQueue.length < 5000) freeQueue.push(req);
      else console.warn("[Queue] Free queue full, dropping request");
    }
    
    // Only spin up a new loop if we have capacity
    if (!isQueueSpawning && activeWorkers < MAX_WORKERS) {
      processQueue();
    }
  }`;

const replacement = `  function getRiskLevel(text: string): 'high' | 'medium' | 'low' {
     if (containsHighRiskSignal(text)) return 'high';
     if (text.length > 100 || /<@!?\\d+>/.test(text) || /https?:\\/\\/[^\\s]+/.test(text)) return 'medium';
     return 'low';
  }

  const coalesceMap = new Map<string, { timer: NodeJS.Timeout | null, deadline: number, requests: QueueRequest[] }>();

  function coalesceModerationRequest(req: QueueRequest) {
    const coalesceKey = \`\${req.serverId}-\${req.message.channelId}\`;
    let entry = coalesceMap.get(coalesceKey);

    const risk = getRiskLevel(req.message.content);
    let delay = risk === 'high' ? 50 : (risk === 'medium' ? 2500 : 8000);

    if (!entry) {
      entry = {
        requests: [],
        timer: null,
        deadline: Date.now() + delay
      };
      coalesceMap.set(coalesceKey, entry);
    } else {
      const newDeadline = Date.now() + delay;
      if (newDeadline < entry.deadline) {
        entry.deadline = newDeadline;
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      }
    }

    entry.requests.push(req);

    if (entry.requests.length >= 10 || risk === 'high') {
        if (entry.timer) clearTimeout(entry.timer);
        setTimeout(() => flushCoalesced(coalesceKey), 50); // Small 50ms buffer for high-risk
        return;
    }

    if (!entry.timer) {
      const waitTime = Math.max(0, entry.deadline - Date.now());
      entry.timer = setTimeout(() => {
        flushCoalesced(coalesceKey);
      }, waitTime);
    }
  }

  function flushCoalesced(coalesceKey: string) {
      const entry = coalesceMap.get(coalesceKey);
      if (!entry) return;
      coalesceMap.delete(coalesceKey);
      if (entry && entry.requests.length > 0) {
        let currentBatch: QueueRequest[] = [];
        let currentSize = 0;
        
        for (const r of entry.requests) {
           const size = r.message.content.length;
           if (currentBatch.length > 0 && (currentBatch.length >= 10 || currentSize + size > 4000)) {
               sendBatch(currentBatch);
               currentBatch = [];
               currentSize = 0;
           }
           currentBatch.push(r);
           currentSize += size;
        }
        if (currentBatch.length > 0) {
           sendBatch(currentBatch);
        }
      }
  }

  function sendBatch(batch: QueueRequest[]) {
      if (batch.length === 0) return;
      
      const hasHighRisk = batch.some(r => getRiskLevel(r.message.content) === 'high');
      const baseReq = batch[batch.length - 1]; 
      
      if (batch.length > 1) {
         baseReq.coalescedMessages = batch.map(r => r.message);
      } else {
         baseReq.coalescedMessages = undefined;
      }
      
      if (hasHighRisk) {
         if (baseReq.isPremium) {
           if (premiumQueue.length < 5000) premiumQueue.unshift(baseReq);
         } else {
           if (freeQueue.length < 5000) freeQueue.unshift(baseReq);
         }
         
         if (!isQueueSpawning && activeWorkers < MAX_WORKERS) {
           processQueue();
         }
      } else {
         enqueueModerationRequest(baseReq);
      }
  }

  function enqueueModerationRequest(req: QueueRequest) {
    if (req.isPremium) {
      if (premiumQueue.length < 5000) premiumQueue.push(req);
      else console.warn("[Queue] Premium queue full, dropping request");
    } else {
      if (freeQueue.length < 5000) freeQueue.push(req);
      else console.warn("[Queue] Free queue full, dropping request");
    }
    
    // Only spin up a new loop if we have capacity
    if (!isQueueSpawning && activeWorkers < MAX_WORKERS) {
      processQueue();
    }
  }`;

if (code.includes(targetObj)) {
  fs.writeFileSync('src/discordBot.ts', code.replace(targetObj, replacement), 'utf8');
  console.log("Success");
} else {
  console.log("Not found target string");
}
