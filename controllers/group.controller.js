// controllers/group.controller.js
import Group from "../models/Group.js";
import GroupInvite from "../models/GroupInvite.js";
import User from "../models/User.js";
import Message from "../models/Message.js";

const pickUser = (u) => ({ _id: u._id, name: u.name, email: u.email, avatar: u.avatar });
const pickGroup = (g) => ({ _id: g._id, name: g.name, owner: g.owner, members: g.members, avatar: g.avatar });

export const createGroup = async (req, res) => {
    try {
        const io = req.app.get("io");
        const me = String(req.user.id || req.user._id);
        const { name, memberIds = [] } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ message: "Thiếu tên nhóm" });

        const members = Array.from(new Set([me, ...memberIds.map(String)]));

        const g = await Group.create({ name: name.trim(), owner: me, members });

        // realtime: báo cho thành viên khác
        members.filter(id => id !== me).forEach(uid => {
            io?.to(String(uid)).emit("group:create", { groupId: g._id, name: g.name });
        });

        return res.json({ message: "Đã tạo nhóm", data: pickGroup(g) });
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
};

export const myGroups = async (req, res) => {
    try {
        const me = String(req.user.id || req.user._id);
        const groups = await Group.find({ members: me })
            .populate("owner", "name email avatar")
            .populate("members", "name email avatar")
            .sort({ updatedAt: -1 })
            .lean();

        res.json({ data: groups });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const inviteToGroup = async (req, res) => {
    try {
        const io = req.app.get("io");
        const me = String(req.user.id || req.user._id);
        const { groupId, userId } = req.body || {};
        if (!groupId || !userId) return res.status(400).json({ message: "Thiếu tham số" });

        const g = await Group.findById(groupId);
        if (!g) return res.status(404).json({ message: "Nhóm không tồn tại" });

        if (!g.members.map(String).includes(me))
            return res.status(403).json({ message: "Không có quyền mời" });

        const meDoc = await User.findById(me);
        if (!meDoc.friends.map(String).includes(String(userId)))
            return res.status(400).json({ message: "Chỉ có thể mời bạn bè" });

        if (g.members.map(String).includes(String(userId)))
            return res.status(400).json({ message: "Người này đã trong nhóm" });

        const exists = await GroupInvite.findOne({ group: groupId, invitee: userId, status: "pending" });
        if (exists) return res.status(400).json({ message: "Đã có lời mời đang chờ" });

        const inv = await GroupInvite.create({ group: groupId, inviter: me, invitee: userId });
        io?.to(String(userId)).emit("group:invite", { inviteId: inv._id, groupId: g._id, groupName: g.name });

        res.json({ message: "Đã gửi lời mời", data: { inviteId: inv._id } });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const listGroupInvites = async (req, res) => {
    try {
        const { type = "incoming" } = req.query;
        const me = String(req.user.id || req.user._id);
        const query = type === "incoming" ? { invitee: me, status: "pending" } : { inviter: me, status: "pending" };

        const list = await GroupInvite.find(query)
            .populate("group", "name avatar")
            .populate("inviter", "name email avatar")
            .populate("invitee", "name email avatar")
            .sort({ createdAt: -1 });

        res.json({
            data: list.map(iv => ({
                _id: iv._id,
                status: iv.status,
                group: { _id: iv.group._id, name: iv.group.name, avatar: iv.group.avatar },
                inviter: pickUser(iv.inviter),
                invitee: pickUser(iv.invitee),
                createdAt: iv.createdAt
            }))
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const addMembersNow = async (req, res) => {
    try {
        const io = req.app.get("io");
        const me = String(req.user.id || req.user._id);
        const { groupId, memberIds = [] } = req.body || {};
        if (!groupId || !memberIds.length) return res.status(400).json({ message: "Thiếu tham số" });

        const g = await Group.findById(groupId).populate("members", "_id");
        if (!g) return res.status(404).json({ message: "Nhóm không tồn tại" });
        if (!g.members.map(m => String(m._id)).includes(me))
            return res.status(403).json({ message: "Chỉ thành viên nhóm mới được thêm người" });

        const toAdd = [...new Set(memberIds.map(String))]
            .filter(uid => !g.members.map(m => String(m._id)).includes(uid));
        if (!toAdd.length) return res.json({ message: "Không có thành viên mới để thêm", data: { added: 0 } });

        g.members.push(...toAdd);
        await g.save();

        const [actor, newbies] = await Promise.all([
            User.findById(me).select("_id name"),
            User.find({ _id: { $in: toAdd } }).select("_id name")
        ]);
        const newbieNames = newbies.map(u => u.name).join(", ");
        const text = `${actor.name} đã thêm ${newbieNames} vào nhóm.`;

        // LƯU notice
        const sysMsg = await Message.create({
            type: "system",
            sender: actor._id,
            recipientType: "group",
            recipientId: g._id,
            content: text
        });

        // realtime
        const audience = g.members.map(m => String(m._id));
        audience.forEach(uid => io?.to(uid).emit("group:notice", {
            groupId: String(g._id),
            text,
            at: sysMsg.createdAt
        }));

        return res.json({ message: "Đã thêm thành viên", data: { groupId: g._id, added: toAdd.length } });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const leaveGroup = async (req, res) => {
    try {
        const io = req.app.get("io");
        const me = String(req.user.id || req.user._id);
        const { groupId } = req.body || {};
        if (!groupId) return res.status(400).json({ message: "Thiếu groupId" });

        const g = await Group.findById(groupId).populate("members", "_id");
        if (!g) return res.status(404).json({ message: "Nhóm không tồn tại" });

        if (String(g.owner) === me) {
            return res.status(400).json({ message: "Chủ nhóm không thể rời nhóm" });
        }

        g.members = g.members.filter(m => String(m._id) !== me);
        await g.save();

        const actor = await User.findById(me).select("_id name");
        const text = `${actor.name} đã rời nhóm.`;

        const sysMsg = await Message.create({
            type: "system",
            sender: actor._id,
            recipientType: "group",
            recipientId: g._id,
            content: text
        });

        g.members.forEach(m => {
            const uid = String(m._id || m);
            io?.to(uid).emit("group:notice", {
                groupId: String(g._id),
                text,
                at: sysMsg.createdAt
            });
        });

        return res.json({ message: "Đã rời nhóm" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const kickMembers = async (req, res) => {
    try {
        const io = req.app.get("io");
        const ownerId = String(req.user._id || req.user.id);
        const { groupId, memberIds = [] } = req.body || {};
        if (!groupId || !memberIds.length) {
            return res.status(400).json({ message: "Thiếu groupId/memberIds" });
        }

        const g = await Group.findById(groupId).populate("members", "_id name");
        if (!g) return res.status(404).json({ message: "Nhóm không tồn tại" });

        if (String(g.owner) !== ownerId) {
            return res.status(403).json({ message: "Chỉ chủ nhóm mới được đuổi thành viên" });
        }

        // chỉ giữ những id hiện đang trong nhóm và KHÔNG phải owner
        const toKick = [...new Set(memberIds.map(String))]
            .filter(id => id !== String(g.owner))
            .filter(id => g.members.some(m => String(m._id) === id));

        if (!toKick.length) {
            return res.json({ message: "Không có thành viên hợp lệ để đuổi", data: { kicked: 0 } });
        }

        // cập nhật thành viên
        g.members = g.members.filter(m => !toKick.includes(String(m._id)));
        await g.save();

        // thông tin hiển thị
        const [actor, kickedUsers] = await Promise.all([
            User.findById(ownerId).select("_id name"),
            User.find({ _id: { $in: toKick } }).select("_id name")
        ]);
        const names = kickedUsers.map(u => u.name).join(", ");
        const text = `${actor.name} đã đuổi ${names} khỏi nhóm.`;

        // lưu system message để không mất khi F5
        const sysMsg = await Message.create({
            type: "system",
            sender: actor._id,
            recipientType: "group",
            recipientId: g._id,
            content: text
        });

        // realtime: notice cho các thành viên còn lại
        g.members.forEach(m => {
            io?.to(String(m._id)).emit("group:notice", {
                groupId: String(g._id),
                text,
                at: sysMsg.createdAt
            });
        });

        // realtime: báo cho người bị đuổi (để tự rời phòng nếu đang mở)
        toKick.forEach(uid => {
            io?.to(String(uid)).emit("group:kick", {
                groupId: String(g._id),
                text,
                at: sysMsg.createdAt
            });
        });

        return res.json({ message: "Đã đuổi thành viên", data: { kicked: toKick.length } });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const deleteGroup = async (req, res) => {
    try {
        const io = req.app.get("io");
        const me = String(req.user.id || req.user._id);
        const { groupId } = req.body || {};
        const g = await Group.findById(groupId);
        if (!g) return res.status(404).json({ message: "Nhóm không tồn tại" });
        if (String(g.owner) !== me)
            return res.status(403).json({ message: "Chỉ owner mới được xóa nhóm" });

        const members = [...g.members];
        await Group.deleteOne({ _id: groupId });
        await GroupInvite.updateMany({ group: groupId, status: "pending" }, { $set: { status: "canceled" } });

        members.forEach(uid => io?.to(String(uid)).emit("group:deleted", { groupId }));
        res.json({ message: "Đã xóa nhóm" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
