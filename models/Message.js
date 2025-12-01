// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    type: { type: String, enum: ["text", "image", "system"], default: "text", index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // system: vẫn lưu actor
    recipientType: { type: String, enum: ["user", "group"], required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    content: String,
    imageUrl: String,
    recalledAt: Date
}, { timestamps: true });

// index tối ưu query history
messageSchema.index({ recipientType: 1, recipientId: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
