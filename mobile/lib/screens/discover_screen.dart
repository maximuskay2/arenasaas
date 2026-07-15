import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'create_tournament_screen.dart';
import 'tournament_detail_screen.dart';

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
      final data = await api.catalog(q: search.text.trim(), limit: 40);
      final list = data['items'] ?? data['tournaments'] ?? data['data'] ?? [];
      setState(() {
        items = list is List ? list : [];
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
        title: const Text('Discover'),
        actions: [
          if (auth.isLeagueHost)
            IconButton(
              tooltip: 'Create tournament',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CreateTournamentScreen()),
                );
              },
              icon: const Icon(Icons.add_box_outlined),
            ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: search,
              decoration: InputDecoration(
                hintText: 'Search tournaments…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.arrow_forward),
                  onPressed: _load,
                ),
              ),
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(error!, textAlign: TextAlign.center),
                              const SizedBox(height: 12),
                              ElevatedButton(onPressed: _load, child: const Text('Retry')),
                            ],
                          ),
                        ),
                      )
                    : items.isEmpty
                        ? const Center(child: Text('No tournaments found'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: items.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) {
                                final t = Map<String, dynamic>.from(items[i] as Map);
                                final id = '${t['id'] ?? ''}';
                                final name = '${t['name'] ?? 'Tournament'}';
                                final status = '${t['status'] ?? ''}';
                                final fee = t['entry_fee'];
                                final prize = t['prize_pool'];
                                return Card(
                                  child: ListTile(
                                    title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    subtitle: Text(
                                      [
                                        status.replaceAll('_', ' '),
                                        if (fee != null) 'Entry: $fee',
                                        if (prize != null) 'Prize: $prize',
                                      ].where((e) => e.toString().isNotEmpty).join(' · '),
                                    ),
                                    trailing: const Icon(Icons.chevron_right),
                                    onTap: id.isEmpty
                                        ? null
                                        : () {
                                            Navigator.of(context).push(
                                              MaterialPageRoute(
                                                builder: (_) => TournamentDetailScreen(tournamentId: id),
                                              ),
                                            );
                                          },
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
