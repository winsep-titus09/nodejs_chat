// public/js/chat.js
(async function () {
    // ===== Helpers / DOM =====
    const $ = (s) => document.querySelector(s);

    // Chat layout
    const elMsgs = $("#msgs");
    const elTitle = $("#roomTitle");
    const elAvatar = $("#roomAvatar");
    const elChatDot = $("#chatStatusDot");
    const elTyping = $("#typing"); // vẫn giữ nếu bạn muốn dùng lại sau, nhưng JS mới sẽ render trong #msgs

    // Composer
    const elForm = $("#composer");
    const elText = $("#textInput");
    const elImg = $("#imgInput");
    const elPreview = $("#preview");
    const elPrevImg = $("#prevImg");
    const elClearPrev = $("#clearPrev");

    // Emoji
    const elBtnEmoji = $("#btnEmoji");
    const elEmojiPicker = $("#emojiPicker");

    // Sidebar
    const elSideList = $("#sideList");
    const elSideSearch = $("#sideSearch");
    const elTabs = document.querySelectorAll(".tab");
    let currentTab = "friends";

    // Group header menu
    const elGroupActions = $("#groupActions");
    const elBtnGroupMenu = $("#btnGroupMenu");
    const elGroupMenu = $("#groupMenu");
    const elMiAdd = $("#miAddMembers");
    const elMiKick = $("#miKick");
    const elMiLeave = $("#miLeave");
    const elMiDelete = $("#miDelete");

    // Create Group modal
    const elBtnNewGroup = $("#btnNewGroup");
    const elGm = $("#groupModal");
    const elGmClose = $("#gmClose");
    const elGmCancel = $("#gmCancel");
    const elGmForm = $("#gmForm");
    const elGmName = $("#gmName");
    const elGmFind = $("#gmFind");
    const elGmList = $("#gmList");

    // Add Members modal
    const elAm = $("#addMemberModal");
    const elAmClose = $("#amClose");
    const elAmCancel = $("#amCancel");
    const elAmForm = $("#amForm");
    const elAmFind = $("#amFind");
    const elAmList = $("#amList");

    // Kick Members modal
    const elKm = $("#kickMemberModal");
    const elKmClose = $("#kmClose");
    const elKmCancel = $("#kmCancel");
    const elKmForm = $("#kmForm");
    const elKmFind = $("#kmFind");
    const elKmList = $("#kmList");

    // ===== State =====
    const state = {
        me: null,
        online: new Set(),
        friends: [],
        current: null // {type:'user'|'group', id, name, avatar, owner?, members?}
    };

    // ---- Typing state / helpers ----
    const TYPING_DEBOUNCE = 250;
    const TYPING_IDLE = 2000;
    let typingTimer = null;
    let stopTimer = null;
    let alreadyTyping = false;
    const typers = new Map(); // userId -> { name, timeoutId }

    function showTypingHeader() {
        // GIỮ nguyên logic cũ cho #typing trên header nếu bạn muốn dùng lại,
        // nhưng mặc định chúng ta sẽ hiển thị trong #msgs bằng bubble riêng.
        if (!elTyping) return;
        const items = Array.from(typers.values()).map(x => x.name || "Ai đó");
        if (!items.length) {
            elTyping.style.display = "none";
            elTyping.textContent = "";
            return;
        }
        elTyping.style.display = "";
        elTyping.textContent =
            items.length === 1
                ? `${items[0]} đang nhắn…`
                : `${items.slice(0, 2).join(", ")}${items.length > 2 ? ` và ${items.length - 2} người khác` : ""} đang nhắn…`;
    }
    function addTyper(userId, name) {
        if (!userId || String(userId) === String(state.me?._id || state.me?.id)) return;
        const prev = typers.get(String(userId));
        if (prev?.timeoutId) clearTimeout(prev.timeoutId);
        const timeoutId = setTimeout(() => {
            typers.delete(String(userId));
            showTypingHeader();
        }, 2500);
        typers.set(String(userId), { name, timeoutId });
        showTypingHeader();
    }
    function removeTyper(userId) {
        const t = typers.get(String(userId));
        if (t?.timeoutId) clearTimeout(t.timeoutId);
        typers.delete(String(userId));
        showTypingHeader();
    }
    function resetTypers() {
        for (const [, v] of typers) if (v.timeoutId) clearTimeout(v.timeoutId);
        typers.clear();
        showTypingHeader();
    }
    function emitTypingStart() {
        if (!state.current?.id || alreadyTyping) return;
        alreadyTyping = true;
        if (state.current.type === "user") {
            socket.emit("typing", { toType: "user", toId: state.current.id });
        } else if (state.current.type === "group") {
            socket.emit("typing", { toType: "group", groupId: state.current.id });
        }
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = setTimeout(emitTypingStop, TYPING_IDLE);
    }
    function emitTypingStop() {
        if (!state.current?.id || !alreadyTyping) return;
        alreadyTyping = false;
        if (state.current.type === "user") {
            socket.emit("typing:stop", { toType: "user", toId: state.current.id });
        } else if (state.current.type === "group") {
            socket.emit("typing:stop", { toType: "group", groupId: state.current.id });
        }
    }

    // --- NEW: Typing bubble trong #msgs ---
    function getUserNameById(id) {
        id = String(id || "");
        const f = (state.friends || []).find(x => String(x._id) === id);
        if (f?.name) return f.name;
        const mm = state.current?.membersFull;
        if (Array.isArray(mm)) {
            const m = mm.find(x => String(x._id || x.id) === id);
            if (m?.name) return m.name;
        }
        return null;
    }
    function ensureTypingRow() {
        let row = document.querySelector("#typingRow");
        if (!row) {
            row = document.createElement("div");
            row.id = "typingRow";
            row.className = "row typing";
            // inline-style để không cần sửa CSS
            const bubble = document.createElement("div");
            bubble.className = "bubble";
            bubble.style.cssText = "background:#f1f5f9;color:#475569;padding:8px 12px;border-radius:14px;font-size:13px;display:inline-flex;align-items:center;gap:6px;";
            bubble.innerHTML = `<span class="typing-text">Đang nhắn…</span><span class="typing-dots" style="display:inline-flex;gap:4px;"><i style="width:5px;height:5px;border-radius:50%;background:#94a3b8;display:inline-block;"></i><i style="width:5px;height:5px;border-radius:50%;background:#94a3b8;display:inline-block;"></i><i style="width:5px;height:5px;border-radius:50%;background:#94a3b8;display:inline-block;"></i></span>`;
            row.appendChild(bubble);
            elMsgs.appendChild(row);
        }
        return row;
    }
    function setTypingText(text) {
        const row = ensureTypingRow();
        const span = row.querySelector(".typing-text");
        if (span) span.textContent = text || "Đang nhắn…";
    }
    function showTypingRow(text) {
        const row = ensureTypingRow();
        row.style.display = "";
        setTypingText(text);
        elMsgs.scrollTop = elMsgs.scrollHeight;
    }
    function hideTypingRow() {
        const row = document.querySelector("#typingRow");
        if (row) row.style.display = "none";
    }

    // ----- Smart scroll helpers -----
    function isNearBottom(el, threshold = 80) {
        return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
    }
    function scrollToBottom(force = false) {
        if (!elMsgs) return;
        if (force || isNearBottom(elMsgs)) elMsgs.scrollTop = elMsgs.scrollHeight;
    }

    // ===== Utils =====
    async function api(url, opts) {
        const r = await fetch(url, opts);
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
            const j = await r.json();
            if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
            return j;
        } else {
            const t = await r.text();
            throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`);
        }
    }
    const initials = (name) => (name || "?").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
    function toast(msg) { console.log("[toast]", msg); }

    // ===== Auth & Socket =====
    const meResp = await api("/api/auth/me");
    state.me = meResp.data || {};
    if (!state.me._id && state.me.id) state.me._id = state.me.id;

    const socket = io("/", { withCredentials: true });

    // Presence
    socket.on("presence:seed", ({ users }) => {
        state.online = new Set((users || []).map(String));
        markOnline();
        if (state.current?.type === "user") updateChatHeaderPresence(state.current.id);
    });
    socket.on("presence:online", ({ userId }) => {
        state.online.add(String(userId));
        markOnline();
        if (state.current?.type === "user" && String(state.current.id) === String(userId))
            updateChatHeaderPresence(userId);
    });
    socket.on("presence:offline", ({ userId }) => {
        state.online.delete(String(userId));
        markOnline();
        if (state.current?.type === "user" && String(state.current.id) === String(userId))
            updateChatHeaderPresence(userId);
    });

    // ===== SOCKET: tin nhắn realtime =====
    socket.on("message:new", (m) => {
        if (!m) return;
        const isMe = String(m.sender) === String(state.me?._id);

        // khi có tin nhắn thật tới, ẩn bubble typing (nếu của đối tác)
        if (state.current?.type === "user" && m.recipientType === "user") {
            const ongoing =
                (isMe && String(m.recipientId) === String(state.current.id)) ||
                (!isMe && String(m.sender) === String(state.current.id));
            if (ongoing) hideTypingRow();
        } else if (state.current?.type === "group" && m.recipientType === "group") {
            if (String(m.recipientId) === String(state.current.id)) hideTypingRow();
        }

        if (m.recipientType === "user") {
            if (!state.current || state.current.type !== "user") return;
            const ongoing =
                (isMe && String(m.recipientId) === String(state.current.id)) ||
                (!isMe && String(m.sender) === String(state.current.id));
            if (ongoing) renderMessage(m, isMe);
        } else if (m.recipientType === "group") {
            if (!state.current || state.current.type !== "group") return;
            if (String(m.recipientId) === String(state.current.id)) {
                renderMessage(m, isMe);
            }
        }
    });

    // Realtime: khi 1 tin nhắn bị thu hồi
    socket.on("message:recalled", ({ id }) => {
        if (!id) return;
        const row = elMsgs?.querySelector(`.row[data-id="${id}"]`);
        if (!row) return;

        const bubble = row.querySelector(".bubble");
        if (bubble) bubble.innerHTML = `<i>Tin nhắn đã được thu hồi</i>`;

        const img = row.querySelector("img");
        if (img) img.remove();

        const recallBtn = row.querySelector(".msg-recall-btn");
        if (recallBtn) recallBtn.remove();
    });

    // ===== SOCKET: typing (nhận) — HIỂN THỊ TRONG #msgs =====
    socket.on("typing", (d) => {
        console.log("[CLIENT] typing <", d);
        if (!d || !state.current) return;

        // 1-1
        if (state.current.type === "user" && d.toType === "user") {
            if (String(d.from) !== String(state.current.id)) return;
            const name = getUserNameById(d.from) || state.current?.name || "Đối tác";
            showTypingRow(`${name} đang nhắn…`);
            clearTimeout(window.__typingMsgTimer);
            window.__typingMsgTimer = setTimeout(hideTypingRow, 2000);
            return;
        }

        // group
        if (state.current.type === "group" && d.toType === "group") {
            const gid = String(d.groupId || d.toId);
            if (gid !== String(state.current.id)) return;
            const name = getUserNameById(d.from) || "Ai đó";
            showTypingRow(`${name} đang nhắn…`);
            clearTimeout(window.__typingMsgTimer);
            window.__typingMsgTimer = setTimeout(hideTypingRow, 2000);
        }
    });

    socket.on("typing:stop", (d) => {
        console.log("[CLIENT] typing:stop <", d);
        if (!d || !state.current) return;

        if (state.current.type === "user" && d.toType === "user") {
            if (String(d.from) !== String(state.current.id)) return;
            hideTypingRow();
            return;
        }

        if (state.current.type === "group" && d.toType === "group") {
            const gid = String(d.groupId || d.toId);
            if (gid !== String(state.current.id)) return;
            hideTypingRow();
        }
    });

    // ===== Friends =====
    async function loadFriends() {
        const js = await api("/api/friends/list");
        state.friends = (js.data || []).map(u => ({ ...u, _id: String(u._id || u.id) }));
        renderSideFriends(state.friends);
        markOnline();
        if (elGroupActions) elGroupActions.style.display = "none";
        hideGroupMenu();
    }

    function renderSideFriends(list) {
        const q = (elSideSearch.value || "").trim().toLowerCase();
        const data = list.filter(u => (u.name || "").toLowerCase().includes(q));
        elSideList.innerHTML = "";
        if (!data.length) {
            elSideList.innerHTML = `<div class="meta" style="padding:10px">Không có kết quả</div>`;
            return;
        }
        data.forEach(u => {
            const item = document.createElement("div");
            item.className = "item";
            item.dataset.id = u._id;
            item.innerHTML = `
        <div class="avatar-wrap">
          ${u.avatar
                    ? `<div class="avatar"><img src="${u.avatar}" alt=""></div>`
                    : `<div class="avatar">${initials(u.name)}</div>`}
          <span class="status-dot ${state.online.has(String(u._id)) ? "online" : "offline"}"></span>
        </div>
        <div>
          <div style="font-weight:600">${u.name}</div>
          <div class="meta" style="font-size:12px">${u.email || ""}</div>
        </div>`;
            item.onclick = () => openUser(u);
            elSideList.appendChild(item);
        });
    }

    function markOnline() {
        elSideList.querySelectorAll(".item").forEach(it => {
            const id = String(it.dataset.id);
            const dot = it.querySelector(".status-dot");
            if (!dot) return;
            if (state.online.has(id)) { dot.classList.add("online"); dot.classList.remove("offline"); }
            else { dot.classList.add("offline"); dot.classList.remove("online"); }
        });
    }

    function updateChatHeaderPresence(userId) {
        if (!elChatDot) return;
        const on = state.online.has(String(userId));
        elChatDot.classList.toggle("online", on);
        elChatDot.classList.toggle("offline", !on);
    }

    // ===== Open User conversation =====
    async function openUser(u) {
        // reset typing khi đổi phòng
        hideTypingRow();
        if (elTyping) { elTyping.textContent = ""; elTyping.style.display = "none"; }
        clearTimeout(window.__typingHideTimer);
        resetTypers();
        alreadyTyping = false;
        if (typingTimer) clearTimeout(typingTimer);
        if (stopTimer) clearTimeout(stopTimer);

        // Cập nhật state phiên chat hiện tại
        state.current = { type: "user", id: String(u._id), name: u.name, avatar: u.avatar };

        // Header
        elTitle.textContent = u.name;
        elAvatar.innerHTML = u.avatar
            ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : initials(u.name);
        updateChatHeaderPresence(u._id);

        // Ẩn action của group nếu đang bật
        if (elGroupActions) elGroupActions.style.display = "none";
        hideGroupMenu?.();

        // Active item bên sidebar (so sánh string để chắc ăn)
        const uidStr = String(u._id);
        elSideList.querySelectorAll(".item").forEach((n) => {
            n.classList.toggle("active", String(n.dataset.id) === uidStr);
        });

        // Tải lịch sử tin nhắn
        elMsgs.innerHTML = "";
        try {
            const res = await fetch(`/api/messages/history?type=user&id=${uidStr}&limit=40`, {
                credentials: "include",
                headers: { "Accept": "application/json" },
            });

            if (!res.ok) {
                console.error(`Không thể tải lịch sử (${res.status})`);
                return;
            }

            const json = await res.json();
            const items = Array.isArray(json) ? json : (json.data || []);

            const meIdStr = String(state.me?._id || state.me?.id || "");
            items.forEach((m) => {
                renderMessage(m, String(m.sender) === meIdStr);
            });

            scrollToBottom?.(true);
        } catch (err) {
            console.error("Lỗi tải lịch sử:", err);
        }
    }

    // ===== Render message & system =====
    // Lấy tên người gửi (ưu tiên map của phòng nhóm, fallback sang danh bạ)
    function resolveName(senderId) {
        const sid = String(senderId || "");
        // map có sẵn khi openGroup() đã gọi getGroupMembers()
        if (state.current?.memberNameById instanceof Map) {
            const n = state.current.memberNameById.get(sid);
            if (n) return n;
        }
        const fr = (state.friends || []).find(f => String(f._id) === sid);
        if (fr?.name) return fr.name;
        return `User #${sid.slice(-4)}`;
    }

    // Chỉ auto-scroll khi đang gần cuối
    function isNearBottom(el, threshold = 80) {
        if (!el) return true;
        return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
    }

    function renderMessage(m, isMe) {
        if (!m) return;

        // Chống trùng khi vừa load history lại vừa nhận socket cùng tin nhắn
        const exist = elMsgs?.querySelector(`.row[data-id="${m._id}"]`);
        if (exist) {
            // Nếu chỉ là cập nhật trạng thái recall, update nhẹ rồi thoát
            if (m.recalledAt) {
                const bubble = exist.querySelector(".bubble");
                if (bubble) bubble.innerHTML = `<i>Tin nhắn đã được thu hồi</i>`;
                const img = exist.querySelector("img");
                if (img) img.remove();
                const btn = exist.querySelector(".msg-recall-btn");
                if (btn) btn.remove();
            }
            return;
        }

        const shouldStick = isNearBottom(elMsgs);

        const row = document.createElement("div");
        row.className = "row " + (isMe ? "me" : "");
        row.dataset.id = String(m._id);

        // ----- Tên người gửi (chỉ khi là phòng nhóm và không phải tin của mình) -----
        if (state.current?.type === "group" && !isMe) {
            const nameWrap = document.createElement("div");
            nameWrap.className = "sender-name";
            nameWrap.textContent = resolveName(m.sender);
            row.appendChild(nameWrap);
        }

        // ----- Bubble -----
        const bubble = document.createElement("div");
        bubble.className = "bubble";

        if (m.recalledAt) {
            bubble.innerHTML = `<i>Tin nhắn đã được thu hồi</i>`;
        } else if (m.type === "image") {
            bubble.innerHTML = `<img src="${m.imageUrl}" alt="">`;
        } else {
            bubble.textContent = m.content || "";
        }

        // Nút thu hồi (giữ nguyên logic cũ)
        if (isMe && !m.recalledAt) {
            const btn = document.createElement("button");
            btn.className = "msg-recall-btn";
            btn.title = "Thu hồi";
            btn.textContent = "Thu hồi";
            btn.dataset.id = String(m._id);
            bubble.appendChild(btn);
        }

        // Time
        const time = document.createElement("div");
        time.className = "time";
        time.textContent = new Date(m.createdAt || Date.now()).toLocaleTimeString();

        row.appendChild(bubble);
        row.appendChild(time);

        elMsgs.appendChild(row);

        // Chỉ kéo xuống khi người dùng đang ở gần cuối (tránh làm mất vị trí xem history)
        if (shouldStick) {
            elMsgs.scrollTop = elMsgs.scrollHeight;
        }
    }


    function renderSystem(text, at) {
        const row = document.createElement("div");
        row.className = "row system";
        row.innerHTML = `
      <div class="system-line">
        <span>${text}</span>
        <time class="meta">${new Date(at || Date.now()).toLocaleTimeString()}</time>
      </div>`;
        elMsgs.appendChild(row);
        scrollToBottom(false);
    }

    // ===== Composer: typing, file, emoji =====
    if (elText) {
        elText?.addEventListener("input", () => {
            if (!state.current?.id) return;
            const payload = state.current.type === "user"
                ? { toType: "user", toId: state.current.id }
                : { toType: "group", groupId: state.current.id };
            console.log("[CLIENT] -> typing", payload);
            socket.emit("typing", payload);
        });

        // Ngừng typing khi blur / idle
        elText?.addEventListener("blur", () => {
            if (!state.current?.id) return;
            const payload = state.current.type === "user"
                ? { toType: "user", toId: state.current.id }
                : { toType: "group", groupId: state.current.id };
            console.log("[CLIENT] -> typing:stop", payload);
            socket.emit("typing:stop", payload);
        });
    }

    elImg?.addEventListener("change", () => {
        const f = elImg.files?.[0];
        if (!f) { elPreview.classList.remove("show"); return; }
        elPrevImg.src = URL.createObjectURL(f);
        elPreview.classList.add("show");
    });
    elClearPrev?.addEventListener("click", () => {
        elImg.value = "";
        elPreview.classList.remove("show");
        elPrevImg.src = "";
    });

    // Event delegation cho nút Thu hồi
    elMsgs?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".msg-recall-btn");
        if (!btn) return;

        const id = btn.dataset.id;
        try {
            await api(`/api/messages/recall/${id}`, { method: "PATCH" });
            // Không render ở đây -> chờ socket "message:recalled"
        } catch (err) {
            alert(err.message || "Thu hồi thất bại");
        }
    });

    // Emoji toggle
    function toggleEmoji(show) {
        if (!elEmojiPicker) return;
        const isHidden = elEmojiPicker.classList.contains("hidden");
        const willShow = (typeof show === "boolean") ? show : isHidden;
        elEmojiPicker.classList.toggle("hidden", !willShow);
        if (willShow) {
            const rect = elText.getBoundingClientRect();
            elEmojiPicker.style.position = "fixed";
            elEmojiPicker.style.left = rect.left + "px";
            elEmojiPicker.style.bottom = "84px";
        }
    }
    elBtnEmoji?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleEmoji();
    });
    document.addEventListener("click", (e) => {
        if (!elEmojiPicker) return;
        if (elEmojiPicker.classList.contains("hidden")) return;
        const withinPicker = elEmojiPicker.contains(e.target);
        const withinBtn = elBtnEmoji && elBtnEmoji.contains(e.target);
        const withinInput = elText && elText.contains(e.target);
        if (!withinPicker && !withinBtn && !withinInput) toggleEmoji(false);
    });
    if (elEmojiPicker) {
        elEmojiPicker.addEventListener("emoji-click", (ev) => {
            const emoji = ev.detail?.unicode || ev.detail?.emoji?.unicode || "";
            if (!emoji) return;
            insertAtCursor(elText, emoji);
            toggleEmoji(false);
            elText.dispatchEvent(new Event("input", { bubbles: true }));
            elText.focus();
        });
    }
    function insertAtCursor(input, text) {
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const before = input.value.slice(0, start);
        const after = input.value.slice(end);
        input.value = before + text + after;
        const pos = start + text.length;
        input.setSelectionRange(pos, pos);
    }

    // ===== Composer submit (CHỈ GỌI API, KHÔNG RENDER; chờ socket) =====
    elForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.current) return;

        // TEXT
        const text = (elText.value || "").trim();
        if (text) {
            try {
                await api("/api/messages/text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        recipientType: state.current.type, // 'user' | 'group'
                        recipientId: state.current.id,
                        content: text
                    })
                });
                elText.value = "";
                emitTypingStop(); // ngừng "đang nhắn" ngay khi gửi
                hideTypingRow();  // ẩn bubble trong #msgs
            } catch (err) {
                alert(err.message || "Gửi tin nhắn thất bại");
            }
        }

        // IMAGE
        if (elImg.files && elImg.files[0]) {
            const fd = new FormData();
            fd.append("image", elImg.files[0]);
            fd.append("recipientType", state.current.type);
            fd.append("recipientId", state.current.id);
            try {
                const r2 = await fetch("/api/messages/image", { method: "POST", body: fd });
                const js2 = await r2.json();
                if (!r2.ok) throw new Error(js2.message || "Upload ảnh thất bại");
            } catch (err) {
                alert(err.message || "Gửi ảnh thất bại");
            }
            elImg.value = "";
            elPreview.classList.remove("show");
            elPrevImg.src = "";
        }
    });

    // ===== Tabs =====
    elTabs.forEach(tab => {
        tab.addEventListener("click", async () => {
            elTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentTab = tab.dataset.tab;
            if (currentTab === "friends") await loadFriends();
            else if (currentTab === "groups") await loadGroups();
        });
    });

    // ===== Groups (sidebar list) =====
    async function loadGroups() {
        try {
            const r = await fetch("/api/groups/mine");
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Không tải được nhóm");
            renderGroupList(js.data || []);
            if (elTyping) elTyping.textContent = "";
            hideGroupMenu();
        } catch (err) {
            elSideList.innerHTML = `<div class="meta" style="padding:10px;color:red">${err.message}</div>`;
        }
    }
    function renderGroupList(groups) {
        elSideList.innerHTML = "";
        if (!groups.length) {
            elSideList.innerHTML = `<div class="meta" style="padding:10px">Chưa có nhóm nào</div>`;
            return;
        }
        groups.forEach(g => {
            const item = document.createElement("div");
            item.className = "item";
            item.dataset.id = g._id;
            const letter = (g.name || "?")[0]?.toUpperCase() || "?";
            item.innerHTML = `
        <div class="avatar-wrap"><div class="avatar" style="background:#93c5fd">${letter}</div></div>
        <div>
          <div style="font-weight:600">${g.name}</div>
          <div class="meta" style="font-size:12px">${(g.members?.length || 0)} thành viên</div>
        </div>`;
            item.onclick = () => openGroup(g);
            elSideList.appendChild(item);
        });
    }

    // ===== Open Group =====
    async function openGroup(g) {
        hideTypingRow();
        if (elTyping) { elTyping.textContent = ""; elTyping.style.display = "none"; }
        clearTimeout(window.__typingHideTimer);
        // reset typing khi đổi phòng
        resetTypers();
        alreadyTyping = false;
        if (typingTimer) clearTimeout(typingTimer);
        if (stopTimer) clearTimeout(stopTimer);

        const gid = String(g._id || g.id);
        const ownerId = String(g.owner?._id || g.owner);

        state.current = {
            type: "group",
            id: gid,
            name: g.name,
            avatar: null,
            owner: ownerId,
            members: (g.members || []).map(m => (typeof m === "string" ? m : String(m._id))).map(String),
            memberNameById: new Map(), // <-- thêm
        };

        // Lấy tên thành viên để hiển thị
        try {
            const { members } = await getGroupMembers(gid);
            const map = new Map();
            (members || []).forEach(m => {
                const id = String(m._id || m.id || m);
                const name = m.name || "";
                if (id) map.set(id, name);
            });
            state.current.memberNameById = map;
        } catch (_) {
            state.current.memberNameById = new Map();
        }

        elTitle.textContent = g.name;
        elAvatar.innerHTML = `<div class="avatar">${(g.name || "?")[0].toUpperCase()}</div>`;
        elChatDot?.classList.add("offline"); elChatDot?.classList.remove("online");

        if (elGroupActions) {
            elGroupActions.style.display = "block";
            hideGroupMenu();
            const isOwner = ownerId === String(state.me._id);
            if (elMiDelete) elMiDelete.style.display = isOwner ? "block" : "none";
            if (elMiKick) elMiKick.style.display = isOwner ? "block" : "none";
        }

        elSideList.querySelectorAll(".item").forEach(n => n.classList.toggle("active", String(n.dataset.id) === gid));

        const his = await api(`/api/messages/history?type=group&id=${gid}&limit=80`);
        elMsgs.innerHTML = "";
        if (!his.data.length) {
            elMsgs.innerHTML = `<div class="meta" style="padding:20px;text-align:center;color:gray">Tin nhắn nhóm "${g.name}" sẽ hiển thị tại đây</div>`;
        } else {
            his.data.forEach(m => {
                if (m.type === "system") renderSystem(m.content, m.createdAt);
                else renderMessage(m, String(m.sender) === String(state.me._id));
            });
            scrollToBottom(true);
        }
    }

    // ===== Get group members =====
    async function getGroupMembers(groupId) {
        try {
            const r = await fetch(`/api/groups/detail?id=${groupId}`);
            const js = await r.json();
            if (r.ok && js?.data) {
                const g = js.data;
                return {
                    owner: String(g.owner?._id || g.owner || ""),
                    members: (g.members || []).map(m => ({
                        _id: String(m._id || m.id || m),
                        name: m.name || "",
                        avatar: m.avatar,
                        email: m.email
                    }))
                };
            }
        } catch { }
        try {
            const r = await fetch(`/api/groups/mine`);
            const js = await r.json();
            if (r.ok && Array.isArray(js.data)) {
                const g = js.data.find(x => String(x._id) === String(groupId));
                if (g) {
                    return {
                        owner: String(g.owner?._id || g.owner || ""),
                        members: (g.members || []).map(m =>
                            typeof m === "string"
                                ? ({ _id: String(m), name: "" })
                                : ({ _id: String(m._id || m.id), name: m.name || "", avatar: m.avatar, email: m.email })
                        )
                    };
                }
            }
        } catch { }
        return {
            owner: String(state.current?.owner || ""),
            members: (state.current?.members || []).map(id => ({ _id: String(id), name: "" }))
        };
    }

    // ===== Header kebab =====
    function showGroupMenu() {
        if (!elGroupMenu) return;
        elBtnGroupMenu?.setAttribute("aria-expanded", "true");
        elGroupMenu.classList.remove("hidden");
        elGroupMenu.setAttribute("aria-hidden", "false");
    }
    function hideGroupMenu() {
        if (!elGroupMenu) return;
        elBtnGroupMenu?.setAttribute("aria-expanded", "false");
        elGroupMenu.classList.add("hidden");
        elGroupMenu.setAttribute("aria-hidden", "true");
    }
    elBtnGroupMenu?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !elGroupMenu.classList.contains("hidden");
        if (isOpen) hideGroupMenu(); else showGroupMenu();
    });
    document.addEventListener("click", (e) => {
        if (!elGroupActions) return;
        if (!elGroupActions.contains(e.target)) hideGroupMenu();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideGroupMenu(); });

    // ===== Add Members =====
    elMiAdd?.addEventListener("click", () => { hideGroupMenu(); openAddMembersModal(); });
    function openAddMembersModal() {
        if (!state.current || state.current.type !== "group") return;
        renderAddList();
        elAm.classList.remove("hidden");
        elAm.setAttribute("aria-hidden", "false");
        elAmFind.value = "";
        setTimeout(() => elAmFind.focus(), 0);
    }
    function closeAddMembersModal() {
        elAm.classList.add("hidden");
        elAm.setAttribute("aria-hidden", "true");
        elAmList.innerHTML = "";
    }
    function renderAddList() {
        const already = new Set(state.current.members || []);
        const q = (elAmFind.value || "").trim().toLowerCase();
        const data = state.friends
            .filter(u => !already.has(String(u._id)))
            .filter(u => (u.name || "").toLowerCase().includes(q));
        if (!data.length) {
            elAmList.innerHTML = `<div class="meta" style="padding:10px">Không còn bạn nào để thêm</div>`;
            return;
        }
        elAmList.innerHTML = data.map(u => `
      <label class="gm-item">
        <div class="avatar">${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(u.name)}</div>
        <div><div style="font-weight:600">${u.name}</div><div class="meta" style="font-size:12px">${u.email || ""}</div></div>
        <div class="gm-right"><input type="checkbox" class="gm-check" value="${u._id}"></div>
      </label>
    `).join("");
    }
    elAmClose?.addEventListener("click", closeAddMembersModal);
    elAmCancel?.addEventListener("click", closeAddMembersModal);
    elAm?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeAddMembersModal(); });
    elAmFind?.addEventListener("input", renderAddList);
    elAmForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.current || state.current.type !== "group") return;
        const ids = Array.from(elAmList.querySelectorAll(".gm-check:checked")).map(i => i.value);
        if (!ids.length) { alert("Chưa chọn thành viên"); return; }
        try {
            const r = await fetch("/api/groups/add-members", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: state.current.id, memberIds: ids })
            });
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Không thể thêm thành viên");
            state.current.members.push(...ids.map(String));
            closeAddMembersModal();
            if (currentTab === "groups") await loadGroups();
            toast("Đã thêm thành viên");
        } catch (err) { alert(err.message); }
    });

    // ===== Kick Members =====
    elMiKick?.addEventListener("click", () => { hideGroupMenu(); openKickMembersModal(); });
    async function openKickMembersModal() {
        if (!state.current || state.current.type !== "group") return;

        const { owner, members } = await getGroupMembers(state.current.id);
        state.current.owner = owner || state.current.owner;

        state.current.membersFull = (members || []).filter(m => String(m._id) !== String(state.current.owner));

        renderKickList();
        elKm.classList.remove("hidden");
        elKm.setAttribute("aria-hidden", "false");
        elKmFind.value = "";
        setTimeout(() => elKmFind.focus(), 0);
    }
    function closeKickMembersModal() {
        elKm.classList.add("hidden");
        elKm.setAttribute("aria-hidden", "true");
        elKmList.innerHTML = "";
    }
    function renderKickList() {
        const all = Array.isArray(state.current?.membersFull) ? state.current.membersFull : [];
        const q = (elKmFind.value || "").trim().toLowerCase();
        const friendNameById = new Map(state.friends.map(f => [String(f._id), f.name]));

        const data = all
            .map(m => {
                const id = String(m._id || m.id || m);
                const name = (m.name && m.name.trim())
                    ? m.name
                    : (friendNameById.get(id) || `User #${id.slice(-4)}`);
                return { _id: id, name, avatar: m.avatar, email: m.email };
            })
            .filter(m => m.name.toLowerCase().includes(q));

        if (!data.length) {
            elKmList.innerHTML = `<div class="km-empty">Không có thành viên</div>`;
            return;
        }

        elKmList.innerHTML = data.map(m => {
            const av = m.avatar
                ? `<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                : (m.name[0] || "?").toUpperCase();

            return `
        <div class="km-row">
          <div class="avatar">${av}</div>
          <div>
            <div class="km-name">${m.name}</div>
            ${m.email ? `<div class="km-meta">${m.email}</div>` : ""}
          </div>
          <div class="km-right">
            <input type="checkbox" class="gm-check" value="${m._id}">
          </div>
        </div>`;
        }).join("");
    }
    elKmClose?.addEventListener("click", closeKickMembersModal);
    elKmCancel?.addEventListener("click", closeKickMembersModal);
    elKm?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeKickMembersModal(); });
    elKmFind?.addEventListener("input", renderKickList);
    elKmForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.current || state.current.type !== "group") return;
        const ids = Array.from(elKmList.querySelectorAll(".gm-check:checked")).map(i => i.value);
        if (!ids.length) { alert("Chưa chọn thành viên"); return; }
        try {
            const r = await fetch("/api/groups/kick-members", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: state.current.id, memberIds: ids })
            });
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Không thể đuổi thành viên");
            state.current.members = (state.current.members || []).filter(mid => !ids.includes(String(mid)));
            closeKickMembersModal();
            if (currentTab === "groups") await loadGroups();
            toast("Đã đuổi thành viên");
        } catch (err) { alert(err.message); }
    });

    // ===== Leave / Delete =====
    elMiLeave?.addEventListener("click", async () => {
        hideGroupMenu();
        if (!state.current || state.current.type !== "group") return;
        if (!confirm("Bạn chắc chắn muốn rời nhóm?")) return;
        try {
            const r = await fetch("/api/groups/leave", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: state.current.id })
            });
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Không thể rời nhóm");
            document.querySelector('.tab[data-tab="friends"]')?.click();
            elTitle.textContent = "Chưa chọn cuộc trò chuyện";
            elAvatar.innerHTML = ""; elMsgs.innerHTML = "";
            toast("Đã rời nhóm");
        } catch (err) { alert(err.message); }
    });
    elMiDelete?.addEventListener("click", async () => {
        hideGroupMenu();
        if (!state.current || state.current.type !== "group") return;
        if (!confirm("Xóa nhóm này? Hành động không thể hoàn tác.")) return;
        try {
            const r = await fetch("/api/groups/delete", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: state.current.id })
            });
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Không thể xóa nhóm");
            document.querySelector('.tab[data-tab="friends"]')?.click();
            elTitle.textContent = "Chưa chọn cuộc trò chuyện";
            elAvatar.innerHTML = ""; elMsgs.innerHTML = "";
            toast("Đã xóa nhóm");
        } catch (err) { alert(err.message); }
    });

    // ===== Create Group =====
    function openGroupModal() {
        renderGmList();
        elGm.classList.remove("hidden");
        elGm.setAttribute("aria-hidden", "false");
        elGmName.value = ""; elGmFind.value = "";
        setTimeout(() => elGmName.focus(), 0);
    }
    function closeGroupModal() {
        elGm.classList.add("hidden");
        elGm.setAttribute("aria-hidden", "true");
        elGmList.innerHTML = "";
    }
    function renderGmList() {
        const q = (elGmFind.value || "").trim().toLowerCase();
        const data = state.friends.filter(u => (u.name || "").toLowerCase().includes(q));
        elGmList.innerHTML = data.length ? data.map(u => `
      <label class="gm-item">
        <div class="avatar">${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(u.name)}</div>
        <div><div style="font-weight:600">${u.name}</div><div class="meta" style="font-size:12px">${u.email || ""}</div></div>
        <div class="gm-right"><input type="checkbox" class="gm-check" value="${u._id}"></div>
      </label>
    `).join("") : `<div class="meta" style="padding:10px">Không có kết quả</div>`;
    }
    elBtnNewGroup?.addEventListener("click", openGroupModal);
    elGmClose?.addEventListener("click", closeGroupModal);
    elGmCancel?.addEventListener("click", closeGroupModal);
    elGm?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeGroupModal(); });
    elGmFind?.addEventListener("input", renderGmList);
    elGmForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = elGmName.value.trim();
        if (!name) return alert("Vui lòng nhập tên nhóm");
        const ids = Array.from(elGmList.querySelectorAll(".gm-check:checked")).map(i => i.value);
        try {
            const r = await fetch("/api/groups/create", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, memberIds: ids })
            });
            const js = await r.json();
            if (!r.ok) throw new Error(js.message || "Tạo nhóm thất bại");
            closeGroupModal();
            if (currentTab === "groups") await loadGroups();
            else document.querySelector('.tab[data-tab="groups"]')?.click();
            toast("Đã tạo nhóm!");
        } catch (err) { alert(err.message); }
    });

    // ===== Sidebar search =====
    elSideSearch?.addEventListener("input", () => {
        if (currentTab === "friends") renderSideFriends(state.friends);
    });

    // ===== Init =====
    await loadFriends();

})();
