import type { Request, Response } from "express";
import { getSession } from "@auth/express";
import type Stripe from "stripe";
import { authConfig } from "../../auth.js";
import { prisma } from "../../prisma/client.js";
import { stripe } from "../../lib/stripe.js";

const MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_MONTHLY;
const ANNUAL_PRICE_ID = process.env.STRIPE_PRICE_ANNUAL;
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 30);

type AllowedPriceId = string;

function normalizeRedirectUrl(url: string | undefined, baseUrl: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.origin !== base.origin) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function requireSubscriptionSession(req: Request, res: Response) {
  const session = await getSession(req, authConfig);
  if (!session?.user) {
    res.status(401).json({ message: "unauthorized" });
    return null;
  }

  const user = session.user as {
    id?: string;
    email?: string;
    businessId?: string;
    role?: string;
  };

  if (!user.businessId) {
    res.status(403).json({ message: "invalid session" });
    return null;
  }

  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    res.status(403).json({ message: "insufficient permissions" });
    return null;
  }

  return user;
}

async function updateBusinessFromSubscription(
  subscription: Stripe.Subscription
) {
  const businessId = subscription.metadata?.businessId;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  const price = subscription.items.data[0]?.price ?? null;
  const interval = price?.recurring?.interval ?? null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  const data = {
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscription.id,
    stripePriceId: price?.id ?? undefined,
    status: subscription.status,
    currentPeriodEnd: currentPeriodEnd ?? undefined,
    trialEndsAt: trialEndsAt ?? undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    interval: interval ?? undefined,
  };

  if (businessId) {
    await prisma.subscription.upsert({
      where: { businessId },
      create: { businessId, ...data },
      update: data,
    });
    return;
  }

  if (customerId) {
    const existing = await prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { businessId: true },
    });
    if (existing?.businessId) {
      await prisma.subscription.upsert({
        where: { businessId: existing.businessId },
        create: { businessId: existing.businessId, ...data },
        update: data,
      });
    }
  }
}

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { id: true, trial: true },
  });

  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: business.id },
  });

  const now = Date.now();
  const trialEndsAt = business.trial?.endsAt ?? null;
  const isTrialActive =
    trialEndsAt !== null && new Date(trialEndsAt).getTime() > now;
  const rawStatus = subscription?.status ?? "none";
  const effectiveStatus =
    isTrialActive &&
    rawStatus !== "active" &&
    rawStatus !== "trialing" &&
    rawStatus !== "canceled"
      ? "trial"
      : rawStatus;

  return res.json({
    businessId: business.id,
    stripeCustomerId: subscription?.stripeCustomerId,
    stripeSubscriptionId: subscription?.stripeSubscriptionId,
    stripePriceId: subscription?.stripePriceId,
    status: effectiveStatus,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? trialEndsAt,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    interval: subscription?.interval ?? null,
  });
};

export const startTrialNoCard = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: {
      id: true,
      trial: true,
      subscription: { select: { status: true } },
    },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  if (business.trial?.consumedAt) {
    return res.status(409).json({ message: "trial already used" });
  }

  const nonBlockingStatuses = new Set([
    "canceled",
    "incomplete",
    "incomplete_expired",
  ]);
  if (
    business.subscription?.status &&
    !nonBlockingStatuses.has(business.subscription.status)
  ) {
    return res.status(409).json({ message: "subscription already exists" });
  }

  const now = new Date();
  const endsAt = new Date(
    now.getTime() + (Number.isNaN(TRIAL_DAYS) ? 30 : TRIAL_DAYS) * 86400000
  );

  await prisma.trial.create({
    data: {
      businessId: business.id,
      startedAt: now,
      endsAt,
      consumedAt: now,
    },
  });

  return res.json({ status: "trial", trialEndsAt: endsAt });
};

export const createSubscriptionIntent = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const { priceId, withTrial } = req.body as {
    priceId?: AllowedPriceId;
    withTrial?: boolean;
  };

  const allowedPrices = [MONTHLY_PRICE_ID, ANNUAL_PRICE_ID].filter(
    Boolean
  ) as string[];
  if (!priceId || !allowedPrices.includes(priceId)) {
    return res.status(400).json({ message: "invalid priceId" });
  }

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { stripeCustomerId: true },
      },
    },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  let stripeCustomerId = business.subscription?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: business.name,
      email: user.email ?? undefined,
      metadata: { businessId: business.id },
    });
    stripeCustomerId = customer.id;
    await prisma.subscription.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        stripeCustomerId,
      },
      update: { stripeCustomerId },
    });
  }

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
      payment_method_types: ["card", "revolut_pay"],
    },
    ...(withTrial
      ? { trial_period_days: Number.isNaN(TRIAL_DAYS) ? 30 : TRIAL_DAYS }
      : {}),
    expand: ["latest_invoice.payment_intent"],
    metadata: { businessId: business.id },
  });

  await updateBusinessFromSubscription(subscription);

  const paymentIntent = subscription.latest_invoice
    ? (subscription.latest_invoice as Stripe.Invoice).payment_intent
    : null;

  const clientSecret =
    paymentIntent && typeof paymentIntent !== "string"
      ? paymentIntent.client_secret
      : null;

  if (!clientSecret) {
    return res.status(500).json({ message: "payment intent missing" });
  }

  return res.json({
    clientSecret,
    subscriptionId: subscription.id,
  });
};

