# Security Specification: SentinL Dashboard

## Data Invariants
1. A moderator can only access servers that are in their `serverIds` list in `moderators/{email}`.
2. Flagged messages must always be associated with a valid `serverId`.
3. Custom rules belong to a server and can only be managed by its authorized moderators.
4. Offenders data is a subcollection of a server and is restricted to that server's moderators.
5. Training data must identify the moderator who provided the feedback (`trainedBy`).
6. Subscriptions can be account-level (linked to `userId`) or server-level (linked to `serverId`).

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to overwrite `moderators/another@user.com` with a new `serverIds` list.
2. **Privilege Escalation**: Attempt to add a server ID to one's own `serverIds` list in `moderators/{email}` without going through the Discord OAuth flow.
3. **Cross-Server Data Leak**: Attempt to read `flaggedMessages` where `serverId` is a server the moderator doesn't belong to.
4. **Invalid ID Injection**: Attempt to create a rule with a 2KB junk string as the `ruleId`.
5. **State Shortcut**: Attempt to update a `flaggedMessage` status from `pending` to `resolved` while *also* changing the `content` field.
6. **Orphaned Message Creation**: Attempt to create a `flaggedMessage` with a non-existent `serverId`.
7. **Timestamp Spoofing**: Attempt to create a rule with a `createdAt` date in the future (client-provided).
8. **Shadow Field Injection**: Attempt to create a `ServerSettings` document with an extra secret field `isAdmin: true`.
9. **PII Leak**: Attempt to read the entire `moderators` collection via an unfiltered list query.
10. **Subscription Hijacking**: Attempt to update another user's account subscription (`subscriptions/{userId}`).
11. **Denial of Wallet (ID Injection)**: Attempt to create thousands of `training` documents with very large IDs.
12. **Immutability Breach**: Attempt to change the `originalOwnerId` or `createdAt` of a server setting.

## Test Runner (Logic Verification)

I will generate `firestore.rules.test.ts` to verify these constraints. (Note: In this environment, we execute rules via `deploy_firebase` and verify via app logic, but I will provide the test logic here).

```typescript
// firestore.rules.test.ts logic
// 1. moderators/{email} read should fail if auth.email != email
// 2. flaggedMessages read should fail if serverId not in user.serverIds
// 3. flaggedMessages update should fail if fields other than ['status', 'actionTaken'] are changed
// 4. training create should fail if trainedBy != auth.email
// ...
```
