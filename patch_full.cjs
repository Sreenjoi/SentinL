const fs = require('fs');
let code = fs.readFileSync('src/discordBot.ts', 'utf8');

const target = `    try {
      let needsFullPass = false;

      if (ENABLE_FAST_PASS_TRIAGE) {
        const dataFast = await callGroqModel(
          process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant",
          generateFastPassPrompt(),
          userPrompt,
          groqKey,
        );
        const textFast = dataFast.choices?.[0]?.message?.content || "";
        usedModelStr = "primary_fast";
        const fastResults = parseGroqJSON(textFast);

        needsFullPass = shouldRunFullPass(fastResults, primaryConfidenceThreshold);

        if (!needsFullPass) {
          analysisArray = fastResults.map((r: any) => ({
            index: r.index,
            level: "Safe",
            confidence: r.confidence || 100,
            reason: "Safe (Fast Pass Triage)"
          }));
          text = textFast;
        }
      } else {
        needsFullPass = true;
      }

      if (needsFullPass) {
        const includeContext = shouldIncludeContext(req.isPremium, req.serverData?.useContext === true);
        const fullSystemPrompt = generateFullModerationPrompt({ includeContext });
        
        const data = await callGroqModel(
          process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant",
          fullSystemPrompt,
          userPrompt,
          groqKey,
        );
        text = data.choices?.[0]?.message?.content || "";
        usedModelStr = "primary_full";
        analysisArray = parseGroqJSON(text);

        // Dual Model Escalation Logic
        if (shouldEscalateTo70B(req.isPremium, enableDualModel, analysisArray, primaryConfidenceThreshold)) {
          let lowestConf = Math.min(...analysisArray.map((i:any) => typeof i.confidence === 'number' ? i.confidence : (parseInt(i.confidence)||0)));
          if (true) {
            addBotLog(
              \`[Bot AI] Escalating to paid 70B model because primary had low confidence (\${lowestConf} < \${primaryConfidenceThreshold})\`,
            );
            const data70 = await callGroqModel(
              process.env.PREMIUM_AI_MODEL || "llama-3.3-70b-versatile",
              fullSystemPrompt,
              userPrompt,
              groqKey,
            );
            text = data70.choices?.[0]?.message?.content || "";
            usedModelStr = "paid_70b";
            analysisArray = parseGroqJSON(text); // parse array again
          }
        }
      }
    } catch (e: any) {`;

const replacement = `    try {
      let needsFullPass = false;
      const messagesToProcess = req.coalescedMessages || [req.message];
      
      let fastResults: any[] = [];
      let messagesNeedingFullPass: { msg: any, origIndex: number }[] = [];

      if (ENABLE_FAST_PASS_TRIAGE) {
        const dataFast = await callGroqModel(
          process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant",
          generateFastPassPrompt(),
          userPrompt,
          groqKey,
        );
        const textFast = dataFast.choices?.[0]?.message?.content || "";
        usedModelStr = "primary_fast";
        fastResults = parseGroqJSON(textFast);

        // Determine which messages need full pass
        messagesNeedingFullPass = messagesToProcess.map((msg, i) => {
           let origIndex = i + 1;
           const fr = fastResults.find((r: any) => parseInt(r.index) === origIndex);
           if (!fr) return { msg, origIndex, needsPass: true };
           
           const conf = typeof fr.confidence === "number" ? fr.confidence : parseInt(fr.confidence) || 0;
           const isFlagged = fr.flag === true || String(fr.flag).toLowerCase() === "true";
           return { msg, origIndex, needsPass: isFlagged || conf < primaryConfidenceThreshold };
        }).filter(item => item.needsPass);

        needsFullPass = messagesNeedingFullPass.length > 0;

        analysisArray = fastResults.map((r: any) => ({
          index: r.index,
          level: "Safe", // Default safe for fast pass items that matched
          confidence: r.confidence || 100,
          reason: "Safe (Fast Pass Triage)"
        }));
      } else {
        needsFullPass = true;
        messagesNeedingFullPass = messagesToProcess.map((msg, i) => ({ msg, origIndex: i + 1 }));
      }

      if (needsFullPass) {
        const includeContext = shouldIncludeContext(req.isPremium, req.serverData?.useContext === true);
        const fullSystemPrompt = generateFullModerationPrompt({ includeContext });
        
        // Rebuild user prompt ONLY for messages needing full pass to save tokens and only retry uncertain items
        const combinedContentTargeted = messagesNeedingFullPass.map((m, i) => \`\${i + 1}. [\${m.msg.author.username}]: \${m.msg.content}\`).join('\\n');
        const userPromptTargeted = \`\${authorHeader}\\nUser Messages:\\n<user_message>\\n\${combinedContentTargeted}\\n</user_message>\`;
        
        const data = await callGroqModel(
          process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant",
          fullSystemPrompt,
          userPromptTargeted,
          groqKey,
        );
        let text = data.choices?.[0]?.message?.content || "";
        usedModelStr = "primary_full";
        let fullResults = parseGroqJSON(text);

        // Dual Model Escalation Logic for just these targeted ones
        if (shouldEscalateTo70B(req.isPremium, enableDualModel, fullResults, primaryConfidenceThreshold)) {
          let lowestConf = Math.min(...fullResults.map((i:any) => typeof i.confidence === 'number' ? i.confidence : (parseInt(i.confidence)||0)));
          if (true) {
            addBotLog(
              \`[Bot AI] Escalating targeted full-pass to paid 70B model due to low confidence (\${lowestConf} < \${primaryConfidenceThreshold})\`,
            );
            const data70 = await callGroqModel(
              process.env.PREMIUM_AI_MODEL || "llama-3.3-70b-versatile",
              fullSystemPrompt,
              userPromptTargeted,
              groqKey,
            );
            text = data70.choices?.[0]?.message?.content || "";
            usedModelStr = "paid_70b";
            fullResults = parseGroqJSON(text);
          }
        }
        
        // Merge full results back into analysisArray according to original indices
        const mapToOrig = new Map<number, number>();
        messagesNeedingFullPass.forEach((m, i) => mapToOrig.set(i + 1, m.origIndex));
        
        fullResults.forEach((fr: any) => {
           const remappedIndex = mapToOrig.get(parseInt(fr.index));
           if (remappedIndex !== undefined) {
             fr.index = remappedIndex;
             // Add or update in analysisArray
             const extIdx = analysisArray.findIndex(a => parseInt(a.index) === remappedIndex);
             if (extIdx >= 0) analysisArray[extIdx] = fr;
             else analysisArray.push(fr);
           }
        });
      }
    } catch (e: any) {`;

if (code.includes(target)) {
  fs.writeFileSync('src/discordBot.ts', code.replace(target, replacement), 'utf8');
  console.log("Success");
} else {
  console.log("Not found");
}
