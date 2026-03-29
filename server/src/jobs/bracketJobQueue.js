/**
 * In-process bracket generation queue (§5.5 stub). Replace with BullMQ/SQS for multi-instance.
 */
const queue = [];
let seq = 0;

export function enqueueBracketJob(payload = {}) {
  const job = { id: `bracket_${++seq}`, payload, enqueued_at: new Date().toISOString() };
  queue.push(job);
  return job.id;
}

export function bracketQueueDepth() {
  return queue.length;
}

export function drainBracketJobs(limit = 10) {
  return queue.splice(0, Math.min(limit, queue.length));
}
