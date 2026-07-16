import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';
import '../team_profile_screen.dart';

class TeamsManageScreen extends StatefulWidget {
  const TeamsManageScreen({super.key, this.tournamentId});
  final String? tournamentId;

  @override
  State<TeamsManageScreen> createState() => _TeamsManageScreenState();
}

class _TeamsManageScreenState extends State<TeamsManageScreen> {
  bool loading = true;
  String? error;
  List<dynamic> teams = [];
  List<dynamic> tournaments = [];
  String? filterTourId;

  @override
  void initState() {
    super.initState();
    filterTourId = widget.tournamentId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final tours = await api.listTournaments();
      final list = await api.listTeams(tournamentId: filterTourId);
      setState(() {
        tournaments = tours;
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

  Future<void> _editSeed(Map<String, dynamic> team) async {
    final ctrl = TextEditingController(text: '${team['seed'] ?? ''}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Set seed'),
        content: TextField(controller: ctrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Seed #')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final seed = int.tryParse(ctrl.text.trim());
    ctrl.dispose();
    try {
      await context.read<ApiClient>().patchTeam('${team['id']}', {'seed': seed});
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _editRoster(Map<String, dynamic> team) async {
    final roster = List<Map<String, dynamic>>.from(
      ((team['roster'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)),
    );
    final email = TextEditingController();
    final name = TextEditingController();
    final gameId = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text('Roster · ${team['name']}'),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ...roster.asMap().entries.map((e) {
                    final r = e.value;
                    return ListTile(
                      dense: true,
                      title: Text('${r['player_name'] ?? r['player_email']}'),
                      subtitle: Text('${r['player_email']} · ${r['game_id'] ?? ''}'),
                      trailing: IconButton(
                        icon: const Icon(Icons.remove_circle_outline, color: Colors.redAccent),
                        onPressed: () => setLocal(() => roster.removeAt(e.key)),
                      ),
                    );
                  }),
                  TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
                  TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                  TextField(controller: gameId, decoration: const InputDecoration(labelText: 'Game ID')),
                  TextButton(
                    onPressed: () {
                      if (email.text.trim().isEmpty) return;
                      setLocal(() {
                        roster.add({
                          'player_email': email.text.trim().toLowerCase(),
                          'player_name': name.text.trim().isEmpty ? email.text.split('@').first : name.text.trim(),
                          'game_id': gameId.text.trim(),
                          'role': 'player',
                        });
                        email.clear();
                        name.clear();
                        gameId.clear();
                      });
                    },
                    child: const Text('Add player'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await context.read<ApiClient>().patchTeam('${team['id']}', {'roster': roster});
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _kick(Map<String, dynamic> team) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove team?'),
        content: Text('Delete ${team['name']} from the event?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await context.read<ApiClient>().deleteTeam('${team['id']}');
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
        title: const Text('Teams management'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: DropdownButtonFormField<String?>(
              value: filterTourId,
              decoration: const InputDecoration(labelText: 'Tournament filter'),
              items: [
                const DropdownMenuItem(value: null, child: Text('All tournaments')),
                for (final t in tournaments)
                  if (t is Map)
                    DropdownMenuItem(value: t['id']?.toString(), child: Text('${t['name']}', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) {
                setState(() => filterTourId = v);
                _load();
              },
            ),
          ),
          Expanded(
            child: loading
                ? const LoadingBody()
                : error != null
                    ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                    : teams.isEmpty
                        ? const EmptyState(message: 'No teams found')
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: teams.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 8),
                            itemBuilder: (ctx, i) {
                              final t = Map<String, dynamic>.from(teams[i] as Map);
                              return ArenaCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${t['name']} [${t['tag']}]', style: const TextStyle(fontWeight: FontWeight.w800)),
                                    Text('Seed ${t['seed'] ?? '—'} · ${t['captain_email'] ?? ''}'),
                                    StatusChip('${t['status'] ?? ''}'),
                                    Wrap(
                                      spacing: 4,
                                      children: [
                                        TextButton(onPressed: () => _editSeed(t), child: const Text('Seed')),
                                        TextButton(onPressed: () => _editRoster(t), child: const Text('Roster')),
                                        TextButton(
                                          onPressed: t['id'] == null
                                              ? null
                                              : () => Navigator.of(context).push(
                                                    MaterialPageRoute(
                                                      builder: (_) => TeamProfileScreen(teamId: '${t['id']}'),
                                                    ),
                                                  ),
                                          child: const Text('Profile'),
                                        ),
                                        TextButton(
                                          onPressed: () => _kick(t),
                                          child: const Text('Kick', style: TextStyle(color: Colors.redAccent)),
                                        ),
                                      ],
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
}
