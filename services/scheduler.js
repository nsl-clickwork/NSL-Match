const store = require('./store');
const msGraph = require('./msGraph');
const mailer = require('./mailer');
const ejs = require('ejs');
const path = require('path');

// Timezone formatter helper
function formatDualTimezone(utcDateString) {
    const date = new Date(utcDateString);
    const vnTime = date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'long', day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const deTime = date.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        weekday: 'long', day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return { vnTime, deTime };
}

// Lấy student info (có thể extend để lookup từ portalSync)
// Tạm thời mock info hoặc lấy từ param truyền vào
async function getStudentInfo(studentId) {
    // In actual implementation, we might call portalSync here or have it cached
    // For now we assume the caller provides studentName and Email if needed, or we mock it
    return {
        studentId: studentId,
        studentName: studentId.split('_').slice(1, 3).join(' ') || studentId,
        email: "candidate@example.com"
    };
}

module.exports = {
    // ═══ BƯỚC 1: Thí sinh submit ranking ═══
    async savePreferences(studentId, rankings) {
        // Kiểm tra xem đã có chưa
        const existing = store.preferences.findBy('studentId', studentId);
        if (existing.length > 0) {
            return store.preferences.update(existing[0].id, { rankings });
        }
        return store.preferences.add({ studentId, rankings });
    },

    // ═══ BƯỚC 2: DN accept/decline ═══
    async recordDecision(companyId, studentId, decision) {
        const company = store.companies.findById(companyId);
        if (!company) throw new Error('Company not found');

        const existing = store.decisions.readAll().find(d => d.companyId === companyId && d.studentId === studentId);
        let decRecord;
        if (existing) {
            decRecord = store.decisions.update(existing.id, { decision });
        } else {
            decRecord = store.decisions.add({ companyId, studentId, decision });
        }

        // Nếu DECLINE, gửi email cho thí sinh
        if (decision === 'DECLINE') {
            const pref = store.preferences.findBy('studentId', studentId)[0];
            let rankPosition = 'N/A';
            if (pref) {
                const rankIdx = pref.rankings.indexOf(companyId);
                if (rankIdx !== -1) rankPosition = rankIdx + 1;
            }

            const studentInfo = await getStudentInfo(studentId);
            const templatePath = path.join(__dirname, '../views/emails/decline.ejs');
            
            try {
                const html = await ejs.renderFile(templatePath, {
                    studentName: studentInfo.studentName,
                    companyName: company.name,
                    rankPosition: rankPosition
                });
                
                await mailer.sendViaBrevo({ // Or SMTP
                    to: studentInfo.email,
                    subject: 'NSL Click & Work - Cập nhật kết quả',
                    html: html
                });
            } catch (err) {
                console.error("Lỗi gửi email decline:", err.message);
                // Fail-safe: không throw
            }
        }

        return decRecord;
    },

    // ═══ BƯỚC 3: DN submit khung giờ ═══
    async submitSlots(companyId, studentId, rawSlots) {
        // rawSlots = [{ date, startTime, endTime, timezone }]
        const createdSlots = [];
        for (const s of rawSlots) {
            // Convert to UTC
            // Assume format: YYYY-MM-DD and HH:mm
            const startDateTime = new Date(`${s.date}T${s.startTime}:00.000${getTimezoneOffset(s.timezone)}`);
            const endDateTime = new Date(`${s.date}T${s.endTime}:00.000${getTimezoneOffset(s.timezone)}`);
            
            const slot = store.slots.add({
                companyId,
                studentId,
                date: s.date,
                startTime: s.startTime,
                endTime: s.endTime,
                timezone: s.timezone,
                startUTC: startDateTime.toISOString(),
                endUTC: endDateTime.toISOString(),
                status: 'AVAILABLE'
            });
            createdSlots.push(slot);
        }
        return createdSlots;
    },

    // ═══ BƯỚC 4: Thí sinh chọn slot ═══
    async selectSlot(studentId, slotId) {
        // Optimistic locking
        const slot = store.slots.findById(slotId);
        if (!slot) throw new Error('Slot không tồn tại');
        if (slot.status !== 'AVAILABLE') throw new Error('Slot đã được chọn hoặc hết hạn');
        
        // Đổi status
        store.slots.update(slotId, { status: 'BOOKED', bookedBy: studentId });
        
        // Trigger orchestrator (async, không block response)
        this.confirmInterview(studentId, slotId).catch(err => {
            console.error('Lỗi khi confirm interview:', err);
        });

        return slot;
    },

    // ═══ BƯỚC 5: Bot orchestrator ═══
    async confirmInterview(studentId, slotId) {
        const slot = store.slots.findById(slotId);
        const company = store.companies.findById(slot.companyId);
        const studentInfo = await getStudentInfo(studentId);
        
        let meetingUrl = '';
        let meetingId = '';
        let status = 'CONFIRMED';

        // 2. Tạo Teams meeting qua MS Graph
        try {
            const meeting = await msGraph.createOnlineMeeting({
                subject: `NSL Interview: ${studentInfo.studentName} ↔ ${company.name}`,
                startDateTime: slot.startUTC,
                endDateTime: slot.endUTC,
                organizerEmail: process.env.MS_GRAPH_MEETING_ORGANIZER || 'noreply@new-solution.eu'
            });
            meetingUrl = meeting.joinUrl;
            meetingId = meeting.meetingId;
        } catch (err) {
            console.error('Lỗi MS Graph tạo Teams meeting. Tiếp tục gửi email không có link.', err);
            status = 'CONFIRMED_NO_TEAMS';
            meetingUrl = 'https://teams.microsoft.com/l/meetup-join/19%3amock_fallback_link'; // Fallback for demo
        }
        
        // 3. Format timezone cho email
        const { vnTime, deTime } = formatDualTimezone(slot.startUTC);
        
        // 4. Gửi email cho CẢ 2 bên
        const templatePath = path.join(__dirname, '../views/emails/interview.ejs');
        try {
            const emailHtml = await ejs.renderFile(templatePath, {
                studentName: studentInfo.studentName, 
                companyName: company.name,
                vnDateTime: vnTime, 
                deDateTime: deTime,
                teamsLink: meetingUrl
            });
            
            await Promise.all([
                mailer.sendViaBrevo({ to: studentInfo.email, subject: '🎉 Interview Confirmed', html: emailHtml }),
                mailer.sendViaBrevo({ to: company.contactEmail, subject: '🎉 Interview Confirmed', html: emailHtml })
            ]);
        } catch (err) {
            console.error('Lỗi gửi email confirm:', err);
            status = 'CONFIRMED_NO_EMAIL';
        }
        
        // 5. Lưu record interview
        const interview = store.interviews.add({
            studentId, 
            companyId: company.id, 
            slotId,
            teamsLink: meetingUrl,
            teamsEventId: meetingId,
            emailSentAt: status === 'CONFIRMED' ? new Date().toISOString() : null,
            status: status
        });
        
        // 6. Notify Discord
        if (process.env.DISCORD_WEBHOOK_URL) {
            // (Mocking call to discord, you can implement fully using axios)
            console.log(`[DISCORD] ✅ Interview confirmed: ${studentInfo.studentName} ↔ ${company.name} at ${vnTime}`);
        }

        return interview;
    }
};

// Hàm phụ trợ tính offset timezone (Rất basic, chỉ hỗ trợ tĩnh cho demo. Trong thực tế có thể dùng moment-timezone hoặc tính toán chuẩn hơn)
function getTimezoneOffset(tz) {
    if (tz === 'Europe/Berlin') return '+02:00'; // CEST for demo
    if (tz === 'Asia/Ho_Chi_Minh') return '+07:00';
    return '+00:00'; // fallback
}
