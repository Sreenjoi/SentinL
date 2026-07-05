import fs from 'fs';

let content = fs.readFileSync('src/discordBot.ts', 'utf8');

const regex = /async function callGroqModel\([\s\S]*?throw e;\n    \} finally \{\n      clearTimeout\(timeoutId\);\n    \}\n  \}/m;

const replacement = `async function callGroqModel(
    modelName: string,
    systemPrompt: string,
    userPrompt: string,
    groqKey: string,
    options?: GroqModelOptions,
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    let budgetReserved = false;
    let budgetReleasedOrReconciled = false;
    let estimatedTokens = 0;

    try {
      const max_tokens = getStageMaxTokens(options?.stage, options?.itemCount);
      estimatedTokens = estimateGroqCallTokens(
        systemPrompt,
        userPrompt,
        max_tokens,
      );

      const payload: any = {
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens,
      };

      if (isGroqCooldownActive()) {
        return {
          error: "provider_cooldown",
          cooldownUntil: groqProviderCooldownUntil,
        };
      }

      const budget = await reserveGroqBudget(db, estimatedTokens, options?.stage === "primary_fast");
      if (!budget.allowed) {
        if (
          budget.cooldownUntil &&
          budget.cooldownUntil > groqProviderCooldownUntil
        ) {
          groqProviderCooldownUntil = budget.cooldownUntil;
          __setGroqProviderCooldownUntil(groqProviderCooldownUntil); // Update local cache
        }
        return {
          error: "provider_budget_deferred",
          cooldownUntil: budget.cooldownUntil,
        };
      }
      
      budgetReserved = true;

      await waitForGroqRequestSlot(options?.stage);

      if (isGroqCooldownActive()) {
        await releaseGroqBudget(db, estimatedTokens);
        budgetReleasedOrReconciled = true;
        return {
          error: "provider_cooldown",
          cooldownUntil: groqProviderCooldownUntil,
        };
      }

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: \`Bearer \${groqKey}\`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal as any,
        },
      );

      const limitHeader = response.headers.get("x-ratelimit-limit-requests");
      const remainingHeader = response.headers.get(
        "x-ratelimit-remaining-requests",
      );
      const resetHeader = response.headers.get("x-ratelimit-reset-requests");
      const tokensRemainingHeader = response.headers.get(
        "x-ratelimit-remaining-tokens",
      );
      const tokensResetHeader = response.headers.get(
        "x-ratelimit-reset-tokens",
      );

      if (limitHeader) currentRpmLimit = parseInt(limitHeader, 10);
      if (remainingHeader) {
        const remaining = parseInt(remainingHeader, 10);
        if (!isNaN(remaining)) {
          requestsInCurrentMinute = Math.max(
            requestsInCurrentMinute,
            currentRpmLimit - remaining,
          );
        }
      }

      let reqResetMs = resetHeader ? parseGroqResetMs(resetHeader) : 0;
      let tknResetMs = tokensResetHeader
        ? parseGroqResetMs(tokensResetHeader)
        : 0;
      let resetMs = Math.max(reqResetMs, tknResetMs);

      if (!resetMs) {
        resetMs = parseGroqResetMs(null);
      }

      const exactCooldownUntil = Date.now() + resetMs;
      if (resetHeader || tokensResetHeader) {
        nextResetTime = exactCooldownUntil;
      }

      if (!response.ok) {
        if (response.status === 429) {
          groqProviderCooldownUntil = exactCooldownUntil;
          __setGroqProviderCooldownUntil(groqProviderCooldownUntil);
          if (db) {
            db.collection("system_health")
              .doc("groq_budget")
              .set(
                {
                  cooldownUntil: exactCooldownUntil,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true },
              )
              .catch(() => {});
          }
          throw { status: 429, message: "Rate limit hit" };
        }
        if (response.status >= 500) {
          throw { status: response.status, message: "Groq API Unavailable" };
        }
        const errMsg = await response.text();
        throw new Error(errMsg);
      }

      const jsonResult = await response.json();
      
      const actualTokens = jsonResult?.usage?.total_tokens;
      if (typeof actualTokens === 'number') {
         await reconcileGroqTokens(db, estimatedTokens, actualTokens).catch(()=>{});
         budgetReleasedOrReconciled = true;
      }

      return jsonResult;
    } catch (e: any) {
      if (e.name === "AbortError") {
        throw new Error("Groq API Timeout");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
      if (budgetReserved && !budgetReleasedOrReconciled) {
         await releaseGroqBudget(db, estimatedTokens).catch(()=>{});
         budgetReleasedOrReconciled = true;
      }
    }
  }`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/discordBot.ts', content);
    console.log("Patched callGroqModel");
} else {
    console.log("Could not find regex!");
}
