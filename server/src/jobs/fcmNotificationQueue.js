/**
 * In-process FCM job queue (§7.2 stub). Replace with Redis/BullMQ + Firebase Admin worker.
 */
const queue = [];
let seq = 0;

export function enqueueFcmNotificationJob(payload = {}) {
  const job = {
    id: `fcm_${++seq}`,
    payload,
    enqueued_at: new Date().toISOString(),
  };
  queue.push(job);
  return job.id;
}

export function fcmNotificationQueueDepth() {
  return queue.length;
}

export function drainFcmNotificationJobs(limit = 20) {
  return queue.splice(0, Math.min(Math.max(1, limit), queue.length));
}
