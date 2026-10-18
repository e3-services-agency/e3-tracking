import type { RequestHandler } from 'express';
/** Verified staff plus exact browser Origin is the CSRF boundary for these new staff-only writes. */
export const requireStaffMutation: RequestHandler = (req, res, next) => {
    if (!req.userId || !req.userName) {
        res.status(401).json({ error: 'Staff identity required.' });
        return;
    }
    const proxy = (process.env.AUTH_MODE ?? 'local').trim().toLowerCase() === 'proxy';
    const expected = proxy ? process.env.E3_PUBLIC_ORIGIN : `${req.protocol}://${req.headers.host}`;
    let valid = false;
    try {
        if (expected) {
            const canonical = new URL(expected);
            valid = canonical.origin === expected && req.headers.origin === expected && req.headers.host === canonical.host;
        }
    } catch { /* Invalid origin configuration fails closed. */ }
    if (!valid) {
        res.status(403).json({ error: 'An exact same-origin staff request is required.', code: 'INVALID_ORIGIN' });
        return;
    }
    next();
};
