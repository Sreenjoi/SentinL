import fs from "fs";

let file = fs.readFileSync("src/components/HealthScore.tsx", "utf8");

const start = '<div className="mt-4 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-text-muted">';
const startIdx = file.indexOf(start);

if (startIdx !== -1) {
    const end = '</div>';
    const endIdx = file.indexOf(end, startIdx + start.length) + end.length;
    file = file.substring(0, startIdx) + \`<div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 items-start bg-black/10 rounded-xl p-3 border border-outline-variant/10">
                     <span className="text-[10px] uppercase font-black tracking-widest text-text-muted">Peaceful Streak</span>
                     <span className="text-xl font-bold text-primary">{widgetSettings.peacefulStreakDays || 0}</span>
                  </div>
                  <div className="flex flex-col gap-1 items-start bg-black/10 rounded-xl p-3 border border-outline-variant/10">
                     <span className="text-[10px] uppercase font-black tracking-widest text-text-muted">Total Peaceful Days</span>
                     <span className="text-xl font-bold text-primary">{widgetSettings.totalPeacefulDays || 0}</span>
                  </div>
                 </div>\` + file.substring(endIdx);
    fs.writeFileSync("src/components/HealthScore.tsx", file);
    process.exit(0);
}
console.error("failed");
