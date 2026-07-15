import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';
import 'report_score_screen.dart';

/// Player check-in queue: matches in check_in_open / ready states.
class CheckInScreen extends StatefulWidget {
  const CheckInScreen({super.key});

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> matches = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      setState(() => loading = false);
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final all = await context.read<ApiClient>().myMatches(limit: 80);
      final filtered = all
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .where((m) {
            final s = '${m['status'] ?? ''}';
            return s == 'check_in_open' || s == 'checked_in' || s == 'pending' || s == 'in_progress';
          })
          .toList();
      setState(() {
        matches = filtered;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _checkIn(Map<String, dynamic> m) async {
    final id = m['id']?.toString();
    if (id == null) return;
    final side = m['my_side']?.toString(); // 'a' | 'b'
    final body = <String, dynamic>{};
    if (side == 'a') {
      body['team_a_checked_in'] = true;
    } else if (side == 'b') {
      body['team_b_checked_in'] = true;
    } else {
      // Best-effort both flags not allowed — try status transition
      body['status'] = 'checked_in';
    }
    if (m['version'] != null) body['expected_version'] = m['version'];

    final messenger = ScaffoldMessenger.of(context);
    try {
      await context.read<ApiClient>().patchMatch(id, body);
      messenger.showSnackBar(const SnackBar(content: Text('Check-in recorded')));
      _load();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Check-in'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to check into your matches.',
              actionLabel: 'Sign in',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
            )
          : loading
              ? const LoadingBody()
              : error != null
                  ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                  : matches.isEmpty
                      ? const EmptyState(message: 'No matches waiting for check-in right now.')
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: matches.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final m = matches[i];
                              final id = '${m['id'] ?? ''}';
                              final status = '${m['status'] ?? ''}';
                              return ArenaCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      m['tournament_name']?.toString() ?? 'Tournament',
                                      style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5)),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}',
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                    ),
                                    const SizedBox(height: 6),
                                    StatusChip(status),
                                    if (m['check_in_deadline'] != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Text(
                                          'Deadline: ${m['check_in_deadline']}',
                                          style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.45)),
                                        ),
                                      ),
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        if (status == 'check_in_open' || status == 'pending')
                                          ElevatedButton(
                                            onPressed: () => _checkIn(m),
                                            child: const Text('Check in'),
                                          ),
                                        const SizedBox(width: 8),
                                        if (status == 'in_progress' || status == 'checked_in')
                                          TextButton(
                                            onPressed: () {
                                              Navigator.of(context).push(
                                                MaterialPageRoute(
                                                  builder: (_) => ReportScoreScreen(
                                                    matchId: id,
                                                    teamA: '${m['team_a_name'] ?? 'A'}',
                                                    teamB: '${m['team_b_name'] ?? 'B'}',
                                                  ),
                                                ),
                                              );
                                            },
                                            child: const Text('Report score'),
                                          ),
                                      ],
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
