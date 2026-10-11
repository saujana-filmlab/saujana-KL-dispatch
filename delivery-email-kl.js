(function (root) {
  'use strict';

  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // These are the stored Grain Brain theme values, not new staff-facing labels.
  const palettes = {
    classic: {accent: '#02c96d', accentText: '#02c96d', buttonText: '#ffffff',
      paper: '#075b35', sleeve: '#ffffff', strip: '#f1faf5',
      line: '#c6e8d2', inset: '#f1faf5', insetLine: '#c6e8d2', hole: '#02c96d',
      muted: '#4e8064', surround: '#f8fcfa', surroundDot: '#dcefe3'},
    colour: {accent: '#ff6425', paper: '#f3c3a2', sleeve: '#100704', strip: '#271109',
      line: '#58301d', inset: '#201009', insetLine: '#4a271a', hole: '#080402', muted: '#cfb8a8'},
    bw: {accent: '#c9a15c', paper: '#ece7db', sleeve: '#0a0b0c', strip: '#1a1d20',
      line: '#4b402c', inset: '#181b1e', insetLine: '#3d362a', hole: '#050607', muted: '#bab5aa'}
  };

  function themeFor(order) {
    let selected = order.deliveryTheme;
    if (!selected) {
      try { selected = new URL(order.url || order.shortUrl).searchParams.get('negative'); }
      catch { selected = 'classic'; }
    }
    return Object.hasOwn(palettes, String(selected).toLowerCase()) ? palettes[String(selected).toLowerCase()] : palettes.classic;
  }

  function buildGrainBrainDeliveryEmail(order, options = {}) {
    const destination = new URL(order.shortUrl || order.url);
    if (!/^https?:$/.test(destination.protocol)) throw new Error('A web delivery link is required.');
    const p = themeFor(order);
    const name = escapeHtml(order.custName);
    const number = escapeHtml(order.orderNumber);
    const link = escapeHtml(destination.href);
    const logo = escapeHtml(options.logoUrl || 'https://darkroom.saujanalab.com/saujana-logo.png');
    const accentText = p.accentText || p.accent;
    const buttonText = p.buttonText || p.sleeve;
    const surround = p.surround || '#171716';
    const surroundDot = p.surroundDot || '#363633';
    const font = "'Helvetica Neue',Helvetica,Arial,sans-serif";
    const mono = "'Courier New',Courier,monospace";
    const holes = Array.from({length: 14}, () => `<td width="7.14%" style="padding:0 3px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="10" bgcolor="${p.hole}" style="height:10px;font-size:0;line-height:0;background-color:${p.hole}">&nbsp;</td></tr></table></td>`).join('');
    const logoTint = p === palettes.classic
      ? 'filter:brightness(0) saturate(100%) invert(56%) sepia(87%) saturate(2362%) hue-rotate(104deg) brightness(96%) contrast(102%);'
      : '';
    const logoMarkup = `<img src="${logo}" width="200" height="60" alt="Saujana Film Lab Kuala Lumpur" style="display:block;width:200px;max-width:100%;height:60px;object-fit:contain;border:0;color:${p.paper};font:700 14px/20px ${font};${logoTint}">`;
    const notes = order.notes ? `<tr><td style="padding:0 24px 20px;color:${p.paper}"><p style="margin:0 0 10px;font:700 12px/18px ${mono};color:${accentText}">A NOTE FROM THE LAB</p><p style="margin:0;padding:0 0 0 14px;border-left:2px solid ${p.accent};font:14px/23px ${font};color:${p.paper}">${escapeHtml(order.notes).replace(/\r?\n/g, '<br>')}</p></td></tr>` : '';
    const sleeve = `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.sleeve}" style="width:100%;max-width:600px;table-layout:fixed;word-wrap:break-word;border-collapse:separate;border-spacing:0;border:1px solid ${p.line};border-radius:20px;overflow:hidden;background-color:${p.sleeve};font-family:${font};text-align:left;color:${p.paper}">
      <tr><td bgcolor="${p.strip}" style="padding:10px 16px;background-color:${p.strip};border-bottom:1px solid ${p.line};border-radius:19px 19px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 6px 7px;font:700 9px/14px ${mono};color:${accentText}">SAUJANA FILM LAB &middot; KUALA LUMPUR</td><td align="right" style="padding:0 6px 7px;font:9px/14px ${mono};color:${p.paper}">135</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${holes}</tr></table></td></tr>
      <tr><td style="padding:18px 24px 16px">${logoMarkup}<p style="margin:10px 0 0;font:700 9px/15px ${mono};color:${accentText}">DEVELOPING &nbsp;&middot;&nbsp; SCANNING &nbsp;&middot;&nbsp; FILM SUPPLIES</p></td></tr>
      <tr><td style="padding:0 24px 18px;word-wrap:break-word"><p style="margin:0 0 10px;font:10px/16px ${mono};color:${accentText}">ORDER COMPLETE &nbsp;/&nbsp; <strong>${number}</strong></p><p style="margin:0;font:700 34px/35px ${font};color:${accentText}">YOUR SCANS<br>ARE READY.</p><p style="margin:14px 0 0;font:16px/24px ${font};color:${p.paper}">Hi <strong>${name}!</strong></p></td></tr>
      <tr><td style="padding:0 24px 22px"><p style="margin:0 0 16px;font:14px/23px ${font};color:${p.paper}">Tap or click the button below to view and download your scans:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${p.accent}" style="background-color:${p.accent};border-radius:8px;text-align:center"><a href="${link}" style="display:block;padding:16px 12px;border:1px solid ${p.accent};border-radius:8px;background-color:${p.accent};color:${buttonText};font:700 14px/20px ${font};text-decoration:none">OPEN YOUR SCANS</a></td></tr></table></td></tr>
      <tr><td style="padding:0 20px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.inset}" style="width:100%;border:1px solid ${p.insetLine};border-radius:8px;background-color:${p.inset}"><tr><td bgcolor="${p.inset}" style="padding:16px 18px;background-color:${p.inset};border-radius:7px"><p style="margin:0 0 12px;font:700 10px/17px ${mono};color:${accentText}">BEFORE YOU GET INTO THE PHOTOS</p><p style="margin:0 0 12px;font:14px/23px ${font};color:${p.paper}">Your link will stay active for <strong style="color:${accentText}">7 days</strong>, so please download everything before it expires.</p><p style="margin:0 0 12px;font:14px/23px ${font};color:${p.paper}">Need us to hold onto your negatives? We store them for up to <strong>1 month upon request</strong> — just let us know.</p><p style="margin:0;font:14px/23px ${font};color:${p.paper}">When collecting your negatives, quote order number <strong>${number}</strong>.</p></td></tr></table></td></tr>${notes}
      <tr><td style="padding:0 24px 20px"><p style="margin:0;font:14px/23px ${font};color:${p.paper}">You gave us a roll full of tiny mysteries. We gave it some chemistry, scanner time, and probably stared at a few frames longer than necessary. Hope you love what came back.</p></td></tr>
      <tr><td style="padding:0 24px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:18px 0 0;border-top:1px solid ${p.line}"><p style="margin:0 0 12px;font:700 14px/22px ${font};color:${accentText}">Questions, concerns, strange colours, suspicious dots?</p><p style="margin:0;font:14px/23px ${font};color:${p.paper}">Talk to us. We’re here. Hit reply, DM us on <a href="https://www.instagram.com/saujanafilmlab" style="color:${p.paper};text-decoration:underline;font-weight:bold">Instagram</a>, or message us on <a href="https://wa.me/601159318334" style="color:${p.paper};text-decoration:underline;font-weight:bold">WhatsApp</a>.</p><p style="margin:12px 0 0;font:12px/20px ${font};color:${p.muted}">16, Lorong 1/77a, Imbi, 2nd Floor, 55100 Kuala Lumpur<br><a href="mailto:scans@saujanalab.com" style="color:${p.paper};text-decoration:underline">scans@saujanalab.com</a></p></td></tr></table></td></tr>
      <tr><td bgcolor="${p.strip}" style="padding:12px 16px;background-color:${p.strip};border-top:1px solid ${p.line};border-radius:0 0 19px 19px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${holes}</tr></table></td></tr>
    </table><!--[if mso]></td></tr></table><![endif]-->`;
    const signature = options.includePreviewSignature ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;text-align:left"><tr><td style="padding:24px 8px 0;font:13px/20px ${font};color:${p.muted}"><strong style="color:${p.paper}">Saujana Film Lab KL</strong><br>Kuala Lumpur, Malaysia</td></tr></table>` : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${surround}" style="width:100%;border-collapse:collapse;background-color:${surround}"><tr><td align="center" bgcolor="${surround}" style="padding:24px 16px 32px;background-color:${surround};background-image:radial-gradient(${surroundDot} 1px,transparent 1px);background-size:15px 15px">${sleeve}${signature}</td></tr></table>`;
  }

  function buildGrainBrainDeliveryEmailText(order) {
    const notes = order.notes ? `\n\nNotes from the lab:\n${order.notes}` : '';
    return `Hi ${order.custName}!\n\nYour scans are ready.\n\nOrder Number: ${order.orderNumber}${notes}\n\nOpen your scans:\n${order.shortUrl || order.url}\n\nYour link will stay active for 7 days, so please download everything before it expires. Need us to hold onto your negatives? We store them for up to 1 month upon request. When collecting them, quote order number ${order.orderNumber}.\n\nYou gave us a roll full of tiny mysteries. We gave it some chemistry, scanner time, and probably stared at a few frames longer than necessary. Hope you love what came back.\n\nQuestions, concerns, strange colours, suspicious dots? Talk to us. We’re here.\nInstagram: https://www.instagram.com/saujanafilmlab\nWhatsApp: https://wa.me/601159318334\nEmail: scans@saujanalab.com\n16, Lorong 1/77a, Imbi, 2nd Floor, 55100 Kuala Lumpur`;
  }

  root.buildGrainBrainDeliveryEmail = buildGrainBrainDeliveryEmail;
  root.buildGrainBrainDeliveryEmailText = buildGrainBrainDeliveryEmailText;
}(typeof window === 'undefined' ? globalThis : window));
