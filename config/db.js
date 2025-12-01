import mongoose from "mongoose";

export default async function connectDB(uri) {
    mongoose.set("strictQuery", true);

    // Kết nối
    await mongoose.connect(uri, {
        // options hiện đại của Mongoose 7+ không cần nhiều flag
    });

    const dbName = mongoose.connection.db.databaseName;
    console.log("✅ Đã kết nối MongoDB — DB:", dbName);

    // Log lỗi kết nối/thao tác
    mongoose.connection.on("error", (err) => {
        console.error("❌ MongoDB error:", err?.message || err);
    });
}
