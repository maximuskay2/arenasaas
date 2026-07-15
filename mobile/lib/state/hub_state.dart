import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors web hub preference: player career hub vs organizer league host.
enum HubMode { player, organizer }

class HubState extends ChangeNotifier {
  HubMode mode = HubMode.player;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString('arena_hub_mode');
    if (raw == 'organizer') mode = HubMode.organizer;
    notifyListeners();
  }

  Future<void> setMode(HubMode m) async {
    mode = m;
    final p = await SharedPreferences.getInstance();
    await p.setString('arena_hub_mode', m == HubMode.organizer ? 'organizer' : 'player');
    notifyListeners();
  }

  Future<void> toggle() => setMode(mode == HubMode.player ? HubMode.organizer : HubMode.player);
}
