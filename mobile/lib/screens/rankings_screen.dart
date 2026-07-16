import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';
import 'player_profile_screen.dart';
import 'team_profile_screen.dart';

class RankingsScreen extends StatefulWidget {
  const RankingsScreen({super.key});

  @override
  State<RankingsScreen> createState() => _RankingsScreenState();
}

class _RankingsScreenState extends State<RankingsScreen> {
  String kind = 'team';
  bool loading = true;
  String? error;
  List<dynamic> rows = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await context.read<ApiClient>().powerRankings(kind: kind);
      setState(() {
        rows = (data['rankings'] as List?) ?? (data['items'] as List?) ?? [];
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  void _openRow(Map<String, dynamic> r) {
    if (kind == 'team') {
      final id = r['team_id']?.toString() ?? r['id']?.toString() ?? '';
      if (id.isEmpty) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TeamProfileScreen(teamId: id)),
      );
      return;
    }
    final email = r['email']?.toString() ?? r['player_email']?.toString() ?? '';
    if (email.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PlayerProfileScreen(email: email)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Power rankings'),
        actions: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'team', label: Text('Teams')),
              ButtonSegment(value: 'player', label: Text('1v1')),
            ],
            selected: {kind},
            onSelectionChanged: (s) {
              setState(() => kind = s.first);
              _load();
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : rows.isEmpty
                  ? const EmptyState(message: 'No ratings yet')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: rows.length,
                        itemBuilder: (ctx, i) {
                          final r = Map<String, dynamic>.from(rows[i] as Map);
                          final rank = r['global_rank'] ?? (i + 1);
                          final elo = r['elo'];
                          final apex = r['apex_tier'] == true;
                          final title = kind == 'team'
                              ? '${r['name'] ?? r['team_name'] ?? 'Team'}'
                              : '${r['display_name'] ?? r['full_name'] ?? r['email'] ?? 'Player'}';
                          final tag = r['tag']?.toString();
                          return ListTile(
                            onTap: () => _openRow(r),
                            leading: CircleAvatar(
                              backgroundColor: apex
                                  ? const Color(0xFF00D4FF).withValues(alpha: 0.2)
                                  : Colors.white12,
                              child: Text('$rank', style: const TextStyle(fontSize: 12)),
                            ),
                            title: Text(
                              tag != null && tag.isNotEmpty ? '$title [$tag]' : title,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            subtitle: Text('${r['wins'] ?? 0}W – ${r['losses'] ?? 0}L · ${r['trend'] ?? 'flat'}'),
                            trailing: Text(
                              elo == null ? '—' : '${(elo as num).round()}',
                              style: const TextStyle(
                                color: Color(0xFF00D4FF),
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
