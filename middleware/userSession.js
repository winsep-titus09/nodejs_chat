import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function userSession(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        res.locals.user = null;
        return next();
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.id).select("name email avatar");
        res.locals.user = user || null;
    } catch (err) {
        res.locals.user = null;
    }
    next();
}
