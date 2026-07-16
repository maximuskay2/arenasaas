import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';
import 'match_center_screen.dart';
import 'report_score_screen.dart';

/// Match lobby: check-in both sides, reports, evidence upload, maps.
class MatchLobbyScreen extends StatefulWidget {
  const MatchLobbyScreen({super.key, required this.matchId});
  final String matchId;

  @override
  State<MatchLobbyScreen> createState() => _MatchLobbyScreenState();
}

class _MatchLobbyScreenState extends State<MatchLobbyScreen> {
  Map<String, dynamic>? match;
  List<dynamic> reports = [];
  bool loading = true;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final m = await api.getMatch(widget.matchId);
      List<dynamic> r = [];
      try {
        r = await api.listMatchReports(widget.matchId);
      } catch (_) {}
      setState(() {
        match = m;
        reports = r;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _checkIn(String side) async {
    setState(() => busy = true);
    try {
      final body = <String, dynamic>{
        if (side == 'a') 'team_a_checked_in': true,
        if (side == 'b') 'team_b_checked_in': true,
      };
      if (match?['version'] != null) body['expected_version'] = match!['version'];
      await context.read<ApiClient>().patchMatch(widget.matchId, body);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _uploadEvidence() async {
    final picker = ImagePicker();
    final files = await picker.pickMultiImage(imageQuality: 85);
    if (files.isEmpty) return;
    setState(() => busy = true);
    try {
      await context.read<ApiClient>().uploadMatchEvidence(
            widget.matchId,
            files.map((f) => f.path).toList(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Evidence uploaded')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: LoadingBody());
    if (error != null || match == null) {
      return Scaffold(appBar: AppBar(), body: EmptyState(message: error ?? 'Not found', actionLabel: 'Retry', onAction: _load));
    }
    final m = match!;
    final maps = m['maps_played'] is List ? m['maps_played'] as List : [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Match lobby'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => MatchCenterScreen(matchId: widget.matchId)),
              );
            },
            icon: const Icon(Icons.live_tv),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ArenaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                ),
                const SizedBox(height: 8),
                StatusChip('${m['status'] ?? ''}'),
                const SizedBox(height: 8),
                Text(
                  'Score ${m['score_a'] ?? 0} – ${m['score_b'] ?? 0}',
                  style: const TextStyle(color: ArenaColors.cyan, fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const SectionHeader('Check-in'),
          ArenaCard(
            child: Column(
              children: [
                _checkRow(
                  'Team A · ${m['team_a_name'] ?? 'TBD'}',
                  m['team_a_checked_in'] == true,
                  () => _checkIn('a'),
                ),
                const Divider(),
                _checkRow(
                  'Team B · ${m['team_b_name'] ?? 'TBD'}',
                  m['team_b_checked_in'] == true,
                  () => _checkIn('b'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const SectionHeader('Actions'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ElevatedButton(
                onPressed: busy
                    ? null
                    : () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ReportScoreScreen(
                              matchId: widget.matchId,
                              teamA: '${m['team_a_name'] ?? 'A'}',
                              teamB: '${m['team_b_name'] ?? 'B'}',
                            ),
                          ),
                        );
                        _load();
                      },
                child: const Text('Report score'),
              ),
              OutlinedButton(
                onPressed: busy ? null : _uploadEvidence,
                child: const Text('Upload evidence'),
              ),
              OutlinedButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => MatchCenterScreen(matchId: widget.matchId)),
                  );
                },
                child: const Text('Live center'),
              ),
            ],
          ),
          if (maps.isNotEmpty) ...[
            const SizedBox(height: 16),
            const SectionHeader('Maps played'),
            ...maps.map((row) {
              final map = row is Map ? Map<String, dynamic>.from(row) : {'map_name': '$row'};
              return ListTile(
                dense: true,
                title: Text('${map['map_name'] ?? 'Map'}'),
                trailing: Text('${map['score_a'] ?? 0} – ${map['score_b'] ?? 0}'),
              );
            }),
          ],
          const SizedBox(height: 16),
          const SectionHeader('Score reports'),
          if (reports.isEmpty)
            const Text('No reports submitted yet.', style: TextStyle(color: Colors.white54))
          else
            ...reports.map((r) {
              final rep = Map<String, dynamic>.from(r as Map);
              return ArenaCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${rep['submitted_by'] ?? rep['created_by'] ?? 'Player'}',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: ArenaColors.cyan),
                    ),
                    Text('Score ${rep['reported_score_a'] ?? rep['score_a'] ?? '?'} – ${rep['reported_score_b'] ?? rep['score_b'] ?? '?'}'),
                    StatusChip('${rep['status'] ?? 'pending'}'),
                    if (rep['pov_link'] != null) Text('${rep['pov_link']}', style: const TextStyle(fontSize: 11)),
                    if (rep['screenshot_urls'] is List && (rep['screenshot_urls'] as List).isNotEmpty)
                      Text('${(rep['screenshot_urls'] as List).length} screenshot(s)', style: const TextStyle(fontSize: 11)),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _checkRow(String label, bool done, VoidCallback onCheck) {
    return Row(
      children: [
        Icon(done ? Icons.check_circle : Icons.radio_button_unchecked,
            color: done ? Colors.greenAccent : Colors.white38),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
        if (!done)
          TextButton(onPressed: busy ? null : onCheck, child: const Text('Check in')),
        if (done) const Text('Ready', style: TextStyle(color: Colors.greenAccent, fontSize: 12)),
      ],
    );
  }
}
