import jwt from "jsonwebtoken";

export function auth(req, res, next) {
    const raw = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
    if (!raw) return res.status(401).json({ message: "Unauthorized" });

    try {
        const payload = jwt.verify(raw, process.env.JWT_SECRET);
        req.user = { id: payload.id };
        next();
    } catch (e) {
        return res.status(401).json({ message: "Token invalid" });
    }
}
