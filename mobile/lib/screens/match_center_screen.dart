import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../services/api_client.dart';
import '../services/realtime_service.dart';
import '../widgets/arena_ui.dart';
import 'match_lobby_screen.dart';

/// In-app Match Live: WebView stream + Socket.io kill feed + lobby chat.
class MatchCenterScreen extends StatefulWidget {
  const MatchCenterScreen({super.key, required this.matchId});
  final String matchId;

  @override
  State<MatchCenterScreen> createState() => _MatchCenterScreenState();
}

class _MatchCenterScreenState extends State<MatchCenterScreen> {
  Map<String, dynamic>? watch;
  Map<String, dynamic>? match;
  final feed = <Map<String, dynamic>>[];
  final chat = <Map<String, dynamic>>[];
  final chatCtrl = TextEditingController();
  int streamIndex = 0;
  bool loading = true;
  String? error;
  WebViewController? webCtrl;
  final subs = <SocketSub>[];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  RealtimeService? _rt;

  @override
  void dispose() {
    for (final s in subs) {
      s.cancel();
    }
    _rt?.leaveMatchLive(widget.matchId);
    _rt?.leaveMatchLobby(widget.matchId);
    chatCtrl.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    final api = context.read<ApiClient>();
    final rt = context.read<RealtimeService>();
    _rt = rt;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final w = await api.matchWatch(widget.matchId);
      Map<String, dynamic>? m;
      try {
        m = await api.getMatch(widget.matchId);
      } catch (_) {
        m = w['match'] is Map ? Map<String, dynamic>.from(w['match'] as Map) : null;
      }
      List<dynamic> history = [];
      try {
        history = await api.listLobbyChat(widget.matchId);
      } catch (_) {}
      setState(() {
        watch = w;
        match = m ?? (w['match'] is Map ? Map<String, dynamic>.from(w['match'] as Map) : {});
        chat
          ..clear()
          ..addAll(history.map((e) => Map<String, dynamic>.from(e as Map)));
        loading = false;
      });
      _loadStream(0);
      rt.joinMatchLive(widget.matchId);
      rt.joinMatchLobby(widget.matchId);
      subs.add(rt.on('match:live:feed', (data) {
        if (!mounted) return;
        final map = data is Map ? Map<String, dynamic>.from(data) : {'headline': '$data'};
        setState(() => feed.insert(0, map));
      }));
      subs.add(rt.on('match:lobby:message', (data) {
        if (!mounted) return;
        final map = data is Map ? Map<String, dynamic>.from(data) : {'content': '$data'};
        setState(() => chat.add(map));
      }));
      subs.add(rt.on('match:updated', (data) {
        if (!mounted) return;
        final mrow = data is Map ? data['match'] : null;
        if (mrow is Map && '${mrow['id']}' == widget.matchId) {
          setState(() => match = Map<String, dynamic>.from(mrow));
        }
      }));
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  List<dynamic> get streams {
    final s = watch?['streams'];
    if (s is List && s.isNotEmpty) return s;
    final u = watch?['stream_url'] ?? match?['stream_url'];
    if (u != null && '$u'.isNotEmpty) {
      return [
        {'label': 'Main', 'stream_url': u}
      ];
    }
    return [];
  }

  String? _embedUrl(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final u = raw.trim();
    final yt = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]{6,})').firstMatch(u);
    if (yt != null) return 'https://www.youtube.com/embed/${yt.group(1)}?playsinline=1';
    final tw = RegExp(r'twitch\.tv/([A-Za-z0-9_]+)').firstMatch(u);
    if (tw != null && !u.contains('/clip/')) {
      return 'https://player.twitch.tv/?channel=${tw.group(1)}&parent=localhost&parent=127.0.0.1';
    }
    return u;
  }

  void _loadStream(int index) {
    final list = streams;
    if (list.isEmpty) {
      setState(() {
        streamIndex = 0;
        webCtrl = null;
      });
      return;
    }
    final i = index.clamp(0, list.length - 1);
    final url = _embedUrl('${list[i]['stream_url'] ?? ''}');
    if (url == null) return;
    final c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(url));
    setState(() {
      streamIndex = i;
      webCtrl = c;
    });
  }

  Future<void> _sendChat() async {
    final text = chatCtrl.text.trim();
    if (text.isEmpty) return;
    try {
      await context.read<ApiClient>().sendLobbyChat(
            widget.matchId,
            text,
            tournamentId: match?['tournament_id']?.toString(),
          );
      chatCtrl.clear();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: LoadingBody(label: 'Loading match center…'));
    }
    if (error != null) {
      return Scaffold(
        appBar: AppBar(),
        body: EmptyState(message: error!, actionLabel: 'Retry', onAction: _boot),
      );
    }
    final m = match ?? {};
    return Scaffold(
      appBar: AppBar(
        title: Text('${m['team_a_name'] ?? 'TBD'} vs ${m['team_b_name'] ?? 'TBD'}'),
        actions: [
          IconButton(
            tooltip: 'Lobby',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => MatchLobbyScreen(matchId: widget.matchId)),
              );
            },
            icon: const Icon(Icons.meeting_room_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Row(
              children: [
                StatusChip('${m['status'] ?? 'live'}'),
                const SizedBox(width: 12),
                Text(
                  '${m['score_a'] ?? 0} – ${m['score_b'] ?? 0}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 20,
                    color: ArenaColors.cyan,
                  ),
                ),
                const Spacer(),
                if (streams.length > 1)
                  DropdownButton<int>(
                    value: streamIndex,
                    items: [
                      for (var i = 0; i < streams.length; i++)
                        DropdownMenuItem(
                          value: i,
                          child: Text('${streams[i]['label'] ?? 'Stream ${i + 1}'}'),
                        ),
                    ],
                    onChanged: (v) {
                      if (v != null) _loadStream(v);
                    },
                  ),
              ],
            ),
          ),
          AspectRatio(
            aspectRatio: 16 / 9,
            child: webCtrl != null
                ? WebViewWidget(controller: webCtrl!)
                : Container(
                    color: Colors.black54,
                    alignment: Alignment.center,
                    child: const Text('No stream URL', style: TextStyle(color: Colors.white54)),
                  ),
          ),
          Expanded(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Text('EVENT LOG', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1)),
                      ),
                      Expanded(
                        child: feed.isEmpty
                            ? const Center(child: Text('Waiting for live events…', style: TextStyle(color: Colors.white38)))
                            : ListView.builder(
                                itemCount: feed.length,
                                itemBuilder: (ctx, i) {
                                  final e = feed[i];
                                  return ListTile(
                                    dense: true,
                                    title: Text('${e['headline'] ?? e['type'] ?? 'Event'}',
                                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                    subtitle: Text('${e['body'] ?? ''}', style: const TextStyle(fontSize: 11)),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(
                  child: Column(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text('LOBBY CHAT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1)),
                        ),
                      ),
                      Expanded(
                        child: chat.isEmpty
                            ? const Center(child: Text('No messages', style: TextStyle(color: Colors.white38)))
                            : ListView.builder(
                                itemCount: chat.length,
                                itemBuilder: (ctx, i) {
                                  final c = chat[i];
                                  final who = c['author_email'] ?? c['created_by'] ?? 'Player';
                                  final text = c['content'] ?? c['message'] ?? c['body'] ?? '';
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    child: Text.rich(
                                      TextSpan(
                                        children: [
                                          TextSpan(
                                            text: '$who: ',
                                            style: const TextStyle(color: ArenaColors.cyan, fontWeight: FontWeight.w700, fontSize: 12),
                                          ),
                                          TextSpan(text: '$text', style: const TextStyle(fontSize: 12)),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: chatCtrl,
                                decoration: const InputDecoration(hintText: 'Message…', isDense: true),
                                onSubmitted: (_) => _sendChat(),
                              ),
                            ),
                            IconButton(onPressed: _sendChat, icon: const Icon(Icons.send, color: ArenaColors.cyan)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
