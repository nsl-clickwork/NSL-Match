const axios = require('axios');

const mockData = [
    { studentId: "NSL_Tien_NGUYEN_09.01.2000", fullName: "Tiến Nguyễn", email: "tien@example.com", deutschLevel: "B1", strength1: "Node.js", centerCode: "NSL" },
    { studentId: "NSL_Khoi_NGUYEN_15.05.2001", fullName: "Khôi Nguyễn", email: "khoi@example.com", deutschLevel: "A2", strength1: "VLSI", centerCode: "NSL" }
];

async function fetchStudents() {
    const PORTAL_URL = process.env.PORTAL_API_URL;
    const API_KEY = process.env.INTERVIEW_APP_SECRET;

    if (!PORTAL_URL || !API_KEY) {
        console.warn('⚠️ Portal Sync chưa được cấu hình. Trả về data mock.');
        return mockData;
    }

    try {
        const { data } = await axios.get(`${PORTAL_URL}/api/students/export?key=${API_KEY}`, { timeout: 3000 });
        if (data && data.success && data.data && data.data.length > 0) {
            return data.data;
        }
        return mockData;
    } catch (err) {
        console.error('Lỗi khi fetch data từ Portal, trả về data mock:', err.message);
        return mockData;
    }
}

async function getStudentById(studentId) {
    const students = await fetchStudents();
    return students.find(s => s.studentId === studentId);
}

module.exports = { fetchStudents, getStudentById };
