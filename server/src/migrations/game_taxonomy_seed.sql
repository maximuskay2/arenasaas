-- Idempotent taxonomy: templates, platforms, genres, titles, platform links.
-- Re-runnable via ON CONFLICT. Refreshes platform links for all seeded titles.

INSERT INTO game_genre_templates (
  slug, name, rules_summary, default_team_roster_size, min_team_size, max_team_size,
  suggested_format, competition_scoring_type, match_scoring_mode, swiss_recommended, sort_order
) VALUES
  ('fps_moba', 'FPS / MOBA',
   'Round-based team rounds; win/loss elimination brackets. Default 5v5 style.', 5, 2, 6,
   'single_elimination', 'bracket', 'best_of_1', FALSE, 10),
  ('battle_royale', 'Battle Royale',
   'Placement and elimination/kill points; squad sizes typically 1–4.', 3, 1, 4,
   'single_elimination', 'points', 'points', FALSE, 20),
  ('fighting_sports', 'Fighting / solo duels',
   'Best-of sets; 1v1 brackets or double elimination.', 1, 1, 1,
   'double_elimination', 'bracket', 'best_of_3', FALSE, 30),
  ('ccg_rts', 'CCG / RTS / auto-battler',
   'Match win/loss; Swiss rounds common for deck and strategy titles.', 1, 1, 1,
   'swiss', 'bracket', 'best_of_1', TRUE, 40),
  ('sports_team', 'Team sports (sim)',
   'Bracket or league play with configurable team rosters.', 5, 2, 11,
   'single_elimination', 'bracket', 'best_of_1', FALSE, 50),
  ('ladder_points', 'Ladder / leaderboard',
   'Runs, scores, or routines accumulated over a schedule or ladder.', 1, 1, 8,
   'round_robin', 'points', 'points', FALSE, 60)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  rules_summary = EXCLUDED.rules_summary,
  default_team_roster_size = EXCLUDED.default_team_roster_size,
  min_team_size = EXCLUDED.min_team_size,
  max_team_size = EXCLUDED.max_team_size,
  suggested_format = EXCLUDED.suggested_format,
  competition_scoring_type = EXCLUDED.competition_scoring_type,
  match_scoring_mode = EXCLUDED.match_scoring_mode,
  swiss_recommended = EXCLUDED.swiss_recommended,
  sort_order = EXCLUDED.sort_order;

INSERT INTO game_platforms (slug, name, sort_order) VALUES
  ('mobile', 'Mobile', 10),
  ('pc', 'PC', 20),
  ('pc_console', 'PC / Console', 25),
  ('console', 'Console', 30),
  ('vr', 'VR', 40),
  ('handheld', 'Handheld', 50),
  ('arcade', 'Arcade', 60)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

INSERT INTO game_genres (slug, name, default_roster_size, sort_order) VALUES
  ('tactical_fps', 'Tactical FPS', 5, 10),
  ('hero_shooter', 'Hero Shooter', 5, 15),
  ('moba', 'MOBA', 5, 20),
  ('battle_royale', 'Battle Royale', 3, 30),
  ('fighting_fgc', 'Fighting (FGC)', 1, 40),
  ('platform_fighter', 'Platform Fighter', 1, 45),
  ('sports_sim', 'Sports Sim', 5, 50),
  ('sim_racing', 'Sim Racing', 1, 55),
  ('physics_sports', 'Physics Sports', 3, 58),
  ('ccg', 'CCG / Deck games', 1, 60),
  ('auto_battler', 'Auto-battler', 1, 65),
  ('rts', 'RTS', 1, 70),
  ('brawl_arena', 'Arena Brawler', 3, 75),
  ('rhythm', 'Rhythm', 1, 80),
  ('speedrunning', 'Speedrunning', 1, 85),
  ('shooter', 'Shooter (legacy)', 4, 95),
  ('card_strategy', 'Card / Strategy (legacy)', 1, 96),
  ('racing', 'Racing (legacy)', 1, 97)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  default_roster_size = EXCLUDED.default_roster_size,
  sort_order = EXCLUDED.sort_order;

