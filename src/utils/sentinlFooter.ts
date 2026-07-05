export const SENTINL_FOOTER_TEXT = "Protected by SentinL";

function getLogoUrl() {
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  return /^https:\/\//i.test(appUrl) ? `${appUrl}/logo.png` : null;
}

export function getSentinLProtectedFooter() {
  const logoUrl = getLogoUrl();
  return logoUrl
    ? { text: SENTINL_FOOTER_TEXT, iconURL: logoUrl }
    : { text: SENTINL_FOOTER_TEXT };
}

export function getSentinLProtectedRawFooter() {
  const logoUrl = getLogoUrl();
  return logoUrl
    ? { text: SENTINL_FOOTER_TEXT, icon_url: logoUrl }
    : { text: SENTINL_FOOTER_TEXT };
}
