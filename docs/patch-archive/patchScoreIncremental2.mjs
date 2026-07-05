import fs from "fs";

let file = fs.readFileSync("src/discordBot.ts", "utf8");

const startMarker = `          const fetchFromMs = hasGradedBefore ? lastScoreUpd : 0;`;
const endMarker = `          let streakStart = 0;`;

const startIndex = file.indexOf(startMarker);
const endIndex = file.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find boundaries! startIndex:", startIndex, "endIndex:", endIndex);
    process.exit(1);
}

const replacement = `          const fetchFromMs = hasGradedBefore ? lastScoreUpd : 0;
          let penaltyPoints = 0;
          let falsePositives = 0;
          let raidFlags = 0;
          
          let hadUnapprovedExtremeFlag = false;

          if (canUpdateScore && !isCalibrating) {
              const flagsSnap = await db.collection("flaggedMessages")
                 .where("serverId", "==", serverId)
                 .orderBy("timestamp", "desc").limit(3000).get();

              const flagsPerHour = new Map<string, number>();

              for (const doc of flagsSnap.docs) {
                 const data = doc.data();
                 const tMillis = data.timestamp?.toMillis() || Date.now();
                 if (tMillis <= fetchFromMs) continue;

                 const hrFloor = Math.floor(tMillis / (1000 * 60 * 60)).toString();
                 flagsPerHour.set(hrFloor, (flagsPerHour.get(hrFloor) || 0) + 1);

                 if ((flagsPerHour.get(hrFloor) || 0) > 100) {
                     raidFlags++;
                     continue; 
                 }

                 let isExtreme = false;
                 const level = data.level?.toLowerCase() || "";
                 if (level === "extreme" || data.actionTaken === "ban" || data.actionTaken === "timeout" || data.actionTaken === "deleted" || data.actionTaken === "auto_deleted") {
                     isExtreme = true;
                 }
                 
                 const isApproved = data.actionTaken === "approved" || data.isApproved;

                 if (isApproved) {
                     falsePositives++;
                 } else {
                     if (isExtreme) {
                         hadUnapprovedExtremeFlag = true;
                         penaltyPoints += 5;
                     } else if (level === "high") {
                         penaltyPoints += 3;
                     } else if (level === "medium") {
                         penaltyPoints += 2;
                     } else {
                         penaltyPoints += 1;
                     }
                 }
              }
          }

          let resolvedReports = 0;
          let trainingCount = 0;

          if (canUpdateScore && !isCalibrating) {
              const resolvedReportsSnap = await db.collection("servers").doc(serverId).collection("reports")
                 .where("status", "in", ["actioned", "dismissed", "approved"])
                 .limit(500).get();
              resolvedReportsSnap.docs.forEach((doc:any) => {
                 if ((doc.data().timestamp?.toMillis() || 0) > fetchFromMs) resolvedReports++;
              });

              const trainingSnap = await db.collection("trainingFeedback")
                 .where("serverId", "==", serverId)
                 .limit(500).get();
              trainingSnap.docs.forEach((doc:any) => {
                 if ((doc.data().timestamp?.toMillis() || 0) > fetchFromMs) trainingCount++;
              });
          }

          let score = parseFloat(healthWidget.lastScore);
          if (isNaN(score)) score = 100; 
          
          let currentStreakDays = healthWidget.streakDays || 0;
          let peacefulStreakDays = healthWidget.peacefulStreakDays || 0;
          let recoveredPoints = 0; 

          if (canUpdateScore && !isCalibrating) {
              let dailyBonus = 0;
              
              if (!hadUnapprovedExtremeFlag) {
                  // Peaceful Day Base Recovery
                  peacefulStreakDays++;
                  dailyBonus += 2;
                  
                  if (peacefulStreakDays <= 7) dailyBonus += 1;
                  else if (peacefulStreakDays <= 14) dailyBonus += 1.5;
                  else if (peacefulStreakDays <= 21) dailyBonus += 2;
                  else dailyBonus += 3;
              } else {
                  peacefulStreakDays = 0;
              }

              let scoreDelta = 0;
              scoreDelta -= penaltyPoints;
              scoreDelta += falsePositives;
              scoreDelta += Math.min(resolvedReports, 5);
              scoreDelta += Math.min(trainingCount, 5);
              if (raidFlags > 0) scoreDelta += 5;
              scoreDelta += dailyBonus;
              
              recoveredPoints = scoreDelta > 0 ? scoreDelta : 0; 
              score += scoreDelta;
              score = Math.round(score);

              if (score < 0) score = 0;
              if (score > 100) score = 100;
          }

`;

const newFile = file.substring(0, startIndex) + replacement + file.substring(endIndex);

fs.writeFileSync("src/discordBot.ts", newFile);
console.log("Patched successfully!");
