async function loadHistoryList() {
    showPanelLoading('historyList');
    const res = await fetch('/api/get_history');
    const data = await res.json();
    if (data.success && data.history) {
        document.getElementById('historyList').innerHTML = data.history.map(h => `
            <div class="scenery-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="cursor:pointer; flex:1;" onclick="viewTravel('${h.id}')">${h.title}</h4>
                    <div style="display:flex; gap:5px; align-items:center; flex-shrink:0;">
                        <button class="btn-outline" style="padding:4px 8px;font-size:11px;" onclick="event.stopPropagation(); toggleCommunityShare('${h.id}', this)" title="${h.is_public ? '取消社区分享' : '分享到社区'}">
                            <i class="fas fa-globe-asia" style="color:${h.is_public ? '#10b981' : 'var(--color-muted)'};"></i>
                        </button>
                        <button class="btn-outline" style="padding:4px 8px;" onclick="event.stopPropagation(); toggleFavorite('${h.id}', this)" title="${h.is_favorited ? '取消收藏' : '收藏'}">
                            <i class="${h.is_favorited ? 'fas' : 'far'} fa-heart" ${h.is_favorited ? "style='color:#3b82f6;'" : ""}></i>
                        </button>
                        <button class="btn-outline" style="padding:4px 8px;" onclick="event.stopPropagation(); reusePlan('${h.id}')" title="再用一次">
                            <i class="fas fa-redo-alt"></i>
                        </button>
                        <button class="btn-outline" style="padding:4px 8px;" onclick="event.stopPropagation(); shareTravel('${h.id}')" title="分享">
                            <i class="fas fa-share-alt"></i>
                        </button>
                        <button class="btn-outline" style="padding:4px 8px; color:#c13515;" onclick="event.stopPropagation(); deleteTravel('${h.id}', this)" title="删除">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                <p style="color:#6a6a6a; font-size:12px;">${new Date(h.created_at).toLocaleString()} ${h.is_public ? '<span style="color:#10b981;margin-left:8px;"><i class="fas fa-globe-asia"></i> 已公开</span>' : ''}</p>
            </div>
        `).join('');
    } else {
        document.getElementById('historyList').innerHTML = '<div style="text-align:center; padding:40px; color:var(--color-muted);"><i class="fas fa-history" style="font-size:32px; display:block; margin-bottom:12px;"></i>暂无历史行程，请先登录后生成行程</div>';
    }
}

async function reusePlan(planId) {
    const res = await fetch(`/api/travel/${planId}`);
    const data = await res.json();
    if (data.success) {
        document.getElementById('messageInput').value = data.title;
        showPanel('chat');
    }
}

async function viewTravel(planId) {
    try {
        const res = await fetch(`/api/travel/${planId}`);
        const data = await res.json();
        if (!data.success) return alert(data.message);

        document.getElementById('travelDetailTitle').innerText = data.title;
        const body = document.getElementById('travelDetailBody');
        body.innerHTML = data.content;
        bindNavPoints();

        // 隐藏地图容器直到有数据
        const mapContainer = document.getElementById('travelMapContainer');
        mapContainer.style.display = 'none';

        // 记录当前 planId 供各功能使用
        _currentSharePlanId = planId;
        _expensePlanUuid = planId;

        // 重置到内容 Tab
        switchTravelDetailTab('content');

        // 后台加载费用和行李数据
        loadExpenses(planId);
        loadPackingList(planId);

        // 收藏按钮
        const header = document.querySelector('#travelDetailModal .modal-header');
        let favBtn = document.getElementById('travelDetailFavBtn');
        if (!favBtn) {
            favBtn = document.createElement('button');
            favBtn.id = 'travelDetailFavBtn';
            favBtn.className = 'btn-outline';
            favBtn.style.marginRight = '4px';
            favBtn.innerHTML = '<i class="far fa-heart"></i>';
            header.querySelector('div').insertBefore(favBtn, header.querySelector('div').firstChild);
        }
        favBtn.onclick = () => toggleFavorite(planId, favBtn);

        showModal('travelDetailModal');

        setTimeout(() => {
            const points = [];
            document.querySelectorAll('#travelDetailBody .nav-point').forEach(el => {
                const lng = parseFloat(el.dataset.lng);
                const lat = parseFloat(el.dataset.lat);
                if (!isNaN(lng) && !isNaN(lat)) {
                    points.push({ name: el.dataset.name, lng, lat });
                }
            });
            if (points.length > 0) {
                mapContainer.style.display = 'block';
                drawTravelMap(points);
            }
        }, 100);

    } catch (e) {
        alert('请求失败：' + e.message);
    }
}

