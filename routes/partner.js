const express = require('express');
const router = express.Router();
const store = require('../services/store');
const scheduler = require('../services/scheduler');
const { fetchStudents } = require('../services/portalSync');

// Require authentication for partner routes
router.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/do-login') return next();
    if (!req.session.userId || req.session.role !== 'partner') {
        return res.redirect('/partner/login');
    }
    next();
});

// Partner Login
router.get('/login', (req, res) => {
    res.render('partner/login', { error: req.query.error });
});

router.post('/do-login', (req, res) => {
    const { partnerCode, email } = req.body;
    const company = store.companies.findBy('partnerCode', partnerCode)[0];
    
    if (company && company.contactEmail === email) {
        req.session.userId = company.id;
        req.session.role = 'partner';
        res.redirect('/partner/candidates');
    } else {
        res.redirect('/partner/login?error=Invalid+credentials');
    }
});

// List candidates who ranked this company
router.get('/candidates', async (req, res) => {
    const companyId = req.session.userId;
    const company = store.companies.findById(companyId);
    
    // Find students who ranked this company
    const preferences = store.preferences.readAll().filter(p => p.rankings.includes(companyId));
    const allStudents = await fetchStudents();
    
    const candidates = preferences.map(pref => {
        const s = allStudents.find(st => st.studentId === pref.studentId) || { fullName: "Unknown", studentId: pref.studentId };
        const decision = store.decisions.readAll().find(d => d.companyId === companyId && d.studentId === pref.studentId);
        return {
            ...s,
            rankPosition: pref.rankings.indexOf(companyId) + 1,
            decision: decision ? decision.decision : null
        };
    });
    
    res.render('partner/candidates', { company, candidates });
});

// Accept / Decline Candidate
router.post('/candidates/:studentId/decide', async (req, res) => {
    const companyId = req.session.userId;
    const { studentId } = req.params;
    const { decision } = req.body; // ACCEPT or DECLINE
    
    await scheduler.recordDecision(companyId, studentId, decision);
    res.redirect('/partner/candidates');
});

// Schedule slots for a candidate
router.get('/schedule/:studentId', async (req, res) => {
    const companyId = req.session.userId;
    const { studentId } = req.params;
    const company = store.companies.findById(companyId);
    
    const allStudents = await fetchStudents();
    const student = allStudents.find(st => st.studentId === studentId);
    
    res.render('partner/schedule', { company, student });
});

router.post('/schedule/:studentId', async (req, res) => {
    const companyId = req.session.userId;
    const { studentId } = req.params;
    
    // rawSlots must be sent as JSON in body
    // expected format: { slots: [{ date, startTime, endTime, timezone }] }
    let rawSlots = req.body.slots;
    if (typeof rawSlots === 'string') rawSlots = JSON.parse(rawSlots);
    
    if (rawSlots && rawSlots.length > 0) {
        await scheduler.submitSlots(companyId, studentId, rawSlots);
    }
    
    res.redirect('/partner/candidates?success=Slots+submitted');
});

module.exports = router;
