import { startEmailWorker } from './emailQueue';

// eslint-disable-next-line no-console
console.log('[worker] starting approval-email consumer…');
const worker = startEmailWorker();

worker.on('completed', (job) => {
  // eslint-disable-next-line no-console
  console.log(`[worker] sent ${String(job.id)}`);
});
worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] failed ${String(job?.id)}: ${err.message}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void worker.close().then(() => process.exit(0));
  });
}
