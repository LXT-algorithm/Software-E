// UI 控制函数
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
}
function showModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showHelpModal() { showModal('helpModal'); }
function showLoginModal() { showModal('loginModal'); }
function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}
function showLoginForm() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('resetForm').style.display = 'none';
}
function showResetForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'block';
}

function showPanel(panel) {
    closeSidebar();
    // 保存聊天面板滚动位置
    const chatContainer = document.getElementById('chatMessages');
    const savedScroll = chatContainer ? chatContainer.scrollTop : 0;

    // 使用 class 控制面板显隐（触发 CSS transition）
    const panels = ['chatPanel','sceneryPanel','communityPanel','historyPanel','favoritesPanel','profilePanel','preferencesPanel','statsPanel','friendPanel'];
    panels.forEach(id => {
        document.getElementById(id).classList.remove('panel-active');
    });
    // 隐藏主页
    document.getElementById('homePanel').classList.remove('home-active');

    if (panel === 'home') {
        document.getElementById('homePanel').classList.add('home-active');
        loadUpcomingTrips();
    } else {
        document.getElementById(panel + 'Panel').classList.add('panel-active');
    }

    // 恢复聊天面板滚动位置
    if (panel === 'chat' && chatContainer) {
        requestAnimationFrame(() => {
            chatContainer.scrollTop = savedScroll;
        });
    }
    // 更新顶部导航 active 状态
    document.querySelectorAll('.top-nav-center a').forEach(a => a.classList.remove('active'));
    const navMap = { home: '首页', chat: '旅程规划', scenery: '景点搜索', community: '社区', history: '历史行程' };
    if (navMap[panel]) {
        document.querySelectorAll('.top-nav-center a').forEach(a => {
            if (a.textContent.trim() === navMap[panel]) a.classList.add('active');
        });
    }
    if (panel === 'scenery') { currentPage = 1; searchScenery(); }
    if (panel === 'community') loadCommunityPanel();
    if (panel === 'chat') loadHotCities();
    if (panel === 'history') loadHistoryList();
    if (panel === 'favorites') loadFavoritesList();
    if (panel === 'profile') loadProfile();
    if (panel === 'preferences') loadPreferences();
    if (panel === 'stats') loadUserStats();
    if (panel === 'friend') loadFriendPanel();
}

function loadUpcomingTrips() {
    const container = document.getElementById('upcomingTripsContainer');
    if (!container) return;
    fetch('/api/upcoming_trips')
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.trips || data.trips.length === 0) {
                container.innerHTML = '<div class="countdown-placeholder" style="grid-column:1/-1;text-align:center;padding:40px 20px;background:var(--color-surface-soft);border-radius:16px;color:var(--color-muted);font-size:14px;"><i class="fas fa-suitcase" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.4;"></i><span>暂无即将出发的行程</span></div>';
                return;
            }
            container.innerHTML = data.trips.map(t => {
                const startDate = new Date(t.start_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
                const isUrgent = diff <= 3;
                const isSoon = diff <= 7;
                const cls = isUrgent ? 'countdown-urgent' : isSoon ? 'countdown-soon' : 'countdown-normal';
                const label = isUrgent ? '即将出发' : isSoon ? '临近出发' : '计划中';
                const icon = isUrgent ? 'fa-bell' : isSoon ? 'fa-clock' : 'fa-calendar-alt';
                return `
                    <div class="countdown-card ${cls}" onclick="viewTravel('${t.plan_uuid}')">
                        <div class="countdown-days">
                            <span class="countdown-number">${diff}</span>
                            <span class="countdown-unit">天</span>
                            <span class="countdown-label">${label}</span>
                        </div>
                        <div class="countdown-info">
                            <div class="countdown-title">${escapeHtml(t.title)}</div>
                            <div class="countdown-meta">
                                <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(t.destination || '未指定')}</span>
                                <span><i class="fas fa-calendar-day"></i> ${t.start_date}</span>
                                <span><i class="fas fa-clock"></i> ${t.days}天</span>
                            </div>
                        </div>
                        <i class="fas ${icon} countdown-icon"></i>
                    </div>
                `;
            }).join('');
        })
        .catch(() => {});
}

// 暗色模式
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('darkMode', isDarkMode);
    applyDarkMode(isDarkMode);
}

function applyDarkMode(enabled) {
    document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    // 更新暗色模式图标
    const topIcon = document.querySelector('#darkModeToggle i');
    const sidebarIcon = document.querySelector('#darkModeIcon');
    const sidebarText = document.querySelector('#darkModeText');
    if (topIcon) topIcon.className = enabled ? 'fas fa-sun' : 'fas fa-moon';
    if (sidebarIcon) sidebarIcon.className = enabled ? 'fas fa-sun' : 'fas fa-moon';
    if (sidebarText) sidebarText.textContent = enabled ? '亮色模式' : '暗色模式';
}

