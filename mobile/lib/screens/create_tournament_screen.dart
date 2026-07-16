import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';
import 'tournament_detail_screen.dart';

/// Multi-step create wizard: basics → game taxonomy → schedule/fees → prizes → eligibility → review.
class CreateTournamentScreen extends StatefulWidget {
  const CreateTournamentScreen({super.key});

  @override
  State<CreateTournamentScreen> createState() => _CreateTournamentScreenState();
}

class _CreateTournamentScreenState extends State<CreateTournamentScreen> {
  int step = 0;
  String? draftId;
  bool saving = false;

  final name = TextEditingController();
  final description = TextEditingController();
  final maxTeams = TextEditingController(text: '8');
  final prizePool = TextEditingController(text: '0');
  final entryFee = TextEditingController(text: '0');
  final currency = TextEditingController(text: 'USD');
  final rules = TextEditingController();
  final streamUrl = TextEditingController();
  final regions = TextEditingController();
  final minElo = TextEditingController();
  final rank1 = TextEditingController(text: '60');
  final rank2 = TextEditingController(text: '30');
  final rank3 = TextEditingController(text: '10');

  String format = 'single_elimination';
  String entryType = 'FREE';
  String eloTier = 'none';
  String status = 'registration_open';
  String prizeType = 'PERCENTAGE';
  bool requireHandle = false;
  String? bannerUrl;

