import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';

/// Watch hub — live matches + open stream (web WatchHub parity).
class WatchScreen extends StatefulWidget {
  const WatchScreen({super.key});

  @override
  State<WatchScreen> createState() => _WatchScreenState();
}

class _WatchScreenState extends State<WatchScreen> {
  bool loading = true;
  String? error;
  List<dynamic> matches = [];

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
      final list = await context.read<ApiClient>().liveMatches(limit: 40);
      setState(() {
        matches = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _open(String matchId) async {
    try {
      final meta = await context.read<ApiClient>().matchWatch(matchId);
      var url = meta['stream_url']?.toString();
      final streams = meta['streams'];
      if ((url == null || url.isEmpty) && streams is List && streams.isNotEmpty) {
        url = streams.first['stream_url']?.toString();
      }
      if (url == null || url.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No stream URL')));
        return;
      }
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Watch live'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : matches.isEmpty
                  ? const EmptyState(message: 'No live matches right now. Check back soon.')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: matches.length,
                        separatorBuilder: (c, i) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final m = Map<String, dynamic>.from(matches[i] as Map);
                          final id = '${m['id'] ?? ''}';
                          return ArenaCard(
                            onTap: id.isEmpty ? null : () => _open(id),
                            child: Row(
                              children: [
                                Container(
                                  width: 10,
                                  height: 10,
                                  decoration: const BoxDecoration(
                                    color: Colors.redAccent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                                        style: const TextStyle(fontWeight: FontWeight.w800),
                                      ),
                                      Text(
                                        '${m['score_a'] ?? 0} – ${m['score_b'] ?? 0} · ${m['status'] ?? ''}'
                                            .replaceAll('_', ' '),
                                        style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5)),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.play_circle_outline, color: ArenaColors.cyan),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
