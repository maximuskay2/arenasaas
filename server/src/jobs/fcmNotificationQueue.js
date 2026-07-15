/**
 * In-process FCM job queue. When FIREBASE_SERVICE_ACCOUNT_JSON is set, jobs auto-drain.
 * For multi-instance, prefer calling deliver from workers; depth APIs remain for Central Station.
 */
import { processFcmQueueJob } from '../notifications/fcmStub.js';

const queue = [];
let seq = 0;
let draining = false;

export function enqueueFcmNotificationJob(payload = {}) {
  const job = {
    id: `fcm_${++seq}`,
    payload,
    enqueued_at: new Date().toISOString(),
  };
  queue.push(job);
  // Auto-deliver on next tick (no manual drain required for join/prize).
  if (process.env.FCM_AUTO_DRAIN !== '0') {
    setImmediate(() => {
      void autoDrainFcmQueue();
    });
  }
  return job.id;
}

export function fcmNotificationQueueDepth() {
  return queue.length;
}

export function drainFcmNotificationJobs(limit = 20) {
  return queue.splice(0, Math.min(Math.max(1, limit), queue.length));
}

export async function autoDrainFcmQueue(limit = 50) {
  if (draining) return [];
  draining = true;
  const results = [];
  try {
    const jobs = drainFcmNotificationJobs(limit);
    for (const job of jobs) {
      try {
        results.push(await processFcmQueueJob(job));
      } catch (e) {
        results.push({ job_id: job?.id, error: e?.message || String(e) });
      }
    }
  } finally {
    draining = false;
    if (queue.length && process.env.FCM_AUTO_DRAIN !== '0') {
      setImmediate(() => {
        void autoDrainFcmQueue();
      });
    }
  }
  return results;
}
