import { Router } from "express";
import { body } from "express-validator";
import { auth } from "../middleware/auth.js";
import { register, login, me, logout } from "../controllers/auth.controller.js";

const r = Router();

r.post(
    "/register",
    body("name").trim().notEmpty().withMessage("Tên là bắt buộc"),
    body("email").isEmail().withMessage("Email không hợp lệ"),
    body("password").isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
    register
);

r.post("/login", login);
r.get("/me", auth, me);
r.post("/logout", auth, logout);

export default r;
