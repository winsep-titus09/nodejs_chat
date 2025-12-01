// routes/friend.routes.js
import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
    sendRequest,
    listRequests,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    listFriends
} from "../controllers/friend.controller.js";

const r = Router();

r.get("/list", auth, listFriends);                 // danh sách bạn bè
r.get("/requests", auth, listRequests);            // ?type=incoming|outgoing (default incoming)

r.post("/request", auth, sendRequest);             // gửi lời mời
r.post("/accept", auth, acceptRequest);            // chấp nhận
r.post("/decline", auth, declineRequest);          // từ chối
r.post("/cancel", auth, cancelRequest);            // hủy lời mời đã gửi
r.post("/unfriend", auth, removeFriend);           // hủy bạn bè

export default r;
