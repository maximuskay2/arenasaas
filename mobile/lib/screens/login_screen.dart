import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_state.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  bool registerMode = false;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final auth = context.read<AuthState>();
    final ok = registerMode
        ? await auth.register(email.text, password.text, name: name.text)
        : await auth.login(email.text, password.text);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.error ?? 'Auth failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(title: Text(registerMode ? 'Create account' : 'Sign in')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Arena player hub',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Discover tournaments, join, report scores, climb Elo.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 24),
          if (registerMode) ...[
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Display name'),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: email,
            decoration: const InputDecoration(labelText: 'Email'),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: password,
            decoration: const InputDecoration(labelText: 'Password'),
            obscureText: true,
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: auth.loading ? null : _submit,
            child: auth.loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(registerMode ? 'Register' : 'Sign in'),
          ),
          TextButton(
            onPressed: () => setState(() => registerMode = !registerMode),
            child: Text(registerMode ? 'Have an account? Sign in' : 'New here? Register'),
          ),
        ],
      ),
    );
  }
}
