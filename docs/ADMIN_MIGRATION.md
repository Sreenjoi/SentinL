# Admin Migration Note

The application no longer hardcodes a super admin email address in code and Firestore rules. Instead, it checks for the existence of the user's UID in the \`admins\` Firestore collection.

**Migration for Current Admin (srinjoymahato9@gmail.com):**
1. Log in to the application at least once so your UID is created in Firebase Auth.
2. In the Firebase Console, navigate to Firestore Database.
3. Create a collection named \`admins\`.
4. Create a document in this collection where the **Document ID** is your exact Firebase **UID** (not email).
5. You may leave the document empty or add \`{ migrated: true }\`.

Your super admin capabilities will now unlock via this secure \`admins/{uid}\` lookup, keeping lists of admins private and portable.
