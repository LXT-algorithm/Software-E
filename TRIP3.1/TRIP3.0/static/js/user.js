async function doLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) return alert('请填写完整');
    let res;
    try {
        res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) });
    } catch (e) {
        return alert('网络错误：' + e.message);
    }
    // 检查响应类型
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        const text = await res.text();
        console.error('登录返回非JSON:', text.slice(0, 200));
        return alert('服务器返回异常，请检查服务是否正常');
    }
    const data = await res.json();
    if (data.success) {
        updateUserUI(data.user);
        closeModal('loginModal');
        showToast('登录成功');
        loadCurrentUser(); // 后台刷新状态，不阻塞
    } else {
        alert(data.message);
    }
}

async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirmPassword').value;
    if (!username || !phone || !password) return alert('请填写完整');
    if (username.length < 2 || username.length > 20) return alert('用户名长度需在2-20位之间');
    if (!validatePhone(phone)) return alert('请输入正确的11位手机号');
    if (password !== confirm) return alert('两次密码不一致');
    if (password.length < 6) return alert('密码至少6位');
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,phone,password}) });
    const data = await res.json();
    if (data.success) { alert('注册成功'); showLoginForm(); document.getElementById('loginUsername').value = phone; }
    else alert(data.message);
}

async function guestLogin() {
    try {
        const res = await fetch('/api/guest', { method:'POST' });
        const data = await res.json();
        if (data.success) { updateUserUI(data.user); closeModal('loginModal'); await loadCurrentUser(); }
    } catch (e) {
        alert('游客登录失败：' + e.message);
    }
}

// 密码强度指示器
function updatePasswordStrength(inputId, fillId, textId, containerId) {
    const pwd = document.getElementById(inputId).value;
    const container = document.getElementById(containerId);
    const fill = document.getElementById(fillId);
    const text = document.getElementById(textId);
    if (!container || !fill || !text) return;
    if (!pwd) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    const result = computePasswordStrength(pwd);
    fill.style.width = result.pct + '%';
    fill.className = 'strength-fill ' + result.cls;
    text.textContent = '密码强度: ' + result.label;
}

async function logout() {
    await fetch('/api/logout', { method:'POST' });
    updateUserUI(null);
    showToast('已退出');
}

