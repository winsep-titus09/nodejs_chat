// models/Group.js
import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        avatar: { type: String, default: "" }
    },
    { timestamps: true }
);

groupSchema.index({ owner: 1 });
groupSchema.index({ members: 1 });

export default mongoose.model("Group", groupSchema);
