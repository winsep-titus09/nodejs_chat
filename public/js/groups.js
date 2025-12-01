const groupList = document.getElementById('groupList');
const inviteList = document.getElementById('inviteList');
const form = document.getElementById('createForm');
const input = document.getElementById('groupName');
const socket = io("/", { withCredentials: true });

async function api(url, opts = {}) {
    const r = await fetch(url, opts);
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'Lỗi');
    return j.data;
}

async function loadGroups() {
    const groups = await api('/api/groups/mine');
    if (!groups.length) {
        groupList.innerHTML = '<p class="meta">Chưa có nhóm nào.</p>';
        return;
    }
    groupList.innerHTML = groups.map(g => `
    <div class="group-card">
      <h3>${g.name}</h3>
      <div class="meta">${g.members.length} thành viên</div>
      <div class="actions">
        ${g.owner._id === g.owner._id
            ? `<button class="btn-danger" onclick="deleteGroup('${g._id}')">Xóa nhóm</button>`
            : `<button class="btn-outline" onclick="leaveGroup('${g._id}')">Rời nhóm</button>`}
      </div>
    </div>
  `).join('');
}

async function loadInvites() {
    const invs = await api('/api/groups/invites?type=incoming');
    if (!invs.length) {
        inviteList.innerHTML = '<p class="meta">Không có lời mời nào.</p>';
        return;
    }
    inviteList.innerHTML = invs.map(i => `
    <div class="invite-item">
      <span>${i.inviter.name} mời bạn vào nhóm <b>${i.group.name}</b></span>
      <div>
        <button class="accept" onclick="acceptInvite('${i._id}')">Đồng ý</button>
        <button class="decline" onclick="declineInvite('${i._id}')">Từ chối</button>
      </div>
    </div>
  `).join('');
}

form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return alert('Vui lòng nhập tên nhóm');
    await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    input.value = '';
    loadGroups();
});

async function deleteGroup(id) {
    if (!confirm('Xác nhận xóa nhóm?')) return;
    await fetch('/api/groups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: id })
    });
    loadGroups();
}

async function leaveGroup(id) {
    if (!confirm('Rời khỏi nhóm này?')) return;
    await fetch('/api/groups/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: id })
    });
    loadGroups();
}

async function acceptInvite(id) {
    await fetch('/api/groups/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId: id })
    });
    loadGroups();
    loadInvites();
}

async function declineInvite(id) {
    await fetch('/api/groups/invite/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId: id })
    });
    loadInvites();
}

// realtime update
["group:invite", "group:create", "group:member-join", "group:member-leave", "group:deleted"]
    .forEach(evt => socket.on(evt, () => { loadGroups(); loadInvites(); }));

loadGroups();
loadInvites();
