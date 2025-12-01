// controllers/message.controller.js
import mongoose from "mongoose";
import Message from "../models/Message.js";
import Group from "../models/Group.js"; // <-- sửa path cho đúng model Group của bạn
import multer from "multer";
import path from "path";
import fs from "fs";

// ========= Helpers ========

// Multer (lưu file ảnh về /public/uploads)
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => {
        const ext = path.extname(file.originalname || ".jpg");
        cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
    },
});
export const upload = multer({ storage });

// ========= SOCKET EMIT HELPERS =========
function emitMessageNew(io, doc) {
    // đối tượng nhận: user hoặc group
    if (doc.recipientType === "user") {
        // gửi cho người gửi và người nhận
        const sender = String(doc.sender);
        const peer = String(doc.recipientId);
        io.to(sender).emit("message:new", doc);
        io.to(peer).emit("message:new", doc);
    } else if (doc.recipientType === "group") {
        // phát cho tất cả thành viên của nhóm
        // để tối ưu: thay vì socket join group room, ta loop các user rooms
        Group.findById(doc.recipientId)
            .select("members")
            .lean()
            .then((g) => {
                const ids = (g?.members || []).map((m) =>
                    typeof m === "string" ? m : String(m)
                );
                // gửi cả owner nữa nếu model có owner tách riêng:
                // ids.push(String(g.owner))  <-- nếu muốn
                // đảm bảo người gửi cũng nhận (để sync UI)
                ids.push(String(doc.sender));
                const uniq = Array.from(new Set(ids));
                uniq.forEach((uid) => io.to(String(uid)).emit("message:new", doc));
            })
            .catch(() => {
                // nếu lỗi, ít nhất gửi cho sender
                io.to(String(doc.sender)).emit("message:new", doc);
            });
    }
}

function emitMessageRecalled(io, doc) {
    if (doc.recipientType === "user") {
        const sender = String(doc.sender);
        const peer = String(doc.recipientId);
        io.to(sender).emit("message:recalled", { id: String(doc._id) });
        io.to(peer).emit("message:recalled", { id: String(doc._id) });
    } else if (doc.recipientType === "group") {
        Group.findById(doc.recipientId)
            .select("members")
            .lean()
            .then((g) => {
                const ids = (g?.members || []).map((m) =>
                    typeof m === "string" ? m : String(m)
                );
                // đảm bảo người gửi cũng nhận
                ids.push(String(doc.sender));
                const uniq = Array.from(new Set(ids));
                uniq.forEach((uid) =>
                    io.to(String(uid)).emit("message:recalled", { id: String(doc._id) })
                );
            })
            .catch(() => {
                io.to(String(doc.sender)).emit("message:recalled", { id: String(doc._id) });
            });
    }
}

// ========= CONTROLLERS =========

// GET /api/messages/history?type=user|group&id=...&limit=80&before=<msgId>
const toObjIdSafe = (v) => {
    try {
        if (!v) return null;
        if (v instanceof mongoose.Types.ObjectId) return v;
        if (typeof v === "string" && /^[a-f\d]{24}$/i.test(v)) {
            return new mongoose.Types.ObjectId(v);
        }
        return null;
    } catch { return null; }
};

