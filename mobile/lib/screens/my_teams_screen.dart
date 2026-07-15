import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';
import 'tournament_detail_screen.dart';

class MyTeamsScreen extends StatefulWidget {
  const MyTeamsScreen({super.key});

  @override
  State<MyTeamsScreen> createState() => _MyTeamsScreenState();
}

class _MyTeamsScreenState extends State<MyTeamsScreen> {
  bool loading = true;
  String? error;
  List<dynamic> teams = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      setState(() => loading = false);
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final list = await context.read<ApiClient>().myTeams();
      setState(() {
        teams = list;
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
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('My teams'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to see squads you captain or join.',
              actionLabel: 'Sign in',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
            )
          : loading
              ? const LoadingBody()
              : error != null
                  ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                  : teams.isEmpty
                      ? const EmptyState(message: 'No teams yet — join a tournament to form a squad.')
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: teams.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final t = Map<String, dynamic>.from(teams[i] as Map);
                              final tid = t['tournament_id']?.toString();
                              final roster = t['roster'] is List ? t['roster'] as List : [];
                              return ArenaCard(
                                onTap: tid == null
                                    ? null
                                    : () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => TournamentDetailScreen(tournamentId: tid),
                                          ),
                                        ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            '${t['name'] ?? 'Team'} [${t['tag'] ?? ''}]',
                                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                          ),
                                        ),
                                        StatusChip('${t['status'] ?? 'registered'}'),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      t['tournament_name']?.toString() ?? 'Tournament',
                                      style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13),
                                    ),
                                    if (t['is_captain'] == true)
                                      const Padding(
                                        padding: EdgeInsets.only(top: 4),
                                        child: Text('Captain', style: TextStyle(color: ArenaColors.cyan, fontSize: 12)),
                                      ),
                                    if (roster.isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Text(
                                        'Roster: ${roster.length} · Elo ${t['elo'] ?? '—'}',
                                        style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.45)),
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
