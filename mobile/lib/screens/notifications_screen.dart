import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../navigation/deep_link.dart';
import '../services/api_client.dart';
import '../services/push_service.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool loading = true;
  String? error;
  List<dynamic> items = [];

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
      final list = await context.read<ApiClient>().listNotifications();
      setState(() {
        items = list;
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
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Enable FCM',
            onPressed: () async {
              final r = await context.read<PushService>().initializeAndRegister();
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(r.ok ? 'Push enabled' : (r.error ?? 'Failed'))),
              );
            },
            icon: const Icon(Icons.notifications_active_outlined),
          ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to see notifications.',
              actionLabel: 'Sign in',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
            )
          : loading
              ? const LoadingBody()
              : error != null
                  ? EmptyState(
                      message: '$error\n\nInbox uses Notification entity when available.',
                      actionLabel: 'Retry',
                      onAction: _load,
                    )
                  : items.isEmpty
                      ? const EmptyState(message: 'No notifications yet. Enable push from Profile for live alerts.')
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: items.length,
                            separatorBuilder: (c, i) => const SizedBox(height: 8),
                            itemBuilder: (ctx, i) {
                              final n = Map<String, dynamic>.from(items[i] as Map);
                              final id = n['id']?.toString();
                              final payload = Map<String, dynamic>.from(
                                n['data'] is Map
                                    ? n['data'] as Map
                                    : n['payload'] is Map
                                        ? n['payload'] as Map
                                        : n,
                              );
                              return ArenaCard(
                                onTap: () async {
                                  if (id != null) {
                                    try {
                                      await context.read<ApiClient>().markNotificationRead(id);
                                    } catch (_) {}
                                  }
                                  if (!mounted) return;
                                  final page = DeepLink.pageForPayload(payload);
                                  if (page != null) {
                                    DeepLink.open(context, page);
                                  } else {
                                    _load();
                                  }
                                },
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${n['title'] ?? n['type'] ?? 'Notice'}',
                                        style: const TextStyle(fontWeight: FontWeight.w800)),
                                    if (n['body'] != null || n['message'] != null)
                                      Text('${n['body'] ?? n['message']}',
                                          style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                                    Text(
                                      '${n['created_date'] ?? n['created_at'] ?? ''}',
                                      style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
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
