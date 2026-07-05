import fs from "fs";

let file = fs.readFileSync("src/discordBot.ts", "utf8");

// We're going to search for the lines to replace and splice them out.
const startMarker = `          const lastUpd = healthWidget.lastUpdated?.toMillis() || 0;`;
const endMarker = `          let grade = "A+";`;

const startIndex = file.indexOf(startMarker);
const endIndex = file.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find boundaries! startIndex:", startIndex, "endIndex:", endIndex);
    process.exit(1);
}

const replacement = `          const lastScoreUpd = healthWidget.lastScoreUpdate?.toMillis() || 0;
          const hoursSinceScoreUpdate = lastScoreUpd === 0 ? 24 : ((Date.now() - lastScoreUpd) / (1000 * 60 * 60));

          let totalMessages = healthWidget.totalMessages;
          
          if (totalMessages === undefined) {
             const allMsgSnap = await db.collection("analytics").doc(serverId).collection("messages").get();
             totalMessages = 0;
             allMsgSnap.docs.forEach((doc: any) => {
                totalMessages += (doc.data().total || 0);
             });
             await serverDoc.ref.update({ "healthWidget.totalMessages": totalMessages });
          }

          const hasGradedBefore = healthWidget.lastScore !== undefined && healthWidget.lastScore !== "N/A";
          let isCalibrating = totalMessages < 500 && !hasGradedBefore;
          let canUpdateScore = hoursSinceScoreUpdate >= 24 || (!hasGradedBefore && !isCalibrating);
          
          const needsWeeklyUpdate = (Date.now() - (healthWidget.lastUpdated?.toMillis() || 0)) > (7 * 24 * 60 * 60 * 1000);

          if (!healthWidget.needsUpdate && !forceUpdate && !needsWeeklyUpdate && !canUpdateScore) {
              return; 
          }

          const fetchFromMs = hasGradedBefore ? lastScoreUpd : 0;
          let penaltyPoints = 0;
          let falsePositives = 0;
          let raidFlags = 0;
          
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

                 if (data.actionTaken === "approved" || data.isApproved) {
                     falsePositives++;
                 } else {
                     const level = data.level?.toLowerCase() || "";
                     if (level === "extreme" || data.actionTaken === "ban" || data.actionTaken === "timeout" || data.actionTaken === "deleted" || data.actionTaken === "auto_deleted") {
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
          let recoveredPoints = 0; 

          if (canUpdateScore && !isCalibrating) {
              let dailyBonus = 0;
              
              if (penaltyPoints === 0) {
                  // Peaceful Day Base Recovery
                  dailyBonus += 2;
              }
              
              if (currentStreakDays > 0) {
                  if (currentStreakDays <= 7) dailyBonus += 1;
                  else if (currentStreakDays <= 14) dailyBonus += 1.5;
                  else if (currentStreakDays <= 21) dailyBonus += 2;
                  else dailyBonus += 3;
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

          let streakStart = 0; 
          let nearMissPayload: any = null;

          if (canUpdateScore && !isCalibrating) {
              if (score < 75) {
                  if (currentStreakDays >= 10 && healthWidget.recoveryMessages !== false) {
                     const oldStreak = currentStreakDays;
                     const months = Math.round(oldStreak / 30);
                     const timeString = months >= 2 ? \`\${months} months\` : months === 1 ? \`1 month\` : \`\${oldStreak} days\`;
                     let nextTier = "Bronze";
                     if (currentStreakDays >= 60) nextTier = "Silver";
                     if (currentStreakDays >= 90) nextTier = "Gold";
                     if (currentStreakDays >= 180) nextTier = "Platinum";
                     if (currentStreakDays >= 365) nextTier = "Diamond";
                     nearMissPayload = { oldStreak, timeString, nextTier };
                  }
                  currentStreakDays = 0;
              } else if (score >= 85) {
                  if (hoursSinceScoreUpdate >= 24 || (!hasGradedBefore)) {
                      const safeIncrement = Math.floor(hoursSinceScoreUpdate / 24) || 1;
                      currentStreakDays += safeIncrement;
                  }
              }
          }

`;

const newFile = file.substring(0, startIndex) + replacement + file.substring(endIndex);

fs.writeFileSync("src/discordBot.ts", newFile);
console.log("Patched successfully!");
