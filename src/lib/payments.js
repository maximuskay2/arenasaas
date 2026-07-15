import { maxikay } from "@/api/maxikayClient";

function storeCheckoutRef(tournamentId, provider, reference) {
  if (!tournamentId || !reference || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `arena_pay_ref:${tournamentId}`,
      JSON.stringify({ provider, reference, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function readStoredCheckoutRef(tournamentId) {
  if (!tournamentId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`arena_pay_ref:${tournamentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.reference) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredCheckoutRef(tournamentId) {
  if (!tournamentId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`arena_pay_ref:${tournamentId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Infer provider from checkout return query params / reference shape.
 */
export function inferPaymentProviderFromRef(ref, hint) {
  if (hint && ["stripe", "paystack", "flutterwave", "dev", "ledger"].includes(String(hint).toLowerCase())) {
    return String(hint).toLowerCase();
  }
  const r = String(ref || "");
  if (r.startsWith("cs_") || r.startsWith("pi_")) return "stripe";
  if (r.startsWith("dev_entry_")) return "dev";
  return "paystack";
}

/**
 * PaymentsAdapter — unified entry fee facade (§8.1).
 * Stripe / Paystack / Flutterwave use server initialize; 503 falls back to dev-simulate-entry (non-prod).
 */
export const PaymentsAdapter = {
  /**
   * @param {object} opts
   * @param {string} [opts.providerOverride] — force `stripe` | `paystack` | `flutterwave`
   * @param {string} [opts.returnUrl] — post-checkout redirect
   * @param {string} [opts.checkout_kind]
   */
  async initiatePayment({
    amount,
    currency = "USD",
    description,
    tenantConfig,
    tournamentId,
    tenantId,
    providerOverride,
    returnUrl,
    checkout_kind = "registration",
    onSuccess,
    onError,
  }) {
    const provider = (providerOverride || tenantConfig?.payment_provider || "stripe").toLowerCase();
    switch (provider) {
      case "paystack":
        return PaymentsAdapter._paystackCheckout({
          amount,
          currency,
          description,
          tournamentId,
          tenantId,
          checkout_kind,
          returnUrl,
          onSuccess,
          onError,
        });
      case "flutterwave":
        return PaymentsAdapter._flutterwaveCheckout({
          amount,
          currency,
          description,
          tournamentId,
          tenantId,
          checkout_kind,
          returnUrl,
          onSuccess,
          onError,
        });
      case "stripe":
      default:
        return PaymentsAdapter._stripeCheckout({
          amount,
          currency,
          description,
          tournamentId,
          tenantId,
          checkout_kind,
          returnUrl,
          onSuccess,
          onError,
        });
    }
  },

  async _devSimulateEntry({ amount, currency, description, tournamentId, provider, onSuccess, onError }) {
    try {
      const out = await maxikay.payments.devSimulateEntry({
        tournament_id: tournamentId || "",
        amount: Number(amount),
        currency,
        provider: provider || "dev",
      });
      if (out?.reference) {
        storeCheckoutRef(tournamentId, out.provider || provider || "dev", out.reference);
        onSuccess?.({
          provider: out.provider || provider || "dev",
          amount,
          currency,
          reference: out.reference,
          simulated: true,
        });
        return;
      }
      throw new Error("Dev simulate did not return a reference");
    } catch (e) {
      onError?.({ message: e?.message || "Dev payment simulation failed" });
    }
  },

  async _stripeCheckout({
    amount,
    currency,
    description,
    tournamentId,
    tenantId,
    checkout_kind = "registration",
    returnUrl,
    onSuccess,
    onError,
  }) {
    try {
      const successBase =
        returnUrl ||
        `${window.location.origin}${window.location.pathname}?join=1&provider=stripe`;
      const withProvider = successBase.includes("provider=")
        ? successBase
        : `${successBase}${successBase.includes("?") ? "&" : "?"}provider=stripe`;
      const success_url = withProvider.includes("{CHECKOUT_SESSION_ID}")
        ? withProvider
        : `${withProvider}${withProvider.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
      const cancel_url = `${window.location.origin}${window.location.pathname}?join=1`;
      const { url } = await maxikay.payments.createCheckoutSession({
        amount: Number(amount),
        currency,
        description,
        success_url,
        cancel_url,
        tournament_id: tournamentId || "",
        tenant_id: tenantId || "",
        checkout_kind,
      });
      if (url) {
        window.location.assign(url);
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      if (e?.status === 503) {
        const ok = window.confirm(
          `💳 Stripe Checkout (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nAPI has no STRIPE_SECRET_KEY — record a local ledger entry and continue?`
        );
        if (ok) {
          return PaymentsAdapter._devSimulateEntry({
            amount,
            currency,
            description,
            tournamentId,
            provider: "dev",
            onSuccess,
            onError,
          });
        }
        onError?.({ message: "Payment cancelled" });
        return;
      }
      onError?.({ message: e?.message || "Checkout failed" });
    }
  },

  async _paystackCheckout({
    amount,
    currency,
    description,
    tournamentId,
    tenantId,
    checkout_kind = "registration",
    returnUrl,
    onSuccess,
    onError,
  }) {
    try {
      const callback_url =
        returnUrl || `${window.location.origin}${window.location.pathname}?join=1&provider=paystack`;
      const init = await maxikay.paystack.initialize({
        amount: Number(amount),
        currency,
        tournament_id: tournamentId || "",
        tenant_id: tenantId || "",
        checkout_kind,
        callback_url,
      });
      const authorization_url = init?.authorization_url;
      const reference = init?.reference || init?.data?.reference;
      if (reference) storeCheckoutRef(tournamentId, "paystack", reference);
      if (authorization_url) {
        window.location.assign(authorization_url);
        return;
      }
      throw new Error("No authorization URL");
    } catch (e) {
      if (e?.status === 503) {
        const ok = window.confirm(
          `💳 Paystack (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nPAYSTACK_SECRET_KEY is not set — record a local ledger entry and continue?`
        );
        if (ok) {
          return PaymentsAdapter._devSimulateEntry({
            amount,
            currency,
            description,
            tournamentId,
            provider: "dev",
            onSuccess,
            onError,
          });
        }
        onError?.({ message: "Payment cancelled" });
        return;
      }
      onError?.({ message: e?.message || "Paystack checkout failed" });
    }
  },

  async _flutterwaveCheckout({
    amount,
    currency,
    description,
    tournamentId,
    tenantId,
    checkout_kind = "registration",
    returnUrl,
    onSuccess,
    onError,
  }) {
    try {
      let redirect_url =
        returnUrl || `${window.location.origin}${window.location.pathname}?join=1&provider=flutterwave`;
      const init = await maxikay.flutterwave.initialize({
        amount: Number(amount),
        currency,
        description,
        tournament_id: tournamentId || "",
        tenant_id: tenantId || "",
        checkout_kind,
        redirect_url,
      });
      const link = init?.link;
      const tx_ref = init?.tx_ref || init?.data?.tx_ref;
      if (tx_ref) {
        storeCheckoutRef(tournamentId, "flutterwave", tx_ref);
        // Ensure return URL carries tx_ref even if FW omits it
        if (redirect_url && !redirect_url.includes("tx_ref=")) {
          const sep = redirect_url.includes("?") ? "&" : "?";
          redirect_url = `${redirect_url}${sep}tx_ref=${encodeURIComponent(tx_ref)}&provider=flutterwave`;
        }
      }
      if (link) {
        window.location.assign(link);
        return;
      }
      throw new Error("No payment link");
    } catch (e) {
      if (e?.status === 503) {
        const ok = window.confirm(
          `💳 Flutterwave (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nFLUTTERWAVE_SECRET_KEY is not set — record a local ledger entry and continue?`
        );
        if (ok) {
          return PaymentsAdapter._devSimulateEntry({
            amount,
            currency,
            description,
            tournamentId,
            provider: "dev",
            onSuccess,
            onError,
          });
        }
        onError?.({ message: "Payment cancelled" });
        return;
      }
      onError?.({ message: e?.message || "Flutterwave checkout failed" });
    }
  },
};
