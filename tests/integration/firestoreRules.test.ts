import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import * as fs from "fs";
import { describe, beforeAll, afterAll, beforeEach, it } from "vitest";

const runTests = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

runTests("Firestore Security Rules - Paid Features", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = fs.readFileSync("firestore.rules", "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-sentinl-rules-test",
      firestore: { rules, host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Setup free server & moderator
      await db.collection("moderators").doc("mod@free.com").set({
        serverIds: ["server-free"]
      });
      await db.collection("servers").doc("server-free").set({
        confidenceThreshold: 80,
        autoDelete: false
      });
      await db.collection("subscriptions").doc("server-free").set({
        accessTier: "free", status: "active"
      });

      // Setup paid server & moderator
      await db.collection("moderators").doc("mod@paid.com").set({
        serverIds: ["server-paid"]
      });
      await db.collection("servers").doc("server-paid").set({
        confidenceThreshold: 80,
        autoDelete: false
      });
      await db.collection("subscriptions").doc("server-paid").set({
        accessTier: "pro", status: "active"
      });

      // Setup superadmin
      await db.collection("admins").doc("super-uid").set({
        email: "super@admin.com"
      });
      
    });
  });

  it("free user cannot write paid feature fields", async () => {
    const freeMod = testEnv.authenticatedContext("free-uid", { email: "mod@free.com" });
    const db = freeMod.firestore();

    // autoDelete is a paid feature field
    await assertFails(
      db.collection("servers").doc("server-free").update({
        autoDelete: true
      })
    );
    
    // Custom commands are paid
    await assertFails(
      db.collection("servers").doc("server-free").collection("custom_commands").doc("cmd1").set({
        id: "cmd1", name: "test", description: "test", actions: []
      })
    );
  });

  it("paid user can write paid feature fields", async () => {
    const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com" });
    const db = paidMod.firestore();

    // autoDelete is a paid feature field
    await assertSucceeds(
      db.collection("servers").doc("server-paid").update({
        autoDelete: true
      })
    );

    // Custom commands are paid
    await assertSucceeds(
      db.collection("servers").doc("server-paid").collection("custom_commands").doc("cmd1").set({
        id: "cmd1", name: "test", description: "test", actions: []
      })
    );
  });

  it("moderator can still edit free settings like confidenceThreshold", async () => {
    const freeMod = testEnv.authenticatedContext("free-uid", { email: "mod@free.com" });
    const db = freeMod.firestore();

    await assertSucceeds(
      db.collection("servers").doc("server-free").update({
        logChannelId: "new-channel-id",
        confidenceThreshold: 90
      })
    );
  });

  it("confidenceThreshold must be between 50 and 100", async () => {
    const freeMod = testEnv.authenticatedContext("free-uid", { email: "mod@free.com" });
    const db = freeMod.firestore();

    await assertFails(
      db.collection("servers").doc("server-free").update({
        confidenceThreshold: 49
      })
    );

    await assertFails(
      db.collection("servers").doc("server-free").update({
        confidenceThreshold: 101
      })
    );
  });

  it("allows updating free fields like keywords", async () => {
    const freeMod = testEnv.authenticatedContext("free-uid", { email: "mod@free.com" });
    const db = freeMod.firestore();

    // keywords is a free field
    await assertSucceeds(
      db.collection("servers").doc("server-free").update({
        keywords: ["badword"]
      })
    );
  });

  it("superadmin can write all admin-needed fields", async () => {
    const adminUser = testEnv.authenticatedContext("super-uid", { email: "super@admin.com" });
    const db = adminUser.firestore();

    // Can edit paid features on a free server
    await assertSucceeds(
      db.collection("servers").doc("server-free").update({
        autoDelete: true
      })
    );
    
    // Can add custom commands on a free server
    await assertSucceeds(
      db.collection("servers").doc("server-free").collection("custom_commands").doc("cmd2").set({
        id: "cmd2", name: "admin-cmd", description: "admin", actions: []
      })
    );
  });

  describe("error_logs validation", () => {
    it("allows valid error log creation by signed in user", async () => {
      const user = testEnv.authenticatedContext("some-user", { email: "user@test.com" });
      const db = user.firestore();
      await assertSucceeds(
        db.collection("error_logs").add({
          error: "test err",
          operationType: "get",
          path: "users/id",
        })
      );
    });

    it("denies unauthenticated error log creation", async () => {
      const unauth = testEnv.unauthenticatedContext();
      const db = unauth.firestore();
      await assertFails(
        db.collection("error_logs").add({
          error: "test err",
          operationType: "get",
          path: "users/id",
        })
      );
    });

    it("denies oversized error strings", async () => {
      const user = testEnv.authenticatedContext("some-user", { email: "user@test.com" });
      const db = user.firestore();
      const bigString = "E".repeat(3000); // Max is 2000
      await assertFails(
        db.collection("error_logs").add({
          error: bigString,
          operationType: "get",
          path: "users/id",
        })
      );
    });

    it("denies invalid operationType", async () => {
      const user = testEnv.authenticatedContext("some-user", { email: "user@test.com" });
      const db = user.firestore();
      await assertFails(
        db.collection("error_logs").add({
          error: "hi",
          operationType: "hack",
          path: "users/id",
        })
      );
    });
  });

  describe("moderators document security", () => {
  it("denies access with an unverified email", async () => {
      const unverifiedMod = testEnv.authenticatedContext("unverified-uid", { email: "unverified@test.com", email_verified: false });
      const db = unverifiedMod.firestore();

      await assertFails(db.collection("moderators").doc("unverified@test.com").get());
      await assertFails(db.collection("moderators").doc("unverified@test.com").set({
        serverIds: []
      }));
      // Should also fail accessing servers
      await assertFails(db.collection("servers").doc("server-free").get());
    });

  it("denies forging server-computed health fields", async () => {
    const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true });
    const db = paidMod.firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("servers").doc("server-paid").update({
            healthWidget: { enabled: true, lastScore: "85", streakDays: 5 }
        });
    });

    // Valid update touching safe fields
    await assertSucceeds(db.collection("servers").doc("server-paid").update({
        "healthWidget.enabled": false,
        "healthWidget.color": "#ff0000"
    }));

    // Forging unsafe fields
    await assertFails(db.collection("servers").doc("server-paid").update({
        "healthWidget.lastScore": "100"
    }));
    await assertFails(db.collection("servers").doc("server-paid").update({
        "healthWidget.streakDays": 999
    }));
  });

  it("denies direct giveaway deletion", async () => {
    const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true });
    const db = paidMod.firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("servers").doc("server-paid").collection("giveaways").doc("gwid1").set({
             prize: "apple", winnersCount: 1, durationHours: 1, channelId: "123", status: "active", createdAt: new Date(), endsAt: "123", serverId: "server-paid"
        });
    });

    await assertFails(db.collection("servers").doc("server-paid").collection("giveaways").doc("gwid1").delete());
  });

  it("denies direct report deletion", async () => {
    const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true });
    const db = paidMod.firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("servers").doc("server-paid").collection("reports").doc("rid1").set({
             reporterId: "r1", reportedUserId: "u1", reason: "spam", status: "pending", timestamp: "123"
        });
    });

    await assertFails(db.collection("servers").doc("server-paid").collection("reports").doc("rid1").delete());
  });

  describe("beta tester expiry logic", () => {
    it("denies paid access if betaExpiry is missing or invalid or in past", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await ctx.firestore().collection("servers").doc("server-beta").set({
              confidenceThreshold: 80, autoDelete: false, isBetaTester: true,
              betaExpiry: new Date(Date.now() - 10000000) 
          });
          await ctx.firestore().collection("moderators").doc("mod@beta.com").set({ serverIds: ["server-beta"] });
      });

      const db = testEnv.authenticatedContext("beta-uid", { email: "mod@beta.com", email_verified: true }).firestore();
      await assertFails(db.collection("servers").doc("server-beta").collection("custom_commands").doc("cmd10").set({
          id: "cmd10", name: "test", description: "test", actions: []
      }));
    });

    it("allows paid access if betaExpiry is valid and in future", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await ctx.firestore().collection("servers").doc("server-beta2").set({
              confidenceThreshold: 80, autoDelete: false, isBetaTester: true,
              betaExpiry: new Date(Date.now() + 10000000) // future timestamp
          });
          await ctx.firestore().collection("moderators").doc("mod@beta2.com").set({ serverIds: ["server-beta2"] });
      });

      const db = testEnv.authenticatedContext("beta2-uid", { email: "mod@beta2.com", email_verified: true }).firestore();
      await assertSucceeds(db.collection("servers").doc("server-beta2").collection("custom_commands").doc("cmd10").set({
          id: "cmd10", name: "test", description: "test", actions: []
      }));
    });
  });

  describe("XP and leveling users rules", () => {
    it("restricts XP reads to owner and server moderator", async () => {
       const userContext = testEnv.authenticatedContext("xp-user", { email: "user@test.com", email_verified: true });
       const dbUser = userContext.firestore();

       const modContext = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true });
       const dbMod = modContext.firestore();
       
       await testEnv.withSecurityRulesDisabled(async (ctx) => {
           await ctx.firestore().collection("users").doc("xp-user").collection("xp").doc("server-paid").set({ totalXp: 100 });
           await ctx.firestore().collection("users").doc("xp-user-2").collection("xp").doc("server-paid").set({ totalXp: 100 });
       });

       // User can read their own XP
       await assertSucceeds(dbUser.collection("users").doc("xp-user").collection("xp").doc("server-paid").get());
       
       // User CANNOT read someone else's XP
       await assertFails(dbUser.collection("users").doc("xp-user-2").collection("xp").doc("server-paid").get());

       // Mod can read anyone's XP in their server
       await assertSucceeds(dbMod.collection("users").doc("xp-user-2").collection("xp").doc("server-paid").get());
    });
  });

  describe("simulator flagged message creation", () => {
    it("denies creation for simulator flagged message if simulator mode is disabled", async () => {
       const db = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true }).firestore();
       const msg = {
         serverId: "server-paid", channelId: "123", authorId: "123", authorUsername: "a",
         content: "test", level: "Spam", confidence: 100, reason: "x", status: "pending",
         timestamp: "123", isSimulator: true 
       };
       await assertFails(db.collection("flaggedMessages").doc("msg1").set(msg));
    });

    it("allows creation for simulator flagged message if simulator mode is enabled", async () => {
       await testEnv.withSecurityRulesDisabled(async (ctx) => {
           await ctx.firestore().collection("servers").doc("server-paid").update({ simulatorMode: true });
       });
       const db = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true }).firestore();
       const msg = {
         serverId: "server-paid", channelId: "123", authorId: "123", authorUsername: "a",
         content: "test", level: "Spam", confidence: 100, reason: "x", status: "pending",
         timestamp: "123", isSimulator: true 
       };
       await assertSucceeds(db.collection("flaggedMessages").doc("msg1").set(msg));
    });
  });

  describe("feedback security", () => {
     it("requires userId and userEmail to match auth context", async () => {
        const db = testEnv.authenticatedContext("user-id-123", { email: "test@auth.com", email_verified: true }).firestore();
        
        await assertFails(db.collection("feedback").add({
           userId: "other-user", userEmail: "test@auth.com", type: "bug", title: "t", description: "d"
        }));

        await assertFails(db.collection("feedback").add({
           userId: "user-id-123", userEmail: "other@auth.com", type: "bug", title: "t", description: "d"
        }));

        await assertSucceeds(db.collection("feedback").add({
           userId: "user-id-123", userEmail: "test@auth.com", type: "bug", title: "t", description: "d"
        }));
     });
  });

  describe("Leveling Settings", () => {
     it("applies strict validation to leveling settings updates/creates", async () => {
        const db = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true }).firestore();
        
        // Fails if invalid format
        await assertFails(db.collection("servers").doc("server-paid").collection("leveling").doc("settings").set({
             enabled: true 
        }));

        // Succeeds if valid
        await assertSucceeds(db.collection("servers").doc("server-paid").collection("leveling").doc("settings").set({
             enabled: true, xpMultiplier: 1.0, cooldownSeconds: 60, xpMin: 15, xpMax: 25, levelDivisor: 100
        }));

        // Fails valid format update if not using full schema because create/update checks are unified
        await assertFails(db.collection("servers").doc("server-paid").collection("leveling").doc("settings").update({
             enabled: false 
        }));
     });
  });

  describe("error_logs nested authInfo validation", () => {
    it("fails if authInfo contains excessive keys", async () => {
       const user = testEnv.authenticatedContext("some-user", { email: "user@test.com" });
       const db = user.firestore();
       await assertFails(
         db.collection("error_logs").add({
           error: "test err",
           operationType: "get",
           path: "users/id",
           authInfo: { userId: "some-user", email: "user@test.com", extra: "illegal" }
         })
       );
    });
  });

  it("denies cross-server access", async () => {
    const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true }); // moderates server-paid
    const db = paidMod.firestore();

    await assertFails(db.collection("servers").doc("server-free").get());
    await assertFails(db.collection("servers").doc("server-free").update({ language: "de" }));
  });

  it("denies oversized feedback", async () => {
      const user = testEnv.authenticatedContext("some-user", { email: "user@test.com", email_verified: true });
      const db = user.firestore();
      
      await assertSucceeds(
        db.collection("feedback").add({
          userId: "some-user",
          userEmail: "user@test.com",
          type: "bug",
          title: "Test",
          description: "Great tool!",
          createdAt: "2024-01-01"
        })
      );

      const bigFeedback = "E".repeat(2001); // Max is 2000
      await assertFails(
        db.collection("feedback").add({
          userId: "some-user",
          userEmail: "user@test.com",
          type: "bug",
          title: "Test",
          description: bigFeedback,
          createdAt: "2024-01-01"
        })
      );
  });

  it("denies paid access with expired subscriptions", async () => {
      const paidMod = testEnv.authenticatedContext("paid-uid", { email: "mod@paid.com", email_verified: true });
      const db = paidMod.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("subscriptions").doc("server-paid").update({
              expiresAt: new Date(Date.now() - 10000000)
          });
      });

      // Should now fail to do paid things like custom commands
      await assertFails(
          db.collection("servers").doc("server-paid").collection("custom_commands").doc("cmd10").set({
            id: "cmd10", name: "test", description: "test", actions: []
          })
      );
  });

    it("allows reading own moderator document if verified", async () => {
      const verifiedMod = testEnv.authenticatedContext("verified-uid", { email: "verified@test.com", email_verified: true });
      const db = verifiedMod.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("moderators").doc("verified@test.com").set({
          serverIds: ["server1"]
        });
      });

      await assertSucceeds(db.collection("moderators").doc("verified@test.com").get());
    });

    it("denies reading another user's moderator document", async () => {
      const verifiedMod = testEnv.authenticatedContext("verified-uid", { email: "verified@test.com", email_verified: true });
      const db = verifiedMod.firestore();

      await assertFails(db.collection("moderators").doc("mod@free.com").get());
    });

    it("denies creating a moderator document with custom serverIds or active fields", async () => {
      const newMod = testEnv.authenticatedContext("newmod-uid", { email: "newmod@test.com", email_verified: true });
      const db = newMod.firestore();

      await assertFails(db.collection("moderators").doc("newmod@test.com").set({
        serverIds: ["server-hacked"]
      }));

      await assertFails(db.collection("moderators").doc("newmod@test.com").set({
        serverIds: [],
        serverNames: {},
        activeServerId: "server1"
      }));

      // A simple shell with empty arrays/objects should pass
      await assertSucceeds(db.collection("moderators").doc("newmod@test.com").set({
        serverIds: [],
        serverNames: {}
      }));
    });

    it("denies updating serverIds or serverNames", async () => {
      // Create valid mod first
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("moderators").doc("updatemod@test.com").set({
          serverIds: [],
          serverNames: {},
          discordUsername: "oldname"
        });
      });

      const updateMod = testEnv.authenticatedContext("updatemod-uid", { email: "updatemod@test.com", email_verified: true });
      const db = updateMod.firestore();

      // Should deny updating serverIds
      await assertFails(db.collection("moderators").doc("updatemod@test.com").update({
        serverIds: ["server1"]
      }));

      // Should deny updating serverNames
      await assertFails(db.collection("moderators").doc("updatemod@test.com").update({
        serverNames: { "server1": "My Server" }
      }));

      // Should allow updating non-authoritative fields (e.g. discordUsername)
      await assertSucceeds(db.collection("moderators").doc("updatemod@test.com").update({
        discordUsername: "newname"
      }));
    });
  });

});
