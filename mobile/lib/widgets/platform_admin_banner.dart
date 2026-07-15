import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../state/auth_state.dart';
import 'arena_ui.dart';

/// Shown for platform owners (`role: admin`). All Central Station / system admin
/// tools stay on the web app — mobile is player + league organizer only.
class PlatformAdminWebBanner extends StatelessWidget {
  const PlatformAdminWebBanner({super.key, this.compact = false});

  final bool compact;

  Future<void> _openWeb() async {
    // Prefer configured API host's sibling web URL; fall back to localhost Vite.
    final base = AppConfig.apiBase.contains('3001')
        ? AppConfig.apiBase.replaceFirst('3001', '5173')
        : 'http://127.0.0.1:5173';
    final uri = Uri.parse('$base/central-station');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    if (!auth.isPlatformAdmin) return const SizedBox.shrink();

    return ArenaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.desktop_windows_outlined, color: Colors.amber.shade300, size: 22),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Platform admin is web-only',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                ),
              ),
            ],
          ),
          if (!compact) ...[
            const SizedBox(height: 8),
            Text(
              auth.platformAdminWebOnly
                  ? 'Central Station, global tenants, HWID bans, commission, vault secrets, and system maintenance run on the web app only. Use this mobile app for player flows or a league host account.'
                  : 'You have platform admin rights. Use the web Central Station for platform control. League organizer tools here only apply when a tenant membership is selected.',
              style: TextStyle(fontSize: 12, height: 1.35, color: Colors.white.withValues(alpha: 0.65)),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              ElevatedButton.icon(
                onPressed: _openWeb,
                icon: const Icon(Icons.open_in_browser, size: 18),
                label: const Text('Open Central Station'),
              ),
              if (!auth.isLeagueHost)
                Text(
                  'No league membership — organizer tabs stay hidden',
                  style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
