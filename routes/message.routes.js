// routes/message.routes.js
import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { history, sendText, sendImage, recall, upload } from "../controllers/message.controller.js";

const r = Router();

r.get("/history", auth, history);
r.post("/text", auth, sendText);
r.post("/image", auth, upload.single("image"), sendImage);
r.patch("/recall/:id", auth, recall);

export default r;
