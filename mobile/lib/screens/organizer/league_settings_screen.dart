import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../state/auth_state.dart';
import '../../widgets/arena_ui.dart';

class LeagueSettingsScreen extends StatefulWidget {
  const LeagueSettingsScreen({super.key});

  @override
  State<LeagueSettingsScreen> createState() => _LeagueSettingsScreenState();
}

class _LeagueSettingsScreenState extends State<LeagueSettingsScreen> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? config;
  Map<String, dynamic>? connect;
  final name = TextEditingController();
  final primary = TextEditingController();
  final logo = TextEditingController();
  final payoutRail = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    name.dispose();
    primary.dispose();
    logo.dispose();
    payoutRail.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final configs = await api.listEntities('TenantConfig', query: {'limit': '5'});
      Map<String, dynamic>? cfg;
      final tid = api.tenantId;
      for (final c in configs) {
        if (c is Map && (tid == null || '${c['tenant_id']}' == tid)) {
          cfg = Map<String, dynamic>.from(c);
          break;
        }
      }
      if (cfg == null && configs.isNotEmpty && configs.first is Map) {
        cfg = Map<String, dynamic>.from(configs.first as Map);
      }
      Map<String, dynamic>? conn;
      try {
        conn = await api.stripeConnectStatus();
      } catch (_) {}
      setState(() {
        config = cfg;
        connect = conn;
        name.text = cfg?['tenant_name']?.toString() ?? '';
        primary.text = cfg?['primary_color']?.toString() ?? '#00d4ff';
        logo.text = cfg?['logo_url']?.toString() ?? '';
        payoutRail.text = cfg?['payout_provider']?.toString() ?? cfg?['payment_provider']?.toString() ?? 'stripe';
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _save() async {
    final id = config?['id']?.toString();
    final body = {
      'tenant_name': name.text.trim(),
      'primary_color': primary.text.trim(),
      'logo_url': logo.text.trim().isEmpty ? null : logo.text.trim(),
      'payment_provider': payoutRail.text.trim(),
    };
    body.removeWhere((k, v) => v == null);
    try {
      final api = context.read<ApiClient>();
      if (id != null) {
        await api.patchEntity('TenantConfig', id, body);
      } else {
        await api.createEntity('TenantConfig', {
          ...body,
          'tenant_id': api.tenantId,
        });
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings saved')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final tid = context.watch<AuthState>().api.tenantId;
    return Scaffold(
      appBar: AppBar(title: const Text('League settings')),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('Tenant: $tid', style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
                    const SizedBox(height: 12),
                    const SectionHeader('Branding'),
                    TextField(controller: name, decoration: const InputDecoration(labelText: 'Display name')),
                    const SizedBox(height: 8),
                    TextField(controller: primary, decoration: const InputDecoration(labelText: 'Primary color')),
                    const SizedBox(height: 8),
                    TextField(controller: logo, decoration: const InputDecoration(labelText: 'Logo URL')),
                    const SizedBox(height: 16),
                    const SectionHeader('Payout rail'),
                    TextField(
                      controller: payoutRail,
                      decoration: const InputDecoration(labelText: 'Provider', hintText: 'stripe | paystack | flutterwave'),
                    ),
                    const SizedBox(height: 12),
                    if (connect != null)
                      ArenaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Stripe Connect', style: TextStyle(fontWeight: FontWeight.w800)),
                            Text('charges_enabled: ${connect!['charges_enabled']}'),
                            Text('payouts_enabled: ${connect!['payouts_enabled']}'),
                            Text('details_submitted: ${connect!['details_submitted']}'),
                            if (connect!['connected_account_id'] != null)
                              Text('account: ${connect!['connected_account_id']}'),
                          ],
                        ),
                      ),
                    const SizedBox(height: 20),
                    ElevatedButton(onPressed: _save, child: const Text('Save settings')),
                  ],
                ),
    );
  }
}
