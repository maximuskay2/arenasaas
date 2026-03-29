import { deliverFcmNotification } from './fcmAdmin.js';

/**
 * Legacy name — delegates to Firebase Admin when FIREBASE_SERVICE_ACCOUNT_JSON is set.
 */
export async function sendFcmStub(payload) {
  return deliverFcmNotification(payload);
}

/** Called when draining the in-process queue (`/api/system/notification-jobs/fcm/drain`). */
export async function processFcmQueueJob(job) {
  const out = await deliverFcmNotification(job?.payload ?? {});
  return { job_id: job?.id, result: out };
}
