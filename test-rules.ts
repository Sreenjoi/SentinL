import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import { getDoc, doc, collection, getDocs, query, where } from 'firebase/firestore';

async function main() {
    let testEnv = await initializeTestEnvironment({
        projectId: 'ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f',
        firestore: {
            rules: fs.readFileSync('firestore.rules', 'utf8')
        }
    });

    // We must mock the moderators doc
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc('moderators/skybound1708@gmail.com').set({
        serverIds: ['1494768295356797040']
      });
      await adminDb.doc('servers/1494768295356797040').set({
        name: 'Test'
      });
      await adminDb.doc('flaggedMessages/123').set({
        serverId: '1494768295356797040',
        content: 'test'
      });
      console.log('Test data created');
    });

    const context = testEnv.authenticatedContext('skybound1708', {
        email: 'skybound1708@gmail.com',
        email_verified: true
    });

    const db = context.firestore() as any;
    
    try {
        const q = query(collection(db, 'flaggedMessages'), where('serverId', '==', '1494768295356797040'));
        const snap = await getDocs(q);
        console.log('flaggedMessages list SUCCESS, size:', snap.size);
    } catch(e) {
        console.log('flaggedMessages list FAILED', e.message);
    }
    
    await testEnv.cleanup();
}
main().catch(console.error);
