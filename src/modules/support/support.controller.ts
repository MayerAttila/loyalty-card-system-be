import type { Request, Response } from "express";
import { sendContactMessageEmail } from "../../common/utils/mailer.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;
const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 5000;

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const validateLength = (value: string, maxLength: number) =>
  value.length > 0 && value.length <= maxLength;

async function submitContact(req: Request, res: Response) {
  const name = normalizeString(req.body?.name);
  const email = normalizeString(req.body?.email).toLowerCase();
  const subject = normalizeString(req.body?.subject);
  const message = normalizeString(req.body?.message);

  if (!validateLength(name, MAX_NAME_LENGTH)) {
    return res.status(400).json({ message: "Name is required." });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "A valid email is required." });
  }

  if (!validateLength(subject, MAX_SUBJECT_LENGTH)) {
    return res.status(400).json({ message: "Subject is required." });
  }

  if (!validateLength(message, MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    await sendContactMessageEmail({
      name,
      email,
      subject,
      message,
    });
    return res.status(200).json({ message: "Message sent successfully." });
  } catch (error) {
    console.error("submitContact failed", error);
    return res.status(500).json({ message: "Unable to send message." });
  }
}

export const supportController = {
  submitContact,
};
