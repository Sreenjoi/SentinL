/**
 * Basic Load/Stress Test Script
 * This simulates 1,000 concurrent user messages to test the event loop and memory.
 * 
 * Usage: node tests/load/loadTest.js
 */

async function simulateLoad() {
    const totalConcurrent = 1000;
    console.log(`Starting Load Test: Simulating ${totalConcurrent} concurrent messages...`);

    const startTime = Date.now();
    let processed = 0;

    // Simulate async message processing (event loop strain)
    const tasks = Array.from({ length: totalConcurrent }).map(async (_, i) => {
        // Simulate minor async work and object creation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        const message = { id: `msg_${i}`, content: "test message", _size: new Array(500).fill(1) };
        processed++;
    });

    await Promise.all(tasks);

    const endTime = Date.now();
    console.log(`Load Test Complete: Processed ${processed} messages in ${endTime - startTime}ms`);
}

simulateLoad().catch(console.error);
