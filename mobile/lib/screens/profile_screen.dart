import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config.dart';
import '../firebase_options.dart';
import '../services/push_service.dart';
import '../state/auth_state.dart';
import 'create_tournament_screen.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool pushBusy = false;
  String? pushStatus;

  Future<void> _enablePush() async {
    final auth = context.read<AuthState>();
    final push = context.read<PushService>();
    if (!auth.isLoggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sign in first')));
      return;
    }
    setState(() {
      pushBusy = true;
      pushStatus = null;
    });
    final result = await push.initializeAndRegister(requireAuth: true);
    if (!mounted) return;
    setState(() {
      pushBusy = false;
      if (result.ok) {
        final t = result.token ?? '';
        final short = t.length > 24 ? '${t.substring(0, 12)}…${t.substring(t.length - 8)}' : t;
        pushStatus = result.registeredWithApi == true
            ? 'FCM registered · $short'
            : 'Token: $short · ${result.note ?? "API not registered"}';
      } else {
        pushStatus = result.error ?? 'Failed';
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(result.ok ? 'Push enabled (real FCM token)' : (result.error ?? 'Failed'))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final user = auth.user;
    final push = context.read<PushService>();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!auth.isLoggedIn) ...[
            const Text('Sign in for vault, FCM, team join, and organizer tools.'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
              },
              child: const Text('Sign in'),
            ),
          ] else ...[
            Text(
              user?['full_name']?.toString() ?? user?['email']?.toString() ?? 'Player',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(user?['email']?.toString() ?? '', style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                Chip(label: Text('Role: ${user?['role'] ?? 'player'}')),
                if (auth.isOrganizer) const Chip(label: Text('Organizer')),
              ],
            ),
            if (auth.tenantMemberships.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Tenant context', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              ...auth.tenantMemberships.map((m) {
                final tid = m['tenant_id']?.toString() ?? '';
                final selected = auth.api.tenantId == tid;
                return ListTile(
                  dense: true,
                  title: Text(tid),
                  subtitle: Text('${m['role_in_tenant'] ?? m['role'] ?? ''}'),
                  trailing: selected ? const Icon(Icons.check, color: Color(0xFF00D4FF)) : null,
                  onTap: () => auth.selectTenant(tid),
                );
              }),
            ],
            const SizedBox(height: 12),
            if (auth.isLeagueHost)
              ListTile(
                leading: const Icon(Icons.add_circle_outline),
                title: const Text('Create tournament'),
                subtitle: const Text('League organizer (tenant)'),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const CreateTournamentScreen()),
                  );
                },
              ),
            if (auth.isPlatformAdmin)
              const ListTile(
                leading: Icon(Icons.desktop_windows_outlined, color: Colors.amber),
                title: Text('Platform admin'),
                subtitle: Text('Central Station stays on the web app'),
              ),
            ListTile(
              leading: Icon(
                Icons.notifications_active,
                color: DefaultFirebaseOptions.isConfigured ? const Color(0xFF00D4FF) : Colors.orange,
              ),
              title: const Text('Enable push notifications'),
              subtitle: Text(
                DefaultFirebaseOptions.isConfigured
                    ? 'Real Firebase FCM token → Arena API'
                    : 'Firebase not configured — see mobile/docs/FIREBASE_SETUP.md',
              ),
              trailing: pushBusy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
              onTap: pushBusy ? null : _enablePush,
            ),
            if (pushStatus != null) ...[
              const SizedBox(height: 8),
              SelectableText(
                pushStatus!,
                style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.7)),
              ),
              if (push.lastToken != null)
                TextButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: push.lastToken!));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Token copied')),
                    );
                  },
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text('Copy full FCM token'),
                ),
            ],
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => auth.logout(), child: const Text('Sign out')),
          ],
          const SizedBox(height: 32),
          Text(
            'API: ${AppConfig.apiBase}\nFirebase configured: ${DefaultFirebaseOptions.isConfigured}',
            style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
          ),
        ],
      ),
    );
  }
}