  List<dynamic> platforms = [];
  List<dynamic> genres = [];
  List<dynamic> titles = [];
  List<dynamic> templates = [];
  String? platformId;
  String? genreId;
  String? titleId;
  String? gameTemplateId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
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
    regions.dispose();
    minElo.dispose();
    rank1.dispose();
    rank2.dispose();
    rank3.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final api = context.read<ApiClient>();
    try {
      final p = await api.taxonomyPlatforms();
      final t = await api.listGameTemplates();
      setState(() {
        platforms = p;
        templates = t;
        if (t.isNotEmpty && t.first is Map) gameTemplateId = t.first['id']?.toString();
      });
    } catch (_) {}
  }

  Future<void> _loadGenres() async {
    if (platformId == null) return;
    final g = await context.read<ApiClient>().taxonomyGenres(platformId: platformId);
    setState(() {
      genres = g;
      genreId = null;
      titles = [];
      titleId = null;
    });
  }

  Future<void> _loadTitles() async {
    final t = await context.read<ApiClient>().taxonomyTitles(platformId: platformId, genreId: genreId);
    setState(() {
      titles = t;
      titleId = null;
    });
  }

  Map<String, dynamic> _body() {
    final fee = num.tryParse(entryFee.text.trim()) ?? 0;
    final ranks = [
      if (prizeType == 'PERCENTAGE') ...[
        {'rank': 1, 'percent': num.tryParse(rank1.text) ?? 60},
        {'rank': 2, 'percent': num.tryParse(rank2.text) ?? 30},
        {'rank': 3, 'percent': num.tryParse(rank3.text) ?? 10},
      ] else ...[
        {'rank': 1, 'payout': num.tryParse(rank1.text) ?? 0},
        {'rank': 2, 'payout': num.tryParse(rank2.text) ?? 0},
        {'rank': 3, 'payout': num.tryParse(rank3.text) ?? 0},
      ],
    ];
    final allowed = regions.text
        .split(RegExp(r'[,|]'))
        .map((s) => s.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toList();
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
      if (titleId != null) 'game_title_id': titleId,
      if (eloTier != 'none') 'elo_tier': eloTier,
      if (bannerUrl != null) 'banner_url': bannerUrl,
      'require_game_handle': requireHandle,
      if (minElo.text.trim().isNotEmpty) 'min_team_elo': num.tryParse(minElo.text.trim()),
      if (allowed.isNotEmpty) 'allowed_regions': allowed,
      'prize_structure': {'type': prizeType, 'currency': currency.text.trim().toUpperCase(), 'ranks': ranks},
      'seeding_method': 'random',
      'check_in_duration_minutes': 15,
    };
    body.removeWhere((k, v) => v == null);
    return body;
  }

  Future<void> _autosave() async {
    final auth = context.read<AuthState>();
    if (!auth.isLeagueHost || name.text.trim().isEmpty) return;
    final api = context.read<ApiClient>();
    setState(() => saving = true);
    try {
      if (draftId == null) {
        final created = await api.createTournament({..._body(), 'status': 'draft'});
        draftId = created['id']?.toString();
      } else {
        await api.updateTournament(draftId!, _body());
      }
    } catch (_) {
      /* silent autosave */
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _pickBanner() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file == null) return;
    try {
      final bytes = await file.readAsBytes();
      final out = await context.read<ApiClient>().uploadFile(bytes, file.name);
      setState(() => bannerUrl = out['file_url']?.toString() ?? out['url']?.toString());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _finish() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    if (!auth.isLeagueHost) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('League host membership required')),
      );
      return;
    }
    if (name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Name required')));
      return;
    }
    if (auth.api.tenantId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a tenant in Settings')));
      return;
    }
    setState(() => saving = true);
    try {
      final body = _body();
      Map<String, dynamic> created;
      if (draftId != null) {
        created = await context.read<ApiClient>().updateTournament(draftId!, body);
        created = {...created, 'id': draftId};
      } else {
        created = await context.read<ApiClient>().createTournament(body);
      }
      final id = created['id']?.toString() ?? draftId;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tournament saved')));
      if (id != null) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => TournamentDetailScreen(tournamentId: id)),
        );
      } else {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final steps = ['Basics', 'Game', 'Money', 'Prizes', 'Eligibility', 'Review'];
    return Scaffold(
      appBar: AppBar(
        title: Text('Create · ${steps[step]}'),
        actions: [
          if (saving)
            const Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(value: (step + 1) / steps.length),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (step == 0) ...[
                  TextField(controller: name, decoration: const InputDecoration(labelText: 'Name *'), onChanged: (_) => _autosave()),
                  const SizedBox(height: 10),
                  TextField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'Description')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: format,
                    decoration: const InputDecoration(labelText: 'Format'),
                    items: const [
                      DropdownMenuItem(value: 'single_elimination', child: Text('Single elim')),
                      DropdownMenuItem(value: 'double_elimination', child: Text('Double elim')),
                      DropdownMenuItem(value: 'round_robin', child: Text('Round robin')),
                      DropdownMenuItem(value: 'swiss', child: Text('Swiss')),
                    ],
                    onChanged: (v) => setState(() => format = v ?? format),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: maxTeams, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Max teams')),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(onPressed: _pickBanner, icon: const Icon(Icons.image), label: Text(bannerUrl == null ? 'Upload banner' : 'Banner set')),
                ],
                if (step == 1) ...[
                  DropdownButtonFormField<String>(
                    value: platformId,
                    decoration: const InputDecoration(labelText: 'Platform'),
                    items: [
                      for (final p in platforms)
                        if (p is Map)
                          DropdownMenuItem(value: p['id']?.toString(), child: Text('${p['name'] ?? p['key'] ?? p['id']}')),
                    ],
                    onChanged: (v) async {
                      setState(() => platformId = v);
                      await _loadGenres();
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: genreId,
                    decoration: const InputDecoration(labelText: 'Genre'),
                    items: [
                      for (final g in genres)
                        if (g is Map)
                          DropdownMenuItem(value: g['id']?.toString(), child: Text('${g['name'] ?? g['id']}')),
                    ],
                    onChanged: (v) async {
                      setState(() => genreId = v);
                      await _loadTitles();
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: titleId,
                    decoration: const InputDecoration(labelText: 'Game title'),
                    items: [
                      for (final t in titles)
                        if (t is Map)
                          DropdownMenuItem(value: t['id']?.toString(), child: Text('${t['name'] ?? t['title'] ?? t['id']}')),
                    ],
                    onChanged: (v) => setState(() => titleId = v),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: gameTemplateId,
                    decoration: const InputDecoration(labelText: 'Game template (fallback)'),
                    items: [
                      for (final t in templates)
                        if (t is Map)
                          DropdownMenuItem(value: t['id']?.toString(), child: Text('${t['title'] ?? t['name']}')),
                    ],
                    onChanged: (v) => setState(() => gameTemplateId = v),
                  ),
                ],
                if (step == 2) ...[
                  DropdownButtonFormField<String>(
                    value: entryType,
                    decoration: const InputDecoration(labelText: 'Entry type'),
                    items: const [
                      DropdownMenuItem(value: 'FREE', child: Text('Free')),
                      DropdownMenuItem(value: 'PAID', child: Text('Paid')),
                    ],
                    onChanged: (v) => setState(() => entryType = v ?? entryType),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: entryFee, enabled: entryType == 'PAID', keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Entry fee')),
                  const SizedBox(height: 10),
                  TextField(controller: prizePool, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Prize pool headline')),
                  const SizedBox(height: 10),
                  TextField(controller: currency, decoration: const InputDecoration(labelText: 'Currency')),
                  const SizedBox(height: 10),
                  TextField(controller: streamUrl, decoration: const InputDecoration(labelText: 'Stream URL')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: eloTier,
                    decoration: const InputDecoration(labelText: 'Elo tier'),
                    items: const [
                      DropdownMenuItem(value: 'none', child: Text('Auto')),
                      DropdownMenuItem(value: 'community', child: Text('Community')),
                      DropdownMenuItem(value: 'regional', child: Text('Regional')),
                      DropdownMenuItem(value: 'premier', child: Text('Premier')),
                      DropdownMenuItem(value: 'major', child: Text('Major')),
                    ],
                    onChanged: (v) => setState(() => eloTier = v ?? eloTier),
                  ),
                ],
                if (step == 3) ...[
                  DropdownButtonFormField<String>(
                    value: prizeType,
                    decoration: const InputDecoration(labelText: 'Prize model'),
                    items: const [
                      DropdownMenuItem(value: 'PERCENTAGE', child: Text('Percentage of pot')),
                      DropdownMenuItem(value: 'FIXED', child: Text('Fixed amounts')),
                    ],
                    onChanged: (v) => setState(() => prizeType = v ?? prizeType),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: rank1, decoration: InputDecoration(labelText: prizeType == 'PERCENTAGE' ? '1st %' : '1st payout')),
                  TextField(controller: rank2, decoration: InputDecoration(labelText: prizeType == 'PERCENTAGE' ? '2nd %' : '2nd payout')),
                  TextField(controller: rank3, decoration: InputDecoration(labelText: prizeType == 'PERCENTAGE' ? '3rd %' : '3rd payout')),
                ],
                if (step == 4) ...[
                  TextField(controller: regions, decoration: const InputDecoration(labelText: 'Allowed regions', hintText: 'us,eu,africa or leave empty')),
                  const SizedBox(height: 10),
                  TextField(controller: minElo, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Min team Elo')),
                  SwitchListTile(
                    title: const Text('Require game handle'),
                    value: requireHandle,
                    onChanged: (v) => setState(() => requireHandle = v),
                  ),
                  TextField(controller: rules, maxLines: 4, decoration: const InputDecoration(labelText: 'Rules')),
                ],
                if (step == 5) ...[
                  DropdownButtonFormField<String>(
                    value: status,
                    decoration: const InputDecoration(labelText: 'Publish status'),
                    items: const [
                      DropdownMenuItem(value: 'draft', child: Text('Keep draft')),
                      DropdownMenuItem(value: 'registration_open', child: Text('Open registration')),
                    ],
                    onChanged: (v) => setState(() => status = v ?? status),
                  ),
                  const SizedBox(height: 12),
                  ArenaCard(
                    child: Text(
                      '${name.text}\n$format · max ${maxTeams.text}\n$entryType ${entryFee.text} ${currency.text}\nPrize pool ${prizePool.text} ($prizeType)',
                      style: const TextStyle(height: 1.4),
                    ),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  if (step > 0)
                    OutlinedButton(onPressed: () => setState(() => step--), child: const Text('Back')),
                  const Spacer(),
                  if (step < steps.length - 1)
                    ElevatedButton(
                      onPressed: () async {
                        await _autosave();
                        setState(() => step++);
                      },
                      child: const Text('Next'),
                    )
                  else
                    ElevatedButton(onPressed: saving ? null : _finish, child: const Text('Publish')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
