import http from "http";
import initSocket from "./socket/index.js";
import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import connectDB from "./config/db.js";
import expressLayouts from "express-ejs-layouts";
import { userSession } from "./middleware/userSession.js";
import { requireLogin, redirectIfLoggedIn } from "./middleware/routeGuard.js";
import { auth } from "./middleware/auth.js";

import friendRoutes from "./routes/friend.routes.js";
import userRoutes from "./routes/user.routes.js";
import groupRoutes from "./routes/group.routes.js";
import messageRoutes from "./routes/message.routes.js";

// ⬇️ NEW: routes
import authRoutes from "./routes/auth.routes.js";

const app = express();
const httpServer = http.createServer(app);
const io = initSocket(httpServer);
app.set("io", io); // cho controller dùng

// View engine EJS
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

// Middlewares cơ bản
app.use(cors({ origin: true, credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(userSession);

// Static
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

// Locals dùng mọi view
app.locals.brandName = "WinChat";

// Pages
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", redirectIfLoggedIn, (req, res) => res.render("auth/login", { title: "Đăng nhập" }));
app.get("/register", redirectIfLoggedIn, (req, res) => res.render("auth/register", { title: "Đăng ký" }));
app.get("/chat", requireLogin, (req, res) => res.render("chat/index", { title: "Chat" }));

// APIs
app.use("/api/auth", authRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/messages", messageRoutes);

// Trang chat chính
app.get("/chat", auth, (req, res) => {
    res.render("chat/index", { user: req.user });
});

// Trang nhóm
app.get("/groups", auth, (req, res) => {
    res.render("chat/groups", { user: req.user });
});

app.get("/", auth, (req, res) =>
    res.render("chat/index", { user: req.user }));

// Health check
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/friends", requireLogin, (req, res) =>
    res.render("chat/friends", { title: "Kết bạn" })
);

// Khởi động
const PORT = process.env.PORT || 3000;
(async () => {
    try {
        await connectDB(process.env.MONGO_URI);
        httpServer.listen(PORT, () => {
            console.log(`🚀 http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Không thể khởi động server:", err?.message || err);
        process.exit(1);
    }
})();
