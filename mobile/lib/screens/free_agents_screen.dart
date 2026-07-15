import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';

class FreeAgentsScreen extends StatefulWidget {
  const FreeAgentsScreen({super.key});

  @override
  State<FreeAgentsScreen> createState() => _FreeAgentsScreenState();
}

class _FreeAgentsScreenState extends State<FreeAgentsScreen> {
  bool loading = true;
  String? error;
  List<dynamic> agents = [];
  final game = TextEditingController();
  final note = TextEditingController();
  final rank = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    game.dispose();
    note.dispose();
    rank.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final list = await context.read<ApiClient>().listFreeAgents();
      setState(() {
        agents = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _postListing() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    try {
      await context.read<ApiClient>().createFreeAgent({
        'game_title': game.text.trim().isEmpty ? 'Any' : game.text.trim(),
        'rank_or_role': rank.text.trim(),
        'notes': note.text.trim(),
        'status': 'open',
      });
      game.clear();
      note.clear();
      rank.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Listing posted')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Free agents'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: ArenaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('List yourself', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  TextField(controller: game, decoration: const InputDecoration(labelText: 'Game')),
                  const SizedBox(height: 8),
                  TextField(controller: rank, decoration: const InputDecoration(labelText: 'Role / rank')),
                  const SizedBox(height: 8),
                  TextField(controller: note, decoration: const InputDecoration(labelText: 'Notes')),
                  const SizedBox(height: 10),
                  ElevatedButton(onPressed: _postListing, child: const Text('Post free agent')),
                ],
              ),
            ),
          ),
          Expanded(
            child: loading
                ? const LoadingBody()
                : error != null
                    ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                    : agents.isEmpty
                        ? const EmptyState(message: 'No free agents listed yet.')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                              itemCount: agents.length,
                              separatorBuilder: (c, i) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final a = Map<String, dynamic>.from(agents[i] as Map);
                                return ArenaCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        a['game_title']?.toString() ?? a['game']?.toString() ?? 'Game',
                                        style: const TextStyle(fontWeight: FontWeight.w800),
                                      ),
                                      Text(
                                        a['rank_or_role']?.toString() ?? a['role']?.toString() ?? '',
                                        style: const TextStyle(color: ArenaColors.cyan),
                                      ),
                                      if (a['notes'] != null || a['bio'] != null)
                                        Text('${a['notes'] ?? a['bio']}'),
                                      Text(
                                        a['created_by']?.toString() ?? a['player_email']?.toString() ?? '',
                                        style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.45)),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
