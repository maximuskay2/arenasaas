import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    composer.dispose();
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
        list = await api.communityPosts();
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
        'title': text.length > 80 ? text.substring(0, 80) : text,
      });
      composer.clear();
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _like(String id) async {
    try {
      await context.read<ApiClient>().likePost(id);
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Community'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: composer,
                    decoration: const InputDecoration(
                      hintText: 'Post to the war room…',
                    ),
                    minLines: 1,
                    maxLines: 3,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _post,
                  icon: const Icon(Icons.send),
                ),
              ],
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
                                final author = p['author_email'] ?? p['created_by'] ?? 'Player';
                                final pinned = p['pinned'] == true || p['is_pinned'] == true;
                                return ArenaCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              '$author',
                                              style: const TextStyle(fontWeight: FontWeight.w700, color: ArenaColors.cyan),
                                            ),
                                          ),
                                          if (pinned)
                                            const StatusChip('pinned'),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Text('$body'),
                                      const SizedBox(height: 10),
                                      Row(
                                        children: [
                                          TextButton.icon(
                                            onPressed: id.isEmpty ? null : () => _like(id),
                                            icon: const Icon(Icons.favorite_border, size: 16),
                                            label: Text('${p['like_count'] ?? p['likes'] ?? ''}'),
                                          ),
                                        ],
                                      ),
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
