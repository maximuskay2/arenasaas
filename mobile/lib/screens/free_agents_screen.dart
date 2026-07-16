import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';
import 'player_profile_screen.dart';

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
  final discord = TextEditingController();
  String region = 'NA';
  String availability = 'anytime';
  String filterRegion = 'all';
  String filterGame = '';

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
    discord.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      var list = await context.read<ApiClient>().listFreeAgents();
      if (filterRegion != 'all') {
        list = list.where((e) => e is Map && '${e['region']}' == filterRegion).toList();
      }
      if (filterGame.trim().isNotEmpty) {
        final g = filterGame.trim().toLowerCase();
        list = list.where((e) {
          if (e is! Map) return false;
          final games = e['preferred_games'];
          if (games is List) return games.any((x) => '$x'.toLowerCase().contains(g));
          return '${e['game_title'] ?? ''}'.toLowerCase().contains(g);
        }).toList();
      }
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
        'player_email': auth.user?['email'],
        'display_name': auth.user?['full_name'] ?? auth.user?['email']?.toString().split('@').first,
        'game_title': game.text.trim().isEmpty ? 'Any' : game.text.trim(),
        'preferred_games': [if (game.text.trim().isNotEmpty) game.text.trim()],
        'rank': rank.text.trim(),
        'rank_or_role': rank.text.trim(),
        'notes': note.text.trim(),
        'bio': note.text.trim(),
        'region': region,
        'availability': availability,
        'discord_handle': discord.text.trim().isEmpty ? null : discord.text.trim(),
        'status': 'open',
        'is_active': true,
      });
      game.clear();
      note.clear();
      rank.clear();
      discord.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Listing posted')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _delete(String id) async {
    try {
      await context.read<ApiClient>().deleteFreeAgent(id);
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _invite(Map<String, dynamic> agent) async {
    final email = agent['player_email']?.toString() ?? '';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Invite $email from tournament join roster / team captain tools.')),
    );
    if (email.isNotEmpty) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PlayerProfileScreen(email: email)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final me = auth.user?['email']?.toString().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Free agents'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: ArenaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('List yourself', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  TextField(controller: game, decoration: const InputDecoration(labelText: 'Game')),
                  TextField(controller: rank, decoration: const InputDecoration(labelText: 'Role / rank')),
                  TextField(controller: note, decoration: const InputDecoration(labelText: 'Bio / notes')),
                  TextField(controller: discord, decoration: const InputDecoration(labelText: 'Discord')),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: region,
                          decoration: const InputDecoration(labelText: 'Region'),
                          items: const [
                            DropdownMenuItem(value: 'NA', child: Text('NA')),
                            DropdownMenuItem(value: 'EU', child: Text('EU')),
                            DropdownMenuItem(value: 'LATAM', child: Text('LATAM')),
                            DropdownMenuItem(value: 'ASIA', child: Text('ASIA')),
                            DropdownMenuItem(value: 'OCE', child: Text('OCE')),
                            DropdownMenuItem(value: 'AF', child: Text('AF')),
                            DropdownMenuItem(value: 'ME', child: Text('ME')),
                          ],
                          onChanged: (v) => setState(() => region = v ?? region),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: availability,
                          decoration: const InputDecoration(labelText: 'Availability'),
                          items: const [
                            DropdownMenuItem(value: 'anytime', child: Text('Anytime')),
                            DropdownMenuItem(value: 'weekdays', child: Text('Weekdays')),
                            DropdownMenuItem(value: 'weekends', child: Text('Weekends')),
                            DropdownMenuItem(value: 'limited', child: Text('Limited')),
                          ],
                          onChanged: (v) => setState(() => availability = v ?? availability),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ElevatedButton(onPressed: _postListing, child: const Text('Post free agent')),
                ],
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Row(
              children: [
                for (final r in ['all', 'NA', 'EU', 'ASIA', 'AF', 'LATAM', 'OCE', 'ME'])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(r == 'all' ? 'All regions' : r),
                      selected: filterRegion == r,
                      onSelected: (_) {
                        setState(() => filterRegion = r);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Filter by game…',
                suffixIcon: IconButton(icon: const Icon(Icons.search), onPressed: _load),
              ),
              onChanged: (v) => filterGame = v,
              onSubmitted: (_) => _load(),
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
                              padding: const EdgeInsets.all(16),
                              itemCount: agents.length,
                              separatorBuilder: (c, i) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final a = Map<String, dynamic>.from(agents[i] as Map);
                                final email = a['player_email']?.toString().toLowerCase() ?? '';
                                final own = me != null && me == email;
                                return ArenaCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(a['display_name']?.toString() ?? email,
                                          style: const TextStyle(fontWeight: FontWeight.w800)),
                                      Text(email, style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5))),
                                      const SizedBox(height: 6),
                                      Wrap(
                                        spacing: 6,
                                        children: [
                                          if (a['region'] != null) StatusChip('${a['region']}'),
                                          if (a['rank'] != null || a['rank_or_role'] != null)
                                            Chip(label: Text('${a['rank'] ?? a['rank_or_role']}', style: const TextStyle(fontSize: 11))),
                                          if (a['availability'] != null)
                                            Chip(label: Text('${a['availability']}', style: const TextStyle(fontSize: 11))),
                                        ],
                                      ),
                                      if (a['preferred_games'] is List)
                                        Text((a['preferred_games'] as List).join(' · '),
                                            style: const TextStyle(fontSize: 12, color: ArenaColors.cyan)),
                                      if (a['bio'] != null || a['notes'] != null)
                                        Text('${a['bio'] ?? a['notes']}'),
                                      Row(
                                        children: [
                                          TextButton(
                                            onPressed: email.isEmpty
                                                ? null
                                                : () => Navigator.of(context).push(
                                                      MaterialPageRoute(
                                                        builder: (_) => PlayerProfileScreen(email: email),
                                                      ),
                                                    ),
                                            child: const Text('Profile'),
                                          ),
                                          if (!own)
                                            TextButton(onPressed: () => _invite(a), child: const Text('Invite')),
                                          if (own && a['id'] != null)
                                            TextButton(
                                              onPressed: () => _delete('${a['id']}'),
                                              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
                                            ),
                                        ],
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
