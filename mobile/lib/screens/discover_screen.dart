import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'create_tournament_screen.dart';
import 'tournament_detail_screen.dart';
import 'watchlist_screen.dart';

class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key});

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final search = TextEditingController();
  bool loading = true;
  String? error;
  List<dynamic> items = [];
  Map<String, dynamic>? dash;
  String statusFilter = 'all';
  String feeFilter = 'all'; // all | free | paid

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final status = statusFilter == 'all' ? null : statusFilter;
      final data = await api.catalog(q: search.text.trim(), limit: 40, status: status);
      Map<String, dynamic>? d;
      try {
        d = await api.discoveryDashboard();
      } catch (_) {}
      var list = data['items'] ?? data['tournaments'] ?? data['data'] ?? [];
      if (list is! List) list = [];
      if (feeFilter == 'free') {
        list = list.where((e) {
          if (e is! Map) return false;
          final fee = num.tryParse('${e['entry_fee'] ?? 0}') ?? 0;
          final t = '${e['entry_type'] ?? ''}'.toUpperCase();
          return fee <= 0 || t == 'FREE';
        }).toList();
      } else if (feeFilter == 'paid') {
        list = list.where((e) {
          if (e is! Map) return false;
          final fee = num.tryParse('${e['entry_fee'] ?? 0}') ?? 0;
          return fee > 0;
        }).toList();
      }
      setState(() {
        items = list;
        dash = d;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  String _statusLabel(Map t) {
    final s = '${t['status'] ?? ''}'.replaceAll('_', ' ');
    return s.isEmpty ? 'unknown' : s;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final stats = dash?['stats'] is Map ? Map<String, dynamic>.from(dash!['stats'] as Map) : dash;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover'),
        actions: [
          IconButton(
            tooltip: 'Watchlist',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WatchlistScreen())),
            icon: const Icon(Icons.bookmarks_outlined),
          ),
          if (auth.isLeagueHost)
            IconButton(
              onPressed: () async {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateTournamentScreen()));
                _load();
              },
              icon: const Icon(Icons.add_box_outlined),
            ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: Column(
        children: [
          if (stats != null)
            SizedBox(
              height: 88,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                children: [
                  _chipStat('Open', '${stats['open_tournaments'] ?? stats['registration_open'] ?? items.length}'),
                  _chipStat('Live', '${stats['live_matches'] ?? stats['live'] ?? '—'}'),
                  _chipStat('Orgs', '${stats['active_tenants'] ?? stats['tenants'] ?? '—'}'),
                  _chipStat('Games', '${stats['games'] ?? stats['top_games'] is List ? (stats['top_games'] as List).length : '—'}'),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: TextField(
              controller: search,
              decoration: InputDecoration(
                hintText: 'Search tournaments…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _load),
              ),
              onSubmitted: (_) => _load(),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                for (final s in [
                  ('all', 'All'),
                  ('registration_open', 'Registering'),
                  ('in_progress', 'Live'),
                  ('completed', 'Completed'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(s.$2),
                      selected: statusFilter == s.$1,
                      onSelected: (_) {
                        setState(() => statusFilter = s.$1);
                        _load();
                      },
                    ),
                  ),
                for (final f in [('all', 'Any fee'), ('free', 'Free'), ('paid', 'Paid')])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(f.$2),
                      selected: feeFilter == f.$1,
                      onSelected: (_) {
                        setState(() => feeFilter = f.$1);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: loading
                ? const LoadingBody()
                : error != null
                    ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                    : items.isEmpty
                        ? const EmptyState(message: 'No tournaments match filters')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: items.length,
                              separatorBuilder: (c, i) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) {
                                final t = Map<String, dynamic>.from(items[i] as Map);
                                final id = '${t['id'] ?? ''}';
                                final fee = t['entry_fee'];
                                final prize = t['prize_pool'];
                                return ArenaCard(
                                  onTap: id.isEmpty
                                      ? null
                                      : () => Navigator.of(context).push(
                                            MaterialPageRoute(builder: (_) => TournamentDetailScreen(tournamentId: id)),
                                          ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text('${t['name'] ?? 'Tournament'}',
                                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                          ),
                                          StatusChip(_statusLabel(t)),
                                        ],
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        [
                                          if (t['game_title'] != null) '${t['game_title']}',
                                          if (fee != null) 'Entry: $fee',
                                          if (prize != null) 'Prize: $prize',
                                          if (t['registered_teams'] != null)
                                            '${t['registered_teams']}/${t['max_teams'] ?? '∞'} teams',
                                        ].where((e) => e.toString().isNotEmpty).join(' · '),
                                        style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.55)),
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

  Widget _chipStat(String label, String value) {
    return Container(
      width: 110,
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ArenaColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ArenaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: const TextStyle(fontWeight: FontWeight.w900, color: ArenaColors.cyan, fontSize: 18)),
          Text(label, style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.5))),
        ],
      ),
    );
  }
}
