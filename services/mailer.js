/**
 * Gửi email. Hai đường:
 *  1) Brevo HTTP API (khuyến nghị cho cloud/Railway — cổng 443 không bị chặn): set BREVO_API_KEY (xkeysib-...).
 *  2) SMTP (nodemailer): SMTP_HOST/PORT/SECURE/USER/PASS — dùng cho local hoặc host không chặn cổng SMTP.
 * Có BREVO_API_KEY thì ưu tiên HTTP API. Fail-safe: lỗi -> trả false, không throw.
 * Chung: MAIL_FROM (địa chỉ gửi, phải là sender đã verify trên Brevo), NSL_NOTIFY_EMAIL (mail nhận thông báo).
 */
const nodemailer = require('nodemailer');
const axios = require('axios');

let _transporter = null; // null = chưa khởi tạo, false = chưa cấu hình

function env(k) {
    let v = process.env[k];
    return v == null ? '' : String(v).trim();
}

function brevoKey() { return env('BREVO_API_KEY'); }
function fromAddr() { return env('MAIL_FROM') || env('SMTP_USER'); }

// ---------- Đường 1: Brevo HTTP API (cổng 443) ----------
async function sendViaBrevo({ to, subject, html, text }) {
    const payload = {
        sender: { email: fromAddr(), name: 'NSL Click & Work' },
        to: [{ email: to }],
        subject: subject || '(no subject)'
    };
    if (html) payload.htmlContent = html;
    if (text) payload.textContent = text;
    if (!html && !text) payload.textContent = ' ';
    await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: { 'api-key': brevoKey(), 'Content-Type': 'application/json', accept: 'application/json' },
        timeout: 12000
    });
}

// ---------- Đường 2: SMTP ----------
function getTransporter() {
    if (_transporter !== null) return _transporter;
    const host = env('SMTP_HOST');
    const user = env('SMTP_USER');
    const pass = env('SMTP_PASS');
    if (!host || !user || !pass) { _transporter = false; return false; }
    const port = parseInt(env('SMTP_PORT') || '587', 10);
    _transporter = nodemailer.createTransport({
        host, port,
        secure: env('SMTP_SECURE').toLowerCase() === 'true' || port === 465,
        auth: { user, pass },
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000
    });
    return _transporter;
}

function configured() {
    return !!brevoKey() || getTransporter() !== false;
}

async function sendEmail({ to, subject, html, text }) {
    try {
        if (!to) return false;
        if (brevoKey()) {
            await sendViaBrevo({ to, subject, html, text });
            console.log(`[MAILER] (Brevo API) đã gửi tới ${to} — ${subject}`);
            return true;
        }
        const t = getTransporter();
        if (!t) { console.log('[MAILER] chưa cấu hình (thiếu BREVO_API_KEY và SMTP) -> bỏ qua gửi email.'); return false; }
        await t.sendMail({ from: fromAddr(), to, subject, html, text });
        console.log(`[MAILER] (SMTP) đã gửi tới ${to} — ${subject}`);
        return true;
    } catch (e) {
        const detail = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
        console.warn('⚠️ Gửi email thất bại:', detail);
        return false;
    }
}

// Gửi "bắn rồi quên" -> KHÔNG chặn response HTTP.
function sendEmailBg(opts) {
    Promise.resolve().then(() => sendEmail(opts)).catch(() => {});
}

// Kiểm tra cấu hình (endpoint chẩn đoán) -> trả lỗi thật.
async function verify() {
    if (brevoKey()) {
        try {
            const r = await axios.get('https://api.brevo.com/v3/account', {
                headers: { 'api-key': brevoKey(), accept: 'application/json' }, timeout: 10000
            });
            return { ok: true, mode: 'brevo-api', from: fromAddr(), account: r.data && r.data.email };
        } catch (e) {
            const detail = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
            return { ok: false, mode: 'brevo-api', error: detail };
        }
    }
    const t = getTransporter();
    if (!t) return { ok: false, error: 'Chưa cấu hình BREVO_API_KEY lẫn SMTP' };
    try {
        await t.verify();
        return { ok: true, mode: 'smtp', host: env('SMTP_HOST'), from: fromAddr() };
    } catch (e) {
        return { ok: false, mode: 'smtp', error: e.message };
    }
}

module.exports = { sendEmail, sendEmailBg, configured, verify };
