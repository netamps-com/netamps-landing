import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { ResendProvider } from '../services/mailer';

export interface ApprovalEmailJob {
  to: string;
  subject: string;
  html: string;
  pdfBase64?: string;
  pdfFilename?: string;
  idempotencyKey: string;
}

const QUEUE_NAME = 'crm-email';

let queue: Queue<ApprovalEmailJob> | null = null;

function getQueue(): Queue<ApprovalEmailJob> | null {
  if (!config.redisUrl) return null; // inline fallback (documented)
  if (!queue) {
    queue = new Queue<ApprovalEmailJob>(QUEUE_NAME, {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000 },
    });
  }
  return queue;
}

const defaultOpts = (job: ApprovalEmailJob): JobsOptions => ({ jobId: job.idempotencyKey });

/** Enqueue (BullMQ/Redis) or send inline when Redis is absent. Returns provider message id. */
export async function dispatchApprovalEmail(job: ApprovalEmailJob): Promise<{ id: string; queued: boolean }> {
  const q = getQueue();
  if (!q) {
    const provider = new ResendProvider();
    const sent = await provider.send({
      to: job.to,
      subject: job.subject,
      html: job.html,
      attachments: job.pdfBase64
        ? [{ filename: job.pdfFilename ?? 'document.pdf', contentBase64: job.pdfBase64, contentType: 'application/pdf' }]
        : [],
    });
    return { id: sent.id, queued: false };
  }
  const j = await q.add('approval-email', job, defaultOpts(job));
  return { id: String(j.id ?? job.idempotencyKey), queued: true };
}

/** Long-lived worker entrypoint (`npm run worker`). Idempotent via jobId. */
export function startEmailWorker(): Worker<ApprovalEmailJob> {
  if (!config.redisUrl) throw new Error('REDIS_URL required for the email worker');
  const provider = new ResendProvider();
  return new Worker<ApprovalEmailJob>(
    QUEUE_NAME,
    async (wjob) => {
      const j = wjob.data;
      await provider.send({
        to: j.to,
        subject: j.subject,
        html: j.html,
        attachments: j.pdfBase64
          ? [{ filename: j.pdfFilename ?? 'document.pdf', contentBase64: j.pdfBase64, contentType: 'application/pdf' }]
          : [],
      });
    },
    { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }) }
  );
}
