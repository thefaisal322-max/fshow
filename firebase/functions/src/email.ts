import type { Purpose } from './codes';

export const EMAIL_FROM = 'Faisal Show <no-reply@fainet.org>';

function template(code: string, purpose: Purpose): { subject: string; html: string; text: string } {
  const heading = purpose === 'signup' ? 'Faisal Show ته ښه راغلاست' : 'د پاسورډ بدلول';
  const line =
    purpose === 'signup'
      ? 'د خپل حساب د جوړولو لپاره دا کوډ په اپ کې ولیکئ:'
      : 'د نوي پاسورډ لپاره دا کوډ په اپ کې ولیکئ:';
  const subject = `${code} — Faisal Show code`;
  const html = `<!doctype html>
<html dir="rtl" lang="ps"><body style="margin:0;background:#F0F2F5;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:440px;margin:32px auto;background:#fff;border-radius:16px;padding:28px;text-align:center">
    <div style="color:#1877F2;font-size:26px;font-weight:800;margin-bottom:12px">Faisal Show</div>
    <div style="font-size:18px;font-weight:700;color:#1c1e21">${heading}</div>
    <p style="color:#65676B;font-size:15px;line-height:1.7">${line}</p>
    <div dir="ltr" style="font-size:36px;letter-spacing:10px;font-weight:800;color:#1c1e21;background:#F0F2F5;border-radius:12px;padding:14px 0;margin:16px 0">${code}</div>
    <p style="color:#65676B;font-size:13px;line-height:1.7">دا کوډ ۱۰ دقیقې اعتبار لري.<br>دا کوډ له هېچا سره مه شریکوئ. که تاسو دا غوښتنه نه وي کړې، دا ایمیل پرېږدئ.</p>
  </div>
</body></html>`;
  const text = `Faisal Show\n${heading}\n${line}\n\n${code}\n\nThis code is valid for 10 minutes. Never share it.`;
  return { subject, html, text };
}

/** Sends the code with Resend (https://resend.com/docs/api-reference/emails/send-email). */
export async function sendCodeEmail(apiKey: string, to: string, code: string, purpose: Purpose): Promise<void> {
  const { subject, html, text } = template(code, purpose);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}
