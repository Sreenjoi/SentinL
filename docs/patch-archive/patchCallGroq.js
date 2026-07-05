const fs = require('fs');

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
        "https://api.com", // dummy
      );

      /* REMOVED EXTRA CODE HERE FOR BREVITY JUST FOR REGEX TEST */
    } finally {}
  }`;

// I will just use npx tsx in a moment.
