import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';

class GameTemplatesScreen extends StatefulWidget {
  const GameTemplatesScreen({super.key});

  @override
  State<GameTemplatesScreen> createState() => _GameTemplatesScreenState();
}

class _GameTemplatesScreenState extends State<GameTemplatesScreen> {
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
      final list = await context.read<ApiClient>().listGameTemplates();
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

  Future<void> _createOrEdit({Map<String, dynamic>? existing}) async {
    final title = TextEditingController(text: existing?['title']?.toString() ?? '');
    final roster = TextEditingController(text: '${existing?['roster_size'] ?? 5}');
    final scoring = TextEditingController(text: existing?['scoring_mode']?.toString() ?? 'best_of_3');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'New template' : 'Edit template'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
            TextField(controller: roster, decoration: const InputDecoration(labelText: 'Roster size'), keyboardType: TextInputType.number),
            TextField(controller: scoring, decoration: const InputDecoration(labelText: 'Scoring mode')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final body = {
      'title': title.text.trim(),
      'roster_size': int.tryParse(roster.text.trim()) ?? 5,
      'scoring_mode': scoring.text.trim(),
    };
    try {
      final api = context.read<ApiClient>();
      if (existing?['id'] != null) {
        await api.patchEntity('GameTemplate', '${existing!['id']}', body);
      } else {
        await api.createEntity('GameTemplate', body);
      }
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _delete(String id) async {
    try {
      await context.read<ApiClient>().deleteEntity('GameTemplate', id);
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
        title: const Text('Game templates'),
        actions: [
          IconButton(onPressed: () => _createOrEdit(), icon: const Icon(Icons.add)),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : items.isEmpty
                  ? EmptyState(message: 'No templates', actionLabel: 'Create', onAction: () => _createOrEdit())
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      separatorBuilder: (c, i) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) {
                        final t = Map<String, dynamic>.from(items[i] as Map);
                        return ArenaCard(
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('${t['title']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text('Roster ${t['roster_size']} · ${t['scoring_mode'] ?? ''}'),
                            trailing: PopupMenuButton<String>(
                              onSelected: (v) {
                                if (v == 'edit') _createOrEdit(existing: t);
                                if (v == 'del' && t['id'] != null) _delete('${t['id']}');
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(value: 'edit', child: Text('Edit')),
                                PopupMenuItem(value: 'del', child: Text('Delete')),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
