import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/arena_ui.dart';

class RevenueScreen extends StatefulWidget {
  const RevenueScreen({super.key});

  @override
  State<RevenueScreen> createState() => _RevenueScreenState();
}

class _RevenueScreenState extends State<RevenueScreen> {
  bool loading = true;
  String? error;
  List<dynamic> ledger = [];
  List<dynamic> wallets = [];

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
      final api = context.read<ApiClient>();
      final led = await api.listEntities('PaymentLedger', query: {'limit': '50'});
      final tw = await api.listEntities('TenantWallet', query: {'limit': '20'});
      setState(() {
        ledger = led;
        wallets = tw;
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
    double entrySum = 0;
    double prizeSum = 0;
    for (final row in ledger) {
      if (row is! Map) continue;
      final amt = num.tryParse('${row['amount'] ?? 0}') ?? 0;
      final type = '${row['type'] ?? ''}'.toLowerCase();
      if (type.contains('entry')) entrySum += amt;
      if (type.contains('prize')) prizeSum += amt;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Revenue & wallet'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: loading
          ? const LoadingBody()
          : error != null
              ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          Expanded(child: StatTile(label: 'Entry fees (ledger)', value: entrySum.toStringAsFixed(2))),
                          const SizedBox(width: 8),
                          Expanded(child: StatTile(label: 'Prize payouts', value: prizeSum.toStringAsFixed(2))),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const SectionHeader('Tenant wallets'),
                      if (wallets.isEmpty)
                        const Text('No tenant wallet rows', style: TextStyle(color: Colors.white54))
                      else
                        ...wallets.map((w) {
                          final m = Map<String, dynamic>.from(w as Map);
                          return ListTile(
                            title: Text('${m['currency'] ?? 'USD'}'),
                            subtitle: Text('tenant ${m['tenant_id'] ?? ''}'),
                            trailing: Text('${m['balance'] ?? 0}',
                                style: const TextStyle(color: ArenaColors.cyan, fontWeight: FontWeight.w900)),
                          );
                        }),
                      const SizedBox(height: 16),
                      const SectionHeader('Recent ledger'),
                      if (ledger.isEmpty)
                        const Text('No ledger rows', style: TextStyle(color: Colors.white54))
                      else
                        ...ledger.take(30).map((row) {
                          final m = Map<String, dynamic>.from(row as Map);
                          return ListTile(
                            dense: true,
                            title: Text('${m['type'] ?? 'tx'} · ${m['amount'] ?? 0} ${m['currency'] ?? ''}'),
                            subtitle: Text('${m['status'] ?? ''} · ${m['reference'] ?? m['provider'] ?? ''}'),
                          );
                        }),
                    ],
                  ),
                ),
    );
  }
}
