import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import { UserPlus, X, Check, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PaymentsAdapter,
  readStoredCheckoutRef,
  clearStoredCheckoutRef,
  inferPaymentProviderFromRef,
} from "@/lib/payments";
import { toast } from "sonner";
import { tournamentJoinReturnPath } from "@/lib/tournamentJoinIntent";

export function idempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `join_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function buildTeamRoster(form) {
  const emails = form.members.split(",").map((m) => m.trim()).filter(Boolean);
  const ids = (form.memberGameIds || "").split(",").map((m) => m.trim());
  return emails.map((player_email, i) => ({
    player_email,
    player_name: player_email.split("@")[0] || player_email,
    game_id: ids[i] ?? "",
  }));
}

/** Match server `linkedGameHandle` — non-empty handle for this game title on the user profile. */
export function profileHandleForTitle(gameHandles, titleKey) {
  const key = String(titleKey || "").trim();
  if (!key || !gameHandles || typeof gameHandles !== "object") return "";
  if (gameHandles[key]) return String(gameHandles[key]).trim();
  const low = key.toLowerCase();
  for (const k of Object.keys(gameHandles)) {
    if (String(k).toLowerCase() === low) return String(gameHandles[k] || "").trim();
  }
  return "";
}

/**
 * Full registration flow (solo / team, optional entry fee + payment rails).
 * `tournament` should include at least: id, name, tenant_id, roster_size, entry_fee, currency, game_title (optional).
 * `initialPayment` — from checkout return URL / sessionStorage: { reference, provider }.
 */
export default function TournamentJoinModal({
  tournament,
  onClose,
  extraInvalidateQueryKeys = [],
  initialPayment = null,
}) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const rosterSize = Number(tournament.roster_size) || 1;
  const entryType = String(tournament.entry_type || "").toUpperCase();
  const entryFee = entryType === "FREE" ? 0 : Number(tournament.entry_fee || 0);
  const soloOk = rosterSize <= 1;
  const tournamentCurrency = String(tournament.currency || "USD")
    .trim()
    .toUpperCase() || "USD";

  const bootstrapPay = useMemo(() => {
    if (initialPayment?.reference) {
      return {
        reference: String(initialPayment.reference).trim(),
        provider: inferPaymentProviderFromRef(initialPayment.reference, initialPayment.provider),
      };
    }
    const stored = readStoredCheckoutRef(tournament.id);
    if (stored?.reference) {
      return {
        reference: String(stored.reference).trim(),
        provider: inferPaymentProviderFromRef(stored.reference, stored.provider),
      };
    }
    return null;
  }, [initialPayment, tournament.id]);

  const [form, setForm] = useState({
    teamName: "",
    tag: "",
    captainEmail: "",
    members: "",
    memberGameIds: "",
    paymentRef: bootstrapPay?.reference || "",
    payProvider: bootstrapPay?.provider || "stripe",
    captainGameId: "",
  });
  const [joinFlow, setJoinFlow] = useState(soloOk ? "solo" : "team");
  const [done, setDone] = useState(false);
  const [payMode, setPayMode] = useState(bootstrapPay?.reference ? "instant" : "wallet");
  const autoVerifyRan = useRef(false);

  const { data: me } = useQuery({
    queryKey: ["auth-me-join-modal"],
    queryFn: () => maxikay.auth.me(),
    enabled: isAuthenticated && !isLoadingAuth,
    staleTime: 60_000,
    retry: false,
  });

  const { data: paymentRails = {} } = useQuery({
    queryKey: ["payment-rails", tournamentCurrency],
    queryFn: () => maxikay.public.paymentRails({ currency: tournamentCurrency }),
    staleTime: 120_000,
  });

  const { data: meWallet } = useQuery({
    queryKey: ["auth-me-wallet", tournamentCurrency],
    queryFn: () => maxikay.auth.meWallet(),
    enabled: isAuthenticated && !isLoadingAuth && entryFee > 0,
    staleTime: 30_000,
  });

  const walletBalance = useMemo(() => {
    const rows = meWallet?.wallets || [];
    const row = rows.find((w) => String(w.currency || "").toUpperCase() === tournamentCurrency);
    return row != null ? Number(row.balance) : 0;
  }, [meWallet, tournamentCurrency]);

  const railOrder = useMemo(() => {
    const ro = paymentRails.recommended_order;
    if (Array.isArray(ro) && ro.length) {
      return ro.filter((k) => paymentRails[k]);
    }
    return ["stripe", "paystack", "flutterwave"].filter((k) => paymentRails[k]);
  }, [paymentRails]);

  const defaultRailApplied = useRef(false);

  useEffect(() => {
    defaultRailApplied.current = false;
  }, [tournament.id]);

  useEffect(() => {
    if (me?.email) setForm((f) => ({ ...f, captainEmail: f.captainEmail || me.email }));
  }, [me?.email]);

  /** NGN (and API recommended_order): default ledger provider to first available rail (Paystack / Flutterwave before Stripe when configured). */
  useEffect(() => {
    if (entryFee <= 0 || defaultRailApplied.current || !railOrder.length) return;
    defaultRailApplied.current = true;
    const first = railOrder[0];
    setForm((f) => ({ ...f, payProvider: first }));
  }, [entryFee, railOrder]);

  useEffect(() => {
    if (entryFee <= 0) return;
    if (bootstrapPay?.reference) {
      setPayMode("instant");
      return;
    }
    if (walletBalance + 1e-9 >= entryFee) setPayMode("wallet");
    else setPayMode("instant");
  }, [entryFee, walletBalance, tournament.id, bootstrapPay?.reference]);

  /** After provider checkout return: auto-verify ledger (or accept dev reference). */
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || entryFee <= 0 || !bootstrapPay?.reference) return;
    if (autoVerifyRan.current) return;
    autoVerifyRan.current = true;
    const provider = bootstrapPay.provider || "stripe";
    const reference = bootstrapPay.reference;
    setForm((f) => ({
      ...f,
      paymentRef: reference,
      payProvider: provider === "dev" ? "ledger" : provider,
    }));
    setPayMode("instant");

    const run = async () => {
      if (provider === "dev" || provider === "ledger") {
        toast.success("Payment reference ready — complete join.");
        return;
      }
      try {
        const cap = String(me?.email || form.captainEmail || "")
          .trim()
          .toLowerCase();
        const data = await maxikay.payments.verifyEntryReference({
          tournament_id: tournament.id,
          provider,
          reference,
          captain_email: cap || undefined,
        });
        if (data?.duplicate) toast.info("Payment already on file — you can complete join.");
        else toast.success("Payment verified — complete join.");
        clearStoredCheckoutRef(tournament.id);
      } catch (err) {
        // Join path can still verify-on-join if webhook wrote ledger later.
        toast.message("Could not auto-verify yet", {
          description: err?.data?.error || err?.message || "Use Verify with provider, then Join.",
        });
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per modal open with bootstrap ref
  }, [isAuthenticated, isLoadingAuth, entryFee, bootstrapPay, tournament.id, me?.email]);

  const payProviderSelectValue = useMemo(() => {
    const p = form.payProvider;
    if (p === "stripe" && paymentRails.stripe) return p;
    if (p === "paystack" && paymentRails.paystack) return p;
    if (p === "flutterwave" && paymentRails.flutterwave) return p;
    if (p === "ledger") return p;
    return "ledger";
  }, [form.payProvider, paymentRails.stripe, paymentRails.paystack, paymentRails.flutterwave]);

  const gameTitle = String(tournament.game_title || "").trim();
  const capEmailNorm = String(form.captainEmail || me?.email || "")
    .trim()
    .toLowerCase();
  const meEmailNorm = String(me?.email || "")
    .trim()
    .toLowerCase();
  const needProfileGameHandle =
    Boolean(gameTitle) && (joinFlow === "solo" || (joinFlow === "team" && capEmailNorm === meEmailNorm));
  const profileGameOk = !needProfileGameHandle || Boolean(profileHandleForTitle(me?.game_handles, gameTitle));

  const verifyPayment = useMutation({
    mutationFn: async () => {
      const cap = String(form.captainEmail || me?.email || "")
        .trim()
        .toLowerCase();
      return maxikay.payments.verifyEntryReference({
        tournament_id: tournament.id,
        provider: String(form.payProvider || "stripe").toLowerCase(),
        reference: form.paymentRef.trim(),
        captain_email: cap,
      });
    },
    onSuccess: (data) => {
      if (data?.duplicate) toast.info("This reference is already on file.");
      else toast.success("Payment verified with the provider — you can complete join.");
    },
    onError: (err) => {
      toast.error(err.data?.error || err.message || "Verification failed");
    },
  });

  const join = useMutation({
    mutationFn: () => {
      const key = idempotencyKey();
      const cap = String(form.captainEmail || me?.email || "")
        .trim()
        .toLowerCase();
      let payment_proof;
      if (entryFee > 0) {
        if (payMode === "wallet") {
          payment_proof = { method: "wallet" };
        } else if (form.paymentRef.trim()) {
          payment_proof = {
            provider: String(form.payProvider || "stripe").toLowerCase(),
            reference: form.paymentRef.trim(),
          };
        }
      }

      if (joinFlow === "solo") {
        return maxikay.tournaments.join(
          tournament.id,
          {
            mode: "solo",
            captain_email: cap,
            captain_game_id: form.captainGameId.trim() || undefined,
            payment_proof,
          },
          { idempotencyKey: key }
        );
      }

      return maxikay.tournaments.join(
        tournament.id,
        {
          mode: "team",
          team_name: form.teamName.trim(),
          tag: form.tag,
          captain_email: cap,
          roster: buildTeamRoster(form),
          payment_proof,
        },
        { idempotencyKey: key }
      );
    },
    onSuccess: () => {
      setDone(true);
      clearStoredCheckoutRef(tournament.id);
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["auth-me-wallet"] });
      for (const qk of extraInvalidateQueryKeys) {
        queryClient.invalidateQueries({ queryKey: qk });
      }
      toast.success("You're in! Check notifications and email for updates.");
    },
    onError: (err) => {
      if (err.status === 401) {
        toast.error("Sign in to join a tournament.");
        maxikay.auth.redirectToLogin(tournamentJoinReturnPath(tournament.id));
        return;
      }
      if (err.status === 402) {
        const code = err.data?.code;
        if (code === "insufficient_wallet") {
          toast.error(
            err.data?.error || `Need ${err.data?.required ?? ""} ${tournamentCurrency} — balance ${err.data?.balance ?? 0}. Fund your wallet first.`
          );
        } else if (code === "payment_not_verified") {
          toast.error("Payment reference not found — use the provider reference from your completed checkout.");
        } else if (code === "payment_required") {
          toast.error("Entry fee required — add payment reference after checkout, or pay from the tournament page.");
        } else {
          toast.error(err.data?.error || err.message || "Payment required");
        }
        return;
      }
      if (err.status === 403 && err.data?.code === "wallet_captain_only") {
        toast.error("Pay from wallet only when you are the captain on this registration.");
        return;
      }
      if (err.status === 400 && err.data?.code === "game_id_required") {
        toast.error("Each teammate needs a linked game ID (same order as emails).");
        return;
      }
      if (err.status === 400 && err.data?.code === "game_handle_required") {
        toast.error(err.data?.error || "Link your game ID in Settings before joining.");
        return;
      }
      if (err.status === 403 && err.data?.code) {
        toast.error(err.data?.error || "You are not eligible for this event.");
        return;
      }
      toast.error(err.data?.error || err.message || "Could not join");
    },
  });

  const capOk = Boolean(String(form.captainEmail || me?.email || "").trim());
  const teamOk =
    profileGameOk &&
    (joinFlow === "solo" ||
      (form.teamName.trim() &&
        form.tag.trim() &&
        capOk &&
        (rosterSize <= 1 || buildTeamRoster(form).length >= Math.max(0, rosterSize - 1))));

  const walletFunded = entryFee <= 0 || payMode !== "wallet" || walletBalance + 1e-9 >= entryFee;
  const instantReady = entryFee <= 0 || payMode !== "instant" || form.paymentRef.trim().length > 0;
  const payOk = entryFee <= 0 || (walletFunded && instantReady && (payMode === "wallet" || payMode === "instant"));

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${tournamentJoinReturnPath(tournament.id)}`
      : "";
  const joinReturnPath = tournamentJoinReturnPath(tournament.id);

  const joining = join.isPending;
  const dismiss = () => {
    if (joining) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={dismiss}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative glass rounded-2xl p-6 w-full max-w-md space-y-5 border border-primary/20 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base text-foreground">Join Tournament</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{tournament.name}</p>
            {(tournament.eligibility_notes ||
              (Array.isArray(tournament.allowed_regions) && tournament.allowed_regions.length > 0) ||
              tournament.min_team_elo ||
              tournament.require_game_handle) && (
              <div className="mt-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
                <p className="font-semibold text-primary text-[10px] uppercase tracking-wider">Eligibility</p>
                {tournament.eligibility_notes ? <p>{tournament.eligibility_notes}</p> : null}
                {Array.isArray(tournament.allowed_regions) && tournament.allowed_regions.length > 0 ? (
                  <p>Regions: {tournament.allowed_regions.join(", ").toUpperCase()}</p>
                ) : null}
                {tournament.min_team_elo ? <p>Min team Elo: {tournament.min_team_elo}</p> : null}
                {tournament.require_game_handle ? <p>Linked game ID required</p> : null}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={joining}
            title={joining ? "Please wait — submitting registration" : "Close"}
            className={`p-1.5 rounded-lg text-muted-foreground ${joining ? "opacity-40 cursor-not-allowed" : "hover:bg-secondary/60"}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoadingAuth ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Checking your session…</p>
        ) : !isAuthenticated ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              You need a signed-in account to join this tournament. Sign in or create a player account — we&apos;ll bring you back
              here to finish registration.
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" className="w-full" onClick={() => maxikay.auth.redirectToLogin(joinReturnPath)}>
                Sign in
              </Button>
              <Button type="button" variant="outline" className="w-full" asChild>
                <Link to={`/register?type=player&returnUrl=${encodeURIComponent(joinReturnPath)}`}>Create player account</Link>
              </Button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : done ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <p className="font-display font-bold text-foreground">You're In!</p>
            <p className="text-xs text-muted-foreground">Your team is registered. Open the tournament lobby when the bracket is live.</p>
            <button type="button" onClick={onClose} className="w-full py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-display font-semibold transition-colors">
              Close
            </button>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Registration is final — there is no self-service cancel after you join. Contact the organizer if you need to withdraw.
            </p>
          </div>
        ) : (
          <>
            {soloOk && (
              <div className="flex rounded-lg border border-border/60 p-0.5 bg-secondary/30">
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-[10px] font-display font-bold uppercase rounded-md ${joinFlow === "solo" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                  onClick={() => setJoinFlow("solo")}
                >
                  Quick join (1v1)
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-[10px] font-display font-bold uppercase rounded-md ${joinFlow === "team" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                  onClick={() => setJoinFlow("team")}
                >
                  Named team
                </button>
              </div>
            )}

            <div className="space-y-3">
              {joinFlow === "team" && (
                <>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Team Name *</label>
                    <input
                      value={form.teamName}
                      onChange={(e) => setForm({ ...form, teamName: e.target.value })}
                      placeholder="e.g. Shadow Wolves"
                      className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Team Tag * (max 5)</label>
                    <input
                      value={form.tag}
                      onChange={(e) => setForm({ ...form, tag: e.target.value.slice(0, 5) })}
                      placeholder="SWL"
                      className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Captain Email *</label>
                <input
                  type="email"
                  value={form.captainEmail}
                  onChange={(e) => setForm({ ...form, captainEmail: e.target.value })}
                  placeholder="captain@email.com"
                  className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {joinFlow === "solo" && (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    In-game ID {gameTitle ? `(required — ${gameTitle} in Settings)` : "(optional)"}
                  </label>
                  <input
                    value={form.captainGameId}
                    onChange={(e) => setForm({ ...form, captainGameId: e.target.value })}
                    placeholder={gameTitle ? `Also set "${gameTitle}" under Settings → game handles` : "Riot tag, Steam ID, etc."}
                    className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  {gameTitle && !profileGameOk && (
                    <p className="mt-1 text-[10px] text-amber-200/90">
                      Link your <strong className="text-foreground">{gameTitle}</strong> handle in{" "}
                      <Link to="/settings" className="text-primary underline font-semibold">
                        Settings
                      </Link>{" "}
                      to join.
                    </p>
                  )}
                </div>
              )}

              {joinFlow === "team" && gameTitle && capEmailNorm === meEmailNorm && !profileGameOk && (
                <p className="text-[10px] text-amber-200/90 rounded-md border border-amber-500/25 bg-amber-500/5 p-2">
                  This tournament uses <strong className="text-foreground">{gameTitle}</strong>. Add your handle in{" "}
                  <Link to="/settings" className="text-primary underline font-semibold">
                    Settings
                  </Link>{" "}
                  before registering.
                </p>
              )}

              {joinFlow === "team" && capEmailNorm && meEmailNorm && capEmailNorm !== meEmailNorm && (
                <p className="text-[10px] text-muted-foreground">
                  Captain email differs from your account — game-handle checks apply to the captain&apos;s profile when they join.
                </p>
              )}

              {joinFlow === "team" && rosterSize > 1 && (
                <>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Teammates (emails, comma-separated) — need {Math.max(0, rosterSize - 1)}
                    </label>
                    <input
                      value={form.members}
                      onChange={(e) => setForm({ ...form, members: e.target.value })}
                      placeholder="p1@email.com, p2@email.com"
                      className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Game IDs (same order as emails)
                    </label>
                    <input
                      value={form.memberGameIds}
                      onChange={(e) => setForm({ ...form, memberGameIds: e.target.value })}
                      placeholder="id1, id2, id3…"
                      className="mt-1 w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </>
              )}

              {entryFee > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-4">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex justify-between items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Entry fee required</span>
                    <span className="text-xl font-black italic tabular-nums">
                      {entryFee} {tournamentCurrency}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setPayMode("wallet")}
                      className={`h-auto min-h-[4rem] rounded-xl border px-4 py-3 text-left transition flex flex-col items-start justify-center gap-0.5 ${
                        payMode === "wallet"
                          ? "border-primary bg-primary/15 ring-1 ring-primary/30"
                          : "border-white/10 bg-white/5 hover:border-primary/40"
                      }`}
                    >
                      <span className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">Pay from</span>
                      <span className="text-sm font-black italic uppercase flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-primary" /> Internal wallet
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Balance: {walletBalance.toFixed(2)} {tournamentCurrency}
                      </span>
                      {payMode === "wallet" && walletBalance + 1e-9 < entryFee && (
                        <Link to="/dashboard/wallet" className="text-[10px] text-primary font-bold underline mt-1">
                          Fund wallet
                        </Link>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayMode("instant")}
                      className={`min-h-[3rem] rounded-xl border px-4 py-3 text-left font-black uppercase italic text-xs transition ${
                        payMode === "instant"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-white/10 bg-primary/80 text-primary-foreground hover:bg-primary"
                      }`}
                    >
                      Instant checkout (card / bank)
                    </button>
                  </div>

                  {payMode === "instant" && (
                    <>
                  <p className="text-[11px] text-amber-200/90 font-medium leading-relaxed">
                    Checkout uses the fee from the server for this tournament. After paying, paste your reference below.
                    {tournamentCurrency === "NGN"
                      ? " NGN: Paystack and Flutterwave are typical."
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {railOrder.map((rail) => {
                      if (rail === "stripe" && paymentRails.stripe) {
                        return (
                          <Button
                            key="stripe"
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-[10px] font-display font-bold uppercase h-8"
                            onClick={() =>
                              void PaymentsAdapter.initiatePayment({
                                amount: entryFee,
                                currency: tournamentCurrency,
                                description: `Entry fee: ${tournament.name}`,
                                tenantConfig: { payment_provider: "stripe" },
                                tournamentId: tournament.id,
                                tenantId: tournament.tenant_id,
                                providerOverride: "stripe",
                                returnUrl,
                                onSuccess: () => {},
                                onError: (e) => toast.error(e?.message || "Stripe checkout failed"),
                              })
                            }
                          >
                            Pay · Stripe
                          </Button>
                        );
                      }
                      if (rail === "paystack" && paymentRails.paystack) {
                        return (
                          <Button
                            key="paystack"
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-[10px] font-display font-bold uppercase h-8"
                            onClick={() =>
                              void PaymentsAdapter.initiatePayment({
                                amount: entryFee,
                                currency: tournamentCurrency,
                                description: `Entry fee: ${tournament.name}`,
                                tenantConfig: { payment_provider: "paystack" },
                                tournamentId: tournament.id,
                                tenantId: tournament.tenant_id,
                                providerOverride: "paystack",
                                returnUrl,
                                onSuccess: () => {},
                                onError: (e) => toast.error(e?.message || "Paystack checkout failed"),
                              })
                            }
                          >
                            Pay · Paystack
                          </Button>
                        );
                      }
                      if (rail === "flutterwave" && paymentRails.flutterwave) {
                        return (
                          <Button
                            key="flutterwave"
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-[10px] font-display font-bold uppercase h-8"
                            onClick={() =>
                              void PaymentsAdapter.initiatePayment({
                                amount: entryFee,
                                currency: tournamentCurrency,
                                description: `Entry fee: ${tournament.name}`,
                                tenantConfig: { payment_provider: "flutterwave" },
                                tournamentId: tournament.id,
                                tenantId: tournament.tenant_id,
                                providerOverride: "flutterwave",
                                returnUrl,
                                onSuccess: () => {},
                                onError: (e) => toast.error(e?.message || "Flutterwave checkout failed"),
                              })
                            }
                          >
                            Pay · Flutterwave
                          </Button>
                        );
                      }
                      return null;
                    })}
                  </div>
                  {!paymentRails.stripe && !paymentRails.paystack && !paymentRails.flutterwave && (
                    <p className="text-[10px] text-muted-foreground">
                      No payment API keys on the server — use Ledger (admin) or configure STRIPE_SECRET_KEY / PAYSTACK_SECRET_KEY / FLUTTERWAVE_SECRET_KEY.
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <span className="text-foreground/90 font-medium">References:</span> Stripe — <code className="text-[9px]">session_id</code> in the URL after success (
                    <code className="text-[9px]">cs_…</code>). Paystack — <code className="text-[9px]">reference</code> or <code className="text-[9px]">trxref</code> in the return URL. Flutterwave —{" "}
                    <code className="text-[9px]">tx_ref</code> you were shown before redirect (also in some redirect URLs).
                  </p>
                  <Select value={payProviderSelectValue} onValueChange={(v) => setForm((f) => ({ ...f, payProvider: v }))}>
                    <SelectTrigger className="h-8 text-xs bg-secondary/50">
                      <SelectValue placeholder="Match ledger provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {railOrder.map((rail) => {
                        if (rail === "stripe" && paymentRails.stripe) {
                          return (
                            <SelectItem key="stripe" value="stripe">
                              Stripe (ledger)
                            </SelectItem>
                          );
                        }
                        if (rail === "paystack" && paymentRails.paystack) {
                          return (
                            <SelectItem key="paystack" value="paystack">
                              Paystack (ledger)
                            </SelectItem>
                          );
                        }
                        if (rail === "flutterwave" && paymentRails.flutterwave) {
                          return (
                            <SelectItem key="flutterwave" value="flutterwave">
                              Flutterwave (ledger)
                            </SelectItem>
                          );
                        }
                        return null;
                      })}
                      <SelectItem value="ledger">Ledger (admin test)</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    value={form.paymentRef}
                    onChange={(e) => setForm({ ...form, paymentRef: e.target.value })}
                    placeholder="Paste checkout reference (session id, Paystack ref, or tx_ref)"
                    className="w-full px-3 py-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-[10px] font-display font-bold uppercase h-8"
                    disabled={!form.paymentRef.trim() || verifyPayment.isPending}
                    onClick={() => verifyPayment.mutate()}
                  >
                    {verifyPayment.isPending ? "Verifying…" : "Verify with provider & record payment"}
                  </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => join.mutate()}
                disabled={!teamOk || !payOk || joining}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold tracking-wider hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {joining ? "Joining..." : joinFlow === "solo" ? "Join now" : "Register team"}
              </button>
              <Button type="button" variant="ghost" className="w-full text-xs text-muted-foreground h-9" disabled={joining} onClick={dismiss}>
                Cancel registration
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
