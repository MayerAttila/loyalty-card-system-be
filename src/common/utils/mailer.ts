import nodemailer from "nodemailer";
import { buildEmployeeInviteEmail } from "../emails/employeeInvite.js";

type InviteEmailParams = {
  to: string;
  businessName: string;
  inviteUrl: string;
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
