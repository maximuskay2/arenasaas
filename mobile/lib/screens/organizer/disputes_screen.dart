import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';

class DisputesScreen extends StatefulWidget {
  const DisputesScreen({super.key});

  @override
  State<DisputesScreen> createState() => _DisputesScreenState();
}

class _DisputesScreenState extends State<DisputesScreen> {
  bool loading = true;
  String? error;
  List<dynamic> disputes = [];

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
      final list = await context.read<ApiClient>().listDisputes();
      setState(() {
        disputes = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _resolve(String matchId, {required int scoreA, required int scoreB, required String winnerSide}) async {
    try {
      await context.read<ApiClient>().resolveDispute(matchId, {
        'score_a': scoreA,
        'score_b': scoreB,
        'winner_side': winnerSide,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dispute resolved')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _promptResolve(Map<String, dynamic> m) async {
    final id = m['id']?.toString() ?? m['match_id']?.toString();
    if (id == null) return;
    final a = TextEditingController(text: '${m['score_a'] ?? 0}');
    final b = TextEditingController(text: '${m['score_b'] ?? 0}');
    String winner = 'a';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Resolve dispute'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: a, decoration: const InputDecoration(labelText: 'Score A'), keyboardType: TextInputType.number),
            TextField(controller: b, decoration: const InputDecoration(labelText: 'Score B'), keyboardType: TextInputType.number),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: winner,
              items: const [
                DropdownMenuItem(value: 'a', child: Text('Team A wins')),
                DropdownMenuItem(value: 'b', child: Text('Team B wins')),
              ],
              onChanged: (v) => winner = v ?? 'a',
              decoration: const InputDecoration(labelText: 'Winner'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Resolve')),
        ],
      ),
    );
    if (ok == true) {
      await _resolve(
        id,
        scoreA: int.tryParse(a.text) ?? 0,
        scoreB: int.tryParse(b.text) ?? 0,
        winnerSide: winner,
      );
    }
    a.dispose();
    b.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Disputes'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : disputes.isEmpty
                  ? const EmptyState(message: 'No open disputes. Nice.')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: disputes.length,
                        separatorBuilder: (c, i) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final m = Map<String, dynamic>.from(disputes[i] as Map);
                          return ArenaCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${m['team_a_name'] ?? 'A'} vs ${m['team_b_name'] ?? 'B'}',
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 4),
                                StatusChip('${m['status'] ?? 'under_dispute'}'),
                                const SizedBox(height: 8),
                                ElevatedButton(
                                  onPressed: () => _promptResolve(m),
                                  child: const Text('Resolve'),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
