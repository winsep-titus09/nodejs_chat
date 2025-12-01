// models/FriendRequest.js
import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // người gửi
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // người nhận
    status: {
        type: String,
        enum: ["pending", "accepted", "declined", "canceled"],
        default: "pending"
    }
}, { timestamps: true });

// Tối ưu truy vấn
friendRequestSchema.index({ requester: 1, recipient: 1, status: 1 });
friendRequestSchema.index({ recipient: 1, status: 1, createdAt: -1 });

export default mongoose.model("FriendRequest", friendRequestSchema);
