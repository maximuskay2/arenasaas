import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_client.dart';

class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
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
      final list = await context.read<ApiClient>().liveMatches();
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

  Future<void> _openWatch(String matchId) async {
    try {
      final meta = await context.read<ApiClient>().matchWatch(matchId);
      final url = meta['stream_url']?.toString() ??
          ((meta['streams'] is List && (meta['streams'] as List).isNotEmpty)
              ? (meta['streams'] as List).first['stream_url']?.toString()
              : null);
      if (url == null || url.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No stream URL for this match')),
        );
        return;
      }
      final uri = Uri.parse(url);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Live'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : matches.isEmpty
                  ? const Center(child: Text('No live matches right now'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: matches.length,
                        separatorBuilder: (context, index) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final m = Map<String, dynamic>.from(matches[i] as Map);
                          final id = '${m['id'] ?? ''}';
                          return Card(
                            child: ListTile(
                              title: Text(
                                '${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              subtitle: Text(
                                '${m['score_a'] ?? 0} – ${m['score_b'] ?? 0} · ${m['status'] ?? ''}',
                              ),
                              trailing: const Icon(Icons.play_circle_outline, color: Color(0xFF00D4FF)),
                              onTap: id.isEmpty ? null : () => _openWatch(id),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
