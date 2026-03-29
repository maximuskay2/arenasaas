/**
 * Optional BullMQ + Redis queue for prize payout jobs.
 * Set REDIS_URL. Run the worker in this API process unless PRIZE_PAYOUT_WORKER=0.
 * For multiple API instances, enable the worker on only one process.
 */

import IORedis from 'ioredis';

/** @type {import('bullmq').Queue | null} */
let queueInstance = null;

function connectionOpts() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export async function getPrizePayoutQueue() {
  if (!process.env.REDIS_URL) return null;
  if (queueInstance) return queueInstance;
  const connection = connectionOpts();
  if (!connection) return null;
  const { Queue } = await import('bullmq');
  queueInstance = new Queue('prize-payout', { connection });
  return queueInstance;
}

/**
 * @param {{ tournament_id: string, tenant_id: string }} payload
 * @returns {Promise<string | null>} job id
 */
export async function enqueuePrizePayoutJobBullmq(payload) {
  const q = await getPrizePayoutQueue();
  if (!q) return null;
  const job = await q.add(
    'run',
    { tournament_id: payload.tournament_id, tenant_id: payload.tenant_id },
    { removeOnComplete: 50, attempts: 3, backoff: { type: 'exponential', delay: 3000 } }
  );
  return job.id ? String(job.id) : null;
}

export function startPrizePayoutBullWorker() {
  if (!process.env.REDIS_URL || process.env.PRIZE_PAYOUT_WORKER === '0') return;
  const connection = connectionOpts();
  if (!connection) return;

  void import('bullmq').then(async ({ Worker }) => {
    const worker = new Worker(
      'prize-payout',
      async (job) => {
        const { runTournamentPrizePayout } = await import('../lib/prizePayoutProcessor.js');
        await runTournamentPrizePayout(job.data.tournament_id, job.data.tenant_id);
      },
      { connection }
    );
    worker.on('failed', (job, err) => {
      const data = job?.data;
      console.error(
        '[prizePayout BullMQ] job failed (dead-letter after max attempts)',
        job?.id,
        data?.tournament_id,
        data?.tenant_id,
        err?.message || err
      );
    });
    console.info('[prizePayout] BullMQ worker started (queue prize-payout)');
  });
}