export const cancelSubscription = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: user.businessId },
    select: {
      stripeSubscriptionId: true,
      status: true,
      cancelAtPeriodEnd: true,
    },
  });

  if (!subscription?.stripeSubscriptionId) {
    return res.status(404).json({ message: "no active subscription" });
  }

  if (subscription.cancelAtPeriodEnd) {
    return res.status(409).json({ message: "subscription already canceling" });
  }

  const updated = await stripe.subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: true,
    }
  );

  await updateBusinessFromSubscription(updated);

  return res.json({ status: updated.status, cancelAtPeriodEnd: true });
};

export const cancelSubscriptionNow = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: user.businessId },
    select: { stripeSubscriptionId: true },
  });

  if (!subscription?.stripeSubscriptionId) {
    return res.status(404).json({ message: "no active subscription" });
  }

  const canceled = await stripe.subscriptions.cancel(
    subscription.stripeSubscriptionId
  );

  await updateBusinessFromSubscription(canceled);

  return res.json({ status: canceled.status });
};

export const resetSubscriptionForTesting = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: user.businessId },
    select: {
      stripeSubscriptionId: true,
      stripeCustomerId: true,
    },
  });

  if (!subscription) {
    await prisma.trial.deleteMany({
      where: { businessId: user.businessId },
    });
    return res.json({ status: "reset" });
  }

  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error) {
      console.error("[subscription reset] failed to cancel subscription", error);
    }
  }

  if (subscription.stripeCustomerId) {
    try {
      await stripe.customers.del(subscription.stripeCustomerId);
    } catch (error) {
      console.error("[subscription reset] failed to delete customer", error);
    }
  }

  if (subscription) {
    await prisma.subscription.delete({
      where: { businessId: user.businessId },
    });
  }

  await prisma.trial.deleteMany({
    where: { businessId: user.businessId },
  });

  return res.json({ status: "reset" });
};

export const createCheckoutSession = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const { priceId, successUrl, cancelUrl, withTrial, requireCard } = req.body as {
    priceId?: AllowedPriceId;
    successUrl?: string;
    cancelUrl?: string;
    withTrial?: boolean;
    requireCard?: boolean;
  };

  const allowedPrices = [MONTHLY_PRICE_ID, ANNUAL_PRICE_ID].filter(
    Boolean
  ) as string[];
  if (!priceId || !allowedPrices.includes(priceId)) {
    return res.status(400).json({ message: "invalid priceId" });
  }

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { stripeCustomerId: true },
      },
    },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const baseUrl = process.env.APP_BASE_URL ?? req.get("origin") ?? "";
  if (!baseUrl) {
    return res.status(500).json({ message: "APP_BASE_URL is not configured" });
  }

  const resolvedSuccess = normalizeRedirectUrl(successUrl, baseUrl) ?? baseUrl;
  const resolvedCancel = normalizeRedirectUrl(cancelUrl, baseUrl) ?? baseUrl;

  let stripeCustomerId = business.subscription?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: business.name,
      email: user.email ?? undefined,
      metadata: { businessId: business.id },
    });
    stripeCustomerId = customer.id;
    await prisma.subscription.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        stripeCustomerId,
      },
      update: { stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: resolvedSuccess,
    cancel_url: resolvedCancel,
    ...(withTrial && requireCard === false
      ? { payment_method_collection: "if_required" }
      : {}),
    subscription_data: {
      ...(withTrial
        ? { trial_period_days: Number.isNaN(TRIAL_DAYS) ? 30 : TRIAL_DAYS }
        : {}),
      ...(withTrial && requireCard === false
        ? {
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" },
            },
          }
        : {}),
      metadata: { businessId: business.id },
    },
  });

  return res.json({ url: session.url });
};

export const createPortalSession = async (req: Request, res: Response) => {
  const user = await requireSubscriptionSession(req, res);
  if (!user) return;

  const { returnUrl } = req.body as { returnUrl?: string };
  const baseUrl = process.env.APP_BASE_URL ?? req.get("origin") ?? "";
  if (!baseUrl) {
    return res.status(500).json({ message: "APP_BASE_URL is not configured" });
  }

  const resolvedReturn = normalizeRedirectUrl(returnUrl, baseUrl) ?? baseUrl;

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: user.businessId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  const resolveCustomerFromSubscription = async () => {
    if (!subscription?.stripeSubscriptionId) return null;
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );
    const customerId =
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer?.id;
    if (!customerId) return null;
    await prisma.subscription.update({
      where: { businessId: user.businessId },
      data: { stripeCustomerId: customerId },
    });
    return customerId;
  };

  let customerId = subscription?.stripeCustomerId ?? null;

  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (typeof customer !== "string" && "deleted" in customer && customer.deleted) {
        customerId = null;
      }
    } catch (error) {
      const maybeStripeError = error as { code?: string };
      if (maybeStripeError?.code === "resource_missing") {
        customerId = null;
      } else {
        throw error;
      }
    }
  }

  if (!customerId) {
    customerId = await resolveCustomerFromSubscription();
  }

  if (!customerId) {
    return res.status(400).json({ message: "no subscription customer found" });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: resolvedReturn,
  });

  return res.json({ url: session.url });
};

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || typeof sig !== "string") {
    return res.status(400).send("Missing Stripe signature");
  }
  if (!secret) {
    return res.status(500).send("STRIPE_WEBHOOK_SECRET is not configured");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${(error as Error).message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          await updateBusinessFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await updateBusinessFromSubscription(subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription && typeof invoice.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription
          );
          await updateBusinessFromSubscription(subscription);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook] handler failed", error);
    return res.status(500).send("Webhook handler failed");
  }

  return res.json({ received: true });
};

export const subscriptionController = {
  getSubscriptionStatus,
  startTrialNoCard,
  createSubscriptionIntent,
  cancelSubscription,
  cancelSubscriptionNow,
  resetSubscriptionForTesting,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
};
