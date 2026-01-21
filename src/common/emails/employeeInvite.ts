type EmployeeInviteTemplateParams = {
  businessName: string;
  inviteUrl: string;
};

export const buildEmployeeInviteEmail = ({
  businessName,
  inviteUrl,
}: EmployeeInviteTemplateParams) => {
  const subject = `You're invited to join ${businessName}`;
  const text = `You've been invited to join ${businessName} as an employee. Register here: ${inviteUrl}`;
  const html = `
    <div style="background-color: #f8fafc; height: fit-content; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #f9fafb; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; font-family: Arial, sans-serif; line-height: 1.6; color: #475569; text-align: center;">
        <p style="margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">Employee invite</p>
        <h2 style="margin: 0 0 12px; font-size: 22px; color: #d32752;">Join ${businessName}</h2>
        <p style="margin: 0 0 22px;">You've been invited to join <strong>${businessName}</strong> as an employee.</p>
        <a href="${inviteUrl}" style="display: inline-block; background-color: #d32752; color: #f8fafc; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600; font-size: 14px;">Complete your registration</a>
        <p style="margin: 22px 0 0; font-size: 12px; color: #64748b;">If you did not expect this invite, you can ignore this email.</p>
        <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Invite link: ${inviteUrl}</p>
      </div>
    </div>
  `;

  return { subject, text, html };
};
