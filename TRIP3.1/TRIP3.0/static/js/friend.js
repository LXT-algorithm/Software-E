// static/js/friend.js
let _chatWithUid = null;
let _chatWithName = '';
let _chatMessagePage = 1;
let _chatPollTimer = null;
let _convPollTimer = null;

function loadFriendPanel() {
    switchFriendTab('contacts');
    // 动态创建添加好友按钮（确保不受 HTML 缓存影响）
    const contactsTab = document.getElementById('friendTabContacts');
    if (contactsTab && !contactsTab.querySelector('.add-friend-bar')) {
        const bar = document.createElement('div');
        bar.className = 'add-friend-bar';
        const addBtn = document.createElement('button');
        addBtn.className = 'add-friend-btn';
        addBtn.innerHTML = '<i class="fas fa-user-plus"></i> 添加好友';
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            focusFriendSearch();
        });
        bar.appendChild(addBtn);
        const list = document.getElementById('friendsList');
        if (list) contactsTab.insertBefore(bar, list);
    }
    loadFriendsList();
    loadFriendRequests();
    loadConversations();
    updateFriendBadge();

    // 自适应轮询会话列表
    if (_convPollTimer) clearTimeout(_convPollTimer);
    scheduleConvPoll(5000);
}

function scheduleConvPoll(delay) {
    if (_convPollTimer) clearTimeout(_convPollTimer);
    _convPollTimer = setTimeout(() => {
        const panel = document.getElementById('friendPanel');
        if (panel && panel.classList.contains('panel-active')) {
            loadConversations();
            updateFriendBadge();
            scheduleConvPoll(5000);
        } else {
            _convPollTimer = null;
        }
    }, delay);
}

