type BuildPasswordResetEmailParams = {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export const buildPasswordResetEmail = ({
  userName,
  resetUrl,
  expiresInMinutes,
}: BuildPasswordResetEmailParams) => {
  const safeUserName = userName.trim() || "there";
  const subject = "Reset your Loyale password";
  const text = [
    `Hi ${safeUserName},`,
    "",
    "We received a request to reset your password.",
    `Use this link within ${expiresInMinutes} minutes:`,
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
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
            background: #f3f4f6;
            font-family: Arial, sans-serif;
            color: #0f172a;
          }
          .card {
            max-width: 680px;
            margin: 0 auto;
            border: 1px solid #d4d7df;
            border-radius: 14px;
            background: #ffffff;
            padding: 28px;
          }
          h1 {
            margin: 0 0 16px;
            font-size: 28px;
            color: #d32752;
          }
          p {
            margin: 0 0 12px;
            font-size: 15px;
            line-height: 1.6;
          }
          .cta-wrap {
            margin: 20px 0;
            text-align: center;
          }
          .cta {
            display: inline-block;
            border-radius: 999px;
            padding: 12px 22px;
            background: #d32752;
            color: #ffffff !important;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
          }
          .link {
            word-break: break-all;
            color: #d32752;
          }
          .meta {
            font-size: 13px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Reset your password</h1>
          <p>Hi ${safeUserName},</p>
          <p>We received a request to reset your Loyale password.</p>
          <p class="meta">This link expires in ${expiresInMinutes} minutes.</p>
          <p class="cta-wrap">
            <a class="cta" href="${resetUrl}">Reset password</a>
          </p>
          <p class="meta">If the button does not work, use this link:</p>
          <p class="link">${resetUrl}</p>
          <p class="meta">If you did not request this, you can ignore this email.</p>
        </div>
      </body>
    </html>
  `;

  return { subject, text, html };
};
