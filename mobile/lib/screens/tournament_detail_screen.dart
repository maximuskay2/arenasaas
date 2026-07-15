import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'login_screen.dart';

class _RosterSlot {
  final email = TextEditingController();
  final name = TextEditingController();
  final gameId = TextEditingController();
  void dispose() {
    email.dispose();
    name.dispose();
    gameId.dispose();
  }
}

class TournamentDetailScreen extends StatefulWidget {
  const TournamentDetailScreen({super.key, required this.tournamentId});
  final String tournamentId;

  @override
  State<TournamentDetailScreen> createState() => _TournamentDetailScreenState();
}

class _TournamentDetailScreenState extends State<TournamentDetailScreen> {
  Map<String, dynamic>? t;
  bool loading = true;
  String? error;
  bool joining = false;
  String joinMode = 'solo'; // solo | team
  String payProvider = 'dev';
  final gameIdCtrl = TextEditingController();
  final regionCtrl = TextEditingController(text: 'global');
  final teamNameCtrl = TextEditingController();
  final tagCtrl = TextEditingController();
  final List<_RosterSlot> rosterSlots = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    gameIdCtrl.dispose();
    regionCtrl.dispose();
    teamNameCtrl.dispose();
    tagCtrl.dispose();
    for (final s in rosterSlots) {
      s.dispose();
    }
    super.dispose();
  }

  int get rosterSize {
    final r = t?['team_roster_size'] ?? t?['roster_size'];
    final n = int.tryParse('$r') ?? 1;
    return n < 1 ? 1 : n;
  }

  bool get requiresPayment {
    if (t == null) return false;
    final fee = num.tryParse('${t!['entry_fee'] ?? 0}') ?? 0;
    final type = '${t!['entry_type'] ?? ''}'.toUpperCase();
    if (type == 'FREE') return false;
    return fee > 0 || type == 'PAID';
  }

  void _ensureRosterSlots() {
    final needTeammates = joinMode == 'team' ? (rosterSize > 1 ? rosterSize - 1 : 0) : 0;
    while (rosterSlots.length < needTeammates) {
      rosterSlots.add(_RosterSlot());
    }
    while (rosterSlots.length > needTeammates) {
      rosterSlots.removeLast().dispose();
    }
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      Map<String, dynamic> row;
      try {
        row = await api.tournament(widget.tournamentId);
      } catch (_) {
        final cat = await api.catalog(limit: 100);
        final list = (cat['items'] ?? cat['tournaments'] ?? cat['data'] ?? []) as List? ?? [];
        Map<String, dynamic>? found;
        for (final e in list) {
          if (e is Map && '${e['id']}' == widget.tournamentId) {
            found = Map<String, dynamic>.from(e);
            break;
          }
        }
        if (found == null) throw ApiException(404, 'Tournament not found');
        row = found;
      }
      setState(() {
        t = row;
        // Prefer team mode when roster > 1
        if (rosterSize > 1) joinMode = 'team';
        _ensureRosterSlots();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<bool> _ensureAuth() async {
    final auth = context.read<AuthState>();
    if (auth.isLoggedIn) return true;
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
    return ok == true;
  }

  Future<Map<String, dynamic>?> _obtainPaymentProof() async {
    if (!requiresPayment) return null;
    final api = context.read<ApiClient>();
    final tid = widget.tournamentId;

    if (payProvider == 'wallet') {
      return {'method': 'wallet', 'provider': 'wallet', 'reference': 'wallet'};
    }

    if (payProvider == 'dev') {
      final sim = await api.devSimulateEntry(tid);
      final ref = sim['reference']?.toString() ??
          sim['ledger']?['reference']?.toString() ??
          sim['payment']?['reference']?.toString() ??
          sim['id']?.toString();
      if (ref == null || ref.isEmpty) {
        throw ApiException(500, 'Dev simulate entry did not return a reference: $sim');
      }
      return {'provider': 'dev', 'reference': ref};
    }

    if (payProvider == 'stripe') {
      final session = await api.createStripeCheckout(tournamentId: tid);
      final url = session['url']?.toString() ?? session['checkout_url']?.toString();
      final ref = session['id']?.toString() ?? session['session_id']?.toString();
      if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (ref == null) throw ApiException(400, 'No Stripe session id returned');
      return {'provider': 'stripe', 'reference': ref};
    }

    if (payProvider == 'paystack') {
      final init = await api.paystackInitialize(tournamentId: tid);
      final url = init['authorization_url']?.toString() ??
          init['data']?['authorization_url']?.toString();
      final ref = init['reference']?.toString() ?? init['data']?['reference']?.toString();
      if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (ref == null) throw ApiException(400, 'No Paystack reference');
      return {'provider': 'paystack', 'reference': ref};
    }

    if (payProvider == 'flutterwave') {
      final init = await api.flutterwaveInitialize(tournamentId: tid);
      final url = init['link']?.toString() ?? init['data']?['link']?.toString();
      final ref = init['tx_ref']?.toString() ?? init['data']?['tx_ref']?.toString();
      if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (ref == null) throw ApiException(400, 'No Flutterwave tx_ref');
      return {'provider': 'flutterwave', 'reference': ref};
    }

    return null;
  }

  List<Map<String, dynamic>>? _buildRoster() {
    if (joinMode != 'team' || rosterSize <= 1) return null;
    final out = <Map<String, dynamic>>[];
    for (var i = 0; i < rosterSlots.length; i++) {
      final s = rosterSlots[i];
      final email = s.email.text.trim().toLowerCase();
      final gid = s.gameId.text.trim();
      if (email.isEmpty) {
        throw ApiException(400, 'Teammate ${i + 1}: email required');
      }
      if (gid.isEmpty && (t?['require_game_handle'] == true || rosterSize > 1)) {
        throw ApiException(400, 'Teammate ${i + 1}: game ID required');
      }
      out.add({
        'player_email': email,
        'player_name': s.name.text.trim().isEmpty ? email.split('@').first : s.name.text.trim(),
        'game_id': gid,
      });
    }
    return out;
  }

  Future<void> _join() async {
    if (!await _ensureAuth()) return;
    if (!mounted) return;
    final api = context.read<ApiClient>();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => joining = true);
    try {
      Map<String, dynamic>? proof;
      if (requiresPayment) proof = await _obtainPaymentProof();

      List<Map<String, dynamic>>? roster;
      try {
        roster = _buildRoster();
      } on ApiException catch (e) {
        messenger.showSnackBar(SnackBar(content: Text(e.message)));
        return;
      }

      if (joinMode == 'team') {
        if (teamNameCtrl.text.trim().isEmpty || tagCtrl.text.trim().isEmpty) {
          messenger.showSnackBar(const SnackBar(content: Text('Team name and tag required')));
          return;
        }
      }

      await api.joinTournament(
        widget.tournamentId,
        mode: joinMode,
        teamName: joinMode == 'team' ? teamNameCtrl.text.trim() : null,
        tag: joinMode == 'team' ? tagCtrl.text.trim() : null,
        gameId: gameIdCtrl.text.trim().isEmpty ? null : gameIdCtrl.text.trim(),
        roster: roster,
        region: regionCtrl.text.trim().isEmpty ? null : regionCtrl.text.trim(),
        paymentProof: proof,
        idempotencyKey: const Uuid().v4(),
      );
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Joined tournament')));
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.status == 503 && requiresPayment) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('${e.message} — try Dev simulate'),
            action: SnackBarAction(label: 'Use Dev', onPressed: () => setState(() => payProvider = 'dev')),
          ),
        );
      } else {
        messenger.showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (error != null || t == null) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(error ?? 'Not found')));
    }
    final name = '${t!['name'] ?? 'Tournament'}';
    final status = '${t!['status'] ?? ''}'.replaceAll('_', ' ');
    final fee = t!['entry_fee'];
    final prize = t!['prize_pool'];
    final game = t!['game_title'] ?? t!['game'] ?? '';
    final open = '${t!['status']}' == 'registration_open' ||
        status.toLowerCase().contains('registration open');
    final teamAllowed = rosterSize > 1;

    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(name, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(label: Text(status)),
              if (game.toString().isNotEmpty) Chip(label: Text('$game')),
              Chip(label: Text('Roster size: $rosterSize')),
              if (requiresPayment)
                Chip(label: Text('Paid: $fee ${t!['currency'] ?? ''}'))
              else
                const Chip(label: Text('Free entry')),
            ],
          ),
          const SizedBox(height: 12),
          _meta('Prize pool', prize == null ? 'TBD' : '$prize'),
          if (t!['elo_tier'] != null) _meta('Elo tier', '${t!['elo_tier']}'),
          if (t!['allowed_regions'] is List && (t!['allowed_regions'] as List).isNotEmpty)
            _meta('Regions', (t!['allowed_regions'] as List).join(', ')),
          if (t!['description'] != null) ...[
            const SizedBox(height: 12),
            Text('${t!['description']}'),
          ],
          const SizedBox(height: 20),
          if (open) ...[
            Text('Join as', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: [
                const ButtonSegment(value: 'solo', label: Text('Solo')),
                if (teamAllowed) const ButtonSegment(value: 'team', label: Text('Team')),
              ],
              selected: {joinMode == 'team' && teamAllowed ? 'team' : 'solo'},
              onSelectionChanged: (s) {
                setState(() {
                  joinMode = s.first;
                  _ensureRosterSlots();
                });
              },
            ),
            if (joinMode == 'team' && teamAllowed) ...[
              const SizedBox(height: 16),
              TextField(
                controller: teamNameCtrl,
                decoration: const InputDecoration(labelText: 'Team name *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: tagCtrl,
                decoration: const InputDecoration(labelText: 'Tag (≤5) *', hintText: 'ACE'),
                maxLength: 5,
              ),
              const SizedBox(height: 8),
              Text(
                'Captain game ID + teammates (roster size $rosterSize = you + ${rosterSize - 1})',
                style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.55)),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: gameIdCtrl,
                decoration: const InputDecoration(labelText: 'Your (captain) game ID'),
              ),
              ...List.generate(rosterSlots.length, (i) {
                final s = rosterSlots[i];
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Teammate ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          TextField(
                            controller: s.email,
                            decoration: const InputDecoration(labelText: 'Email *'),
                            keyboardType: TextInputType.emailAddress,
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: s.name,
                            decoration: const InputDecoration(labelText: 'Display name'),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: s.gameId,
                            decoration: const InputDecoration(labelText: 'Game ID *'),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ] else ...[
              const SizedBox(height: 12),
              TextField(
                controller: gameIdCtrl,
                decoration: const InputDecoration(labelText: 'In-game ID (if required)'),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: regionCtrl,
              decoration: const InputDecoration(labelText: 'Your region', hintText: 'global, us, eu…'),
            ),
            if (requiresPayment) ...[
              const SizedBox(height: 16),
              Text('Payment', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final p in [
                    ('dev', 'Dev'),
                    ('wallet', 'Wallet'),
                    ('stripe', 'Stripe'),
                    ('paystack', 'Paystack'),
                    ('flutterwave', 'FW'),
                  ])
                    ChoiceChip(
                      label: Text(p.$2),
                      selected: payProvider == p.$1,
                      onSelected: (_) => setState(() => payProvider = p.$1),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: joining ? null : _join,
              child: joining
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      joinMode == 'team'
                          ? (requiresPayment ? 'PAY & JOIN TEAM' : 'JOIN AS TEAM')
                          : (requiresPayment ? 'PAY & JOIN SOLO' : 'JOIN SOLO'),
                    ),
            ),
          ] else
            Text(
              'Registration is not open',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
            ),
        ],
      ),
    );
  }

  Widget _meta(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(k, style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
          ),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