function focusFriendSearch() {
    switchFriendTab('contacts');
    const input = document.getElementById('searchUserInput');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function switchFriendTab(tab) {
    document.querySelectorAll('.friend-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.friend-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.friend-tab-content').forEach(t => t.classList.remove('active'));
    const contentId = 'friendTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(contentId)?.classList.add('active');
}

function updateFriendBadge() {
    const badge = document.getElementById('requestBadge');
    if (!badge) return;
    fetch('/api/friend/requests').then(r => r.json()).then(data => {
        if (data.success) {
            const pending = (data.received || []).filter(r => r.status === 'pending').length;
            if (pending > 0) {
                badge.textContent = pending;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }).catch(() => {});
}

async function loadFriendsList() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    try {
        const res = await fetch('/api/friend/list');
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user-lock"></i><p>请先登录</p></div>';
            return;
        }
        if (data.friends.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:30px 20px;"><i class="fas fa-user-friends"></i><p>暂无好友</p><p style="font-size:13px;color:var(--color-muted-soft);margin-top:8px;">点击上方「添加好友」按钮搜索添加</p></div>';
            return;
        }
        container.innerHTML = data.friends.map(f => `
            <div class="friend-item" onclick="openChat('${f.user_id}','${f.username}')">
                <div class="friend-avatar">
                    ${f.avatar_url ? `<img src="${f.avatar_url}" alt="">` : `<i class="fas fa-user"></i>`}
                </div>
                <div class="friend-info">
                    <div class="friend-name">${escapeHtml(f.username)}</div>
                </div>
                <button class="friend-remove-btn" onclick="event.stopPropagation();removeFriend('${f.user_id}')" title="删除好友">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>加载失败</p></div>';
    }
}

async function searchUsers() {
    const query = document.getElementById('searchUserInput').value.trim();
    const results = document.getElementById('searchUserResults');
    if (!query || query.length < 1) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
    }
    try {
        // 获取已发送的请求和好友列表，用于判断按钮状态
        let pendingSent = new Set();
        let friendsSet = new Set();
        try {
            const [reqRes, friendRes] = await Promise.all([
                fetch('/api/friend/requests'),
                fetch('/api/friend/list')
            ]);
            const reqData = await reqRes.json();
            const friendData = await friendRes.json();
            if (reqData.success) {
                reqData.sent.filter(r => r.status === 'pending').forEach(r => pendingSent.add(r.user.username));
            }
            if (friendData.success) {
                friendData.friends.forEach(f => friendsSet.add(f.username));
            }
        } catch {}

        const res = await fetch(`/api/user/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.users.length > 0) {
            results.style.display = 'block';
            results.innerHTML = data.users.map(u => {
                let btnHtml;
                if (friendsSet.has(u.username)) {
                    btnHtml = `<button class="btn-outline" style="margin-left:auto;height:28px;padding:2px 10px;font-size:11px;color:var(--color-muted);" disabled><i class="fas fa-check"></i> 已是好友</button>`;
                } else if (pendingSent.has(u.username)) {
                    btnHtml = `<button class="btn-outline" style="margin-left:auto;height:28px;padding:2px 10px;font-size:11px;color:var(--color-muted);" disabled><i class="fas fa-clock"></i> 已发送</button>`;
                } else if (currentUser && currentUser.is_guest) {
                    btnHtml = `<button class="btn-outline" style="margin-left:auto;height:28px;padding:2px 10px;font-size:11px;color:var(--color-muted);" disabled title="游客无法添加好友"><i class="fas fa-user-lock"></i> 游客不可用</button>`;
                } else {
                    const encodedName = encodeURIComponent(u.username);
                    btnHtml = `<button class="btn-outline" style="margin-left:auto;height:28px;padding:2px 10px;font-size:11px;" onclick="sendFriendRequest(decodeURIComponent('${encodedName}'), this)"><i class="fas fa-user-plus"></i> 添加</button>`;
                }
                return `
                <div class="search-user-item">
                    <div class="friend-avatar" style="width:32px;height:32px;font-size:12px;">
                        ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : `<i class="fas fa-user"></i>`}
                    </div>
                    <span>${escapeHtml(u.username)}</span>
                    ${btnHtml}
                </div>`;
            }).join('');
        } else {
            results.style.display = 'block';
            results.innerHTML = '<div class="search-user-item" style="color:var(--color-muted);">未找到用户</div>';
        }
    } catch (e) {
        results.style.display = 'block';
        results.innerHTML = '<div class="search-user-item" style="color:var(--color-muted);">搜索失败</div>';
    }
}

async function sendFriendRequest(username, btn) {
    try {
        const res = await fetch('/api/friend/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        showToast(data.message, !data.success);
        if (data.success && btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-clock"></i> 已发送';
            btn.style.color = 'var(--color-muted)';
            loadFriendRequests();
            updateFriendBadge();
        }
    } catch (e) {
        showToast('请求失败', true);
    }
}

async function loadFriendRequests() {
    const container = document.getElementById('friendRequests');
    if (!container) return;
    try {
        const res = await fetch('/api/friend/requests');
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = '';
            return;
        }
        const all = [...data.received, ...data.sent];
        if (all.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i><p>暂无请求</p></div>';
            return;
        }
        container.innerHTML = all.map(r => {
            const isReceived = data.received.includes(r);
            return `
                <div class="friend-request-item">
                    <div class="friend-avatar" style="width:32px;height:32px;font-size:12px;">
                        ${r.user.avatar_url ? `<img src="${r.user.avatar_url}" alt="">` : `<i class="fas fa-user"></i>`}
                    </div>
                    <div class="friend-info">
                        <div class="friend-name">${escapeHtml(r.user.username)}</div>
                        <div class="friend-request-status">${isReceived ? '请求添加你为好友' : '等待对方确认'}</div>
                    </div>
                    ${isReceived && r.status === 'pending' ? `
                        <div style="display:flex;gap:4px;">
                            <button class="btn-outline" style="height:28px;padding:2px 10px;font-size:11px;color:#10b981;" onclick="respondToRequest(${r.id}, true)">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-outline" style="height:28px;padding:2px 10px;font-size:11px;color:#c13515;" onclick="respondToRequest(${r.id}, false)">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    ` : `<span class="request-status-badge">${r.status === 'pending' ? '待确认' : r.status === 'accepted' ? '已通过' : '已拒绝'}</span>`}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.warn('加载好友请求失败:', e);
    }
}

async function respondToRequest(requestId, accept) {
    try {
        const res = await fetch('/api/friend/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, accept })
        });
        const data = await res.json();
        showToast(data.message, !data.success);
        if (data.success) {
            loadFriendRequests();
            loadFriendsList();
            updateFriendBadge();
        }
    } catch (e) {
        showToast('操作失败', true);
    }
}

async function removeFriend(friendUid) {
    if (!confirm('确定要删除这个好友吗？')) return;
    try {
        const res = await fetch('/api/friend/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friend_uid: friendUid })
        });
        const data = await res.json();
        showToast(data.message, !data.success);
        if (data.success) {
            loadFriendsList();
            loadConversations();
        }
    } catch (e) {
        showToast('操作失败', true);
    }
}

// ==================== 聊天 ====================

function openChat(friendUid, friendName) {
    _chatWithUid = friendUid;
    _chatWithName = friendName;
    _chatMessagePage = 1;

    document.getElementById('chatFriendName').textContent = friendName;
    document.getElementById('chatMessagesContainer').innerHTML = '';
    document.getElementById('chatSendBtn').onclick = sendChatMessage;
    document.getElementById('chatMessageInput').onkeypress = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };

    // 标记已读
    fetch('/api/chat/mark_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_uid: friendUid })
    }).catch(() => {});

    // 重新加载会话列表更新未读数
    loadConversations();
    loadChatMessages(friendUid, 1);
    showModal('chatModal');

    // 启动自适应轮询新消息
    if (_chatPollTimer) clearTimeout(_chatPollTimer);
    scheduleChatPoll(friendUid, 3000);
}

