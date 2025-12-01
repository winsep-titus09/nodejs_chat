// models/GroupInvite.js
import mongoose from "mongoose";

const groupInviteSchema = new mongoose.Schema(
    {
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
        inviter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        invitee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["pending", "accepted", "declined", "canceled"], default: "pending" }
    },
    { timestamps: true }
);

groupInviteSchema.index({ group: 1, invitee: 1, status: 1 });

export default mongoose.model("GroupInvite", groupInviteSchema);
