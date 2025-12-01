import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";

function setTokenCookie(res, userId) {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES || "7d",
    });
    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        // secure: true, // bật khi chạy HTTPS
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

export const register = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ message: "Validation error", errors: errors.array() });

    const { name, email, password } = req.body;

    // Tránh E11000: kiểm tra tồn tại trước khi tạo
    const existed = await User.findOne({ email });
    if (existed) return res.status(409).json({ message: "Email đã tồn tại" });

    const user = await User.create({ name, email, password });
    setTokenCookie(res, user._id);

    return res.json({
        message: "Đăng ký thành công",
        data: { id: user._id, name: user.name, email: user.email },
    });
};

export const login = async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
        return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Sai email hoặc mật khẩu" });

    const ok = await user.compare(password);
    if (!ok) return res.status(400).json({ message: "Sai email hoặc mật khẩu" });

    setTokenCookie(res, user._id);

    return res.json({
        message: "Đăng nhập thành công",
        data: { id: user._id, name: user.name, email: user.email },
    });
};

export const me = async (req, res) => {
    const user = await User.findById(req.user.id).select("-password");
    return res.json({ data: user });
};

export const logout = async (req, res) => {
    res.clearCookie("token");
    return res.json({ message: "Đã đăng xuất" });
};
