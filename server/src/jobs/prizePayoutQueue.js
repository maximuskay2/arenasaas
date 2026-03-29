/**
 * Prize payout jobs: BullMQ + Redis when REDIS_URL is set, otherwise in-process drain.
 */

const queue = [];
let seq = 0;
let scheduled = false;

function scheduleDrain() {
  if (scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    void drainOne();
  });
}

async function drainOne() {
  const job = queue.shift();
  if (!job) return;
  try {
    const { runTournamentPrizePayout } = await import('../lib/prizePayoutProcessor.js');
    await runTournamentPrizePayout(job.tournament_id, job.tenant_id);
  } catch (e) {
    console.error('[prizePayoutQueue]', job?.tournament_id, e);
  }
  if (queue.length) scheduleDrain();
}

/**
 * @param {{ tournament_id?: string, tenant_id?: string }} payload
 * @returns {Promise<string | null>}
 */
export async function enqueuePrizePayoutJob(payload = {}) {
  const tournament_id = String(payload.tournament_id || '').trim();
  const tenant_id = String(payload.tenant_id || '').trim();
  if (!tournament_id || !tenant_id) return null;

  if (process.env.REDIS_URL) {
    try {
      const mod = await import('./prizePayoutBullmq.js');
      const id = await mod.enqueuePrizePayoutJobBullmq({ tournament_id, tenant_id });
      if (id) return id;
    } catch (e) {
      console.error('[prizePayoutQueue] BullMQ unavailable, using in-process queue', e);
    }
  }

  const id = `prize_${++seq}`;
  queue.push({
    id,
    tournament_id,
    tenant_id,
    enqueued_at: new Date().toISOString(),
  });
  scheduleDrain();
  return id;
}

export function prizePayoutQueueDepth() {
  return queue.length;
}
