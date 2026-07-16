import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';
import 'match_lobby_screen.dart';
import 'match_center_screen.dart';

/// Mobile bracket: round selector + vertical match cards (web dual-view mobile pattern).
class BracketScreen extends StatefulWidget {
  const BracketScreen({super.key, required this.tournamentId, this.tournamentName});
  final String tournamentId;
  final String? tournamentName;

  @override
  State<BracketScreen> createState() => _BracketScreenState();
}

class _BracketScreenState extends State<BracketScreen> {
  List<dynamic> matches = [];
  bool loading = true;
  String? error;
  int? selectedRound;

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
      List<dynamic> list;
      try {
        list = await context.read<ApiClient>().publicTournamentMatches(widget.tournamentId);
      } catch (_) {
        list = await context.read<ApiClient>().listMatches(tournamentId: widget.tournamentId);
      }
      final rounds = list
          .map((e) => e is Map ? int.tryParse('${e['round']}') ?? 1 : 1)
          .toSet()
          .toList()
        ..sort();
      setState(() {
        matches = list;
        selectedRound ??= rounds.isNotEmpty ? rounds.first : 1;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  List<int> get rounds {
    final r = matches.map((e) => e is Map ? int.tryParse('${e['round']}') ?? 1 : 1).toSet().toList()..sort();
    return r;
  }

  List<Map<String, dynamic>> get roundMatches {
    final rr = selectedRound ?? 1;
    return matches
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((m) => (int.tryParse('${m['round']}') ?? 1) == rr)
        .toList()
      ..sort((a, b) => (int.tryParse('${a['match_number']}') ?? 0).compareTo(int.tryParse('${b['match_number']}') ?? 0));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tournamentName ?? 'Bracket'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : matches.isEmpty
                  ? const EmptyState(message: 'Bracket not generated yet.')
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                          child: Row(
                            children: [
                              for (final r in rounds)
                                Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    label: Text('Round $r'),
                                    selected: selectedRound == r,
                                    onSelected: (_) => setState(() => selectedRound = r),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: roundMatches.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final m = roundMatches[i];
                              final id = '${m['id'] ?? ''}';
                              final live = '${m['status']}' == 'in_progress';
                              return ArenaCard(
                                onTap: id.isEmpty
                                    ? null
                                    : () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => live
                                                ? MatchCenterScreen(matchId: id)
                                                : MatchLobbyScreen(matchId: id),
                                          ),
                                        );
                                      },
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text('Match ${m['match_number'] ?? i + 1}',
                                            style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.5))),
                                        const Spacer(),
                                        StatusChip('${m['status'] ?? 'pending'}'),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    _side(m['team_a_name'], m['score_a'], m['winner_id'] == m['team_a_id']),
                                    const SizedBox(height: 6),
                                    _side(m['team_b_name'], m['score_b'], m['winner_id'] == m['team_b_id']),
                                    if (m['bracket_position'] != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 8),
                                        child: Text('${m['bracket_position']}',
                                            style: const TextStyle(fontSize: 11, color: ArenaColors.cyan)),
                                      ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
    );
  }

  Widget _side(dynamic name, dynamic score, bool winner) {
    return Row(
      children: [
        Expanded(
          child: Text(
            '${name ?? 'TBD'}',
            style: TextStyle(
              fontWeight: winner ? FontWeight.w900 : FontWeight.w600,
              color: winner ? ArenaColors.cyan : Colors.white,
            ),
          ),
        ),
        Text(
          '${score ?? 0}',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 16,
            color: winner ? ArenaColors.cyan : Colors.white70,
          ),
        ),
      ],
    );
  }
}
