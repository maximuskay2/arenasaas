import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'bracket_screen.dart';
import 'login_screen.dart';
import 'match_center_screen.dart';
import 'match_lobby_screen.dart';
import 'organizer/bracket_tools_screen.dart';
import 'report_score_screen.dart';
import 'team_profile_screen.dart';

class _RosterSlot {
  final email = TextEditingController();
  final name = TextEditingController();
  final gameId = TextEditingController();
  void dispose() {
    email.dispose();
    name.dispose();
    gameId.dispose();
  }
}

/// Full tournament surface: overview, join, teams, matches, pick'em, streams, lobby/finalize.
class TournamentDetailScreen extends StatefulWidget {
  const TournamentDetailScreen({super.key, required this.tournamentId});
  final String tournamentId;

  @override
  State<TournamentDetailScreen> createState() => _TournamentDetailScreenState();
}

class _TournamentDetailScreenState extends State<TournamentDetailScreen> with SingleTickerProviderStateMixin {
  Map<String, dynamic>? t;
  List<dynamic> teams = [];
  List<dynamic> matches = [];
  List<dynamic> streams = [];
  Map<String, dynamic>? pickem;
  bool loading = true;
  String? error;
  bool joining = false;
  String joinMode = 'solo';
  String payProvider = 'dev';
  late TabController tabs;

