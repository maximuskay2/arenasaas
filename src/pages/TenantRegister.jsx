import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import {
  activateOrganizerPortalSession,
  getOrganizerPortalOrigin,
  setHubPreference,
} from "@/lib/routingLogic";
import { safeAppReturnPath } from "@/lib/tournamentJoinIntent";
import { useAuth } from "@/lib/AuthContext";
import { getClientHwid } from "@/lib/clientHwid";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, 
  Check, 
  Upload, 
  ArrowLeft, 
  Globe, 
  ShieldCheck, 
  CreditCard, 
  Trophy,
  Loader2,
  Building2,
  Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThemeToggle from "@/components/theme/ThemeToggle";

const steps = [
  { title: "Identity", subtitle: "Login info" },
  { title: "Brand", subtitle: "League details" },
  { title: "Domain", subtitle: "Your URL" },
  { title: "Verify", subtitle: "Email check" },
  { title: "Wallet", subtitle: "Payout rails" },
  { title: "Finish", subtitle: "Ready to play" },
];

const playerSteps = [
  { title: "Identity", subtitle: "Your account" },
  { title: "Verify", subtitle: "Email code" },
];

export default function TenantRegister() {
  const { checkAppState } = useAuth();
  const [searchParams] = useSearchParams();
  const [registrationKind, setRegistrationKind] = useState(null);
  const [playerStep, setPlayerStep] = useState(0);
  const [playerOtpSent, setPlayerOtpSent] = useState(false);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    playerDisplayName: "",
    orgName: "",
    logoUrl: "",
    subdomain: "",
    otp: "",
    stripeAccountId: "",
    billingPlan: "monthly",
    walletCurrency: "USD",
  });
  const [slugSuggestions, setSlugSuggestions] = useState([]);
  const [otpSent, setOtpSent] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [registrationMeta, setRegistrationMeta] = useState(null);

  useEffect(() => {
    const p = String(searchParams.get("plan") || "").toLowerCase();
    if (p === "one_shot" || p === "monthly") {
      setFormData((prev) => ({ ...prev, billingPlan: p }));
    }
  }, [searchParams]);

  useEffect(() => {
    const t = String(searchParams.get("type") || "").toLowerCase();
    if (t === "player" || t === "gamer") setRegistrationKind("player");
    if (t === "organizer" || t === "creator" || t === "tenant") setRegistrationKind("organizer");
  }, [searchParams]);

  const planFromLanding = (() => {
    const p = String(searchParams.get("plan") || "").toLowerCase();
    return p === "one_shot" || p === "monthly" ? p : null;
  })();

  const playerRegisterMutation = useMutation({
    mutationFn: async () => {
      const otpVerify = await maxikay.functions.verifyOtp({ email: formData.email, code: formData.otp });
      if (!otpVerify.success) throw new Error("Invalid OTP");
      const client_hwid = getClientHwid();
      const authExtra = client_hwid ? { client_hwid } : {};
      const fullName = (formData.playerDisplayName || "").trim() || formData.email.split("@")[0];
      try {
        await maxikay.auth.register({
          email: formData.email,
          password: formData.password,
          full_name: fullName,
          ...authExtra,
        });
      } catch (e) {
        if (e.status === 409) {
          await maxikay.auth.login({ email: formData.email, password: formData.password, ...authExtra });
        } else {
          throw e;
        }
      }
    },
    onSuccess: async () => {
      setHubPreference("player");
      await checkAppState?.();
      activateOrganizerPortalSession();
      const ret = safeAppReturnPath(searchParams.get("returnUrl"));
      const dest = ret ? `${getOrganizerPortalOrigin()}${ret}` : `${getOrganizerPortalOrigin()}/dashboard`;
      window.location.assign(dest);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const otpVerify = await maxikay.functions.verifyOtp({ email: formData.email, code: formData.otp });
      if (!otpVerify.success) throw new Error("Invalid OTP");
      const client_hwid = getClientHwid();
      const authExtra = client_hwid ? { client_hwid } : {};
      try {
        await maxikay.auth.register({
          email: formData.email,
          password: formData.password,
          full_name: formData.orgName,
          ...authExtra,
        });
      } catch (e) {
        if (e.status === 409) {
          await maxikay.auth.login({ email: formData.email, password: formData.password, ...authExtra });
        } else {
          throw e;
        }
      }
      const data = await maxikay.tenantRegistration.complete({
        name: formData.orgName,
        slug: formData.subdomain,
        logo_url: formData.logoUrl || "https://mails.bybata.com/logomail.png",
        billing_plan: formData.billingPlan,
        stripe_account_id: formData.stripeAccountId || undefined,
        wallet_currency: formData.walletCurrency || "USD",
      });
      return data;
    },
    onSuccess: async (data) => {
      setRegistrationMeta(data?.registration || null);
      setHubPreference("organizer");
      await checkAppState?.();
      activateOrganizerPortalSession();
      setStep(5);
    },
  });

  const handleInputChange = (field, value) => setFormData({ ...formData, [field]: value });

  const handleOrgNameChange = (value) => {
    handleInputChange("orgName", value);
    const base = value.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 12);
    setSlugSuggestions([base, `${base}-esports`, `${base}-league`].filter(s => s.length > 2));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await maxikay.integrations.Core.UploadFile({ file });
    handleInputChange("logoUrl", file_url);
  };

  const sendOtp = async () => {
    try { await maxikay.functions.sendOtp({ email: formData.email }); setOtpSent(true); } 
    catch (err) { alert("Failed to send OTP"); }
  };

  const sendPlayerOtp = async () => {
    try {
      await maxikay.functions.sendOtp({ email: formData.email });
      setPlayerOtpSent(true);
    } catch {
      alert("Failed to send OTP");
    }
  };

  const connectStripe = async () => {
    setStripeConnecting(true);
    try {
      const result = await maxikay.functions.setupStripe({ email: formData.email, tenantId: '' });
      if (result.success && result.redirectUrl) {
        handleInputChange('stripeAccountId', result.accountId);
        window.location.href = result.redirectUrl;
      } else { setStripeConnecting(false); }
    } catch (err) { setStripeConnecting(false); }
  };

  if (!registrationKind) {
    return (
      <div className="min-h-screen arena-stage text-foreground flex flex-col items-center justify-center p-6 selection:bg-primary/30">
        <div className="arena-content max-w-xl w-full space-y-8">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-bold uppercase tracking-wider">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <ThemeToggle variant="menu" />
          </div>
          <div>
            <h1 className="text-4xl font-display font-bold tracking-tight">Create account</h1>
            <p className="mt-2 text-muted-foreground">Register as a league organizer or as a player — same platform, different home screen.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setRegistrationKind("organizer")}
              className="rounded-2xl glass border border-border/50 p-6 text-left transition glass-hover"
            >
              <Building2 className="h-10 w-10 text-primary mb-4" />
              <p className="text-xs font-display font-bold uppercase tracking-widest text-primary">Tournament creator</p>
              <p className="mt-2 font-display font-bold text-lg">Tenant admin</p>
              <p className="mt-2 text-[11px] text-muted-foreground">Host leagues, brackets, entry fees, and payouts for your org.</p>
            </button>
            <button
              type="button"
              onClick={() => setRegistrationKind("player")}
              className="rounded-2xl glass border border-border/50 p-6 text-left transition glass-hover"
            >
              <Gamepad2 className="h-10 w-10 text-primary mb-4" />
              <p className="text-xs font-display font-bold uppercase tracking-widest text-primary">Player / team / gamer</p>
              <p className="mt-2 font-display font-bold text-lg">Competitor</p>
              <p className="mt-2 text-[11px] text-muted-foreground">Global identity across tenants — matches, check-in, rosters, wallet.</p>
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
            Already have an account?{" "}
            <a href={`${getOrganizerPortalOrigin()}/login`} className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    );
  }

  const sidebarSteps = registrationKind === "organizer" ? steps : playerSteps;
  const activeStep = registrationKind === "organizer" ? step : playerStep;

  return (
    <div className="min-h-screen arena-stage text-foreground flex flex-col md:flex-row selection:bg-primary/30">
      {/* LEFT SIDE: Progress Visualizer (Desktop Only) */}
      <div className="hidden md:flex w-1/3 border-r border-border/50 bg-card/40 backdrop-blur-xl p-12 flex-col justify-between relative overflow-hidden arena-content">
        <div className="absolute top-0 left-0 w-full h-full bg-primary/5 blur-[120px] -translate-x-1/2 -translate-y-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-16">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center font-display font-bold shadow-lg shadow-primary/20 text-primary-foreground">A</div>
              <span className="text-xl font-display font-bold tracking-tight uppercase">Arena Grid</span>
            </Link>
            <ThemeToggle variant="menu" />
          </div>

          <div className="space-y-8">
            {sidebarSteps.map((s, i) => (
              <div key={i} className={`flex items-center gap-4 transition-all duration-500 ${activeStep === i ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-black italic text-xs border ${activeStep >= i ? 'bg-primary border-primary text-white shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]' : 'border-white/20'}`}>
                  {activeStep > i ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase italic tracking-wider leading-none">{s.title}</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{s.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
          <p className="text-xs font-bold text-slate-400 italic">
            {registrationKind === "player"
              ? '"One login for every league you compete in — your command center is on the app dashboard."'
              : '"The fastest way to take your local tournament to a global stage."'}
          </p>
          <div className="flex items-center gap-2 mt-3">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] uppercase font-black text-slate-500">Industry Leader</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Interactive Form Workspace */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-20 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)] pointer-events-none" />
        
        <div className="max-w-md w-full relative z-10">
          {registrationKind === "organizer" && planFromLanding && (
            <div className="mb-6 rounded-xl border border-primary/35 bg-primary/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Plan from pricing</p>
              <p className="mt-1 text-sm font-medium text-slate-200">
                {planFromLanding === "one_shot"
                  ? "One-time payment — one tournament credit"
                  : "Monthly subscription — unlimited tournaments while active"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Adjust anytime on the Brand step (hosting plan).
              </p>
            </div>
          )}
          {/* Mobile Step Indicator */}
          <div className="md:hidden flex justify-between mb-8">
            {sidebarSteps.map((_, i) => (
               <div key={i} className={`h-1 flex-1 mx-1 rounded-full ${activeStep >= i ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]' : 'bg-white/10'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${registrationKind}-${activeStep}`}
              initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-8"
            >
              <header className="space-y-2">
                <h2 className="text-4xl font-black italic uppercase tracking-tighter">{sidebarSteps[activeStep].title}</h2>
                <p className="text-slate-400 font-medium">
                  {registrationKind === "organizer"
                    ? `Step ${step + 1} of 6 — ${steps[step].subtitle}`
                    : `Step ${playerStep + 1} of 2 — ${playerSteps[playerStep].subtitle}`}
                </p>
              </header>

              <div className="space-y-6">
                {registrationKind === "player" && playerStep === 0 && (
                  <>
                    <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-[11px] text-slate-400 leading-relaxed">
                      You will land on the <strong className="text-slate-200">Player Hub</strong> (app dashboard) with
                      match lobby links, teams, wallet, and game ID settings. No league subscription required.
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Email</Label>
                      <Input
                        type="email"
                        placeholder="you@email.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Display name (in-game / public)</Label>
                      <Input
                        placeholder="Ace_Striker"
                        value={formData.playerDisplayName}
                        onChange={(e) => handleInputChange("playerDisplayName", e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                  </>
                )}

                {registrationKind === "player" && playerStep === 1 && (
                  <div className="space-y-8 py-6 text-center">
                    <ShieldCheck className="h-20 w-20 text-primary mx-auto animate-pulse" />
                    {!playerOtpSent ? (
                      <Button onClick={sendPlayerOtp} size="xl" className="w-full h-16 rounded-2xl font-black uppercase italic tracking-tighter">
                        Send verification code
                      </Button>
                    ) : (
                      <div className="space-y-4 text-left">
                        <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500">6-digit code</Label>
                        <Input
                          placeholder="0 0 0 0 0 0"
                          value={formData.otp}
                          onChange={(e) => handleInputChange("otp", e.target.value)}
                          className="bg-white/5 border-white/10 h-20 rounded-2xl text-center text-4xl font-black tracking-[0.5em]"
                          maxLength={6}
                        />
                      </div>
                    )}
                  </div>
                )}

                {registrationKind === "organizer" && step === 0 && (
                  <>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Admin Email</Label>
                      <Input 
                        type="email" placeholder="ceo@league.com"
                        value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Secure Password</Label>
                      <Input 
                        type="password" placeholder="••••••••"
                        value={formData.password} onChange={(e) => handleInputChange("password", e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                  </>
                )}

                {registrationKind === "organizer" && step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Organization Name</Label>
                      <Input 
                        placeholder="Elite Esports Pro"
                        value={formData.orgName} onChange={(e) => handleOrgNameChange(e.target.value)}
                        className="bg-white/5 border-white/10 h-14 rounded-xl focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Settlement currency</Label>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Wallet balance, entry fees, and defaults use this currency. Nigerian operations: choose NGN for Paystack / Flutterwave parity with Stripe checkout.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleInputChange("walletCurrency", "USD")}
                          className={`rounded-2xl border p-4 text-left transition ${
                            formData.walletCurrency === "USD"
                              ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]"
                              : "border-white/10 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-wider text-primary">USD</p>
                          <p className="mt-1 text-sm font-bold">International</p>
                          <p className="mt-1 text-[11px] text-slate-500">Stripe-first; Paystack / Flutterwave when configured.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange("walletCurrency", "NGN")}
                          className={`rounded-2xl border p-4 text-left transition ${
                            formData.walletCurrency === "NGN"
                              ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]"
                              : "border-white/10 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-wider text-primary">NGN</p>
                          <p className="mt-1 text-sm font-bold">Nigeria</p>
                          <p className="mt-1 text-[11px] text-slate-500">Paystack & Flutterwave alongside Stripe for entry fees; wallet in NGN.</p>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Hosting plan</Label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleInputChange("billingPlan", "monthly")}
                          className={`rounded-2xl border p-4 text-left transition ${
                            formData.billingPlan === "monthly"
                              ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]"
                              : "border-white/10 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-wider text-primary">Subscription</p>
                          <p className="mt-1 text-sm font-bold">Monthly hosting</p>
                          <p className="mt-1 text-[11px] text-slate-500">Unlimited tournaments while subscribed. Platform billing via Stripe Checkout when enabled.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange("billingPlan", "one_shot")}
                          className={`rounded-2xl border p-4 text-left transition ${
                            formData.billingPlan === "one_shot"
                              ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]"
                              : "border-white/10 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-wider text-primary">One-time</p>
                          <p className="mt-1 text-sm font-bold">Single tournament credit</p>
                          <p className="mt-1 text-[11px] text-slate-500">Pay once, host one full tournament (credit decrements when you publish).</p>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500 ml-1">Brand Identity</Label>
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl p-8 hover:bg-white/5 transition cursor-pointer group">
                        {formData.logoUrl ? (
                          <div className="relative">
                            <img src={formData.logoUrl} alt="Logo" className="w-24 h-24 rounded-full object-cover border-4 border-primary/20 shadow-2xl" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-full transition"><Upload className="h-6 w-6" /></div>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-10 w-10 text-slate-600 mb-2 group-hover:text-primary transition-colors" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Click to upload logo</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    </div>
                  </>
                )}

                {registrationKind === "organizer" && step === 2 && (
                  <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-4">
                      <Globe className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">Live URL Preview</p>
                        <p className="text-sm font-bold mt-1 italic tracking-tight">{formData.subdomain || 'your-slug'}.arenasaas.com</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Input 
                        placeholder="your-league-slug"
                        value={formData.subdomain} onChange={(e) => handleInputChange("subdomain", e.target.value.toLowerCase())}
                        className="bg-white/5 border-white/10 h-14 rounded-xl text-center text-xl font-bold italic tracking-tighter"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {slugSuggestions.map((slug) => (
                        <button key={slug} onClick={() => handleInputChange("subdomain", slug)} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider hover:border-primary transition">{slug}</button>
                      ))}
                    </div>
                  </div>
                )}

                {registrationKind === "organizer" && step === 3 && (
                  <div className="text-center space-y-8 py-10">
                    <ShieldCheck className="h-20 w-20 text-primary mx-auto animate-pulse" />
                    {!otpSent ? (
                      <Button onClick={sendOtp} size="xl" className="w-full h-16 rounded-2xl font-black uppercase italic tracking-tighter">Send Verification Code</Button>
                    ) : (
                      <div className="space-y-4">
                        <Label className="uppercase text-[10px] font-black tracking-[0.2em] text-slate-500">6-Digit Code</Label>
                        <Input 
                          placeholder="0 0 0 0 0 0" value={formData.otp}
                          onChange={(e) => handleInputChange("otp", e.target.value)}
                          className="bg-white/5 border-white/10 h-20 rounded-2xl text-center text-4xl font-black tracking-[0.5em]"
                          maxLength={6}
                        />
                      </div>
                    )}
                  </div>
                )}

                {registrationKind === "organizer" && step === 4 && (
                  <div className="space-y-6 text-center">
                    <div className="h-24 w-24 bg-primary/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                      <CreditCard className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-xl font-black italic uppercase tracking-tighter">Monetization Bridge</h3>
                    {formData.walletCurrency === "NGN" ? (
                      <>
                        <p className="text-slate-500 text-sm font-medium text-left">
                          You chose <strong className="text-slate-300">NGN</strong>. Entry fees use Paystack, Flutterwave, or Stripe (same server checkout flow as USD orgs). Add Paystack / Flutterwave subaccount references under{" "}
                          <strong className="text-slate-300">Settings → Payouts</strong> after signup; connect Stripe below if you also want Connect transfers.
                        </p>
                        <Button onClick={connectStripe} disabled={stripeConnecting} className="w-full h-16 bg-[#635BFF] hover:bg-[#635BFF]/80 rounded-2xl font-black uppercase italic shadow-[0_10px_20px_rgba(99,91,255,0.2)]">
                          {stripeConnecting ? <Loader2 className="animate-spin" /> : "Connect Stripe (optional)"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-500 text-sm font-medium">
                          Connect Stripe for automated prize payouts. You can skip this step and connect later from Settings after your organization is approved.
                        </p>
                        <Button onClick={connectStripe} disabled={stripeConnecting} className="w-full h-16 bg-[#635BFF] hover:bg-[#635BFF]/80 rounded-2xl font-black uppercase italic shadow-[0_10px_20px_rgba(99,91,255,0.2)]">
                          {stripeConnecting ? <Loader2 className="animate-spin" /> : "Connect with Stripe"}
                        </Button>
                      </>
                    )}
                    <p className="text-[11px] text-slate-600 font-medium">Use “Complete setup” below if you will connect payouts later.</p>
                  </div>
                )}

                {registrationKind === "organizer" && step === 5 && (
                  <div className="text-center space-y-8 py-10">
                    <div className="relative mx-auto w-32 h-32">
                       <Trophy className="h-32 w-32 text-primary relative z-10" />
                       <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-3xl font-black italic uppercase tracking-tighter">Glory Awaits</h3>
                      {registrationMeta?.pending_approval ? (
                        <p className="text-slate-400 font-medium max-w-[320px] mx-auto">
                          Your league is submitted. A platform administrator will verify your organization; you will receive full hosting tools once approved.
                        </p>
                      ) : (
                        <p className="text-slate-400 font-medium max-w-[250px] mx-auto">Your infrastructure is locked and loaded. Time to host your first tournament.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 pt-10">
                {registrationKind === "player" ? (
                  <div className="flex gap-4">
                    {playerStep > 0 && (
                      <Button
                        variant="outline"
                        size="xl"
                        onClick={() => setPlayerStep(playerStep - 1)}
                        className="flex-1 h-16 rounded-2xl border-white/10 bg-white/5 font-black uppercase italic tracking-tighter"
                      >
                        <ArrowLeft className="mr-2 h-5 w-5" /> Back
                      </Button>
                    )}
                    <Button
                      size="xl"
                      className="flex-1 h-16 rounded-2xl bg-primary font-black uppercase italic tracking-tighter shadow-lg shadow-primary/20"
                      onClick={() => {
                        if (playerStep === 0 && formData.email && formData.password) setPlayerStep(1);
                        if (playerStep === 1 && playerOtpSent && formData.otp.length === 6) playerRegisterMutation.mutate();
                      }}
                      disabled={
                        playerRegisterMutation.isPending ||
                        (playerStep === 1 && (!playerOtpSent || formData.otp.length < 6))
                      }
                    >
                      {playerRegisterMutation.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : playerStep === 0 ? (
                        <>
                          Next <ChevronRight className="ml-2 h-5 w-5" />
                        </>
                      ) : (
                        "Create player account"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    {step > 0 && step < 5 && (
                      <Button
                        variant="outline"
                        size="xl"
                        onClick={() => setStep(step - 1)}
                        className="flex-1 h-16 rounded-2xl border-white/10 bg-white/5 font-black uppercase italic tracking-tighter"
                      >
                        <ArrowLeft className="mr-2 h-5 w-5" /> Back
                      </Button>
                    )}
                    <Button
                      size="xl"
                      className="flex-1 h-16 rounded-2xl bg-primary font-black uppercase italic tracking-tighter shadow-lg shadow-primary/20"
                      onClick={() => {
                        if (step === 0 && formData.email && formData.password) setStep(1);
                        else if (step === 1 && formData.orgName) setStep(2);
                        else if (step === 2 && formData.subdomain) setStep(3);
                        else if (step === 3 && formData.otp.length === 6) setStep(4);
                        else if (step === 4) registerMutation.mutate();
                        else if (step === 5) {
                          activateOrganizerPortalSession();
                          window.location.assign(`${getOrganizerPortalOrigin()}/`);
                        }
                      }}
                      disabled={registerMutation.isPending || (step === 4 && stripeConnecting)}
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : step === 5 ? (
                        "Go To Dashboard"
                      ) : step === 4 ? (
                        "Complete setup"
                      ) : (
                        <>
                          Next Milestone <ChevronRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Start over and pick organizer vs player again?")) {
                      setRegistrationKind(null);
                      setStep(0);
                      setPlayerStep(0);
                      setOtpSent(false);
                      setPlayerOtpSent(false);
                    }
                  }}
                  className="text-center text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400"
                >
                  Wrong account type? Start over
                </button>
              </div>

              <p className="text-[10px] text-center text-slate-600 font-black uppercase tracking-widest mt-10">
                Secured by 256-Bit Encryption // <a href="/terms" className="text-slate-400 hover:text-white">Terms</a> // <a href="/privacy" className="text-slate-400 hover:text-white">Privacy</a>
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}