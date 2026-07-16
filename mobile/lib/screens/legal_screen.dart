import 'package:flutter/material.dart';
import '../widgets/arena_ui.dart';

class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key, required this.kind});
  final String kind; // privacy | terms

  @override
  Widget build(BuildContext context) {
    final privacy = kind == 'privacy';
    return Scaffold(
      appBar: AppBar(title: Text(privacy ? 'Privacy Policy' : 'Terms of Service')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            privacy ? 'Privacy Policy' : 'Terms of Service',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22),
          ),
          const SizedBox(height: 4),
          Text('Effective July 16, 2026', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
          const SizedBox(height: 16),
          ArenaCard(
            child: Text(
              privacy
                  ? 'Arena Grid collects account email, organization profile, tournament participation, device identifiers used for integrity (optional HWID), and payment references processed by Stripe, Paystack, or Flutterwave. We do not store full card numbers. Data is used to operate multi-tenant tournaments, prize payouts, fraud prevention, and support. You may request an export via authenticated API (export-my-data) where enabled. Contact support@arenasaas.com for privacy requests.'
                  : 'By using Arena Grid you agree to compete fairly, respect tenant branding and house rules, and not abuse multi-tenant isolation. Entry fees and prize payouts are virtual wallet or payment-provider transfers under organizer and platform fee policies. Platform operators may suspend tenants or devices for ToS violations. Organizers remain responsible for prize disclosure and local legal compliance.',
              style: const TextStyle(height: 1.45, fontSize: 14),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Full legal text also available on the web app (/privacy, /terms).',
            style: TextStyle(fontSize: 12, color: Colors.white54),
          ),
        ],
      ),
    );
  }
}

class MarketingLandingScreen extends StatelessWidget {
  const MarketingLandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Arena Grid')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('One platform. Infinite leagues.',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 26)),
          const SizedBox(height: 8),
          Text(
            'Host multi-tenant tournaments, run live match centers, settle prizes, and give players a career hub.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.65), height: 1.4),
          ),
          const SizedBox(height: 20),
          const SectionHeader('Features'),
          _bullet('Multi-tenant leagues with RLS isolation'),
          _bullet('Brackets, check-in, disputes, prize engine'),
          _bullet('Stripe / Paystack / Flutterwave entry fees'),
          _bullet('Elo rankings, Pick’Em, community war room'),
          _bullet('Player vault, free agents, watch live'),
          const SizedBox(height: 16),
          const SectionHeader('Resources'),
          ListTile(
            title: const Text('Privacy'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const LegalScreen(kind: 'privacy')),
            ),
          ),
          ListTile(
            title: const Text('Terms'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const LegalScreen(kind: 'terms')),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Back to app'),
          ),
        ],
      ),
    );
  }

  Widget _bullet(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('•  ', style: TextStyle(color: ArenaColors.cyan, fontWeight: FontWeight.w900)),
            Expanded(child: Text(t)),
          ],
        ),
      );
}
