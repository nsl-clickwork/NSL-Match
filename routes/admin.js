const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { fetchStudents } = require('../services/portalSync');

// Require authentication for admin routes
router.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/do-login') return next();
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.redirect('/admin/login');
    }
    next();
});

router.get('/login', (req, res) => {
    res.render('admin/login', { error: req.query.error });
});

router.post('/do-login', (req, res) => {
    if (req.body.password === (process.env.ADMIN_PASSWORD || 'admin')) {
        req.session.userId = 'admin';
        req.session.role = 'admin';
        res.redirect('/admin/dashboard');
    } else {
        res.redirect('/admin/login?error=Invalid+password');
    }
});

router.get('/dashboard', async (req, res) => {
    const students = await fetchStudents();
    const companies = store.companies.readAll();
    const preferences = store.preferences.readAll();
    const decisions = store.decisions.readAll();
    const slots = store.slots.readAll();
    const interviews = store.interviews.readAll();

    res.render('admin/dashboard', {
        students,
        companies,
        preferences,
        decisions,
        slots,
        interviews
    });
});

module.exports = router;
