const { Client } = require('@microsoft/microsoft-graph-client');
const { ConfidentialClientApplication } = require('@azure/msal-node');

const msalConfig = {
    auth: {
        clientId: process.env.MS_GRAPH_CLIENT_ID || 'dummy_client_id',
        authority: `https://login.microsoftonline.com/${process.env.MS_GRAPH_TENANT_ID || 'dummy_tenant'}`,
        clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || 'dummy_secret',
    }
};

const cca = new ConfidentialClientApplication(msalConfig);

async function getGraphToken() {
    const clientCredentialRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
    };
    try {
        const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
        return response.accessToken;
    } catch (e) {
        throw new Error('Graph token acquisition failed. Please check MS_GRAPH_CLIENT_ID and secret in .env');
    }
}

function getGraphClient(token) {
    return Client.init({
        authProvider: (done) => {
            done(null, token);
        }
    });
}

async function fetchCandidateFilesFromMS365(query) {
    try {
        if (!process.env.MS_GRAPH_CLIENT_ID) {
            console.log('Chưa cấu hình MS Graph, trả về data mẫu (mock data).');
            return [ { source: 'SharePoint', fileName: `${query}_MS365_CV.pdf`, url: 'https://sharepoint.com/mock-cv' } ];
        }
        
        const token = await getGraphToken();
        const client = getGraphClient(token);
        
        // Ví dụ query search trên SharePoint / OneDrive:
        // const result = await client.api(`/sites/{site-id}/drive/root/search(q='${query}')`).get();
        // return result.value;
        
        return [ { source: 'SharePoint', fileName: `${query}_MS365_CV.pdf`, url: 'https://sharepoint.com/mock-cv' } ];
    } catch (error) {
        console.warn('⚠️ MS365 fetch fail:', error.message);
        return [];
    }
}

/**
 * Gửi email qua Microsoft Graph (client credentials -> /users/{sender}/sendMail).
 * Cần cấu hình: MS_GRAPH_CLIENT_ID, MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_SECRET,
 * MS_GRAPH_SENDER (mailbox gửi đi) + quyền ứng dụng Mail.Send trên Azure.
 * Trả về true/false; không bao giờ throw để không chặn luồng chính.
 */
async function sendMail({ subject, htmlBody, to }) {
    try {
        const sender = process.env.MS_GRAPH_SENDER;
        if (!process.env.MS_GRAPH_CLIENT_ID || !sender) {
            console.log('[MAIL] Chưa cấu hình MS Graph (MS_GRAPH_CLIENT_ID / MS_GRAPH_SENDER) -> bỏ qua gửi email.');
            return false;
        }

        const recipients = (Array.isArray(to) ? to : [to])
            .filter(Boolean)
            .map(addr => ({ emailAddress: { address: addr } }));
        if (recipients.length === 0) {
            console.log('[MAIL] Không có người nhận -> bỏ qua.');
            return false;
        }

        const token = await getGraphToken();
        const client = getGraphClient(token);

        await client.api(`/users/${encodeURIComponent(sender)}/sendMail`).post({
            message: {
                subject,
                body: { contentType: 'HTML', content: htmlBody },
                toRecipients: recipients
            },
            saveToSentItems: true
        });
        return true;
    } catch (error) {
        console.warn('⚠️ Gửi email (MS Graph) thất bại:', error.message);
        return false;
    }
}

/**
 * Tạo Microsoft Teams Online Meeting
 * Yêu cầu: Azure AD App phải có quyền OnlineMeetings.ReadWrite.All (Application)
 */
async function createOnlineMeeting({ subject, startDateTime, endDateTime, organizerEmail }) {
    try {
        const token = await getGraphToken();
        const client = getGraphClient(token);
        const meeting = await client.api(`/users/${encodeURIComponent(organizerEmail)}/onlineMeetings`)
            .post({
                subject,
                startDateTime,   // ISO 8601 format (UTC)
                endDateTime,     // ISO 8601 format (UTC)
                lobbyBypassSettings: {
                    scope: 'everyone'  // Không cần chờ lobby
                }
            });
        return {
            joinUrl: meeting.joinUrl,        // Link Teams để join
            meetingId: meeting.id,
            videoTeleconferenceId: meeting.videoTeleconferenceId
        };
    } catch (error) {
        console.error('⚠️ Lỗi tạo Teams meeting:', error.message);
        throw error;
    }
}

module.exports = { fetchCandidateFilesFromMS365, sendMail, createOnlineMeeting };
