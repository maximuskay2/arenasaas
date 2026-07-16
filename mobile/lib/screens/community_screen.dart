import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_client.dart';
import '../services/realtime_service.dart';
import '../state/auth_state.dart';
import '../widgets/arena_ui.dart';
import 'login_screen.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  bool loading = true;
  String? error;
  List<dynamic> posts = [];
  final composer = TextEditingController();
  final titleCtrl = TextEditingController();
  final mediaCtrl = TextEditingController();
  String? expandedId;
  final Map<String, List<dynamic>> comments = {};
  final commentCtrl = TextEditingController();
  final feedSubs = <SocketSub>[];
  String postType = 'strategy';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
      final rt = context.read<RealtimeService>();
      rt.joinFeed(global: true, tenantId: context.read<ApiClient>().tenantId);
      feedSubs.add(rt.on('community:post', (_) => _load()));
      feedSubs.add(rt.on('community:like', (_) => _load()));
      feedSubs.add(rt.on('community:comment', (_) {
        if (expandedId != null) _loadComments(expandedId!);
        _load();
      }));
    });
  }

  @override
  void dispose() {
    for (final s in feedSubs) {
      s.cancel();
    }
    composer.dispose();
    titleCtrl.dispose();
    mediaCtrl.dispose();
    commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<ApiClient>();
      List<dynamic> list;
      try {
        list = await api.communityPosts(scope: 'global');
      } catch (_) {
        list = await api.publicCommunityPosts();
      }
      setState(() {
        posts = list;
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _loadComments(String postId) async {
    try {
      final c = await context.read<ApiClient>().postComments(postId);
      setState(() => comments[postId] = c);
    } catch (_) {}
  }

  Future<void> _post() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    final text = composer.text.trim();
    if (text.isEmpty) return;
    try {
      await context.read<ApiClient>().createCommunityPost({
        'content': text,
        'body': text,
        'title': titleCtrl.text.trim().isEmpty ? text.substring(0, text.length.clamp(0, 80)) : titleCtrl.text.trim(),
        'post_type': postType,
        if (mediaCtrl.text.trim().isNotEmpty) 'media_url': mediaCtrl.text.trim(),
        'scope': 'global',
      });
      composer.clear();
      titleCtrl.clear();
      mediaCtrl.clear();
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _like(String id, bool liked) async {
    try {
      if (liked) {
        await context.read<ApiClient>().unlikePost(id);
      } else {
        await context.read<ApiClient>().likePost(id);
      }
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Community'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: ArenaCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      for (final t in ['strategy', 'recruitment', 'announcement'])
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(t),
                            selected: postType == t,
                            onSelected: (_) => setState(() => postType = t),
                          ),
                        ),
                    ],
                  ),
                  TextField(controller: titleCtrl, decoration: const InputDecoration(hintText: 'Title (optional)', isDense: true)),
                  TextField(controller: composer, decoration: const InputDecoration(hintText: 'Post to the war room…'), minLines: 1, maxLines: 3),
                  TextField(controller: mediaCtrl, decoration: const InputDecoration(hintText: 'Media URL (YouTube/Twitch)', isDense: true)),
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton.filled(onPressed: _post, icon: const Icon(Icons.send)),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: loading
                ? const LoadingBody()
                : error != null
                    ? EmptyState(message: error!, actionLabel: 'Retry', onAction: _load)
                    : posts.isEmpty
                        ? const EmptyState(message: 'No posts yet. Start the conversation.')
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: posts.length,
                              separatorBuilder: (c, i) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) {
                                final p = Map<String, dynamic>.from(posts[i] as Map);
                                final id = p['id']?.toString() ?? '';
                                final body = p['content'] ?? p['body'] ?? p['title'] ?? '';
                                final author = p['author_email'] ?? p['author_name'] ?? p['author_display_name'] ?? 'Player';
                                final pinned = p['pinned'] == true || p['is_pinned'] == true;
                                final liked = p['liked_by_me'] == true;
                                final media = p['media_url']?.toString();
                                final expanded = expandedId == id;
                                return ArenaCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text('$author',
                                                style: const TextStyle(fontWeight: FontWeight.w700, color: ArenaColors.cyan)),
                                          ),
                                          if (pinned) const StatusChip('pinned'),
                                          if (auth.isLeagueHost || auth.isPlatformAdmin)
                                            PopupMenuButton<String>(
                                              onSelected: (v) async {
                                                if (v == 'pin') await context.read<ApiClient>().pinCommunityPost(id, !pinned);
                                                if (v == 'del') await context.read<ApiClient>().deleteCommunityPost(id);
                                                _load();
                                              },
                                              itemBuilder: (_) => [
                                                PopupMenuItem(value: 'pin', child: Text(pinned ? 'Unpin' : 'Pin')),
                                                const PopupMenuItem(value: 'del', child: Text('Delete')),
                                              ],
                                            ),
                                        ],
                                      ),
                                      if (p['title'] != null)
                                        Text('${p['title']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                                      Text('$body'),
                                      if (media != null && media.isNotEmpty) ...[
                                        const SizedBox(height: 8),
                                        if (media.contains('youtube') || media.contains('youtu.be') || media.contains('twitch'))
                                          TextButton(
                                            onPressed: () => launchUrl(Uri.parse(media), mode: LaunchMode.externalApplication),
                                            child: Text(media, maxLines: 1, overflow: TextOverflow.ellipsis),
                                          )
                                        else
                                          Text(media, style: const TextStyle(fontSize: 11, color: Colors.white54)),
                                      ],
                                      Row(
                                        children: [
                                          TextButton.icon(
                                            onPressed: id.isEmpty ? null : () => _like(id, liked),
                                            icon: Icon(liked ? Icons.favorite : Icons.favorite_border, size: 16),
                                            label: Text('${p['like_count'] ?? p['likes'] ?? 0}'),
                                          ),
                                          TextButton(
                                            onPressed: id.isEmpty
                                                ? null
                                                : () async {
                                                    setState(() => expandedId = expanded ? null : id);
                                                    if (!expanded) await _loadComments(id);
                                                  },
                                            child: Text('Comments (${p['comment_count'] ?? comments[id]?.length ?? 0})'),
                                          ),
                                        ],
                                      ),
                                      if (expanded) ...[
                                        ...(comments[id] ?? []).map((c) {
                                          final cm = Map<String, dynamic>.from(c as Map);
                                          return Padding(
                                            padding: const EdgeInsets.only(left: 8, bottom: 4),
                                            child: Text(
                                              '${cm['author_email'] ?? cm['user_email'] ?? 'User'}: ${cm['body'] ?? cm['content'] ?? ''}',
                                              style: const TextStyle(fontSize: 12),
                                            ),
                                          );
                                        }),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: TextField(
                                                controller: commentCtrl,
                                                decoration: const InputDecoration(hintText: 'Comment…', isDense: true),
                                              ),
                                            ),
                                            IconButton(
                                              onPressed: () async {
                                                final t = commentCtrl.text.trim();
                                                if (t.isEmpty || id.isEmpty) return;
                                                try {
                                                  await context.read<ApiClient>().createComment(id, t);
                                                  commentCtrl.clear();
                                                  await _loadComments(id);
                                                  _load();
                                                } catch (e) {
                                                  if (!mounted) return;
                                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                                }
                                              },
                                              icon: const Icon(Icons.send, size: 18),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