function loadProfile() {
    if (!currentUser || currentUser.is_guest) {
        document.getElementById('profileContent').innerHTML = '<p>请先登录</p><button class="btn btn-primary" onclick="showLoginModal()">去登录</button>';
        return;
    }
    const avatarUrl = currentUser.avatar_url || '';
    document.getElementById('profileContent').innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:20px;">
            <div style="width:100px; height:100px; border-radius:50%; background:#f0f2f5; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:10px;">
                <img id="profileAvatarImg" src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover; ${avatarUrl ? '' : 'display:none;'}">
                <i id="profileAvatarIcon" class="fas fa-user" style="font-size:40px; color:#999; ${avatarUrl ? 'display:none;' : ''}"></i>
            </div>
            <label class="btn btn-outline" style="cursor:pointer;">
                <input type="file" id="avatarUploadInput" accept="image/*" style="display:none;" onchange="uploadAvatar(this)">
                <i class="fas fa-camera"></i> 更换头像
            </label>
        </div>
        <div class="form-group"><label>用户名</label><input type="text" id="profileUsername" value="${currentUser.username || ''}" placeholder="用户名"></div>
        <div class="form-group"><label>手机号</label><input type="tel" id="profilePhone" value="${currentUser.phone || ''}" placeholder="手机号"></div>
        <button class="btn btn-primary" onclick="saveProfile()"><i class="fas fa-save"></i> 保存资料</button>

        <hr style="margin:20px 0; border:none; border-top:1px solid var(--color-hairline-soft);">
        <h4 style="font:var(--text-title); margin-bottom:12px;">修改密码</h4>
        <div class="form-group"><label>原密码</label><input type="password" id="oldPassword" placeholder="输入原密码"></div>
        <div class="form-group"><label>新密码</label><input type="password" id="newPassword" placeholder="输入新密码"></div>
        <div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>
        <button class="btn btn-primary" onclick="doUpdatePassword()">修改密码</button>
    `;
}

async function saveProfile() {
    const username = document.getElementById('profileUsername').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (!username || !phone) return showToast('请填写完整', true);
    if (!validatePhone(phone)) return showToast('请输入正确的11位手机号', true);
    try {
        const res = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, phone })
        });
        const data = await res.json();
        if (data.success) {
            currentUser.username = data.username;
            currentUser.phone = data.phone;
            updateUserUI(currentUser);
            showToast('资料已更新');
        } else {
            showToast(data.message || '保存失败', true);
        }
    } catch (e) {
        showToast('请求失败：' + e.message, true);
    }
}

async function doResetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const phone = document.getElementById('resetPhone').value.trim();
    const password = document.getElementById('resetPassword').value;
    const confirm = document.getElementById('resetConfirmPassword').value;
    if (!username || !phone || !password) return showToast('请填写完整', true);
    if (!validatePhone(phone)) return showToast('请输入正确的11位手机号', true);
    if (password !== confirm) return showToast('两次密码不一致', true);
    if (password.length < 6) return showToast('密码至少6位', true);
    try {
        const res = await fetch('/api/reset_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, phone, new_password: password })
        });
        const data = await res.json();
        if (data.success) {
            showToast('密码已重置，请使用新密码登录');
            showLoginForm();
            document.getElementById('loginUsername').value = username;
        } else {
            showToast(data.message || '重置失败', true);
        }
    } catch (e) {
        showToast('请求失败：' + e.message, true);
    }
}

async function uploadAvatar(input) {
    const file = input.files[0];
    if (!file) return;
    
    // 检查文件大小（可选）
    if (file.size > 2 * 1024 * 1024) {
        alert('图片不能超过2MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        const res = await fetch('/api/upload_avatar', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            // 更新当前用户头像
            currentUser.avatar_url = data.avatar_url;
            updateUserUI(currentUser);
            
            // 更新个人资料页显示
            const profileImg = document.getElementById('profileAvatarImg');
            const profileIcon = document.getElementById('profileAvatarIcon');
            if (profileImg) {
                profileImg.src = data.avatar_url;
                profileImg.style.display = 'block';
                profileIcon.style.display = 'none';
            }
            showToast('头像更新成功');
        } else {
            alert(data.message || '上传失败');
        }
    } catch (e) {
        alert('请求失败：' + e.message);
    }
}

function loadPreferences() {
    if (!currentUser || currentUser.is_guest) {
        document.getElementById('preferencesContent').innerHTML = '<p>请先登录</p>';
        return;
    }
    const prefs = currentUser.preferences || {};
    document.getElementById('preferencesContent').innerHTML = `
        <div class="form-group"><label>兴趣标签</label><div id="interestTags"></div></div>
        <div class="form-group"><label>游玩强度</label><select id="travelStyle"><option ${prefs.travel_style=='轻松'?'selected':''}>轻松</option><option ${prefs.travel_style=='适中'?'selected':''}>适中</option><option ${prefs.travel_style=='紧凑'?'selected':''}>紧凑</option></select></div>
        <div class="form-group"><label>预算</label><select id="budget"><option ${prefs.budget=='经济'?'selected':''}>经济</option><option ${prefs.budget=='中等'?'selected':''}>中等</option><option ${prefs.budget=='舒适'?'selected':''}>舒适</option></select></div>
        <button class="btn btn-primary" onclick="savePreferences()">保存</button>
    `;
    const tagsDiv = document.getElementById('interestTags');
    ['人文古迹','自然山水','美食探店','亲子休闲'].forEach(t => {
        const span = document.createElement('span');
        span.className = `tag ${(prefs.interest_tags||[]).includes(t)?'selected':''}`;
        span.onclick = function(){ this.classList.toggle('selected'); };
        span.innerText = t;
        tagsDiv.appendChild(span);
    });
}

async function savePreferences() {
    const tags = Array.from(document.querySelectorAll('#interestTags .tag.selected')).map(s => s.innerText);
    const style = document.getElementById('travelStyle').value;
    const budget = document.getElementById('budget').value;
    await fetch('/api/update_preferences', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({interest_tags:tags, travel_style:style, budget}) });
    showToast('已保存');
}

async function doUpdatePassword() {
    const oldPwd = document.getElementById('oldPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    if (!oldPwd || !newPwd) return showToast('请填写完整', true);
    if (newPwd !== confirmPwd) return showToast('两次密码不一致', true);
    if (newPwd.length < 6) return showToast('新密码至少6位', true);
    try {
        const res = await fetch('/api/update_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
        });
        const data = await res.json();
        if (data.success) {
            showToast('密码已修改');
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            showToast(data.message || '修改失败', true);
        }
    } catch (e) {
        showToast('请求失败：' + e.message, true);
    }
}

