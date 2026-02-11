type BuildBusinessWelcomeEmailParams = {
  businessName: string;
  loginUrl: string;
};

export const buildBusinessWelcomeEmail = ({
  businessName,
  loginUrl,
}: BuildBusinessWelcomeEmailParams) => {
  const subject = `Welcome to Stampass, ${businessName}`;
  const text = `Your business account for ${businessName} is ready. Log in here: ${loginUrl}`;
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          .wrapper {
            background: #f3f4f6;
            padding: 32px 14px;
            font-family: Inter, Arial, sans-serif;
          }
          .card {
            max-width: 680px;
            margin: 0 auto;
            background: #e9eaee;
            border: 1px solid #d4d7df;
            border-radius: 18px;
            padding: 34px 30px;
            color: #475569;
          }
          .eyebrow {
            margin: 0 0 12px;
            font-size: 12px;
            letter-spacing: 1.4px;
            text-transform: uppercase;
            color: #64748b;
          }
          .title {
            margin: 0 0 14px;
            font-size: 38px;
            line-height: 1.15;
            color: #0f172a;
          }
          .body {
            margin: 0 0 26px;
            font-size: 19px;
            line-height: 1.6;
            color: #334155;
          }
          .cta-wrap {
            text-align: center;
            margin: 0 0 28px;
          }
          .cta {
            display: inline-block;
            background: #d32752;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 999px;
            padding: 14px 30px;
            font-weight: 700;
            font-size: 22px;
            line-height: 1;
          }
          .hint {
            margin: 0 0 8px;
            font-size: 13px;
            color: #64748b;
          }
          .link {
            margin: 0;
            font-size: 13px;
            word-break: break-all;
            color: #d32752 !important;
          }
          @media (prefers-color-scheme: dark) {
            .wrapper {
              background: #222226 !important;
            }
            .card {
              background: #2a2a30 !important;
              border-color: #3c3c46 !important;
              color: #f5f5f5 !important;
            }
            .eyebrow {
              color: #b6bcc8 !important;
            }
            .title {
              color: #f5f5f5 !important;
            }
            .body {
              color: #e7e7eb !important;
            }
            .cta {
              background: #e6345a !important;
              color: #ffffff !important;
            }
            .hint {
              color: #c3c8d2 !important;
            }
            .link {
              color: #ff5a7b !important;
            }
          }
        </style>
      </head>
      <body class="wrapper">
        <div class="card">
          <p class="eyebrow">Business account ready</p>
          <h1 class="title">Welcome to Stampass</h1>
          <p class="body">
            Your business account for <strong>${businessName}</strong> has been created successfully.
          </p>
          <p class="cta-wrap">
            <a class="cta" href="${loginUrl}">Log in to your dashboard</a>
          </p>
          <p class="hint">If the button does not work, use this link:</p>
          <p class="link">${loginUrl}</p>
        </div>
      </body>
    </html>
  `;

  return { subject, text, html };
};
