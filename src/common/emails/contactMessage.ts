type BuildContactMessageEmailParams = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildContactMessageEmail = ({
  name,
  email,
  subject,
  message,
}: BuildContactMessageEmailParams) => {
  const submittedAt = new Date().toISOString();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");
  const emailSubject = `[Loyale Contact] ${subject}`;
  const text = [
    "New contact form submission",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    `Submitted at: ${submittedAt}`,
    "",
    "Message:",
    message,
  ].join("\n");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #f4f4f5;
            font-family: Arial, sans-serif;
            color: #111827;
          }
          .card {
            max-width: 700px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 20px;
          }
          .title {
            margin: 0 0 14px;
            font-size: 22px;
            color: #d32752;
          }
          .meta {
            margin: 0 0 14px;
            font-size: 14px;
            line-height: 1.6;
          }
          .message {
            margin-top: 16px;
            border-top: 1px solid #e5e7eb;
            padding-top: 14px;
            font-size: 14px;
            line-height: 1.7;
            white-space: normal;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="title">New Contact Message</h1>
          <p class="meta"><strong>Name:</strong> ${safeName}</p>
          <p class="meta"><strong>Email:</strong> ${safeEmail}</p>
          <p class="meta"><strong>Subject:</strong> ${safeSubject}</p>
          <p class="meta"><strong>Submitted at:</strong> ${submittedAt}</p>
          <div class="message">${safeMessage}</div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: emailSubject,
    text,
    html,
  };
};