function updateUserUI(user) {
    currentUser = user;
    const avatarImg = document.getElementById('userAvatarImg');
    const avatarIcon = document.getElementById('userAvatarIcon');
    
    if (user && user.user_id && !user.is_guest) {
        document.getElementById('sidebarUserName').innerHTML = user.username || user.phone || '用户';
        document.getElementById('sidebarUserStatus').innerHTML = '已登录';
        document.getElementById('userNameDisplay').innerHTML = user.username || user.phone || '用户';
        document.getElementById('loginMenuItem').style.display = 'none';
        document.getElementById('logoutMenuItem').style.display = 'flex';
        
        // 设置头像
        if (user.avatar_url) {
            avatarImg.src = user.avatar_url;
            avatarImg.style.display = 'block';
            avatarIcon.style.display = 'none';
        } else {
            avatarImg.style.display = 'none';
            avatarIcon.style.display = 'block';
        }
    } else {
        document.getElementById('sidebarUserName').innerHTML = '旅游规划助手';
        document.getElementById('sidebarUserStatus').innerHTML = user && user.is_guest ? '游客模式' : '未登录';
        document.getElementById('userNameDisplay').innerHTML = user && user.is_guest ? '游客模式' : '未登录';
        document.getElementById('loginMenuItem').style.display = 'flex';
        document.getElementById('logoutMenuItem').style.display = 'none';
        
        avatarImg.style.display = 'none';
        avatarIcon.style.display = 'block';
    }
}

function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function smartScroll(container) {
    if (!autoScrollEnabled) return;
    const threshold = 100;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// 暂停自动滚动按钮
const pauseBtn = document.createElement('button');
pauseBtn.id = 'pauseAutoScrollBtn';
pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停自动滚动';
pauseBtn.onclick = () => {
    autoScrollEnabled = !autoScrollEnabled;
    pauseBtn.innerHTML = autoScrollEnabled ? '<i class="fas fa-pause"></i> 暂停自动滚动' : '<i class="fas fa-play"></i> 恢复自动滚动';
};
window.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.chat-container').appendChild(pauseBtn);
});

function fillDestination(city) {
    document.getElementById('messageInput').value = `${city}3日游，2人，预算5000`;
}

async function loadCurrentUser() {
    try {
        const res = await fetch('/api/current_user');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.user) updateUserUI(data.user);
    } catch (e) {
        console.warn('loadCurrentUser 失败:', e);
    }
}

const CITY_COLORS = ['#3b82f6','#1d4ed8','#7c3aed','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#2563eb','#6a6a6a'];
const CITY_ICONS = ['landmark','tree','umbrella-beach','museum','building','ship','leaf','camera','monument','city'];

async function loadHotCities() {
    const grid = document.getElementById('hotCityGrid');
    if (!grid || grid.childNodes.length > 0) return; // 避免重复加载
    try {
        const res = await fetch('/api/cities');
        const data = await res.json();
        if (data.success && data.cities) {
            grid.innerHTML = data.cities.map((c, i) => `
                <div class="city-card" onclick="fillDestination('${c.name.replace('市', '')}')">
                    <div class="city-icon" style="background:${CITY_COLORS[i % CITY_COLORS.length]}">
                        <i class="fas fa-${CITY_ICONS[i % CITY_ICONS.length]}"></i>
                    </div>
                    <div>
                        <div class="city-name">${c.name.replace('市', '')}</div>
                        <div class="city-sub">热门目的地</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.warn('加载热门城市失败:', e);
    }
}

// ==================== 共享工具函数 ====================

/** 显示 Panel 加载状态 */
function showPanelLoading(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<div style="text-align:center;padding:60px 20px;"><div class="loading-spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto 12px;"></div><p style="color:var(--color-muted);font-size:14px;">加载中...</p></div>';
}

/** 防抖工具 */
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/** 手机号验证（中国11位手机号） */
function validatePhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
}

/** 密码强度计算 */
function computePasswordStrength(password) {
    if (!password) return { label: '', pct: 0, cls: '' };
    let score = 0;
    if (password.length >= 6) score += 1;
    if (password.length >= 10) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    const levels = [
        { max: 1, label: '弱', cls: 'strength-weak', pct: 20 },
        { max: 2, label: '中等', cls: 'strength-fair', pct: 40 },
        { max: 3, label: '良好', cls: 'strength-good', pct: 65 },
        { max: 5, label: '强', cls: 'strength-strong', pct: 100 }
    ];
    const level = levels.find(l => score <= l.max) || levels[levels.length - 1];
    return { ...level, score };
}

/** XSS 安全转义 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

/** 相对时间格式化 */
function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return d.toLocaleDateString('zh-CN');
}