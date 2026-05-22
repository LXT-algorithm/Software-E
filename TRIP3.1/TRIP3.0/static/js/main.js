// 入口初始化
document.addEventListener('DOMContentLoaded', () => {
    // 暗色模式初始化
    if (isDarkMode) applyDarkMode(true);

    // 全局事件委托：确保任何情况下点击都生效
    document.addEventListener('click', function(e) {
        // 帮助按钮
        const helpBtn = e.target.closest('#helpBtn');
        if (helpBtn) {
            e.stopPropagation();
            const modal = document.getElementById('helpModal');
            if (modal) modal.classList.add('show');
            return;
        }
        // 添加好友按钮 — 切换为内联搜索框
        const addBtn = e.target.closest('.add-friend-btn');
        if (addBtn) {
            e.stopPropagation();
            switchFriendTab('contacts');
            // 隐藏按钮，显示搜索框
            const bar = addBtn.closest('.add-friend-bar');
            if (bar) {
                addBtn.style.display = 'none';
                const searchBox = bar.querySelector('.add-friend-search');
                if (searchBox) {
                    searchBox.style.display = 'block';
                    const inp = searchBox.querySelector('input');
                    if (inp) {
                        setTimeout(() => inp.focus(), 100);
                        // 输入搜索
                        inp.oninput = debounce(function() {
                            const q = this.value.trim();
                            const results = searchBox.querySelector('#inlineSearchResults');
                            if (!q || q.length < 2) {
                                results.innerHTML = '';
                                results.style.display = 'none';
                                return;
                            }
                            // 直接调用后端搜索
                            fetch(`/api/user/search?q=${encodeURIComponent(q)}`)
                                .then(r => r.json())
                                .then(data => {
                                    results.style.display = 'block';
                                    if (data.success && data.users.length > 0) {
                                        results.innerHTML = data.users.map(u => {
                                            const btnId = 'sreq_' + u.user_id;
                                            return `<div class="search-user-item" style="padding:8px 4px;">
                                                <div class="friend-avatar" style="width:32px;height:32px;font-size:12px;">
                                                    ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : `<i class="fas fa-user"></i>`}
                                                </div>
                                                <span>${u.username}</span>
                                                <button class="btn-outline" id="${btnId}" style="margin-left:auto;height:28px;padding:2px 10px;font-size:11px;" onclick="sendFriendRequest('${u.username}', this)"><i class="fas fa-user-plus"></i> 添加</button>
                                            </div>`;
                                        }).join('');
                                    } else {
                                        results.innerHTML = '<div style="padding:8px 4px;color:var(--color-muted);font-size:13px;">未找到用户</div>';
                                    }
                                }).catch(() => {});
                        }, 350);
                    }
                }
            }
            return;
        }
    });

    loadAMap();
    loadCurrentUser();
    loadHotCities();
    renderQuickPrompts();

    document.getElementById('sendBtn').onclick = () => sendMessage();
    document.getElementById('messageInput').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

    window.addEventListener('beforeunload', () => {
        if (abortController) abortController.abort();
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const active = document.activeElement;
            if (active.tagName === 'INPUT') {
                active.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }
});
