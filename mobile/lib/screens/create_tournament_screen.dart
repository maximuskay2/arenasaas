import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'login_screen.dart';
import 'tournament_detail_screen.dart';

/// Organizer: create a tournament (draft or open registration).
class CreateTournamentScreen extends StatefulWidget {
  const CreateTournamentScreen({super.key});

  @override
  State<CreateTournamentScreen> createState() => _CreateTournamentScreenState();
}

class _CreateTournamentScreenState extends State<CreateTournamentScreen> {
  final name = TextEditingController();
  final description = TextEditingController();
  final maxTeams = TextEditingController(text: '8');
  final prizePool = TextEditingController(text: '0');
  final entryFee = TextEditingController(text: '0');
  final currency = TextEditingController(text: 'USD');
  final rules = TextEditingController();
  final streamUrl = TextEditingController();

  String format = 'single_elimination';
  String entryType = 'FREE';
  String eloTier = 'none';
  String status = 'registration_open';
  String? gameTemplateId;
  List<dynamic> templates = [];
  bool loadingTemplates = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadTemplates());
  }

  @override
  void dispose() {
    name.dispose();
    description.dispose();
    maxTeams.dispose();
    prizePool.dispose();
    entryFee.dispose();
    currency.dispose();
    rules.dispose();
    streamUrl.dispose();
    super.dispose();
  }

  Future<void> _loadTemplates() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      setState(() => loadingTemplates = false);
      return;
    }
    try {
      final list = await context.read<ApiClient>().listGameTemplates();
      setState(() {
        templates = list;
        loadingTemplates = false;
        if (list.isNotEmpty) {
          final first = list.first;
          if (first is Map) gameTemplateId = first['id']?.toString();
        }
      });
    } catch (e) {
      setState(() => loadingTemplates = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Templates: $e')));
      }
    }
  }

  Future<void> _submit() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    // Platform admin (Central Station) is web-only; require league host membership.
    if (!auth.isLeagueHost) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            auth.isPlatformAdmin
                ? 'Platform admin: create platform-wide config on web. For a league event, use a tenant organizer account.'
                : 'Organizer role / tenant membership required',
          ),
        ),
      );
      return;
    }
    if (name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Name required')));
      return;
    }
    if (auth.api.tenantId == null || auth.api.tenantId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a tenant on Profile first')),
      );
      return;
    }

    setState(() => saving = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final fee = num.tryParse(entryFee.text.trim()) ?? 0;
      final body = <String, dynamic>{
        'name': name.text.trim(),
        'description': description.text.trim().isEmpty ? null : description.text.trim(),
        'format': format,
        'max_teams': int.tryParse(maxTeams.text.trim()) ?? 8,
        'prize_pool': num.tryParse(prizePool.text.trim()) ?? 0,
        'currency': currency.text.trim().isEmpty ? 'USD' : currency.text.trim().toUpperCase(),
        'entry_type': entryType,
        'entry_fee': entryType == 'FREE' ? 0 : fee,
        'status': status,
        'rules': rules.text.trim().isEmpty ? null : rules.text.trim(),
        'stream_url': streamUrl.text.trim().isEmpty ? null : streamUrl.text.trim(),
        if (gameTemplateId != null) 'game_template_id': gameTemplateId,
        if (eloTier != 'none') 'elo_tier': eloTier,
        'seeding_method': 'random',
        'check_in_duration_minutes': 15,
      };
      body.removeWhere((k, v) => v == null);

      final created = await context.read<ApiClient>().createTournament(body);
      final id = created['id']?.toString();
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Tournament created')));
      if (id != null) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => TournamentDetailScreen(tournamentId: id)),
        );
      } else {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Create tournament')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!auth.isLoggedIn)
            ElevatedButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              ),
              child: const Text('Sign in as organizer'),
            )
          else ...[
            Text(
              'Tenant: ${auth.api.tenantId ?? "none"} · Role: ${auth.user?['role'] ?? "?"}',
              style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Tournament name *'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: description,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: format,
              decoration: const InputDecoration(labelText: 'Format'),
              items: const [
                DropdownMenuItem(value: 'single_elimination', child: Text('Single elimination')),
                DropdownMenuItem(value: 'double_elimination', child: Text('Double elimination')),
                DropdownMenuItem(value: 'round_robin', child: Text('Round robin')),
                DropdownMenuItem(value: 'swiss', child: Text('Swiss')),
              ],
              onChanged: (v) => setState(() => format = v ?? format),
            ),
            const SizedBox(height: 12),
            if (loadingTemplates)
              const LinearProgressIndicator()
            else
              DropdownButtonFormField<String>(
                value: gameTemplateId,
                decoration: const InputDecoration(labelText: 'Game template'),
                items: [
                  for (final t in templates)
                    if (t is Map)
                      DropdownMenuItem(
                        value: t['id']?.toString(),
                        child: Text('${t['title'] ?? t['name'] ?? t['id']}'),
                      ),
                ],
                onChanged: (v) => setState(() => gameTemplateId = v),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: maxTeams,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Max teams'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: entryType,
                    decoration: const InputDecoration(labelText: 'Entry'),
                    items: const [
                      DropdownMenuItem(value: 'FREE', child: Text('Free')),
                      DropdownMenuItem(value: 'PAID', child: Text('Paid')),
                    ],
                    onChanged: (v) => setState(() => entryType = v ?? entryType),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: entryFee,
                    enabled: entryType == 'PAID',
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Entry fee'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: prizePool,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Prize pool'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: currency,
                    decoration: const InputDecoration(labelText: 'Currency'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: eloTier,
              decoration: const InputDecoration(labelText: 'Elo tier'),
              items: const [
                DropdownMenuItem(value: 'none', child: Text('Auto (prize pool)')),
                DropdownMenuItem(value: 'community', child: Text('Community')),
                DropdownMenuItem(value: 'regional', child: Text('Regional')),
                DropdownMenuItem(value: 'premier', child: Text('Premier')),
                DropdownMenuItem(value: 'major', child: Text('Major')),
              ],
              onChanged: (v) => setState(() => eloTier = v ?? eloTier),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: status,
              decoration: const InputDecoration(labelText: 'Initial status'),
              items: const [
                DropdownMenuItem(value: 'draft', child: Text('Draft')),
                DropdownMenuItem(value: 'registration_open', child: Text('Registration open')),
              ],
              onChanged: (v) => setState(() => status = v ?? status),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: streamUrl,
              decoration: const InputDecoration(labelText: 'Stream URL (optional)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: rules,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Rules'),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: saving ? null : _submit,
              child: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('CREATE TOURNAMENT'),
            ),
          ],
        ],
      ),
    );
  }
}
