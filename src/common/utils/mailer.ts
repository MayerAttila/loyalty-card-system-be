import nodemailer from "nodemailer";
import { buildEmployeeInviteEmail } from "../emails/employeeInvite.js";
import { buildBusinessWelcomeEmail } from "../emails/businessWelcome.js";
import { buildSubscriptionUpdateEmail } from "../emails/subscriptionUpdate.js";
import { buildContactMessageEmail } from "../emails/contactMessage.js";
import { buildPasswordResetEmail } from "../emails/passwordReset.js";

type InviteEmailParams = {
  to: string;
  businessName: string;
  inviteUrl: string;
};

type BusinessWelcomeEmailParams = {
  to: string;
  businessName: string;
  loginUrl: string;
};

type SubscriptionUpdateEmailParams = {
  to: string;
  businessName: string;
  title: string;
  summary: string;
  detailLabel: string;
  detailValue: string;
  dashboardUrl: string;
};

type ContactMessageEmailParams = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type PasswordResetEmailParams = {
  to: string;
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

const resolveTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    throw new Error("SMTP_HOST is not configured");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
};

export const sendEmployeeInviteEmail = async ({
  to,
  businessName,
  inviteUrl,
}: InviteEmailParams) => {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured");
  }

  const transporter = resolveTransporter();
  const { subject, text, html } = buildEmployeeInviteEmail({
    businessName,
    inviteUrl,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

export const sendBusinessWelcomeEmail = async ({
  to,
  businessName,
  loginUrl,
}: BusinessWelcomeEmailParams) => {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured");
  }

  const transporter = resolveTransporter();
  const { subject, text, html } = buildBusinessWelcomeEmail({
    businessName,
    loginUrl,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

export const sendSubscriptionUpdateEmail = async ({
  to,
  businessName,
  title,
  summary,
  detailLabel,
  detailValue,
  dashboardUrl,
}: SubscriptionUpdateEmailParams) => {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured");
  }

  const transporter = resolveTransporter();
  const { subject, text, html } = buildSubscriptionUpdateEmail({
    businessName,
    title,
    summary,
    detailLabel,
    detailValue,
    dashboardUrl,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

export const sendContactMessageEmail = async ({
  name,
  email,
  subject,
  message,
}: ContactMessageEmailParams) => {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured");
  }

  const to = process.env.CONTACT_EMAIL_TO ?? "contactloyale@gmail.com";
  const transporter = resolveTransporter();
  const payload = buildContactMessageEmail({
    name,
    email,
    subject,
    message,
  });

  await transporter.sendMail({
    from,
    to,
    replyTo: email,
    ...payload,
  });
};

export const sendPasswordResetEmail = async ({
  to,
  userName,
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailParams) => {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured");
  }

  const transporter = resolveTransporter();
  const { subject, text, html } = buildPasswordResetEmail({
    userName,
    resetUrl,
    expiresInMinutes,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};
