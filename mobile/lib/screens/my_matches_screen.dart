import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'login_screen.dart';
import 'report_score_screen.dart';

class MyMatchesScreen extends StatefulWidget {
  const MyMatchesScreen({super.key});

  @override
  State<MyMatchesScreen> createState() => _MyMatchesScreenState();
}

class _MyMatchesScreenState extends State<MyMatchesScreen> {
  bool loading = true;
  String? error;
  List<dynamic> matches = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      setState(() {
        loading = false;
        matches = [];
        error = null;
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final list = await context.read<ApiClient>().myMatches();
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

  Future<void> _watch(String matchId) async {
    try {
      final meta = await context.read<ApiClient>().matchWatch(matchId);
      final url = meta['stream_url']?.toString();
      if (url == null || url.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No stream URL')),
        );
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
    final auth = context.watch<AuthState>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('My matches'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: !auth.isLoggedIn
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Sign in to see your matches'),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                      _load();
                    },
                    child: const Text('Sign in'),
                  ),
                ],
              ),
            )
          : loading
              ? const Center(child: CircularProgressIndicator())
              : error != null
                  ? Center(child: Text(error!))
                  : matches.isEmpty
                      ? const Center(child: Text('No matches yet — join a tournament'))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: matches.length,
                            separatorBuilder: (context, index) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final m = Map<String, dynamic>.from(matches[i] as Map);
                              final id = '${m['id'] ?? ''}';
                              final status = '${m['status'] ?? ''}';
                              final canReport = [
                                'in_progress',
                                'checked_in',
                                'check_in_open',
                                'pending',
                              ].contains(status);
                              return Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        m['tournament_name']?.toString() ?? 'Tournament',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.white.withValues(alpha: 0.5),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${m['score_a'] ?? 0} – ${m['score_b'] ?? 0} · $status'
                                            .replaceAll('_', ' '),
                                      ),
                                      if (m['my_team_name'] != null)
                                        Text(
                                          'You: ${m['my_team_name']} (${m['my_side'] ?? '?'})',
                                          style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 12),
                                        ),
                                      const SizedBox(height: 10),
                                      Row(
                                        children: [
                                          if (canReport && id.isNotEmpty)
                                            TextButton(
                                              onPressed: () async {
                                                await Navigator.of(context).push(
                                                  MaterialPageRoute(
                                                    builder: (_) => ReportScoreScreen(
                                                      matchId: id,
                                                      teamA: '${m['team_a_name'] ?? 'A'}',
                                                      teamB: '${m['team_b_name'] ?? 'B'}',
                                                    ),
                                                  ),
                                                );
                                                _load();
                                              },
                                              child: const Text('Report score'),
                                            ),
                                          TextButton(
                                            onPressed: id.isEmpty ? null : () => _watch(id),
                                            child: const Text('Watch'),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
    );
  }
}
