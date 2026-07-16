import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';
import '../bracket_screen.dart';

/// Generate / seed / schedule helpers for a tournament.
class BracketToolsScreen extends StatefulWidget {
  const BracketToolsScreen({super.key, required this.tournamentId, this.tournamentName});
  final String tournamentId;
  final String? tournamentName;

  @override
  State<BracketToolsScreen> createState() => _BracketToolsScreenState();
}

class _BracketToolsScreenState extends State<BracketToolsScreen> {
  bool busy = false;
  Map<String, dynamic>? tournament;
  List<dynamic> teams = [];
  List<dynamic> matches = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    try {
      final t = await api.tournament(widget.tournamentId);
      final tm = await api.listTeams(tournamentId: widget.tournamentId);
      final ms = await api.listMatches(tournamentId: widget.tournamentId);
      setState(() {
        tournament = t;
        teams = tm;
        matches = ms;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _seedRandom() async {
    setState(() => busy = true);
    try {
      final api = context.read<ApiClient>();
      final shuffled = List<Map<String, dynamic>>.from(
        teams.whereType<Map>().map((e) => Map<String, dynamic>.from(e)),
      )..shuffle();
      for (var i = 0; i < shuffled.length; i++) {
        await api.patchTeam('${shuffled[i]['id']}', {'seed': i + 1});
      }
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Seeds assigned 1…n')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _generateBracket() async {
    setState(() => busy = true);
    try {
      final api = context.read<ApiClient>();
      try {
        await api.request('POST', '/api/match-engine/tournaments/${widget.tournamentId}/generate-bracket', body: {});
      } catch (_) {
        final sorted = List<Map<String, dynamic>>.from(
          teams.whereType<Map>().map((e) => Map<String, dynamic>.from(e)),
        )..sort((a, b) => (int.tryParse('${a['seed']}') ?? 999).compareTo(int.tryParse('${b['seed']}') ?? 999));
        if (matches.isEmpty) {
          for (var i = 0; i + 1 < sorted.length; i += 2) {
            final a = sorted[i];
            final b = sorted[i + 1];
            await api.createEntity('Match', {
              'tournament_id': widget.tournamentId,
              'tenant_id': tournament?['tenant_id'] ?? api.tenantId,
              'round': 1,
              'match_number': (i ~/ 2) + 1,
              'team_a_id': a['id']?.toString(),
              'team_a_name': a['name'],
              'team_b_id': b['id']?.toString(),
              'team_b_name': b['name'],
              'status': 'pending',
            });
          }
        }
      }
      await api.updateTournament(widget.tournamentId, {'status': 'registration_closed'});
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bracket ready')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _scheduleCheckIn() async {
    setState(() => busy = true);
    try {
      final api = context.read<ApiClient>();
      final deadline = DateTime.now().add(const Duration(hours: 2)).toUtc().toIso8601String();
      for (final m in matches) {
        if (m is! Map) continue;
        final id = m['id']?.toString();
        if (id == null) continue;
        await api.patchMatch(id, {
          'status': 'check_in_open',
          'check_in_deadline': deadline,
          if (m['version'] != null) 'expected_version': m['version'],
        });
      }
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Check-in opened (+2h deadline)')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tournamentName ?? 'Bracket tools'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => BracketScreen(
                    tournamentId: widget.tournamentId,
                    tournamentName: widget.tournamentName,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.account_tree_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ArenaCard(
            child: Text(
              'Teams: ${teams.length} · Matches: ${matches.length} · Status: ${tournament?['status'] ?? '—'}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: busy ? null : _seedRandom, child: const Text('Randomize seeds')),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: busy ? null : _generateBracket, child: const Text('Generate R1 bracket')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: busy ? null : _scheduleCheckIn, child: const Text('Open check-in on all matches')),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => BracketScreen(
                    tournamentId: widget.tournamentId,
                    tournamentName: widget.tournamentName,
                  ),
                ),
              );
            },
            child: const Text('View bracket'),
          ),
          if (busy) const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
        ],
      ),
    );
  }
}
