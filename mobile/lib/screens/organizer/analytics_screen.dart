import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? dash;
  Map<String, dynamic>? ops;
  List<dynamic> tours = [];

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
      final api = context.read<ApiClient>();
      Map<String, dynamic>? d;
      Map<String, dynamic>? o;
      try {
        d = await api.discoveryDashboard();
      } catch (_) {}
      final tid = api.tenantId;
      if (tid != null) {
        try {
          o = await api.opsBoard(tid);
        } catch (_) {}
      }
      final t = await api.listTournaments();
      setState(() {
        dash = d;
        ops = o;
        tours = t;
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
    final stats = dash?['stats'] is Map ? Map<String, dynamic>.from(dash!['stats'] as Map) : dash;
    final counts = ops?['counts'] is Map ? Map<String, dynamic>.from(ops!['counts'] as Map) : ops;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SectionHeader('Platform pulse'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        SizedBox(
                          width: (MediaQuery.of(context).size.width - 48) / 2,
                          child: StatTile(label: 'Open cups', value: '${stats?['open_tournaments'] ?? '—'}'),
                        ),
                        SizedBox(
                          width: (MediaQuery.of(context).size.width - 48) / 2,
                          child: StatTile(label: 'Live matches', value: '${stats?['live_matches'] ?? counts?['live'] ?? '—'}'),
                        ),
                        SizedBox(
                          width: (MediaQuery.of(context).size.width - 48) / 2,
                          child: StatTile(label: 'Disputes', value: '${counts?['disputes'] ?? '—'}'),
                        ),
                        SizedBox(
                          width: (MediaQuery.of(context).size.width - 48) / 2,
                          child: StatTile(label: 'My events', value: '${tours.length}'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    const SectionHeader('Your tournaments (viewership proxy)'),
                    if (tours.isEmpty)
                      const Text('No tournaments', style: TextStyle(color: Colors.white54))
                    else
                      ...tours.take(20).map((t) {
                        final m = Map<String, dynamic>.from(t as Map);
                        final reg = m['registered_teams'] ?? 0;
                        final max = m['max_teams'] ?? 0;
                        final watch = m['watchlist_count'] ?? 0;
                        return ListTile(
                          title: Text('${m['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text('${m['status']} · $reg/$max teams · watchlist $watch'),
                          trailing: StatusChip('${m['status'] ?? ''}'),
                        );
                      }),
                    const SizedBox(height: 12),
                    Text(
                      'Deep charts / simulated viewership remain richest on web Tournament Analytics.',
                      style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.45)),
                    ),
                  ],
                ),
    );
  }
}
