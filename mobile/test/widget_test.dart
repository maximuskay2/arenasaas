import 'package:flutter_test/flutter_test.dart';
import 'package:arena_mobile/main.dart';

void main() {
  testWidgets('Arena app builds shell', (tester) async {
    await tester.pumpWidget(const ArenaApp());
    await tester.pump();
    // Bottom nav labels
    expect(find.text('Home'), findsWidgets);
    expect(find.text('Discover'), findsWidgets);
  });
}
