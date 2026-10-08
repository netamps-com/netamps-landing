export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const { sessionId, ownerEmail, rows } = msg.body;

        if (!sessionId || !rows || !Array.isArray(rows)) {
          msg.ack();
          continue;
        }

        // D1 batches for performance
        const stmt = env.DB.prepare('INSERT INTO intake_assets (session_id, row_no, data) VALUES (?, ?, ?) ON CONFLICT(session_id, row_no) DO UPDATE SET data=excluded.data');
        const d1Batch = rows.map((row, idx) => stmt.bind(sessionId, idx, JSON.stringify(row)));
        
        if (d1Batch.length > 0) {
          // max batch size for D1 is 100, chunk it if large
          for (let i = 0; i < d1Batch.length; i += 100) {
            await env.DB.batch(d1Batch.slice(i, i + 100));
          }
        }
        
        // Acknowledge the message once successfully processed
        msg.ack();
      } catch (err) {
        console.error('Error processing intake queue message:', err);
        // Retry the message if it fails
        msg.retry();
      }
    }
  }
};
