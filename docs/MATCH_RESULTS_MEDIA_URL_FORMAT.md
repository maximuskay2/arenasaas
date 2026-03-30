# Match Results `media_url` Format (Production / Railway MinIO)

We store “match results” as a **single strict `media_url` template** so the frontend can reliably detect the embed and extract `matchId` **without false positives**.

## Storage layout

- **bucket**: `arena-media`
- **prefix**: `match-results/v1/matches/`
- **matchId location**: **path segment** (not query params, not filename)
- **filename**: `manifest.json`

## Canonical URL template (path-style bucket)

```
https://<MINIO_PUBLIC_ORIGIN>/arena-media/match-results/v1/matches/<matchId>/manifest.json
```

### Example

```
https://media.example.com/arena-media/match-results/v1/matches/3b4c8f9e-2a1b-4c3d-9e10-11aa22bb33cc/manifest.json
```

## Frontend detection

The Community Hub match-results embed **only** triggers when `media_url` matches the canonical pathname above.

- **Extractor**: `src/lib/matchResultsMediaUrl.js` → `extractMatchIdFromMatchResultsMediaUrl(mediaUrl)`
- **Usage**: `src/pages/CommunityHub.jsx` (`MediaEmbed`)

## Notes

- This repo currently returns `data:` URLs in dev for `/api/integrations/upload`. That is fine; the match-results embed format is intended for production object storage URLs.
- The embed UI still fetches the match row via API using the extracted `matchId`. The object storage URL is used only as a **typed reference** for “this media is match results”.

