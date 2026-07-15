import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { maxikay } from '@/api/maxikayClient';
import {
  activateOrganizerPortalSession,
  clearOrganizerPortalSession,
  getEffectiveHubMode,
  getMarketingSiteOrigin,
  isOrganizerPortalEntry,
  isSystemAdmin,
} from '@/lib/routingLogic';
import { getClientHwid } from '@/lib/clientHwid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, Loader2, ArrowLeft, ShieldCheck, Zap } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [params] = useSearchParams();

  const returnUrl = params.get('returnUrl') || '/';
  const registerHref = isOrganizerPortalEntry()
    ? `${getMarketingSiteOrigin()}/register`
    : '/register';
  const registerHrefWithReturn = useMemo(() => {
    const safe = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
    const enc = encodeURIComponent(safe);
    const sep = registerHref.includes('?') ? '&' : '?';
    return `${registerHref}${sep}returnUrl=${enc}`;
  }, [registerHref, returnUrl]);

  const redirectAfterLogin = (data) => {
    if (data?.user?.role === 'admin') {
      clearOrganizerPortalSession();
    } else {
      activateOrganizerPortalSession();
    }
    const adminHome = isSystemAdmin() ? '/central-station' : '/';
    const playerHome = '/dashboard';
    const defaultAppHome = getEffectiveHubMode(data?.user) === 'player' ? playerHome : '/';
    const raw = returnUrl.startsWith('/') ? returnUrl : '/';
    const trivialHome = raw === '/' || raw === '';
    const dest =
      data?.user?.role === 'admin' && isSystemAdmin() && trivialHome
        ? adminHome
        : !trivialHome
          ? raw
          : defaultAppHome;
    window.location.assign(dest);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const client_hwid = getClientHwid();
      const data = await maxikay.auth.login({
        email,
        password,
        ...(client_hwid ? { client_hwid } : {}),
      });
      if (data?.mfa_required && data?.mfa_token) {
        setMfaToken(data.mfa_token);
        return;
      }
      redirectAfterLogin(data);
    } catch (err) {
      if (err.status === 403 && err.data?.code === 'hwid_banned') {
        setError(err.data?.error || 'This device is banned from the platform.');
      } else if (
        err.status === 403 &&
        (err.data?.code === 'mfa_setup_required' || err.data?.code === 'mfa_setup_required_super_admin')
      ) {
        setError(
          err.data?.error ||
            'Enable MFA for your account. Platform admins: Central Station → Security. League Super Admins: League command post → Security.'
        );
      } else {
        setError(err.data?.error || err.message || 'Access Denied: Invalid Credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const client_hwid = getClientHwid();
      const data = await maxikay.auth.loginMfa({
        mfa_token: mfaToken,
        code: mfaCode,
        ...(client_hwid ? { client_hwid } : {}),
      });
      redirectAfterLogin(data);
    } catch (err) {
      if (err.status === 403 && err.data?.code === 'hwid_banned') {
        setError(err.data?.error || 'This device is banned from the platform.');
      } else {
        setError(err.data?.error || err.message || 'Invalid code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero selection:bg-primary/30 px-6 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] bg-primary/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-accent/12 blur-[120px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[440px] relative z-10"
      >
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors group"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-1 transition-transform" />
            Back to Arena
          </Link>
          <ThemeToggle variant="menu" />
        </div>

        <div className="rounded-3xl border border-border/60 glass p-8 md:p-10 shadow-arena">
          <header className="text-center mb-9">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/40 to-accent/30 ring-1 ring-primary/40 shadow-arena-glow mb-5">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
              Sign <span className="text-gradient-primary">in</span>
            </h1>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em] mt-2">
              Secure access · Organizers & players
            </p>
          </header>

          <form onSubmit={mfaToken ? handleMfaSubmit : handleSubmit} className="space-y-5">
            {mfaToken && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 text-center text-xs text-foreground/90">
                Enter the 6-digit code from your authenticator app.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="section-label ml-0.5">
                Email
              </Label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@arena.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={!!mfaToken}
                  className="bg-background/40 border-border/70 h-12 pl-12 rounded-xl focus-visible:ring-primary"
                />
              </div>
            </div>

            {!mfaToken && (
              <div className="space-y-2">
                <Label htmlFor="password" className="section-label ml-0.5">
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-background/40 border-border/70 h-12 pl-12 rounded-xl focus-visible:ring-primary"
                  />
                </div>
              </div>
            )}

            {mfaToken && (
              <div className="space-y-2">
                <Label htmlFor="mfa" className="section-label ml-0.5">
                  Authenticator code
                </Label>
                <Input
                  id="mfa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required
                  className="bg-background/40 border-border/70 h-12 rounded-xl text-center text-lg tracking-[0.35em] font-mono"
                />
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-xs font-semibold text-center"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" className="w-full h-12" size="lg" variant="arena" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </span>
              ) : mfaToken ? (
                'Verify MFA'
              ) : (
                'Initialize Session'
              )}
            </Button>
          </form>

          <footer className="mt-8 pt-6 border-t border-border/50">
            <p className="text-center text-xs text-muted-foreground mb-3">New to Arena?</p>
            <Button variant="outline" asChild className="w-full h-11">
              <a href={registerHrefWithReturn}>Create account</a>
            </Button>
          </footer>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground/50">
          <ShieldCheck className="h-4 w-4 text-primary/70" />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Encrypted session · Arena Grid</span>
        </div>
      </motion.div>
    </div>
  );
}
