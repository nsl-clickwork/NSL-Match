require('dotenv').config();
const express = require('express');
const session = require('cookie-session');
const cookieParser = require('cookie-parser');
const i18n = require('i18n');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// i18n configuration
i18n.configure({
    locales: ['en', 'de', 'vi'],
    directory: path.join(__dirname, 'locales'),
    defaultLocale: 'en',
    cookie: 'lang'
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(i18n.init);

app.use(session({ 
    name: 'nsl-interview', 
    keys: [process.env.SESSION_SECRET || 'secret123'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Routes
app.use('/candidate', require('./routes/candidate'));
app.use('/partner', require('./routes/partner'));
app.use('/admin', require('./routes/admin'));
// app.use('/api', require('./routes/api')); // API route is on the portal side actually, or we might need it. Wait, the implementation plan said api is for frontend ajax calls, but maybe we don't need it right now.
app.use('/auth', require('./routes/auth'));

// Language switcher route
app.get('/lang/:locale', (req, res) => {
    const locale = req.params.locale;
    if (['en', 'de', 'vi'].includes(locale)) {
        res.cookie('lang', locale, { maxAge: 900000, httpOnly: true, path: '/' });
    }
    const backURL = req.get('Referrer') || '/';
    res.redirect(backURL);
});

app.get('/', (req, res) => res.redirect('/candidate/login'));

app.listen(PORT, () => {
    console.log(`NSL Interview Scheduler running on port ${PORT}`);
});
