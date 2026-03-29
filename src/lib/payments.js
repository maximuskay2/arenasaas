import { maxikay } from "@/api/maxikayClient";

/**
 * PaymentsAdapter — unified entry fee facade (§8.1). Stripe uses server checkout session; others remain dev stubs until wired.
 */
export const PaymentsAdapter = {
  /**
   * @param {object} opts
   * @param {string} [opts.providerOverride] — force `stripe` | `paystack` | `flutterwave` (ignores tenant default).
   * @param {string} [opts.returnUrl] — post-checkout redirect (defaults to current path).
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
      const success_url =
        returnUrl || `${window.location.origin}${window.location.pathname}`;
      const { url } = await maxikay.payments.createCheckoutSession({
        amount: Number(amount),
        currency,
        description,
        success_url,
        cancel_url: success_url,
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
          `💳 Stripe Checkout (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nAPI has no STRIPE_SECRET_KEY — simulate success?`
        );
        if (ok) onSuccess?.({ provider: "stripe", amount, currency, simulated: true });
        else onError?.({ message: "Payment cancelled" });
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
      const callback_url = returnUrl || `${window.location.origin}${window.location.pathname}`;
      const { authorization_url } = await maxikay.paystack.initialize({
        amount: Number(amount),
        currency,
        tournament_id: tournamentId || "",
        tenant_id: tenantId || "",
        checkout_kind,
        callback_url,
      });
      if (authorization_url) {
        window.location.assign(authorization_url);
        return;
      }
      throw new Error("No authorization URL");
    } catch (e) {
      if (e?.status === 503) {
        const ok = window.confirm(
          `💳 Paystack (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nPAYSTACK_SECRET_KEY is not set on the API — simulate success?`
        );
        if (ok) onSuccess?.({ provider: "paystack", amount, currency, simulated: true });
        else onError?.({ message: "Payment cancelled" });
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
      const redirect_url = returnUrl || `${window.location.origin}${window.location.pathname}`;
      const { link } = await maxikay.flutterwave.initialize({
        amount: Number(amount),
        currency,
        description,
        tournament_id: tournamentId || "",
        tenant_id: tenantId || "",
        checkout_kind,
        redirect_url,
      });
      if (link) {
        window.location.assign(link);
        return;
      }
      throw new Error("No payment link");
    } catch (e) {
      if (e?.status === 503) {
        const ok = window.confirm(
          `💳 Flutterwave (dev fallback)\n\nPay ${currency} ${amount} for:\n${description}\n\nFLUTTERWAVE_SECRET_KEY is not set on the API — simulate success?`
        );
        if (ok) onSuccess?.({ provider: "flutterwave", amount, currency, simulated: true });
        else onError?.({ message: "Payment cancelled" });
        return;
      }
      onError?.({ message: e?.message || "Flutterwave checkout failed" });
    }
  },
};