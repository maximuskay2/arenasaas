import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';

class TeamProfileScreen extends StatefulWidget {
  const TeamProfileScreen({super.key, required this.teamId});
  final String teamId;

  @override
  State<TeamProfileScreen> createState() => _TeamProfileScreenState();
}

class _TeamProfileScreenState extends State<TeamProfileScreen> {
  Map<String, dynamic>? data;
  bool loading = true;
  String? error;

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
      final d = await context.read<ApiClient>().publicTeam(widget.teamId);
      setState(() {
        data = d;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final team = data?['team'] is Map
        ? Map<String, dynamic>.from(data!['team'] as Map)
        : data ?? {};
    final roster = team['roster'] is List ? team['roster'] as List : [];

    return Scaffold(
      appBar: AppBar(title: Text('${team['name'] ?? 'Team'}')),
      body: loading
          ? const LoadingBody()
          : error != null && team.isEmpty
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ArenaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${team['name'] ?? 'Team'} [${team['tag'] ?? ''}]',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
                          const SizedBox(height: 6),
                          StatusChip('${team['status'] ?? 'registered'}'),
                          const SizedBox(height: 8),
                          Text('Elo ${team['elo'] ?? data?['elo'] ?? '—'} · Captain ${team['captain_email'] ?? '—'}'),
                          if (data?['apex_tier'] == true)
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text('APEX TIER', style: TextStyle(color: ArenaColors.cyan, fontWeight: FontWeight.w900)),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    const SectionHeader('Roster'),
                    if (roster.isEmpty)
                      const Text('No roster data', style: TextStyle(color: Colors.white54))
                    else
                      ...roster.map((r) {
                        final m = r is Map ? Map<String, dynamic>.from(r) : {'player_name': '$r'};
                        return ListTile(
                          title: Text('${m['player_name'] ?? m['player_email'] ?? 'Player'}'),
                          subtitle: Text('${m['player_email'] ?? ''} · ${m['game_id'] ?? ''}'),
                          trailing: Text('${m['role'] ?? ''}'),
                        );
                      }),
                  ],
                ),
    );
  }
}
