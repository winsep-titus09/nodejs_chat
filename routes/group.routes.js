// routes/group.routes.js
import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
    createGroup, myGroups, inviteToGroup, listGroupInvites, addMembersNow,
    leaveGroup, deleteGroup, kickMembers
} from "../controllers/group.controller.js";

const router = Router();

// Danh sách nhóm của tôi
router.get("/mine", auth, myGroups);

// Tạo nhóm
router.post("/create", auth, createGroup);

// Mời vào nhóm
router.post("/invite", auth, inviteToGroup);
router.get("/invites", auth, listGroupInvites);
router.post("/add-members", auth, addMembersNow);
router.post("/kick-members", auth, kickMembers);

// Rời/Xóa nhóm
router.post("/leave", auth, leaveGroup);
router.post("/delete", auth, deleteGroup);

export default router;
