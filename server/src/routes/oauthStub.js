import express from 'express';

const router = express.Router();

router.get('/:provider/start', (req, res) => {
  res.status(501).json({
    error: 'Game OAuth not configured (§6). Wire Steam/Riot callbacks and secrets.',
    provider: req.params.provider,
  });
});

router.get('/:provider/callback', (req, res) => {
  res.status(501).json({
    error: 'OAuth callback not configured',
    provider: req.params.provider,
  });
});

export default router;
