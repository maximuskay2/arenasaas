/**
 * Send OTP email for account verification
 * Railway env: OTP_EXPIRY_MINUTES, RESEND_API_KEY, MAIL_FROM, MAIL_FROM_NAME
 */

import { maxikay } from '../api/arenaClient.js';

export async function sendOtp(email) {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Invalid email' };
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();

    // Store OTP in database
    await maxikay.entities.OTPRecord.create({
      email,
      code: otpCode,
      expires_at: expiresAt,
      used: false,
    });

    // Send email via Resend integration
    const mailFrom = process.env.MAIL_FROM || 'noreply@arenasaas.com';
    const mailFromName = process.env.MAIL_FROM_NAME || 'ArenaSaaS';

    await maxikay.integrations.Core.SendEmail({
      to: email,
      subject: 'Your ArenaSaaS Verification Code',
      body: `Your verification code is: <strong>${otpCode}</strong>\n\nThis code expires in ${expiryMinutes} minutes.\n\nDo not share this code with anyone.`,
      from_name: mailFromName,
    });

    return {
      success: true,
      message: `OTP sent to ${email}`,
    };
  } catch (err) {
    console.error('[sendOtp] Error:', err.message);
    return {
      success: false,
      error: 'Failed to send OTP. Please try again.',
    };
  }
}