export function requireLogin(req, res, next) {
    if (!res.locals.user) return res.redirect('/login');
    next();
}

export function redirectIfLoggedIn(req, res, next) {
    if (res.locals.user) return res.redirect('/chat');
    next();
}
