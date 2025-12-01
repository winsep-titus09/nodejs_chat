import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { searchUsers } from "../controllers/user.controller.js";

const r = Router();
r.get("/search", auth, searchUsers);
export default r;
