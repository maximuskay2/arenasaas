import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMatchResultsMediaUrl,
  extractMatchIdFromMatchResultsMediaUrl,
} from "./matchResultsMediaUrl.js";

test("extractMatchIdFromMatchResultsMediaUrl matches only canonical pathname", () => {
  const matchId = "3b4c8f9e-2a1b-4c3d-9e10-11aa22bb33cc";
  const url =
    "https://media.example.com/arena-media/match-results/v1/matches/" +
    matchId +
    "/manifest.json";

  assert.equal(extractMatchIdFromMatchResultsMediaUrl(url), matchId);

  // Wrong file name
  assert.equal(
    extractMatchIdFromMatchResultsMediaUrl(
      "https://media.example.com/arena-media/match-results/v1/matches/" + matchId + "/video.mp4"
    ),
    null
  );

  // Wrong prefix
  assert.equal(
    extractMatchIdFromMatchResultsMediaUrl(
      "https://media.example.com/arena-media/uploads/matches/" + matchId + "/manifest.json"
    ),
    null
  );

  // Previously-accepted broad patterns should NOT match anymore
  assert.equal(extractMatchIdFromMatchResultsMediaUrl("match://" + matchId), null);
  assert.equal(extractMatchIdFromMatchResultsMediaUrl("https://app.example.com/matches/" + matchId), null);
  assert.equal(extractMatchIdFromMatchResultsMediaUrl("https://app.example.com/?matchId=" + matchId), null);
});

test("buildMatchResultsMediaUrl builds the canonical template", () => {
  const out = buildMatchResultsMediaUrl({
    publicOrigin: "https://media.example.com/",
    bucket: "arena-media",
    matchId: "3b4c8f9e-2a1b-4c3d-9e10-11aa22bb33cc",
  });
  assert.equal(
    out,
    "https://media.example.com/arena-media/match-results/v1/matches/3b4c8f9e-2a1b-4c3d-9e10-11aa22bb33cc/manifest.json"
  );
});

