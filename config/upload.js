import multer from "multer";
import path from "path";
import fs from "fs";

const dir = path.join(process.cwd(), "public", "uploads", "messages");
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "");
        const name = Date.now() + "-" + Math.random().toString(36).slice(2) + ext;
        cb(null, name);
    }
});

function fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Chỉ hỗ trợ file ảnh"), false);
    }
    cb(null, true);
}

export const uploadImage = multer({ storage, fileFilter }).single("image");
