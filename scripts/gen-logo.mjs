import sharp from "sharp";
import { join } from "path";

const robotBadgeSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="34" stdDeviation="38" flood-color="#2b1d1c" flood-opacity="0.22"/>
    </filter>
    <linearGradient id="coral" x1="228" y1="160" x2="796" y2="864" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff8377"/>
      <stop offset="1" stop-color="#ff6f61"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="none"/>
  <g filter="url(#shadow)">
    <circle cx="512" cy="512" r="360" fill="url(#coral)"/>
    <circle cx="512" cy="512" r="302" fill="#ffffff" fill-opacity="0.13"/>
  </g>
  <g transform="translate(224 224) scale(9)" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 23 26 L 16 12" fill="none"/>
    <path d="M 41 26 L 48 12" fill="none"/>
    <circle cx="16" cy="12" r="4" fill="#ffffff" stroke="#ffffff"/>
    <circle cx="48" cy="12" r="4" fill="#ffffff" stroke="#ffffff"/>
    <rect x="14" y="26" width="36" height="24" rx="6" fill="none" stroke="#ffffff"/>
    <path d="M 14 31 H 10 C 8.895 31 8 31.895 8 33 V 43 C 8 44.105 8.895 45 10 45 H 14" fill="none" stroke="#ffffff"/>
    <path d="M 50 31 H 54 C 55.105 31 56 31.895 56 33 V 43 C 56 44.105 55.105 45 54 45 H 50" fill="none" stroke="#ffffff"/>
    <path d="M 26 43 Q 32 48 38 43" fill="none" stroke="#ffffff"/>
    <circle cx="24" cy="36" r="3" fill="#ffffff" stroke="none"/>
    <circle cx="40" cy="36" r="3" fill="#ffffff" stroke="none"/>
  </g>
</svg>`;

async function run() {
  const buf = Buffer.from(robotBadgeSvg);
  await sharp(buf).png().toFile("public/logo.png");
  await sharp(buf).png().toFile("src/assets/logo.png");
  console.log("Images generated");
}
run();
