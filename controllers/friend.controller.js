// controllers/friend.controller.js
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

const pickUser = (u) => ({ _id: u._id, name: u.name, email: u.email, avatar: u.avatar });

/**
 * Gửi lời mời kết bạn
 * body: { userId: "recipientId" }
 */
export const sendRequest = async (req, res) => {
    const io = req.app.get("io");
    const { userId } = req.body;
    const me = req.user.id;

    if (!userId) return res.status(400).json({ message: "Thiếu userId" });
    if (userId === me) return res.status(400).json({ message: "Không thể tự gửi lời mời" });

    const recipient = await User.findById(userId);
    if (!recipient) return res.status(404).json({ message: "Người nhận không tồn tại" });

    // đã là bạn?
    const isFriend = await User.exists({ _id: me, friends: userId });
    if (isFriend) return res.status(400).json({ message: "Hai bạn đã là bạn bè" });

    // đã có pending 2 chiều?
    const pending = await FriendRequest.findOne({
        $or: [
            { requester: me, recipient: userId, status: "pending" },
            { requester: userId, recipient: me, status: "pending" }
        ]
    });
    if (pending) return res.status(400).json({ message: "Đã tồn tại lời mời đang chờ" });

    const fr = await FriendRequest.create({ requester: me, recipient: userId });

    const meDoc = await User.findById(me).select("name email avatar");
    io.to(userId).emit("friend:request", {
        _id: fr._id,
        requester: pickUser(meDoc),
        recipientId: userId,
        status: fr.status,
        createdAt: fr.createdAt
    });

    res.json({ message: "Đã gửi lời mời", data: fr });
};

/**
 * Danh sách lời mời
 * /api/friends/requests?type=incoming|outgoing
 */
export const listRequests = async (req, res) => {
    const io = req.app.get("io");
    const { type = "incoming" } = req.query;
    const me = req.user.id;

    let query;
    if (type === "incoming") {
        query = { recipient: me, status: "pending" };
    } else {
        query = { requester: me, status: "pending" };
    }

    const docs = await FriendRequest.find(query)
        .populate("requester", "name email avatar")
        .populate("recipient", "name email avatar")
        .sort({ createdAt: -1 });

    res.json({
        data: docs.map(d => ({
            _id: d._id,
            status: d.status,
            requester: pickUser(d.requester),
            recipient: pickUser(d.recipient),
            createdAt: d.createdAt
        }))
    });
};

/**
 * Đồng ý lời mời
 * body: { requestId }
 */
export const acceptRequest = async (req, res) => {
    const io = req.app.get("io");
    const { requestId } = req.body;
    const me = req.user.id;

    const fr = await FriendRequest.findById(requestId);
    if (!fr) return res.status(404).json({ message: "Không tìm thấy lời mời" });
    if (fr.recipient.toString() !== me) return res.status(403).json({ message: "Không có quyền" });
    if (fr.status !== "pending") return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    // cập nhật quan hệ bạn bè 2 chiều
    const meDoc = await User.findById(me);
    const friendDoc = await User.findById(fr.requester);

    if (!meDoc.friends.includes(fr.requester)) meDoc.friends.push(fr.requester);
    if (!friendDoc.friends.includes(meDoc._id)) friendDoc.friends.push(meDoc._id);

    fr.status = "accepted";
    await Promise.all([meDoc.save(), friendDoc.save(), fr.save()]);

    // realtime: cho cả 2 bên
    io.to(fr.requester.toString()).emit("friend:accept", { user: pickUser(meDoc) });
    io.to(me).emit("friend:accept", { user: pickUser(friendDoc) });

    res.json({ message: "Đã chấp nhận", data: { friendId: friendDoc._id } });
};

/**
 * Từ chối lời mời
 * body: { requestId }
 */
export const declineRequest = async (req, res) => {
    const io = req.app.get("io");
    const { requestId } = req.body;
    const me = req.user.id;

    const fr = await FriendRequest.findById(requestId);
    if (!fr) return res.status(404).json({ message: "Không tìm thấy lời mời" });
    if (fr.recipient.toString() !== me) return res.status(403).json({ message: "Không có quyền" });
    if (fr.status !== "pending") return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    fr.status = "declined";
    await fr.save();

    io.to(fr.requester.toString()).emit("friend:decline", { by: me });

    res.json({ message: "Đã từ chối" });
};

/**
 * Hủy (cancel) lời mời mình đã gửi
 * body: { requestId }
 */
export const cancelRequest = async (req, res) => {
    const io = req.app.get("io");
    const { requestId } = req.body;
    const me = req.user.id;

    const fr = await FriendRequest.findById(requestId);
    if (!fr) return res.status(404).json({ message: "Không tìm thấy lời mời" });
    if (fr.requester.toString() !== me) return res.status(403).json({ message: "Không có quyền" });
    if (fr.status !== "pending") return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    fr.status = "canceled";
    await fr.save();

    io.to(fr.recipient.toString()).emit("friend:cancel", { by: me });

    res.json({ message: "Đã hủy lời mời" });
};

/**
 * Hủy bạn bè (unfriend)
 * body: { friendId }
 */
export const removeFriend = async (req, res) => {
    const io = req.app.get("io");
    const { friendId } = req.body;
    const me = req.user.id;

    if (!friendId) return res.status(400).json({ message: "Thiếu friendId" });

    const meDoc = await User.findById(me);
    const friendDoc = await User.findById(friendId);
    if (!friendDoc) return res.status(404).json({ message: "Người dùng không tồn tại" });

    meDoc.friends = meDoc.friends.filter(id => id.toString() !== friendId);
    friendDoc.friends = friendDoc.friends.filter(id => id.toString() !== me);

    await Promise.all([meDoc.save(), friendDoc.save()]);

    io.to(friendId).emit("friend:unfriend", { by: me });

    res.json({ message: "Đã hủy bạn bè" });
};

/** Danh sách bạn bè hiện tại */
export const listFriends = async (req, res) => {
    const me = req.user.id;
    const user = await User.findById(me).populate("friends", "name email avatar");
    res.json({ data: (user?.friends || []).map(pickUser) });
};
