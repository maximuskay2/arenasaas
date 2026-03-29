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
import { Lock, Mail, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';

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

  // Logic remains strictly identical to your provided code
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
    <div className="min-h-screen flex items-center justify-center bg-[#050505] selection:bg-primary/30 px-6 relative overflow-hidden">
      {/* Cinematic Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[140px] rounded-full opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full opacity-30" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-[440px] relative z-10"
      >
        {/* Back to Site Link */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-xs font-black uppercase italic tracking-widest text-slate-500 hover:text-primary transition-colors mb-8 group"
        >
          <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" />
          Back to Terminal
        </Link>

        <div className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl p-10 shadow-2xl shadow-black">
          <header className="text-center mb-10">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20 mb-6 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
              <span className="text-2xl">🎮</span>
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">
              Games <span className="text-primary">Portal</span>
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-2">
              Secure Authentication Required
            </p>
          </header>

          <form onSubmit={mfaToken ? handleMfaSubmit : handleSubmit} className="space-y-6">
            {mfaToken && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center text-xs text-slate-300">
                Enter the 6-digit code from your authenticator app.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                Registry Email
              </Label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-primary transition-colors" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@yourleague.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={!!mfaToken}
                  className="bg-white/5 border-white/10 h-14 pl-12 rounded-xl focus:ring-primary focus:border-primary/50 transition-all placeholder:text-slate-700 disabled:opacity-50"
                />
              </div>
            </div>

            {!mfaToken && (
            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Access Key
                </Label>
                <a href="#" className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary">
                  Forgot?
                </a>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-primary transition-colors" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 h-14 pl-12 rounded-xl focus:ring-primary focus:border-primary/50 transition-all placeholder:text-slate-700"
                />
              </div>
            </div>
            )}

            {mfaToken && (
              <div className="space-y-2">
                <Label htmlFor="mfa" className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
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
                  className="bg-white/5 border-white/10 h-14 rounded-xl text-center text-lg tracking-[0.3em] font-mono"
                />
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold text-center italic"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button 
              type="submit" 
              className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black uppercase italic tracking-tighter rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" 
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating...
                </div>
              ) : mfaToken ? (
                'Verify MFA'
              ) : (
                'Initialize Session'
              )}
            </Button>
          </form>

          <footer className="mt-10 pt-8 border-t border-white/5">
            <div className="flex flex-col items-center gap-4">
              <p className="text-[11px] font-medium text-slate-500">
                Don't have an organization yet?
              </p>
              <Button variant="outline" asChild className="w-full h-12 border-white/10 bg-white/5 rounded-xl text-xs font-black uppercase italic tracking-widest hover:bg-white/10">
                <a href={registerHrefWithReturn}>
                  Register Now
                </a>
              </Button>
            </div>
          </footer>
        </div>

        {/* Security Footer */}
        <div className="mt-8 flex items-center justify-center gap-2 opacity-30 group hover:opacity-100 transition-opacity">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Encrypted End-to-End // 2026 Platform
          </span>
        </div>
      </motion.div>
    </div>
  );
}