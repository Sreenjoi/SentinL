export type AIProvider = "groq" | "cloudflare";

const DEFAULT_CLOUDFLARE_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export function getPrimaryFastProvider(): AIProvider {
  const provider = process.env.PRIMARY_AI_PROVIDER?.toLowerCase() as AIProvider;
  return provider === "groq" ? "groq" : "cloudflare";
}

export function getPrimaryFastModel(): string {
  const provider = getPrimaryFastProvider();
  if (provider === "cloudflare") {
    return process.env.CLOUDFLARE_FAST_MODEL || DEFAULT_CLOUDFLARE_MODEL;
  }
  return process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant";
}

export interface AIChatCompletionOptions {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  response_format?: any;
}

async function buildProviderError(response: Response, provider: "Cloudflare" | "Groq") {
  const retryAfter = response.headers.get("retry-after") || response.headers.get("Retry-After");
  const requestId =
    response.headers.get("cf-ray") ||
    response.headers.get("x-request-id") ||
    response.headers.get("x-groq-request-id") ||
    undefined;

  // Read and discard the provider body so the connection can close cleanly, but
  // never put it in logs/errors. Some providers include request details in error
  // bodies, and moderation prompts may contain private Discord message text.
  await response.text().catch(() => "");

  const error = new Error(`${provider} API Error: ${response.status}`) as any;
  error.status = response.status;
  error.provider = provider.toLowerCase();
  error.retryAfter = retryAfter;
  error.requestId = requestId;
  return error;
}

function prepareCloudflareMessages(model: string, messages: any[]) {
  if (!model.toLowerCase().includes("qwen3")) return messages;

  const prepared = messages.map((message) => ({ ...message }));
  const firstSystem = prepared.find((message) => message.role === "system");
  if (firstSystem && typeof firstSystem.content === "string") {
    firstSystem.content = `/no_think\n${firstSystem.content}\nReturn the final JSON immediately. Do not produce reasoning, analysis, or hidden thinking.`;
  }

  const lastUserIndex = prepared.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex >= 0 && typeof prepared[lastUserIndex].content === "string") {
    prepared[lastUserIndex].content = `${prepared[lastUserIndex].content}\n/no_think`;
  }

  return prepared;
}

export async function callAIChatCompletion(options: AIChatCompletionOptions, providerOverride?: AIProvider): Promise<any> {
  const provider = providerOverride || getPrimaryFastProvider();

  if (provider === "cloudflare") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !token) {
      throw new Error("Cloudflare configuration is missing (CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)");
    }

    const model = getPrimaryFastModel();
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
    const messages = prepareCloudflareMessages(model, options.messages);

    const body = {
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format,
      stream: false,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await buildProviderError(response, "Cloudflare");
    }

    const data = await response.json();
    
    // Normalize Cloudflare response if it doesn't already have choices[0].message.content
    if (data && data.result?.choices && !data.choices) {
      return {
        ...data,
        choices: data.result.choices
      };
    }

    if (data && !data.choices && data.result && data.result.response !== undefined) {
      const content =
        typeof data.result.response === "string"
          ? data.result.response
          : JSON.stringify(data.result.response);
      return {
        ...data,
        choices: [
          {
            message: {
              content
            }
          }
        ]
      };
    } else if (data && !data.choices && data.response !== undefined) {
      const content =
        typeof data.response === "string"
          ? data.response
          : JSON.stringify(data.response);
      return {
        ...data,
        choices: [
          {
            message: {
              content
            }
          }
        ]
      };
    } else if (data && !data.choices && typeof data.result === "string") {
      return {
        ...data,
        choices: [
          {
            message: {
              content: data.result
            }
          }
        ]
      };
    }

    return data;
  } else {
    // Groq
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing");
    }

    const model = process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant";
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";

    const body = {
      model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await buildProviderError(response, "Groq");
    }

    return await response.json();
  }
}
