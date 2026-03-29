/**
 * Verify OTP code and mark email as verified
 * Railway env: None (uses OTPRecord entity)
 */

import { maxikay } from '../api/arenaClient.js';

export async function verifyOtp(email, code) {
  try {
    if (!email || !code) {
      return { success: false, error: 'Missing email or code' };
    }

    // Find valid OTP record
    const records = await maxikay.entities.OTPRecord.filter({
      email,
      code,
      used: false,
    }, '-created_date', 1);

    if (!records || records.length === 0) {
      return { success: false, error: 'Invalid or expired OTP' };
    }

    const otpRecord = records[0];

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);

    if (now > expiresAt) {
      // Mark as used so it can't be reused
      await maxikay.entities.OTPRecord.update(otpRecord.id, { used: true });
      return { success: false, error: 'OTP expired' };
    }

    // Mark OTP as used
    await maxikay.entities.OTPRecord.update(otpRecord.id, { used: true });

    return {
      success: true,
      message: 'Email verified successfully',
    };
  } catch (err) {
    console.error('[verifyOtp] Error:', err.message);
    return {
      success: false,
      error: 'Verification failed. Please try again.',
    };
  }
}