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

async function requireBillingSession(req: Request, res: Response) {
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
    approved?: boolean;
  };

  if (!user.businessId) {
    res.status(403).json({ message: "invalid session" });
    return null;
  }

  if (user.approved === false) {
    res.status(403).json({ message: "user not approved" });
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

export const getBillingStatus = async (req: Request, res: Response) => {
  const user = await requireBillingSession(req, res);
  if (!user) return;

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { id: true },
  });

  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: business.id },
  });

  return res.json({
    businessId: business.id,
    stripeCustomerId: subscription?.stripeCustomerId,
    stripeSubscriptionId: subscription?.stripeSubscriptionId,
    stripePriceId: subscription?.stripePriceId,
    status: subscription?.status ?? "none",
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    interval: subscription?.interval ?? null,
  });
};

export const createCheckoutSession = async (req: Request, res: Response) => {
  const user = await requireBillingSession(req, res);
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
  const user = await requireBillingSession(req, res);
  if (!user) return;

  const { returnUrl } = req.body as { returnUrl?: string };
  const baseUrl = process.env.APP_BASE_URL ?? req.get("origin") ?? "";
  if (!baseUrl) {
    return res.status(500).json({ message: "APP_BASE_URL is not configured" });
  }

  const resolvedReturn = normalizeRedirectUrl(returnUrl, baseUrl) ?? baseUrl;

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: user.businessId },
    select: { stripeCustomerId: true },
  });

  if (!subscription?.stripeCustomerId) {
    return res.status(400).json({ message: "no billing customer found" });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
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

export const billingController = {
  getBillingStatus,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
};
