import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:arena_mobile/main.dart';
import 'package:arena_mobile/navigation/deep_link.dart';
import 'package:arena_mobile/screens/match_lobby_screen.dart';
import 'package:arena_mobile/screens/tournament_detail_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Arena app builds shell', (tester) async {
    await tester.pumpWidget(const ArenaApp());
    // Allow first frame + async bootstrap without settling forever (network).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Home'), findsWidgets);
    expect(find.text('Discover'), findsWidgets);
    expect(find.text('Matches'), findsWidgets);
  });

  test('DeepLink resolves tournament and match paths', () {
    final t = DeepLink.pageForUri(Uri.parse('arenasaas://tournament/abc-123'));
    expect(t, isA<TournamentDetailScreen>());

    final m = DeepLink.pageForUri(Uri.parse('/matches/m1/lobby'));
    expect(m, isA<MatchLobbyScreen>());

    final payload = DeepLink.pageForPayload({'match_id': 'm9', 'view': 'lobby'});
    expect(payload, isA<MatchLobbyScreen>());
  });
}
