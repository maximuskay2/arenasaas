import 'package:flutter_test/flutter_test.dart';
import 'package:arena_mobile/main.dart';

void main() {
  testWidgets('Arena app builds', (tester) async {
    await tester.pumpWidget(const ArenaApp());
    await tester.pump();
    expect(find.text('Discover'), findsWidgets);
  });
}
