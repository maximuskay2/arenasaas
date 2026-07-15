import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'login_screen.dart';

class VaultScreen extends StatefulWidget {
  const VaultScreen({super.key});

  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  bool loading = true;
  String? error;
  List<dynamic> wallets = [];
  List<dynamic> accolades = [];
  Map<String, dynamic>? hub;

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
        wallets = [];
        accolades = [];
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final w = await api.myWallet();
      final a = await api.myAccolades();
      Map<String, dynamic>? h;
      try {
        h = await api.myHub();
      } catch (_) {}
      setState(() {
        wallets = w;
        accolades = a;
        hub = h;
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
        title: const Text('Vault'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: !auth.isLoggedIn
          ? Center(
              child: ElevatedButton(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  );
                  _load();
                },
                child: const Text('Sign in'),
              ),
            )
          : loading
              ? const Center(child: CircularProgressIndicator())
              : error != null
                  ? Center(child: Text(error!))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          Text(
                            'Balances',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          if (wallets.isEmpty)
                            Text(
                              'No wallet balances yet. Prize payouts credit here.',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                            )
                          else
                            ...wallets.map((w) {
                              final m = Map<String, dynamic>.from(w as Map);
                              return Card(
                                child: ListTile(
                                  title: Text(
                                    '${m['currency'] ?? '—'}',
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                  trailing: Text(
                                    '${m['balance'] ?? 0}',
                                    style: const TextStyle(
                                      color: Color(0xFF00D4FF),
                                      fontWeight: FontWeight.w900,
                                      fontSize: 18,
                                    ),
                                  ),
                                ),
                              );
                            }),
                          if (hub != null) ...[
                            const SizedBox(height: 20),
                            Text(
                              'Hub',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 8),
                            Text('Accolades: ${hub!['accolades_count'] ?? accolades.length}'),
                            if (hub!['upcoming_matches'] != null)
                              Text('Upcoming matches: ${hub!['upcoming_matches']}'),
                          ],
                          const SizedBox(height: 24),
                          Text(
                            'Trophy case',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          if (accolades.isEmpty)
                            Text(
                              'No badges yet. Win placements to fill your case.',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                            )
                          else
                            ...accolades.map((a) {
                              final m = Map<String, dynamic>.from(a as Map);
                              final rank = m['rank'];
                              return Card(
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: rank == 1
                                        ? Colors.amber.withValues(alpha: 0.25)
                                        : rank == 2
                                            ? Colors.blueGrey.withValues(alpha: 0.3)
                                            : Colors.brown.withValues(alpha: 0.3),
                                    child: Text('#$rank'),
                                  ),
                                  title: Text(
                                    m['tournament_title']?.toString() ?? 'Tournament',
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                  subtitle: Text(m['badge_id']?.toString() ?? 'Placement'),
                                ),
                              );
                            }),
                          const SizedBox(height: 24),
                          Text(
                            'Withdraw',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          ElevatedButton(
                            onPressed: wallets.isEmpty ? null : () => _requestWithdraw(),
                            child: const Text('Request withdrawal'),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'KYC may be required above platform thresholds. Same API as web vault.',
                            style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.4)),
                          ),
                        ],
                      ),
                    ),
    );
  }

  Future<void> _requestWithdraw() async {
    if (wallets.isEmpty) return;
    final first = Map<String, dynamic>.from(wallets.first as Map);
    final currency = first['currency']?.toString() ?? 'USD';
    final amountCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw'),
        content: TextField(
          controller: amountCtrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: 'Amount ($currency)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit')),
        ],
      ),
    );
    if (ok != true) return;
    final amount = num.tryParse(amountCtrl.text.trim());
    amountCtrl.dispose();
    if (amount == null || amount <= 0) return;
    try {
      await context.read<ApiClient>().withdrawalRequest({
        'amount': amount,
        'currency': currency,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal requested')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}
