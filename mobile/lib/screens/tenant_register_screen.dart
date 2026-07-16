import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../state/auth_state.dart';
import 'login_screen.dart';

class TenantRegisterScreen extends StatefulWidget {
  const TenantRegisterScreen({super.key});

  @override
  State<TenantRegisterScreen> createState() => _TenantRegisterScreenState();
}

class _TenantRegisterScreenState extends State<TenantRegisterScreen> {
  final orgName = TextEditingController();
  final slug = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  final fullName = TextEditingController();
  bool busy = false;
  int step = 0;

  @override
  void dispose() {
    orgName.dispose();
    slug.dispose();
    email.dispose();
    password.dispose();
    fullName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => busy = true);
    try {
      final api = context.read<ApiClient>();
      // Ensure user exists / logged in
      final auth = context.read<AuthState>();
      if (!auth.isLoggedIn) {
        try {
          await auth.register(email.text.trim(), password.text, name: fullName.text.trim());
        } catch (_) {
          await auth.login(email.text.trim(), password.text);
        }
      }
      await api.registerTenant({
        'name': orgName.text.trim(),
        'org_name': orgName.text.trim(),
        'slug': slug.text.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9-]'), '-'),
        'owner_email': email.text.trim().toLowerCase(),
        'plan': 'free',
      });
      await auth.refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Organization submitted — complete branding in League settings')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(step == 0 ? 'Create organization' : 'Owner account')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (step == 0) ...[
            TextField(controller: orgName, decoration: const InputDecoration(labelText: 'Organization name *')),
            const SizedBox(height: 10),
            TextField(
              controller: slug,
              decoration: const InputDecoration(labelText: 'Slug *', hintText: 'my-league'),
              onChanged: (v) {
                if (slug.text != v.toLowerCase()) {
                  slug.value = TextEditingValue(
                    text: v.toLowerCase().replaceAll(' ', '-'),
                    selection: TextSelection.collapsed(offset: v.length),
                  );
                }
              },
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                if (orgName.text.trim().isEmpty || slug.text.trim().isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Name and slug required')));
                  return;
                }
                setState(() => step = 1);
              },
              child: const Text('Next'),
            ),
          ] else ...[
            TextField(controller: fullName, decoration: const InputDecoration(labelText: 'Your name')),
            const SizedBox(height: 10),
            TextField(controller: email, decoration: const InputDecoration(labelText: 'Email *'), keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 10),
            TextField(controller: password, decoration: const InputDecoration(labelText: 'Password *'), obscureText: true),
            const SizedBox(height: 20),
            Row(
              children: [
                OutlinedButton(onPressed: () => setState(() => step = 0), child: const Text('Back')),
                const Spacer(),
                ElevatedButton(onPressed: busy ? null : _submit, child: const Text('Register org')),
              ],
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
              child: const Text('Already have an account? Sign in first'),
            ),
          ],
          const SizedBox(height: 16),
          const Text(
            'Platform approval may be required before creating tournaments (tenant pending status).',
            style: TextStyle(fontSize: 12, color: Colors.white54),
          ),
        ],
      ),
    );
  }
}
