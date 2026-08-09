const express = require('express');
const router = express.Router();
const store = require('../services/store');
const scheduler = require('../services/scheduler');
const { getStudentById } = require('../services/portalSync');

// Require authentication for candidate routes
router.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/do-login') return next();
    if (!req.session.userId || req.session.role !== 'candidate') {
        return res.redirect('/candidate/login');
    }
    next();
});

// Candidate Login
router.get('/login', (req, res) => {
    res.render('candidate/login', { error: req.query.error });
});

router.post('/do-login', async (req, res) => {
    const { studentId, email } = req.body;
    const student = await getStudentById(studentId);
    
    if (student && student.email === email) {
        req.session.userId = studentId;
        req.session.role = 'candidate';
        res.redirect('/candidate/dashboard');
    } else {
        res.redirect('/candidate/login?error=Invalid+credentials');
    }
});

// Candidate Dashboard
router.get('/dashboard', async (req, res) => {
    const studentId = req.session.userId;
    const student = await getStudentById(studentId);
    
    // Get preferences if any
    const prefs = store.preferences.findBy('studentId', studentId)[0];
    
    // Check if any partner has submitted slots for this student
    const availableSlots = store.slots.findBy('studentId', studentId).filter(s => s.status === 'AVAILABLE' && new Date(s.startUTC) > new Date());
    const interviews = store.interviews.findBy('studentId', studentId);
    
    res.render('candidate/dashboard', { 
        student, 
        prefs, 
        availableSlots,
        interviews,
        companies: store.companies.readAll()
    });
});

// Rank Companies
router.get('/rank', async (req, res) => {
    const studentId = req.session.userId;
    const student = await getStudentById(studentId);
    const prefs = store.preferences.findBy('studentId', studentId)[0];
    const companies = store.companies.readAll();
    
    res.render('candidate/rank', { student, prefs, companies });
});

router.post('/rank', async (req, res) => {
    const studentId = req.session.userId;
    // expect rankings to be an array of company IDs
    let { rankings } = req.body;
    if (typeof rankings === 'string') rankings = JSON.parse(rankings);
    
    await scheduler.savePreferences(studentId, rankings);
    res.redirect('/candidate/dashboard');
});

// Select Slot
router.post('/select-slot', async (req, res) => {
    const studentId = req.session.userId;
    const { slotId } = req.body;
    
    try {
        await scheduler.selectSlot(studentId, slotId);
        res.redirect('/candidate/dashboard?success=Interview+Scheduled');
    } catch (err) {
        res.redirect(`/candidate/dashboard?error=${encodeURIComponent(err.message)}`);
    }
});

module.exports = router;
