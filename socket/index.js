// socket/index.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Group from "../models/Group.js";
import User from "../models/User.js";

function parseCookie(cookieStr = "") {
    return Object.fromEntries(
        cookieStr
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
                const i = s.indexOf("=");
                const k = s.slice(0, i);
                const v = decodeURIComponent(s.slice(i + 1) || "");
                return [k, v];
            })
    );
}

// Cache đơn giản userId -> name để hiển thị fromName
const userNameCache = new Map();
async function getUserName(userId) {
    const key = String(userId);
    if (userNameCache.has(key)) return userNameCache.get(key);
    try {
        const u = await User.findById(key).select("name").lean();
        const name = u?.name || `User #${key.slice(-4)}`;
        userNameCache.set(key, name);
        return name;
    } catch {
        const fallback = `User #${key.slice(-4)}`;
        userNameCache.set(key, fallback);
        return fallback;
    }
}

export default function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: true, credentials: true },
    });

    // ========= PRESENCE TRACKING =========
    // Map userId -> Set<socketId> (một user có thể có nhiều tab/thiết bị)
    const onlineUsers = new Map();

    function addOnlineUser(userId, socketId) {
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socketId);
    }

    function removeOnlineUser(userId, socketId) {
        const sockets = onlineUsers.get(userId);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                return true; // user đã hoàn toàn offline
            }
        }
        return false;
    }

    function getOnlineUserIds() {
        return Array.from(onlineUsers.keys());
    }

    // Xác thực bằng cookie token và gắn userId vào socket
    io.use((socket, next) => {
        try {
            const cookies = parseCookie(socket.handshake.headers.cookie || "");
            const raw = cookies.token || socket.handshake.auth?.token || "";
            if (!raw) throw new Error("no token");
            const payload = jwt.verify(raw, process.env.JWT_SECRET);
            socket.userId = String(payload.id);
            next();
        } catch (e) {
            console.error("[SOCKET] auth fail:", e.message);
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const uid = String(socket.userId || "");
        console.log("[SOCKET] connected", { sid: socket.id, userId: uid });

        // Phòng cá nhân theo userId (để io.to(userId) phát trực tiếp)
        socket.join(uid);
        console.log("[SOCKET] join personal room", uid);

        // ========= PRESENCE: user online =========
        const wasOffline = !onlineUsers.has(uid);
        addOnlineUser(uid, socket.id);

        // Gửi danh sách user đang online cho socket vừa connect
        socket.emit("presence:seed", { users: getOnlineUserIds() });

        // Nếu user mới online (không phải thêm tab), thông báo cho tất cả
        if (wasOffline) {
            socket.broadcast.emit("presence:online", { userId: uid });
            console.log("[SOCKET] presence:online broadcast", uid);
        }

        // Log mọi sự kiện vào
        socket.onAny((event, payload) => {
            console.log("[SOCKET] <- IN", { sid: socket.id, userId: uid, event, payload });
        });

        // Tuỳ bạn có dùng hay không; giữ lại nếu cần
        socket.on("group:join", ({ groupId }) => {
            if (!groupId) return;
            const gid = String(groupId);
            socket.join(`group:${gid}`);
            console.log("[SOCKET] group:join", { uid, group: gid });
        });

        socket.on("group:leave", ({ groupId }) => {
            if (!groupId) return;
            const gid = String(groupId);
            socket.leave(`group:${gid}`);
            console.log("[SOCKET] group:leave", { uid, group: gid });
        });

        // ====== Typing ======
        socket.on("typing", async ({ toType, toId, groupId }) => {
            try {
                const from = uid;
                const fromName = await getUserName(from);

                // 1-1
                if (toType === "user" && toId) {
                    const peer = String(toId);
                    io.to(peer).emit("typing", {
                        from,
                        fromName,     // ✅ tên hiển thị
                        toType: "user",
                        toId: peer,
                        at: Date.now(),
                    });
                    console.log("[SOCKET] TYPING_OUT -> user room", peer);
                    return;
                }

                // Group
                if (toType === "group" && (groupId || toId)) {
                    const gid = String(groupId || toId);
                    // Lấy các member rồi phát vào phòng cá nhân của từng người
                    const g = await Group.findById(gid).select("members").lean();
                    if (!g) return;

                    const members = (g.members || []).map(String).filter((m) => m !== from);
                    members.forEach((memberId) => {
                        io.to(memberId).emit("typing", {
                            from,
                            fromName,     // ✅ tên hiển thị
                            toType: "group",
                            groupId: gid,
                            toId: gid,
                            at: Date.now(),
                        });
                    });
                    console.log("[SOCKET] TYPING_OUT -> group", gid, "members:", members.length);
                }
            } catch (e) {
                console.error("typing error:", e.message);
            }
        });

        socket.on("typing:stop", async ({ toType, toId, groupId }) => {
            try {
                const from = uid;
                const fromName = await getUserName(from);

                // 1-1
                if (toType === "user" && toId) {
                    const peer = String(toId);
                    io.to(peer).emit("typing:stop", {
                        from,
                        fromName,
                        toType: "user",
                        toId: peer,
                        at: Date.now(),
                    });
                    console.log("[SOCKET] TYPING_STOP_OUT -> user room", peer);
                    return;
                }

                // Group
                if (toType === "group" && (groupId || toId)) {
                    const gid = String(groupId || toId);
                    const g = await Group.findById(gid).select("members").lean();
                    if (!g) return;

                    const members = (g.members || []).map(String).filter((m) => m !== from);
                    members.forEach((memberId) => {
                        io.to(memberId).emit("typing:stop", {
                            from,
                            fromName,
                            toType: "group",
                            groupId: gid,
                            toId: gid,
                            at: Date.now(),
                        });
                    });
                    console.log("[SOCKET] TYPING_STOP_OUT -> group", gid, "members:", members.length);
                }
            } catch (e) {
                console.error("typing:stop error:", e.message);
            }
        });

        socket.on("disconnect", () => {
            console.log("[SOCKET] disconnected", { sid: socket.id, userId: uid });

            // ========= PRESENCE: user offline =========
            const isNowOffline = removeOnlineUser(uid, socket.id);
            if (isNowOffline) {
                io.emit("presence:offline", { userId: uid });
                console.log("[SOCKET] presence:offline broadcast", uid);
            }
        });
    });

    return io;
}
