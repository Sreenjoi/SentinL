import fs from "fs";

let file = fs.readFileSync("src/discordBot.ts", "utf8");

const replacementHelper = `const safeToMillis = (ts: any, fallback = 0) => {
    if (!ts) return fallback;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") { const d = new Date(ts).getTime(); return isNaN(d) ? fallback : d; }
    if (ts.seconds) return ts.seconds * 1000;
    return fallback;
  };`;

if (!file.includes("const safeToMillis =")) {
    const fetchMarker = `const lastScoreUpd = healthWidget.lastScoreUpdate?.toMillis() || 0;`;
    if (file.includes(fetchMarker)) {
        file = file.replace(fetchMarker, replacementHelper + "\n          const lastScoreUpd = safeToMillis(healthWidget.lastScoreUpdate, 0);");
    } else {
        const fetchMarker2 = `const hasGradedBefore`;
        file = file.replace(fetchMarker2, replacementHelper + "\n          const hasGradedBefore");
    }

    file = file.replace(/healthWidget\.lastUpdated\?\.toMillis\(\)/g, "safeToMillis(healthWidget.lastUpdated, 0)");
    file = file.replace(/data\.timestamp\?\.toMillis\(\)/g, "safeToMillis(data.timestamp, Date.now())");
    file = file.replace(/doc\.data\(\)\.timestamp\?\.toMillis\(\)/g, "safeToMillis(doc.data().timestamp, 0)");
    
    fs.writeFileSync("src/discordBot.ts", file);
    console.log("Patched toMillis successfully");
} else {
    console.log("Already patched.");
}