  final gameIdCtrl = TextEditingController();
  final regionCtrl = TextEditingController(text: 'global');
  final teamNameCtrl = TextEditingController();
  final tagCtrl = TextEditingController();
  final List<_RosterSlot> rosterSlots = [];
  final streamLabel = TextEditingController(text: 'Main');
  final streamUrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    tabs = TabController(length: 5, vsync: this);
    _load();
  }

  @override
  void dispose() {
    tabs.dispose();
    gameIdCtrl.dispose();
    regionCtrl.dispose();
    teamNameCtrl.dispose();
    tagCtrl.dispose();
    streamLabel.dispose();
    streamUrl.dispose();
    for (final s in rosterSlots) {
      s.dispose();
    }
    super.dispose();
  }

  int get rosterSize {
    final r = t?['team_roster_size'] ?? t?['roster_size'];
    final n = int.tryParse('$r') ?? 1;
    return n < 1 ? 1 : n;
  }

  bool get requiresPayment {
    if (t == null) return false;
    final fee = num.tryParse('${t!['entry_fee'] ?? 0}') ?? 0;
    final type = '${t!['entry_type'] ?? ''}'.toUpperCase();
    if (type == 'FREE') return false;
    return fee > 0 || type == 'PAID';
  }

  void _ensureRosterSlots() {
    final need = joinMode == 'team' && rosterSize > 1 ? rosterSize - 1 : 0;
    while (rosterSlots.length < need) {
      rosterSlots.add(_RosterSlot());
    }
    while (rosterSlots.length > need) {
      rosterSlots.removeLast().dispose();
    }
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    final api = context.read<ApiClient>();
    try {
      Map<String, dynamic> row;
      try {
        row = await api.publicTournament(widget.tournamentId);
      } catch (_) {
        row = await api.tournament(widget.tournamentId);
      }
      List<dynamic> teamList = [];
      List<dynamic> matchList = [];
      List<dynamic> streamList = [];
      Map<String, dynamic>? pick;
      try {
        teamList = await api.publicTournamentTeams(widget.tournamentId);
      } catch (_) {
        try {
          teamList = await api.listTeams(tournamentId: widget.tournamentId);
        } catch (_) {}
      }
      try {
        matchList = await api.publicTournamentMatches(widget.tournamentId);
      } catch (_) {
        try {
          matchList = await api.listMatches(tournamentId: widget.tournamentId);
        } catch (_) {}
      }
      try {
        streamList = await api.listStreams(widget.tournamentId);
      } catch (_) {}
      try {
        pick = await api.getPickem(
          widget.tournamentId,
          tenantOverride: row['tenant_id']?.toString(),
        );
      } catch (_) {}

      setState(() {
        t = row;
        teams = teamList;
        matches = matchList;
        streams = streamList;
        pickem = pick;
        if (rosterSize > 1) joinMode = 'team';
        _ensureRosterSlots();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<bool> _ensureAuth() async {
    final auth = context.read<AuthState>();
    if (auth.isLoggedIn) return true;
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
    return ok == true;
  }

  Future<Map<String, dynamic>?> _paymentProof() async {
    if (!requiresPayment) return null;
    final api = context.read<ApiClient>();
    final tid = widget.tournamentId;
    if (payProvider == 'wallet') {
      return {'method': 'wallet', 'provider': 'wallet', 'reference': 'wallet'};
    }
    if (payProvider == 'dev') {
      final sim = await api.devSimulateEntry(tid);
      final ref = sim['reference']?.toString();
      if (ref == null) throw ApiException(500, 'No dev reference');
      return {'provider': 'dev', 'reference': ref};
    }
    Map<String, dynamic> init;
    String? url;
    String? ref;
    if (payProvider == 'stripe') {
      init = await api.createStripeCheckout(tournamentId: tid);
      url = init['url']?.toString();
      ref = init['id']?.toString();
    } else if (payProvider == 'paystack') {
      init = await api.paystackInitialize(tournamentId: tid);
      url = init['authorization_url']?.toString() ?? init['data']?['authorization_url']?.toString();
      ref = init['reference']?.toString() ?? init['data']?['reference']?.toString();
    } else {
      init = await api.flutterwaveInitialize(tournamentId: tid);
      url = init['link']?.toString() ?? init['data']?['link']?.toString();
      ref = init['tx_ref']?.toString() ?? init['data']?['tx_ref']?.toString();
    }
    if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (ref == null) throw ApiException(400, 'No payment reference');
    return {'provider': payProvider, 'reference': ref};
  }

  Future<void> _join() async {
    if (!await _ensureAuth()) return;
    if (!mounted) return;
    final api = context.read<ApiClient>();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => joining = true);
    try {
      final proof = await _paymentProof();
      List<Map<String, dynamic>>? roster;
      if (joinMode == 'team' && rosterSize > 1) {
        roster = [];
        for (var i = 0; i < rosterSlots.length; i++) {
          final s = rosterSlots[i];
          final email = s.email.text.trim().toLowerCase();
          final gid = s.gameId.text.trim();
          if (email.isEmpty) throw ApiException(400, 'Teammate ${i + 1} email required');
          if (gid.isEmpty) throw ApiException(400, 'Teammate ${i + 1} game ID required');
          roster.add({
            'player_email': email,
            'player_name': s.name.text.trim().isEmpty ? email.split('@').first : s.name.text.trim(),
            'game_id': gid,
          });
        }
        if (teamNameCtrl.text.trim().isEmpty || tagCtrl.text.trim().isEmpty) {
          throw ApiException(400, 'Team name and tag required');
        }
      }
      await api.joinTournament(
        widget.tournamentId,
        mode: joinMode,
        teamName: joinMode == 'team' ? teamNameCtrl.text.trim() : null,
        tag: joinMode == 'team' ? tagCtrl.text.trim() : null,
        gameId: gameIdCtrl.text.trim().isEmpty ? null : gameIdCtrl.text.trim(),
        roster: roster,
        region: regionCtrl.text.trim().isEmpty ? null : regionCtrl.text.trim(),
        paymentProof: proof,
        idempotencyKey: const Uuid().v4(),
      );
      messenger.showSnackBar(const SnackBar(content: Text('Joined')));
      await _load();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => joining = false);
    }
  }

  Future<void> _watchlistToggle() async {
    if (!await _ensureAuth()) return;
    try {
      await context.read<ApiClient>().watchlistAdd(widget.tournamentId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Added to watchlist')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _finalize() async {
    try {
      await context.read<ApiClient>().finalizeTournament(widget.tournamentId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Finalize enqueued')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _addStream() async {
    if (streamUrl.text.trim().isEmpty) return;
    try {
      await context.read<ApiClient>().addStream(widget.tournamentId, {
        'label': streamLabel.text.trim().isEmpty ? 'Stream' : streamLabel.text.trim(),
        'stream_url': streamUrl.text.trim(),
        'is_primary': streams.isEmpty,
      });
      streamUrl.clear();
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _savePick(String matchId, String teamId) async {
    final current = Map<String, dynamic>.from(pickem?['prediction']?['bracket_picks'] as Map? ?? {});
    current[matchId] = teamId;
    try {
      await context.read<ApiClient>().putPickem(
            widget.tournamentId,
            current,
            tenantOverride: t?['tenant_id']?.toString(),
          );
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: LoadingBody(label: 'Loading tournament…'));
    if (error != null || t == null) {
      return Scaffold(
        appBar: AppBar(),
        body: EmptyState(message: error ?? 'Not found', actionLabel: 'Retry', onAction: _load),
      );
    }
    final name = '${t!['name'] ?? 'Tournament'}';
    final status = '${t!['status'] ?? ''}';
    final open = status == 'registration_open';
    final auth = context.watch<AuthState>();

    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        actions: [
          IconButton(
            tooltip: 'Bracket',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => BracketScreen(tournamentId: widget.tournamentId, tournamentName: name),
              ),
            ),
            icon: const Icon(Icons.account_tree_outlined),
          ),
          if (auth.isLeagueHost)
            IconButton(
              tooltip: 'Bracket tools',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => BracketToolsScreen(
                    tournamentId: widget.tournamentId,
                    tournamentName: name,
                  ),
                ),
              ),
              icon: const Icon(Icons.build_circle_outlined),
            ),
          IconButton(onPressed: _watchlistToggle, icon: const Icon(Icons.bookmark_add_outlined)),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
        bottom: TabBar(
          controller: tabs,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Teams'),
            Tab(text: 'Matches'),
            Tab(text: "Pick'Em"),
            Tab(text: 'Streams'),
          ],
        ),
      ),
      body: TabBarView(
        controller: tabs,
        children: [
          // Overview + join
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusChip(status),
                  Chip(label: Text('Roster $rosterSize')),
                  if (requiresPayment)
                    Chip(label: Text('Fee ${t!['entry_fee']} ${t!['currency'] ?? ''}'))
                  else
                    const Chip(label: Text('Free')),
                  if (t!['elo_tier'] != null) Chip(label: Text('Elo ${t!['elo_tier']}')),
                ],
              ),
              const SizedBox(height: 12),
              Text('Prize: ${t!['prize_pool'] ?? 'TBD'} · Format: ${t!['format'] ?? '—'}'),
              if (t!['description'] != null) ...[
                const SizedBox(height: 8),
                Text('${t!['description']}'),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => BracketScreen(
                          tournamentId: widget.tournamentId,
                          tournamentName: name,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.account_tree, size: 18),
                    label: const Text('View bracket'),
                  ),
                  if (auth.isLeagueHost) ...[
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => BracketToolsScreen(
                            tournamentId: widget.tournamentId,
                            tournamentName: name,
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.build, size: 18),
                      label: const Text('Bracket tools'),
                    ),
                    OutlinedButton(onPressed: _finalize, child: const Text('Finalize')),
                  ],
                ],
              ),
              const SizedBox(height: 20),
              if (open) ...[
                const SectionHeader('Join'),
                SegmentedButton<String>(
                  segments: [
                    const ButtonSegment(value: 'solo', label: Text('Solo')),
                    if (rosterSize > 1) const ButtonSegment(value: 'team', label: Text('Team')),
                  ],
                  selected: {joinMode == 'team' && rosterSize > 1 ? 'team' : 'solo'},
                  onSelectionChanged: (s) => setState(() {
                    joinMode = s.first;
                    _ensureRosterSlots();
                  }),
                ),
                const SizedBox(height: 12),
                if (joinMode == 'team' && rosterSize > 1) ...[
                  TextField(controller: teamNameCtrl, decoration: const InputDecoration(labelText: 'Team name')),
                  const SizedBox(height: 8),
                  TextField(controller: tagCtrl, decoration: const InputDecoration(labelText: 'Tag'), maxLength: 5),
                  TextField(controller: gameIdCtrl, decoration: const InputDecoration(labelText: 'Captain game ID')),
                  ...List.generate(rosterSlots.length, (i) {
                    final s = rosterSlots[i];
                    return Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: ArenaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Teammate ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            TextField(controller: s.email, decoration: const InputDecoration(labelText: 'Email')),
                            TextField(controller: s.name, decoration: const InputDecoration(labelText: 'Name')),
                            TextField(controller: s.gameId, decoration: const InputDecoration(labelText: 'Game ID')),
                          ],
                        ),
                      ),
                    );
                  }),
                ] else
                  TextField(controller: gameIdCtrl, decoration: const InputDecoration(labelText: 'Game ID')),
                const SizedBox(height: 8),
                TextField(controller: regionCtrl, decoration: const InputDecoration(labelText: 'Region')),
                if (requiresPayment) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final p in ['dev', 'wallet', 'stripe', 'paystack', 'flutterwave'])
                        ChoiceChip(
                          label: Text(p),
                          selected: payProvider == p,
                          onSelected: (_) => setState(() => payProvider = p),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: joining ? null : _join,
                  child: joining
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(joinMode == 'team' ? 'JOIN TEAM' : 'JOIN SOLO'),
                ),
              ] else
                Text('Registration closed', style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
            ],
          ),
          // Teams
          teams.isEmpty
              ? const EmptyState(message: 'No teams registered yet')
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: teams.length,
                  separatorBuilder: (c, i) => const SizedBox(height: 8),
                  itemBuilder: (ctx, i) {
                    final team = Map<String, dynamic>.from(teams[i] as Map);
                    final teamId = team['id']?.toString() ?? '';
                    return ArenaCard(
                      onTap: teamId.isEmpty
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => TeamProfileScreen(teamId: teamId)),
                              ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${team['name']} [${team['tag']}]', style: const TextStyle(fontWeight: FontWeight.w800)),
                                Text('Seed ${team['seed'] ?? '—'} · Elo ${team['elo'] ?? '—'}',
                                    style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5))),
                              ],
                            ),
                          ),
                          StatusChip('${team['status'] ?? 'registered'}'),
                        ],
                      ),
                    );
                  },
                ),
          // Matches
          matches.isEmpty
              ? EmptyState(
                  message: 'Bracket not generated yet',
                  actionLabel: auth.isLeagueHost ? 'Bracket tools' : 'View bracket',
                  onAction: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => auth.isLeagueHost
                          ? BracketToolsScreen(tournamentId: widget.tournamentId, tournamentName: name)
                          : BracketScreen(tournamentId: widget.tournamentId, tournamentName: name),
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: matches.length + 1,
                  separatorBuilder: (c, i) => const SizedBox(height: 8),
                  itemBuilder: (ctx, i) {
                    if (i == 0) {
                      return OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => BracketScreen(
                              tournamentId: widget.tournamentId,
                              tournamentName: name,
                            ),
                          ),
                        ),
                        icon: const Icon(Icons.account_tree_outlined),
                        label: const Text('Open full bracket'),
                      );
                    }
                    final m = Map<String, dynamic>.from(matches[i - 1] as Map);
                    final id = m['id']?.toString() ?? '';
                    final st = '${m['status'] ?? ''}';
                    final live = ['in_progress', 'checked_in', 'live'].contains(st);
                    return ArenaCard(
                      onTap: id.isEmpty
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => live
                                      ? MatchCenterScreen(matchId: id)
                                      : MatchLobbyScreen(matchId: id),
                                ),
                              ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('R${m['round'] ?? '?'} · ${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                              style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text('${m['score_a'] ?? 0} – ${m['score_b'] ?? 0}'),
                          StatusChip(st),
                          Wrap(
                            spacing: 4,
                            children: [
                              if (['in_progress', 'checked_in', 'check_in_open'].contains(st) && id.isNotEmpty)
                                TextButton(
                                  onPressed: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => ReportScoreScreen(
                                        matchId: id,
                                        teamA: '${m['team_a_name'] ?? 'A'}',
                                        teamB: '${m['team_b_name'] ?? 'B'}',
                                      ),
                                    ),
                                  ),
                                  child: const Text('Report'),
                                ),
                              if (id.isNotEmpty)
                                TextButton(
                                  onPressed: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => MatchLobbyScreen(matchId: id)),
                                  ),
                                  child: const Text('Lobby'),
                                ),
                              if (live && id.isNotEmpty)
                                TextButton(
                                  onPressed: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => MatchCenterScreen(matchId: id)),
                                  ),
                                  child: const Text('Live'),
                                ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
          // Pick'Em
          pickem == null
              ? const EmptyState(message: "Pick'Em not available for this phase")
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      pickem!['windowOpen'] == true ? 'Window open — tap a team to pick' : 'Window closed / locked',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    ...((pickem!['matches'] as List?) ?? []).map((raw) {
                      final m = Map<String, dynamic>.from(raw as Map);
                      final mid = m['id']?.toString() ?? '';
                      final picks = Map<String, dynamic>.from(
                        pickem?['prediction']?['bracket_picks'] as Map? ?? {},
                      );
                      final chosen = picks[mid]?.toString();
                      return ArenaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}'),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              children: [
                                ChoiceChip(
                                  label: Text('${m['team_a_name'] ?? 'A'}'),
                                  selected: chosen == m['team_a_id']?.toString(),
                                  onSelected: pickem!['windowOpen'] == true && m['team_a_id'] != null
                                      ? (_) => _savePick(mid, m['team_a_id'].toString())
                                      : null,
                                ),
                                ChoiceChip(
                                  label: Text('${m['team_b_name'] ?? 'B'}'),
                                  selected: chosen == m['team_b_id']?.toString(),
                                  onSelected: pickem!['windowOpen'] == true && m['team_b_id'] != null
                                      ? (_) => _savePick(mid, m['team_b_id'].toString())
                                      : null,
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                    if ((pickem!['leaderboard'] as List?)?.isNotEmpty == true) ...[
                      const SizedBox(height: 16),
                      const SectionHeader('Leaderboard'),
                      ...(pickem!['leaderboard'] as List).take(10).map((row) {
                        final r = Map<String, dynamic>.from(row as Map);
                        return ListTile(
                          dense: true,
                          title: Text('${r['email'] ?? r['user'] ?? 'Player'}'),
                          trailing: Text('${r['score'] ?? r['points'] ?? 0}'),
                        );
                      }),
                    ],
                  ],
                ),
          // Streams
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (streams.isEmpty)
                const Text('No multi-stream rows — tournament stream_url may still work on Watch.'),
              ...streams.map((s) {
                final m = Map<String, dynamic>.from(s as Map);
                return ListTile(
                  title: Text('${m['label'] ?? 'Stream'}'),
                  subtitle: Text('${m['stream_url']}'),
                  trailing: m['is_primary'] == true ? const Icon(Icons.star, color: ArenaColors.cyan) : null,
                  onTap: () {
                    final u = m['stream_url']?.toString();
                    if (u != null) launchUrl(Uri.parse(u), mode: LaunchMode.externalApplication);
                  },
                );
              }),
              if (auth.isLeagueHost) ...[
                const SizedBox(height: 16),
                const SectionHeader('Add broadcast'),
                TextField(controller: streamLabel, decoration: const InputDecoration(labelText: 'Label')),
                TextField(controller: streamUrl, decoration: const InputDecoration(labelText: 'URL')),
                const SizedBox(height: 8),
                ElevatedButton(onPressed: _addStream, child: const Text('Add stream')),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
