import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../widgets/arena_ui.dart';

class PlayerProfileScreen extends StatefulWidget {
  const PlayerProfileScreen({super.key, required this.email});
  final String email;

  @override
  State<PlayerProfileScreen> createState() => _PlayerProfileScreenState();
}

class _PlayerProfileScreenState extends State<PlayerProfileScreen> {
  Map<String, dynamic>? career;
  bool loading = true;
  String? error;

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
      final data = await context.read<ApiClient>().playerCareer(widget.email);
      setState(() {
        career = data;
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
      appBar: AppBar(title: const Text('Player profile')),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ArenaCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            career?['user']?['full_name']?.toString() ??
                                career?['user']?['email']?.toString() ??
                                widget.email,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
                          ),
                          Text(widget.email, style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (career?['aggregates'] is Map) ...[
                      const SectionHeader('Career'),
                      Builder(builder: (ctx) {
                        final a = Map<String, dynamic>.from(career!['aggregates'] as Map);
                        return Row(
                          children: [
                            Expanded(child: StatTile(label: 'Earnings', value: '${a['total_earnings'] ?? a['career_earnings'] ?? 0}')),
                            const SizedBox(width: 8),
                            Expanded(child: StatTile(label: 'Win rate', value: '${a['win_rate'] ?? '—'}')),
                          ],
                        );
                      }),
                    ],
                    const SizedBox(height: 12),
                    const SectionHeader('Timeline'),
                    ...((career?['timeline'] as List?) ?? (career?['accolades'] as List?) ?? []).map((e) {
                      final m = Map<String, dynamic>.from(e as Map);
                      return ListTile(
                        leading: CircleAvatar(child: Text('#${m['rank'] ?? '·'}')),
                        title: Text('${m['tournament_title'] ?? m['title'] ?? 'Event'}'),
                        subtitle: Text('${m['created_date'] ?? m['archived_at'] ?? m['badge_id'] ?? ''}'),
                      );
                    }),
                    if (((career?['timeline'] as List?) ?? []).isEmpty && ((career?['accolades'] as List?) ?? []).isEmpty)
                      const Text('No public career events yet.', style: TextStyle(color: Colors.white54)),
                  ],
                ),
    );
  }
}
