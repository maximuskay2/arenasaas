import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';

class OpsBoardScreen extends StatefulWidget {
  const OpsBoardScreen({super.key});

  @override
  State<OpsBoardScreen> createState() => _OpsBoardScreenState();
}

class _OpsBoardScreenState extends State<OpsBoardScreen> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? data;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final tid = context.read<ApiClient>().tenantId;
    if (tid == null || tid.isEmpty) {
      setState(() {
        error = 'Select a tenant in Settings first';
        loading = false;
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final d = await context.read<ApiClient>().opsBoard(tid);
      setState(() {
        data = d;
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
        title: const Text('Ops board'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : data == null
                  ? const EmptyState(message: 'No ops data')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          Text(
                            'Tenant ${context.read<ApiClient>().tenantId}',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                          ),
                          const SizedBox(height: 12),
                          Builder(builder: (context) {
                            final counts = data!['counts'] is Map
                                ? Map<String, dynamic>.from(data!['counts'] as Map)
                                : data!;
                            return Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: [
                                for (final e in {
                                  'Open reg': counts['open_registration'] ?? counts['registration_open'],
                                  'Live': counts['live'] ?? counts['in_progress'],
                                  'Disputes': counts['disputes'],
                                  'Check-ins': counts['check_ins'],
                                  'Drafts': counts['drafts'],
                                }.entries)
                                  SizedBox(
                                    width: (MediaQuery.of(context).size.width - 52) / 2,
                                    child: StatTile(label: e.key, value: '${e.value ?? '—'}'),
                                  ),
                              ],
                            );
                          }),
                          const SizedBox(height: 20),
                          if (data!['check_ins'] is List) ...[
                            const SectionHeader('Check-in queue'),
                            ...(data!['check_ins'] as List).take(20).map((row) {
                              final m = Map<String, dynamic>.from(row as Map);
                              return ListTile(
                                dense: true,
                                title: Text('${m['team_a_name'] ?? '?'} vs ${m['team_b_name'] ?? '?'}'),
                                subtitle: Text('${m['check_in_deadline'] ?? m['status'] ?? ''}'),
                              );
                            }),
                          ],
                          if (data!['disputes'] is List) ...[
                            const SectionHeader('Disputes'),
                            ...(data!['disputes'] as List).take(20).map((row) {
                              final m = Map<String, dynamic>.from(row as Map);
                              return ListTile(
                                dense: true,
                                title: Text('${m['team_a_name'] ?? m['id'] ?? 'Match'}'),
                                subtitle: Text('${m['status'] ?? 'under_dispute'}'),
                              );
                            }),
                          ],
                        ],
                      ),
                    ),
    );
  }
}
