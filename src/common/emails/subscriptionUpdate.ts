type BuildSubscriptionUpdateEmailParams = {
  businessName: string;
  title: string;
  summary: string;
  detailLabel: string;
  detailValue: string;
  dashboardUrl: string;
};

export const buildSubscriptionUpdateEmail = ({
  businessName,
  title,
  summary,
  detailLabel,
  detailValue,
  dashboardUrl,
}: BuildSubscriptionUpdateEmailParams) => {
  const subject = `Subscription update for ${businessName}`;
  const text = `${title}\n\n${summary}\n${detailLabel}: ${detailValue}\nManage subscription: ${dashboardUrl}`;
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
            font-size: 34px;
            line-height: 1.15;
            color: #0f172a;
          }
          .body {
            margin: 0 0 22px;
            font-size: 18px;
            line-height: 1.6;
            color: #334155;
          }
          .meta {
            margin: 0 0 24px;
            padding: 14px 16px;
            border-radius: 12px;
            border: 1px solid #d4d7df;
            background: #f8fafc;
            font-size: 15px;
            color: #334155;
          }
          .meta strong {
            color: #0f172a;
          }
          .cta-wrap {
            text-align: center;
            margin: 0 0 10px;
          }
          .cta {
            display: inline-block;
            background: #d32752;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 999px;
            padding: 14px 30px;
            font-weight: 700;
            font-size: 20px;
            line-height: 1;
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
            .meta {
              background: #31313a !important;
              border-color: #424252 !important;
              color: #e7e7eb !important;
            }
            .meta strong {
              color: #f5f5f5 !important;
            }
            .cta {
              background: #e6345a !important;
              color: #ffffff !important;
            }
          }
        </style>
      </head>
      <body class="wrapper">
        <div class="card">
          <p class="eyebrow">Subscription update</p>
          <h1 class="title">${title}</h1>
          <p class="body">${summary}</p>
          <p class="meta"><strong>${detailLabel}:</strong> ${detailValue}</p>
          <p class="cta-wrap">
            <a class="cta" href="${dashboardUrl}">Open dashboard</a>
          </p>
        </div>
      </body>
    </html>
  `;

  return { subject, text, html };
};