export const history = async (req, res) => {
    try {
        const type = String(req.query.type || "").toLowerCase(); // "user" | "group"
        const rawId = String(req.query.id || "").trim();
        const limit = Math.max(1, Math.min(parseInt(req.query.limit || "80", 10), 200));

        if (!["user", "group"].includes(type) || !rawId) {
            return res.status(400).json({ message: "type phải là user|group và cần id" });
        }

        // App của bạn gắn req.user.id (string _id) → ép sang ObjectId
        const meObj = toObjIdSafe(req.user?.id);
        const peerObj = toObjIdSafe(rawId);
        if (!meObj || !peerObj) {
            return res.status(400).json({ message: "id không hợp lệ" });
        }

        let query;
        if (type === "user") {
            // match 2 chiều, chỉ dùng ObjectId để tuyệt đối chính xác
            query = {
                $or: [
                    { sender: meObj, recipientId: peerObj }, // mình → bạn
                    { sender: peerObj, recipientId: meObj }, // bạn → mình
                ],
            };
        } else {
            // group
            query = { recipientType: "group", recipientId: peerObj };
        }

        const docs = await Message.find(query)
            .sort({ createdAt: -1, _id: -1 }) // 🔥 lấy MỚI → CŨ
            .limit(limit)
            .lean();

        // Đảo lại để render từ CŨ → MỚI như trước
        const data = docs.reverse().map(d => ({
            ...d,
            _id: String(d._id),
            sender: String(d.sender),
            recipientId: String(d.recipientId),
        }));
        // trả về dạng FE đang dùng
        return res.json({
            data: docs.map(d => ({
                ...d,
                _id: String(d._id),
                sender: String(d.sender),
                recipientId: String(d.recipientId),
            })),
        });
    } catch (e) {
        console.error("history error:", e);
        return res.status(500).json({ message: "Lỗi tải lịch sử", error: e.message });
    }
};

// POST /api/messages/text
export const sendText = async (req, res) => {
    try {
        const { recipientType, recipientId, content } = req.body;
        if (!["user", "group"].includes(recipientType)) {
            return res.status(400).json({ message: "recipientType phải là user|group" });
        }
        if (!recipientId) {
            return res.status(400).json({ message: "Thiếu recipientId" });
        }
        const meId = toObjIdSafe(req.user?._id) || toObjIdSafe(req.user?.id);
        if (!meId) return res.status(401).json({ message: "Unauthorized" });

        const ridObj = toObjIdSafe(recipientId) || recipientId; // linh hoạt (đọc cũ)
        const doc = await Message.create({
            type: "text",
            sender: meId,
            recipientType,
            recipientId: ridObj,  // nếu convert fail, vẫn lưu string nhưng history đã an toàn
            content: content || ""
        });

        const io = req.app.get("io");
        emitMessageNew(io, doc.toObject());
        res.json({ data: doc });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// POST /api/messages/image
export const sendImage = async (req, res) => {
    try {
        const { recipientType, recipientId } = req.body;
        if (!["user", "group"].includes(recipientType)) {
            return res.status(400).json({ message: "recipientType phải là user|group" });
        }
        const meId = toObjIdSafe(req.user?._id) || toObjIdSafe(req.user?.id);
        if (!meId) return res.status(401).json({ message: "Unauthorized" });

        const file = req.file;
        if (!file) return res.status(400).json({ message: "Thiếu file ảnh" });

        const ridObj = toObjIdSafe(recipientId) || recipientId;
        const publicUrl = "/uploads/" + path.basename(file.path);

        const doc = await Message.create({
            type: "image",
            sender: meId,
            recipientType,
            recipientId: ridObj,
            imageUrl: publicUrl
        });

        const io = req.app.get("io");
        emitMessageNew(io, doc.toObject());
        res.json({ data: doc });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// PATCH /api/messages/recall/:id
export const recall = async (req, res) => {
    try {
        const id = req.params.id;
        const msg = await Message.findById(id);
        if (!msg) return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

        // chỉ cho phép người gửi thu hồi
        const meId = toObjIdSafe(req.user?._id) || toObjIdSafe(req.user?.id);
        if (!meId) return res.status(401).json({ message: "Unauthorized" });

        if (String(msg.sender) !== String(meId)) {
            return res.status(403).json({ message: "Bạn không thể thu hồi tin nhắn của người khác" });
        }

        msg.recalledAt = new Date();
        msg.content = "";    // ẩn nội dung
        msg.imageUrl = "";   // ẩn ảnh
        await msg.save();

        const io = req.app.get("io");
        emitMessageRecalled(io, msg.toObject());

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