INSERT INTO game_titles (
  genre_id, genre_template_id, slug, name, source,
  suggested_format, competition_scoring_type, match_scoring_mode,
  default_team_roster_size, require_in_game_id
)
SELECT g.id, gt.id, v.slug, v.name, 'seeded', v.sf, v.cst, v.msm, v.roster, v.rign
FROM (VALUES
  -- Tactical & hero shooters
  ('valorant', 'tactical_fps', 'fps_moba', 'Valorant', 'single_elimination', 'bracket', 'best_of_1', 5, TRUE),
  ('cs2', 'tactical_fps', 'fps_moba', 'Counter-Strike 2', 'single_elimination', 'bracket', 'best_of_1', 5, TRUE),
  ('rainbow-six-siege', 'tactical_fps', 'fps_moba', 'Tom Clancy''s Rainbow Six Siege', 'single_elimination', 'bracket', 'best_of_1', 5, TRUE),
  ('call-of-duty', 'tactical_fps', 'fps_moba', 'Call of Duty (competitive)', 'single_elimination', 'bracket', 'best_of_1', 5, TRUE),
  ('overwatch-2', 'hero_shooter', 'fps_moba', 'Overwatch 2', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('marvel-rivals', 'hero_shooter', 'fps_moba', 'Marvel Rivals', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('paladins', 'hero_shooter', 'fps_moba', 'Paladins', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  -- BR
  ('apex-legends', 'battle_royale', 'battle_royale', 'Apex Legends', 'single_elimination', 'points', 'points', 3, FALSE),
  ('fortnite', 'battle_royale', 'battle_royale', 'Fortnite', 'single_elimination', 'points', 'points', 3, FALSE),
  ('warzone', 'battle_royale', 'battle_royale', 'Call of Duty: Warzone', 'single_elimination', 'points', 'points', 3, FALSE),
  ('pubg-mobile', 'battle_royale', 'battle_royale', 'PUBG Mobile', 'single_elimination', 'points', 'points', 4, TRUE),
  ('free-fire', 'battle_royale', 'battle_royale', 'Garena Free Fire', 'single_elimination', 'points', 'points', 4, TRUE),
  ('cod-mobile', 'battle_royale', 'battle_royale', 'Call of Duty: Mobile (Battle Royale)', 'single_elimination', 'points', 'points', 4, TRUE),
  ('farlight-84', 'battle_royale', 'battle_royale', 'Farlight 84', 'single_elimination', 'points', 'points', 4, TRUE),
  -- MOBA
  ('league-of-legends', 'moba', 'fps_moba', 'League of Legends', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('dota-2', 'moba', 'fps_moba', 'Dota 2', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('smite', 'moba', 'fps_moba', 'Smite', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('mlbb', 'moba', 'fps_moba', 'Mobile Legends: Bang Bang', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('honor-of-kings', 'moba', 'fps_moba', 'Honor of Kings', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('wild-rift', 'moba', 'fps_moba', 'League of Legends: Wild Rift', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  ('pokemon-unite', 'moba', 'fps_moba', 'Pokémon UNITE', 'single_elimination', 'bracket', 'best_of_3', 5, TRUE),
  -- Fighting
  ('tekken-8', 'fighting_fgc', 'fighting_sports', 'Tekken 8', 'double_elimination', 'bracket', 'best_of_3', 1, FALSE),
  ('street-fighter-6', 'fighting_fgc', 'fighting_sports', 'Street Fighter 6', 'double_elimination', 'bracket', 'best_of_3', 1, FALSE),
  ('mortal-kombat-1', 'fighting_fgc', 'fighting_sports', 'Mortal Kombat 1', 'double_elimination', 'bracket', 'best_of_3', 1, FALSE),
  ('guilty-gear-strive', 'fighting_fgc', 'fighting_sports', 'Guilty Gear -Strive-', 'double_elimination', 'bracket', 'best_of_3', 1, FALSE),
  ('super-smash-bros-ultimate', 'platform_fighter', 'fighting_sports', 'Super Smash Bros. Ultimate', 'double_elimination', 'bracket', 'best_of_3', 1, FALSE),
  ('multiversus', 'platform_fighter', 'fighting_sports', 'MultiVersus', 'double_elimination', 'bracket', 'best_of_3', 2, FALSE),
  ('brawlhalla', 'platform_fighter', 'fighting_sports', 'Brawlhalla', 'double_elimination', 'bracket', 'best_of_3', 2, FALSE),
  -- Sports / racing / physics
  ('ea-fc-26', 'sports_sim', 'sports_team', 'EA Sports FC 26', 'single_elimination', 'bracket', 'best_of_1', 5, FALSE),
  ('nba-2k26', 'sports_sim', 'sports_team', 'NBA 2K26', 'single_elimination', 'bracket', 'best_of_1', 5, FALSE),
  ('madden-nfl-26', 'sports_sim', 'sports_team', 'Madden NFL 26', 'single_elimination', 'bracket', 'best_of_1', 5, FALSE),
  ('iracing', 'sim_racing', 'fighting_sports', 'iRacing', 'double_elimination', 'bracket', 'best_of_1', 1, FALSE),
  ('assetto-corsa-competizione', 'sim_racing', 'fighting_sports', 'Assetto Corsa Competizione', 'double_elimination', 'bracket', 'best_of_1', 1, FALSE),
  ('f1-24', 'sim_racing', 'fighting_sports', 'F1 24', 'double_elimination', 'bracket', 'best_of_1', 1, FALSE),
  ('gran-turismo-7', 'sim_racing', 'fighting_sports', 'Gran Turismo 7', 'double_elimination', 'bracket', 'best_of_1', 1, FALSE),
  ('rocket-league', 'physics_sports', 'sports_team', 'Rocket League', 'double_elimination', 'bracket', 'best_of_1', 3, FALSE),
  ('rocket-league-sideswipe', 'physics_sports', 'sports_team', 'Rocket League Sideswipe', 'double_elimination', 'bracket', 'best_of_1', 2, FALSE),
  -- CCG / auto-battler / RTS
  ('hearthstone', 'ccg', 'ccg_rts', 'Hearthstone', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('mtg-arena', 'ccg', 'ccg_rts', 'Magic: The Gathering Arena', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('yugioh-master-duel', 'ccg', 'ccg_rts', 'Yu-Gi-Oh! Master Duel', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('teamfight-tactics', 'auto_battler', 'ccg_rts', 'Teamfight Tactics', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('dota-underlords', 'auto_battler', 'ccg_rts', 'Dota Underlords', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('starcraft-ii', 'rts', 'ccg_rts', 'StarCraft II', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('age-of-empires-iv', 'rts', 'ccg_rts', 'Age of Empires IV', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  ('stormgate', 'rts', 'ccg_rts', 'Stormgate', 'swiss', 'bracket', 'best_of_1', 1, TRUE),
  -- Other
  ('brawl-stars', 'brawl_arena', 'fps_moba', 'Brawl Stars', 'single_elimination', 'bracket', 'best_of_3', 3, TRUE),
  ('just-dance', 'rhythm', 'ladder_points', 'Just Dance', 'round_robin', 'points', 'points', 2, FALSE),
  ('osu', 'rhythm', 'ladder_points', 'osu!', 'round_robin', 'points', 'points', 1, FALSE),
  ('beat-saber', 'rhythm', 'ladder_points', 'Beat Saber', 'round_robin', 'points', 'points', 1, FALSE),
  ('speedrunning-any-title', 'speedrunning', 'ladder_points', 'Speedrunning (any title)', 'round_robin', 'points', 'points', 1, FALSE)
) AS v(slug, genre_slug, template_slug, name, sf, cst, msm, roster, rign)
INNER JOIN game_genres g ON g.slug = v.genre_slug
INNER JOIN game_genre_templates gt ON gt.slug = v.template_slug
ON CONFLICT (slug) DO UPDATE SET
  genre_id = EXCLUDED.genre_id,
  genre_template_id = EXCLUDED.genre_template_id,
  name = EXCLUDED.name,
  source = 'seeded',
  suggested_format = EXCLUDED.suggested_format,
  competition_scoring_type = EXCLUDED.competition_scoring_type,
  match_scoring_mode = EXCLUDED.match_scoring_mode,
  default_team_roster_size = EXCLUDED.default_team_roster_size,
  require_in_game_id = EXCLUDED.require_in_game_id;

DELETE FROM game_title_platforms gtp
USING game_titles t
WHERE gtp.title_id = t.id AND t.source = 'seeded';

INSERT INTO game_title_platforms (title_id, platform_id)
SELECT t.id, p.id
FROM game_titles t
INNER JOIN (VALUES
  ('valorant', 'pc'),
  ('cs2', 'pc'),
  ('rainbow-six-siege', 'pc'),
  ('call-of-duty', 'pc_console'),
  ('overwatch-2', 'pc_console'),
  ('marvel-rivals', 'pc_console'),
  ('paladins', 'pc_console'),
  ('apex-legends', 'pc_console'),
  ('fortnite', 'pc_console'),
  ('warzone', 'pc_console'),
  ('pubg-mobile', 'mobile'),
  ('free-fire', 'mobile'),
  ('cod-mobile', 'mobile'),
  ('farlight-84', 'mobile'),
  ('league-of-legends', 'pc'),
  ('dota-2', 'pc'),
  ('smite', 'pc_console'),
  ('mlbb', 'mobile'),
  ('honor-of-kings', 'mobile'),
  ('wild-rift', 'mobile'),
  ('pokemon-unite', 'mobile'),
  ('tekken-8', 'pc_console'),
  ('street-fighter-6', 'pc_console'),
  ('mortal-kombat-1', 'pc_console'),
  ('guilty-gear-strive', 'pc_console'),
  ('super-smash-bros-ultimate', 'console'),
  ('multiversus', 'pc_console'),
  ('brawlhalla', 'pc_console'),
  ('ea-fc-26', 'pc_console'),
  ('nba-2k26', 'pc_console'),
  ('madden-nfl-26', 'pc_console'),
  ('iracing', 'pc'),
  ('assetto-corsa-competizione', 'pc_console'),
  ('f1-24', 'pc_console'),
  ('gran-turismo-7', 'console'),
  ('rocket-league', 'pc_console'),
  ('rocket-league-sideswipe', 'mobile'),
  ('hearthstone', 'pc'),
  ('hearthstone', 'mobile'),
  ('mtg-arena', 'pc'),
  ('mtg-arena', 'mobile'),
  ('yugioh-master-duel', 'pc'),
  ('yugioh-master-duel', 'mobile'),
  ('teamfight-tactics', 'pc'),
  ('teamfight-tactics', 'mobile'),
  ('dota-underlords', 'pc'),
  ('dota-underlords', 'mobile'),
  ('starcraft-ii', 'pc'),
  ('age-of-empires-iv', 'pc_console'),
  ('stormgate', 'pc'),
  ('brawl-stars', 'mobile'),
  ('just-dance', 'pc_console'),
  ('osu', 'pc'),
  ('beat-saber', 'vr'),
  ('speedrunning-any-title', 'pc_console')
) AS x(title_slug, platform_slug)
  ON t.slug = x.title_slug
INNER JOIN game_platforms p ON p.slug = x.platform_slug
ON CONFLICT DO NOTHING;
