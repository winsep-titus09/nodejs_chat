import User from "../models/User.js";

export const searchUsers = async (req, res) => {
    const { q = "" } = req.query;
    if (!q.trim()) return res.json({ data: [] });

    // tìm theo name text index + fallback email
    const users = await User.find({
        $or: [
            { $text: { $search: q } },
            { email: { $regex: q, $options: "i" } },
            { name: { $regex: q, $options: "i" } }
        ]
    }).select("_id name email avatar").limit(20);

    res.json({ data: users });
};
