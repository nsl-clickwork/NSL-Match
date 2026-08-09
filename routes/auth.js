const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Deep Link handler from portal
router.get('/portal', (req, res) => {
    const { user, role, exp, sig } = req.query;
    
    // 1. Kiểm tra expire
    if (!exp || Date.now() > Number(exp)) {
        return res.status(401).send('Link expired');
    }
    
    // 2. Verify chữ ký HMAC
    const SHARED_SECRET = process.env.INTERVIEW_APP_SECRET || 'shared-secret-key-here';
    const payload = `${user}:${role}:${exp}`;
    const expected = crypto.createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
    
    if (sig !== expected) {
        return res.status(403).send('Invalid signature');
    }
    
    // 3. Tạo session
    req.session.userId = user;
    req.session.role = role;
    
    // 4. Redirect
    if (role === 'candidate') {
        res.redirect('/candidate/dashboard');
    } else if (role === 'partner') {
        res.redirect('/partner/candidates');
    } else {
        res.status(400).send('Invalid role');
    }
});

module.exports = router;
