import { logger } from "./logger.js";
export function parseAppOrigin(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    const urlStr = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
    const url = new URL(urlStr);
    return url.origin;
  } catch (e) {
    logger.warn(`[Startup] WARNING: Invalid APP_URL provided: ${appUrl}`);
    return null;
  }
}

export function buildFrameAncestors(appUrl: string | undefined, allowAiStudioEmbed: string | undefined): string[] {
  const frameAncestorsList = ["'self'"];
  
  const origin = parseAppOrigin(appUrl);
  if (origin) {
    frameAncestorsList.push(origin);
  }

  const isProd = process.env.NODE_ENV === "production";
  const isPreview = process.env.AI_STUDIO_PREVIEW === "true";
  let allowEmbed = false;

  if (allowAiStudioEmbed === "true" || (!isProd && isPreview)) {
    allowEmbed = true;
  } else if (!isProd && allowAiStudioEmbed !== "false") {
    allowEmbed = true;
  }

  if (allowEmbed) {
    frameAncestorsList.push("https://aistudio.google.com");
    frameAncestorsList.push("https://*.aistudio.google.com");
    frameAncestorsList.push("https://*.googleusercontent.com");
    frameAncestorsList.push("https://ai.google.dev");
    frameAncestorsList.push("https://ai.studio");
    frameAncestorsList.push("https://*.ai.studio");
  }

  return frameAncestorsList;
}