let _chatPollBackoff = 0;

function scheduleChatPoll(withUid, delay) {
    if (_chatPollTimer) clearTimeout(_chatPollTimer);
    _chatPollTimer = setTimeout(() => pollNewMessages(withUid, delay), delay);
}

async function pollNewMessages(withUid, prevDelay) {
    // 如果聊天窗口已关闭，停止轮询
    const modal = document.getElementById('chatModal');
    if (!modal || !modal.classList.contains('show')) {
        _chatPollTimer = null;
        _chatPollBackoff = 0;
        return;
    }
    try {
        const res = await fetch(`/api/chat/messages?with=${withUid}&page=1`);
        const data = await res.json();
        if (!data.success) throw new Error('load failed');
        _chatPollBackoff = Math.max(0, _chatPollBackoff - 1000);

        const container = document.getElementById('chatMessagesContainer');
        const currentCount = container ? container.querySelectorAll('.chat-msg').length : 0;
        if (data.messages.length > currentCount) {
            const newOnes = data.messages.slice(currentCount);
            newOnes.forEach(m => {
                const div = document.createElement('div');
                div.className = `chat-msg ${m.is_me ? 'chat-msg-me' : 'chat-msg-other'}`;
                div.innerHTML = `
                    <div class="chat-bubble">${escapeHtml(m.message)}</div>
                    <div class="chat-time">${formatChatTime(m.created_at)}</div>
                `;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
            fetch('/api/chat/mark_read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from_uid: withUid })
            }).catch(() => {});
            loadConversations();
            updateFriendBadge();
        }
        scheduleChatPoll(withUid, Math.max(2000, 3000 + _chatPollBackoff));
    } catch (e) {
        // 指数退避: 3s → 6s → 12s → 最多30s
        _chatPollBackoff = Math.min(30000, (_chatPollBackoff || 3000) * 2);
        scheduleChatPoll(withUid, 3000 + _chatPollBackoff);
    }
}

async function loadChatMessages(withUid, page) {
    const container = document.getElementById('chatMessagesContainer');
    try {
        const res = await fetch(`/api/chat/messages?with=${withUid}&page=${page}`);
        const data = await res.json();
        if (!data.success) return;

        if (page === 1) {
            container.innerHTML = '';
        }

        data.messages.forEach(m => {
            const div = document.createElement('div');
            div.className = `chat-msg ${m.is_me ? 'chat-msg-me' : 'chat-msg-other'}`;
            div.innerHTML = `
                <div class="chat-bubble">${escapeHtml(m.message)}</div>
                <div class="chat-time">${formatChatTime(m.created_at)}</div>
            `;
            container.appendChild(div);
        });

        // 滚动到底部
        if (page === 1) {
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
        }
    } catch (e) {
        console.warn('加载聊天消息失败:', e);
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if (!msg || !_chatWithUid) return;

    input.value = '';
    try {
        const res = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to_uid: _chatWithUid, message: msg })
        });
        const data = await res.json();
        if (data.success) {
            // 即时显示消息
            const container = document.getElementById('chatMessagesContainer');
            const div = document.createElement('div');
            div.className = 'chat-msg chat-msg-me';
            div.innerHTML = `
                <div class="chat-bubble">${escapeHtml(msg)}</div>
                <div class="chat-time">刚刚</div>
            `;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            loadConversations();
        } else {
            showToast(data.message, true);
        }
    } catch (e) {
        showToast('发送失败', true);
    }
}

async function loadConversations() {
    const container = document.getElementById('conversationList');
    if (!container) return;
    try {
        const res = await fetch('/api/chat/conversations');
        const data = await res.json();
        if (!data.success || !data.conversations || data.conversations.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-comment-dots"></i><p style="font-size:12px;">暂无会话</p></div>';
            return;
        }
        container.innerHTML = data.conversations.map(c => `
            <div class="conv-item ${c.unread_count > 0 ? 'conv-unread' : ''}" onclick="openChat('${c.user.user_id}','${c.user.username}')">
                <div class="friend-avatar" style="width:36px;height:36px;font-size:13px;">
                    ${c.user.avatar_url ? `<img src="${c.user.avatar_url}" alt="">` : `<i class="fas fa-user"></i>`}
                </div>
                <div class="conv-info">
                    <div class="conv-name">${escapeHtml(c.user.username)}</div>
                    <div class="conv-preview">${escapeHtml(c.last_message.substring(0, 30))}${c.last_message.length > 30 ? '...' : ''}</div>
                </div>
                ${c.unread_count > 0 ? `<span class="conv-badge">${c.unread_count}</span>` : ''}
            </div>
        `).join('');
    } catch (e) {
        console.warn('加载会话列表失败:', e);
        container.innerHTML = '';
    }
}

function formatChatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// escapeHtml is in utils.js (shared)
