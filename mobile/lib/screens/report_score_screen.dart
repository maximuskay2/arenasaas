import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';

class ReportScoreScreen extends StatefulWidget {
  const ReportScoreScreen({
    super.key,
    required this.matchId,
    required this.teamA,
    required this.teamB,
  });

  final String matchId;
  final String teamA;
  final String teamB;

  @override
  State<ReportScoreScreen> createState() => _ReportScoreScreenState();
}

class _ReportScoreScreenState extends State<ReportScoreScreen> {
  final scoreA = TextEditingController(text: '0');
  final scoreB = TextEditingController(text: '0');
  final pov = TextEditingController();
  final evidencePaths = <String>[];
  bool busy = false;

  @override
  void dispose() {
    scoreA.dispose();
    scoreB.dispose();
    pov.dispose();
    super.dispose();
  }

  Future<void> _pickEvidence() async {
    final picker = ImagePicker();
    final files = await picker.pickMultiImage(imageQuality: 85);
    if (files.isEmpty) return;
    setState(() {
      evidencePaths
        ..clear()
        ..addAll(files.map((f) => f.path));
    });
  }

  Future<void> _submit() async {
    setState(() => busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final api = context.read<ApiClient>();
    try {
      final a = int.tryParse(scoreA.text.trim()) ?? 0;
      final b = int.tryParse(scoreB.text.trim()) ?? 0;
      if (evidencePaths.isNotEmpty) {
        try {
          await api.uploadMatchEvidence(widget.matchId, evidencePaths);
        } catch (e) {
          // Non-blocking — score still transmits
          if (mounted) {
            messenger.showSnackBar(SnackBar(content: Text('Evidence upload: $e')));
          }
        }
      }
      await api.reportResult(
        widget.matchId,
        scoreA: a,
        scoreB: b,
        povLink: pov.text.trim().isEmpty ? null : pov.text.trim(),
      );
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Result submitted')));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report score')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            '${widget.teamA} vs ${widget.teamB}',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
          ),
          const SizedBox(height: 8),
          Text(
            'Both teams must report matching scores to auto-resolve. Attach screenshot evidence if the series may dispute.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: scoreA,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: '${widget.teamA} score'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: scoreB,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: '${widget.teamB} score'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: pov,
            decoration: const InputDecoration(
              labelText: 'POV / VOD link (optional)',
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: busy ? null : _pickEvidence,
            icon: const Icon(Icons.photo_library_outlined),
            label: Text(
              evidencePaths.isEmpty
                  ? 'Add evidence photos'
                  : '${evidencePaths.length} photo(s) selected',
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: busy ? null : _submit,
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Transmit results'),
          ),
        ],
      ),
    );
  }
}
