import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, index: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },

    // Sẵn sàng cho các chức năng sau này (kết bạn, nhóm...)
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

userSchema.pre("save", async function (next) {
    if (this.isModified("password")) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

userSchema.methods.compare = function (plain) {
    return bcrypt.compare(plain, this.password);
};

// Tạo text index cho tìm kiếm theo tên (phục vụ search bạn bè về sau)
userSchema.index({ name: "text" });

const User = mongoose.model("User", userSchema);
export default User;
