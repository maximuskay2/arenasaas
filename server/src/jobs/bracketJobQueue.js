/**
 * Bracket generation queue — in-process fallback + optional BullMQ when REDIS_URL is set.
 */
import IORedis from 'ioredis';

const memoryQueue = [];
let seq = 0;

/** @type {import('bullmq').Queue | null} */
let bullQueue = null;

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
}

async function getBullQueue() {
  if (!process.env.REDIS_URL) return null;
  if (bullQueue) return bullQueue;
  const connection = redisConnection();
  if (!connection) return null;
  const { Queue } = await import('bullmq');
  bullQueue = new Queue('bracket-jobs', { connection });
  return bullQueue;
}

/**
 * @param {object} payload
 * @returns {string | Promise<string>} job id
 */
export function enqueueBracketJob(payload = {}) {
  // Sync API for system routes — fire-and-forget BullMQ when available
  if (process.env.REDIS_URL) {
    const id = `bracket_bull_${++seq}_${Date.now()}`;
    void getBullQueue()
      .then((q) => {
        if (!q) {
          memoryQueue.push({ id, payload, enqueued_at: new Date().toISOString(), backend: 'memory' });
          return;
        }
        return q.add('generate', { ...payload, client_job_id: id }, {
          removeOnComplete: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });
      })
      .catch((e) => {
        console.warn('[bracketQueue] BullMQ enqueue failed, memory fallback', e?.message || e);
        memoryQueue.push({ id, payload, enqueued_at: new Date().toISOString(), backend: 'memory' });
      });
    return id;
  }
  const job = {
    id: `bracket_${++seq}`,
    payload,
    enqueued_at: new Date().toISOString(),
    backend: 'memory',
  };
  memoryQueue.push(job);
  return job.id;
}

export function bracketQueueDepth() {
  return memoryQueue.length;
}

export function drainBracketJobs(limit = 10) {
  return memoryQueue.splice(0, Math.min(limit, memoryQueue.length));
}

/** Optional worker: logs/drains memory jobs; BullMQ worker processes Redis queue. */
export function startBracketBullWorker() {
  if (!process.env.REDIS_URL || process.env.BRACKET_WORKER === '0') return;
  const connection = redisConnection();
  if (!connection) return;

  void import('bullmq').then(({ Worker }) => {
    const worker = new Worker(
      'bracket-jobs',
      async (job) => {
        // Generation is still invoked by tournament engine routes; this worker records intent for multi-instance ops.
        console.info('[bracketQueue] processed', job.id, job.data?.tournament_id || job.data?.client_job_id);
        return { ok: true, job_id: job.id, at: new Date().toISOString() };
      },
      { connection }
    );
    worker.on('failed', (job, err) => {
      console.error('[bracketQueue] job failed', job?.id, err?.message || err);
    });
    console.info('[bracketQueue] BullMQ worker started (queue bracket-jobs)');
  });
}
