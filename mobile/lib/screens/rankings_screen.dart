import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';

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
        rows = (data['rankings'] as List?) ?? [];
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
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : rows.isEmpty
                  ? const Center(child: Text('No ratings yet'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: rows.length,
                        itemBuilder: (ctx, i) {
                          final r = Map<String, dynamic>.from(rows[i] as Map);
                          final rank = r['global_rank'] ?? (i + 1);
                          final elo = r['elo'];
                          final apex = r['apex_tier'] == true;
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: apex
                                  ? const Color(0xFF00D4FF).withValues(alpha: 0.2)
                                  : Colors.white12,
                              child: Text('$rank', style: const TextStyle(fontSize: 12)),
                            ),
                            title: Text(
                              '${r['display_name'] ?? '—'} [${r['tag'] ?? ''}]',
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