// 收藏/取消收藏（后端双向切换）
async function toggleFavorite(planId, btnElement) {
    try {
        const res = await fetch('/api/favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ travel_id: planId })
        });
        const data = await res.json();
        if (data.success) {
            const icon = btnElement.querySelector('i');
            if (data.is_favorited) {
                icon.className = 'fas fa-heart';
                icon.style.color = '#3b82f6';
                showToast('已添加到收藏');
            } else {
                icon.className = 'far fa-heart';
                icon.style.color = '';
                const card = btnElement.closest('.scenery-card');
                if (card && document.getElementById('favoritesPanel').style.display !== 'none') {
                    card.remove();
                }
                showToast('已取消收藏');
            }
        } else {
            alert('操作失败：' + (data.message || '请先登录'));
        }
    } catch (e) {
        alert('请求失败：' + e.message);
    }
}

async function deleteTravel(planId, btnElement) {
    if (!confirm('确定要删除这个行程吗？')) return;
    try {
        const res = await fetch(`/api/travel/${planId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            const card = btnElement.closest('.scenery-card');
            if (card) card.remove();
            showToast('已删除');
        } else {
            alert('删除失败：' + (data.message || '未知错误'));
        }
    } catch (e) {
        alert('请求失败：' + e.message);
    }
}

async function loadFavoritesList() {
    showPanelLoading('favoritesList');
    const res = await fetch('/api/get_favorites');
    const data = await res.json();
    if (data.success) {
        document.getElementById('favoritesList').innerHTML = data.favorites.map(f => `
            <div class="scenery-card">
                <div style="display:flex; justify-content:space-between;">
                    <h4 style="cursor:pointer;" onclick="viewTravel('${f.id}')">${f.title}</h4>
                    <button class="btn-outline" style="padding:4px 8px;" onclick="event.stopPropagation(); toggleFavorite('${f.id}', this)" title="取消收藏">
                        <i class="fas fa-heart" style="color:#3b82f6;"></i>
                    </button>
                </div>
                <p style="color:#6a6a6a; font-size:12px;">${new Date(f.created_at).toLocaleString()}</p>
            </div>
        `).join('');
    }
}

// 分享行程
let _currentSharePlanId = null;

async function toggleCommunityShare(planId, btnElement) {
    try {
        const res = await fetch('/api/community/toggle_share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_uuid: planId })
        });
        const data = await res.json();
        if (data.success) {
            const icon = btnElement.querySelector('i');
            icon.style.color = data.is_public ? '#10b981' : 'var(--color-muted)';
            showToast(data.is_public ? '已分享到社区' : '已取消社区分享');
            // 刷新历史列表以更新状态文字
            loadHistoryList();
        } else {
            showToast('操作失败' + (data.is_public ? '' : '，请先登录'), true);
        }
    } catch (e) {
        showToast('请求失败：' + e.message, true);
    }
}

function shareTravel(planId) {
    _currentSharePlanId = planId;
    const url = `${window.location.origin}/api/share/${planId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('分享链接已复制到剪贴板');
        }).catch(() => {
            fallbackCopy(url);
        });
    } else {
        fallbackCopy(url);
    }
}

function shareTravelFromModal() {
    if (_currentSharePlanId) shareTravel(_currentSharePlanId);
    else showToast('请先打开行程', true);
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('分享链接已复制到剪贴板');
    } catch (e) {
        prompt('复制链接:', text);
    }
    document.body.removeChild(ta);
}

async function exportTravelDetailAsImage() {
    const el = document.getElementById('travelDetailBody');
    if (!el) return showToast('没有可导出的内容', true);
    try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff' });
        const link = document.createElement('a');
        link.download = `行程_${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('图片已导出');
    } catch (e) {
        showToast('导出失败：' + e.message, true);
    }
}
