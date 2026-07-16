import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';
import '../bracket_screen.dart';
import '../create_tournament_screen.dart';
import '../tournament_detail_screen.dart';
import 'bracket_tools_screen.dart';

class LeagueTournamentsScreen extends StatefulWidget {
  const LeagueTournamentsScreen({super.key});

  @override
  State<LeagueTournamentsScreen> createState() => _LeagueTournamentsScreenState();
}

class _LeagueTournamentsScreenState extends State<LeagueTournamentsScreen> {
  bool loading = true;
  String? error;
  List<dynamic> items = [];

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
      final list = await context.read<ApiClient>().listTournaments();
      setState(() {
        items = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My tournaments'),
        actions: [
          IconButton(
            onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateTournamentScreen()));
              _load();
            },
            icon: const Icon(Icons.add),
          ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : items.isEmpty
                  ? EmptyState(
                      message: 'No tournaments for this tenant yet.',
                      actionLabel: 'Create',
                      onAction: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const CreateTournamentScreen()),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: items.length,
                        separatorBuilder: (c, i) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final t = Map<String, dynamic>.from(items[i] as Map);
                          final id = t['id']?.toString() ?? '';
                          final tName = '${t['name'] ?? 'Tournament'}';
                          return ArenaCard(
                            onTap: id.isEmpty
                                ? null
                                : () => Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => TournamentDetailScreen(tournamentId: id),
                                      ),
                                    ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        tName,
                                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                      ),
                                    ),
                                    StatusChip('${t['status'] ?? ''}'),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  [
                                    t['format'],
                                    if (t['entry_fee'] != null) 'fee ${t['entry_fee']}',
                                    if (t['registered_teams'] != null) '${t['registered_teams']}/${t['max_teams'] ?? '∞'} teams',
                                  ].where((e) => e != null && '$e'.isNotEmpty).join(' · '),
                                  style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5)),
                                ),
                                if (id.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      TextButton(
                                        onPressed: () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => BracketScreen(
                                              tournamentId: id,
                                              tournamentName: tName,
                                            ),
                                          ),
                                        ),
                                        child: const Text('Bracket'),
                                      ),
                                      TextButton(
                                        onPressed: () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => BracketToolsScreen(
                                              tournamentId: id,
                                              tournamentName: tName,
                                            ),
                                          ),
                                        ),
                                        child: const Text('Tools'),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
