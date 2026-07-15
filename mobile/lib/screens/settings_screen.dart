import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config.dart';
import '../firebase_options.dart';
import '../services/api_client.dart';
import '../services/push_service.dart';
import '../state/auth_state.dart';
import '../state/hub_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final region = TextEditingController();
  final fullName = TextEditingController();
  final gameKey = TextEditingController();
  final gameVal = TextEditingController();
  bool saving = false;
  String? pushStatus;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final u = context.read<AuthState>().user;
      region.text = u?['profile_region']?.toString() ?? 'global';
      fullName.text = u?['full_name']?.toString() ?? '';
    });
  }

  @override
  void dispose() {
    region.dispose();
    fullName.dispose();
    gameKey.dispose();
    gameVal.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    setState(() => saving = true);
    try {
      final handles = Map<String, dynamic>.from(
        context.read<AuthState>().user?['game_handles'] as Map? ?? {},
      );
      if (gameKey.text.trim().isNotEmpty && gameVal.text.trim().isNotEmpty) {
        handles[gameKey.text.trim()] = gameVal.text.trim();
      }
      final updated = await context.read<ApiClient>().patchMe({
        'full_name': fullName.text.trim(),
        'profile_region': region.text.trim().isEmpty ? 'global' : region.text.trim(),
        'game_handles': handles,
      });
      context.read<AuthState>().setUserLocal(updated);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _enablePush() async {
    final push = context.read<PushService>();
    final r = await push.initializeAndRegister(requireAuth: true);
    setState(() {
      pushStatus = r.ok
          ? 'FCM OK · registered=${r.registeredWithApi} · ${(r.token ?? '').length > 20 ? '${r.token!.substring(0, 16)}…' : r.token}'
          : r.error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final hub = context.watch<HubState>();
    final handles = auth.user?['game_handles'] as Map? ?? {};

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: !auth.isLoggedIn
          ? EmptyState(
              message: 'Sign in to edit profile and enable push.',
              actionLabel: 'Sign in',
              onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const SectionHeader('Profile'),
                TextField(controller: fullName, decoration: const InputDecoration(labelText: 'Display name')),
                const SizedBox(height: 10),
                TextField(controller: region, decoration: const InputDecoration(labelText: 'Region', hintText: 'global, us, eu, africa…')),
                const SizedBox(height: 16),
                const SectionHeader('Game handles (passport)'),
                if (handles.isNotEmpty)
                  ...handles.entries.map(
                    (e) => ListTile(
                      dense: true,
                      title: Text('${e.key}'),
                      subtitle: Text('${e.value}'),
                    ),
                  ),
                TextField(controller: gameKey, decoration: const InputDecoration(labelText: 'Game title key', hintText: 'Valorant')),
                const SizedBox(height: 8),
                TextField(controller: gameVal, decoration: const InputDecoration(labelText: 'In-game ID')),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: saving ? null : _saveProfile,
                  child: saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save profile'),
                ),
                const SizedBox(height: 24),
                const SectionHeader('Hub mode'),
                SegmentedButton<HubMode>(
                  segments: const [
                    ButtonSegment(value: HubMode.player, label: Text('Player')),
                    ButtonSegment(value: HubMode.organizer, label: Text('Organizer')),
                  ],
                  selected: {
                    // Platform admin without league host cannot enter organizer hub
                    auth.isLeagueHost ? hub.mode : HubMode.player,
                  },
                  onSelectionChanged: auth.isLeagueHost
                      ? (s) => hub.setMode(s.first)
                      : null,
                ),
                if (!auth.isLeagueHost)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      auth.isPlatformAdmin
                          ? 'Platform admin tools (Central Station) are web-only. Organizer mode needs a tenant membership.'
                          : 'Organizer mode unlocks with a tenant host membership (not platform admin).',
                      style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.45)),
                    ),
                  ),
                const SizedBox(height: 24),
                const SectionHeader('Tenant context'),
                if (auth.tenantMemberships.isEmpty)
                  Text('No memberships', style: TextStyle(color: Colors.white.withValues(alpha: 0.5)))
                else
                  ...auth.tenantMemberships.map((m) {
                    final tid = m['tenant_id']?.toString() ?? '';
                    return ListTile(
                      title: Text(tid),
                      subtitle: Text('${m['role_in_tenant'] ?? ''}'),
                      trailing: auth.api.tenantId == tid
                          ? const Icon(Icons.check, color: ArenaColors.cyan)
                          : null,
                      onTap: () => auth.selectTenant(tid),
                    );
                  }),
                const SizedBox(height: 16),
                const SectionHeader('Push (Firebase FCM)'),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Enable real FCM'),
                  subtitle: Text(
                    DefaultFirebaseOptions.isConfigured
                        ? 'Firebase options detected'
                        : 'Not configured — see mobile/docs/FIREBASE_SETUP.md',
                  ),
                  trailing: const Icon(Icons.notifications_active_outlined),
                  onTap: _enablePush,
                ),
                if (pushStatus != null) SelectableText(pushStatus!, style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 24),
                Text('API ${AppConfig.apiBase}', style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.35))),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () async {
                    await auth.logout();
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  child: const Text('Sign out'),
                ),
              ],
            ),
    );
  }
}
