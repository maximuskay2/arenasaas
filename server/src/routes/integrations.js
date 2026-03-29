import express from 'express';
import multer from 'multer';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { sendPlatformEmail } from '../mail/sendPlatformEmail.js';
import { clientSafeErrorMessage } from '../clientSafeError.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** Public upload for tenant registration (returns data URL in dev). */
router.post('/upload', optionalAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const b64 = req.file.buffer.toString('base64');
  const mime = req.file.mimetype || 'application/octet-stream';
  res.json({
    file_url: `data:${mime};base64,${b64}`,
    message: 'Local dev: data URL returned; replace with S3/R2 in production',
  });
});

router.post('/send-email', requireAuth, async (req, res) => {
  const { to, subject, template, meta, body: htmlBody } = req.body || {};
  const toAddr = String(to || '').trim();
  if (!toAddr) return res.status(400).json({ error: 'to required' });
  try {
    const result = await sendPlatformEmail({
      to: toAddr,
      subject: String(subject || 'Notification'),
      body: htmlBody != null ? String(htmlBody) : template ? `${template} ${JSON.stringify(meta || {})}` : '(no body)',
    });
    res.json({
      success: true,
      queued: !result?.stub,
      result,
    });
  } catch (e) {
    console.error('[send-email]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
