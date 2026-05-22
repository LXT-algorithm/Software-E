// static/js/community.js
let communityPage = 1;
let communityKeyword = '';
let communityCity = '';
let communityTag = '';
let communitySort = 'hot';
const COMMUNITY_PER_PAGE = 12;

async function loadCommunityTags() {
    const container = document.getElementById('communityTags');
    if (!container) return;
    try {
        const res = await fetch('/api/community/tags');
        const data = await res.json();
        if (data.success && data.tags.length > 0) {
            container.innerHTML = '<span style="color:var(--color-muted);font-size:12px;margin-right:2px;">热门:</span>' +
                data.tags.map(t =>
                    `<span class="tag" style="cursor:pointer;font-size:12px;padding:2px 10px;" onclick="filterByCity('${t.name}')">${t.name} (${t.count})</span>`
                ).join('');
        }
    } catch (e) {
        console.warn('加载热门标签失败:', e);
    }
}

function setCommunitySort(sort) {
    communitySort = sort;
    document.getElementById('sortHot').className = 'tag' + (sort === 'hot' ? ' selected' : '');
    document.getElementById('sortNew').className = 'tag' + (sort === 'new' ? ' selected' : '');
    loadCommunityPlans(1, false);
}

async function loadCommunityPlans(page = 1, append = false) {
    const params = new URLSearchParams({
        page, per_page: COMMUNITY_PER_PAGE,
        keyword: communityKeyword,
        city: communityCity,
        tag: communityTag,
        sort: communitySort
    });
    try {
        const res = await fetch(`/api/community/plans?${params}`);
        const data = await res.json();
        if (data.success) {
            const grid = document.getElementById('communityGrid');
            const countEl = document.getElementById('communityResultCount');
            if (countEl) countEl.textContent = `共 ${data.total} 个行程`;
            if (!append) grid.innerHTML = '';
            if (data.plans.length === 0) {
                if (!append) grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--color-muted);"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:12px;"></i>暂无公开行程</div>';
                document.getElementById('communityLoadMore').style.display = 'none';
                return;
            }
            data.plans.forEach(p => {
                const card = document.createElement('div');
                card.className = 'scenery-card';
                const likeIcon = p.is_liked ? 'fas' : 'far';
                card.innerHTML = `
                    <div onclick="viewCommunityPlan('${p.id}')" style="cursor:pointer;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <div style="width:28px;height:28px;border-radius:50%;background:var(--color-surface-strong);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--color-muted);overflow:hidden;flex-shrink:0;">
                                ${p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fas fa-user"></i>`}
                            </div>
                            <span style="font-size:13px;font-weight:500;color:var(--color-ink);">${escapeHtml(p.username || '匿名')}</span>
                            <span style="font-size:11px;color:var(--color-muted-soft);margin-left:auto;">${formatTimeAgo(p.created_at)}</span>
                        </div>
                        <h4 style="font-size:15px;margin-bottom:4px;">${escapeHtml(p.title)}</h4>
                        <p style="font-size:13px;color:var(--color-muted);">
                            ${p.destination || '未知目的地'} · ${p.days}天${p.budget ? ' · ¥' + Number(p.budget).toFixed(0) : ''}
                        </p>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:10px;padding-top:8px;border-top:1px solid var(--color-hairline-soft);">
                        <button class="btn-like" data-plan-id="${p.id}" onclick="toggleCommunityLike('${p.id}', this)" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:13px;color:var(--color-muted);padding:2px 8px;border-radius:var(--radius-full);transition:all 0.15s;">
                            <i class="${likeIcon} fa-heart" style="color:${p.is_liked ? '#ef4444' : 'var(--color-muted)'};"></i>
                            <span>${p.like_count}</span>
                        </button>
                        <span style="font-size:12px;color:var(--color-muted-soft);"><i class="far fa-eye"></i> 详情</span>
                    </div>
                `;
                grid.appendChild(card);
            });
            document.getElementById('communityLoadMore').style.display = data.has_more ? 'block' : 'none';
            communityPage = page;
        }
    } catch (e) {
        document.getElementById('communityGrid').innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--color-muted);">加载失败</div>';
    }
}

async function toggleCommunityLike(planUuid, btn) {
    try {
        const res = await fetch('/api/community/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_uuid: planUuid })
        });
        const data = await res.json();
        if (data.success) {
            const icon = btn.querySelector('i');
            const count = btn.querySelector('span');
            icon.className = data.is_liked ? 'fas fa-heart' : 'far fa-heart';
            icon.style.color = data.is_liked ? '#ef4444' : 'var(--color-muted)';
            count.textContent = data.like_count;
        }
    } catch (e) {
        showToast('操作失败', true);
    }
}

function viewCommunityPlan(planUuid) {
    fetch(`/api/community/plan/${planUuid}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById('travelDetailTitle').innerText = data.title + ' (社区)';
                const body = document.getElementById('travelDetailBody');
                body.innerHTML = data.content;
                bindNavPoints();

                // 设置 planUuid 使费用/行李 Tab 可用
                _expensePlanUuid = planUuid;
                switchTravelDetailTab('content');
                loadExpenses(planUuid);
                loadPackingList(planUuid);

                showModal('travelDetailModal');
                setTimeout(() => {
                    const points = [];
                    document.querySelectorAll('#travelDetailBody .nav-point').forEach(el => {
                        const lng = parseFloat(el.dataset.lng);
                        const lat = parseFloat(el.dataset.lat);
                        if (!isNaN(lng) && !isNaN(lat)) points.push({ name: el.dataset.name, lng, lat });
                    });
                    if (points.length > 0) drawTravelMap(points);
                }, 200);
            }
        });
}

function searchCommunity() {
    communityKeyword = document.getElementById('communitySearchInput').value.trim();
    communityCity = document.getElementById('communityCityInput').value.trim();
    communityTag = '';
    loadCommunityPlans(1, false);
}

function filterByTag(tag) {
    communityTag = tag;
    communityKeyword = '';
    communityCity = '';
    document.getElementById('communitySearchInput').value = '';
    document.getElementById('communityCityInput').value = '';
    loadCommunityPlans(1, false);
}

function filterByCity(city) {
    communityCity = city;
    communityTag = '';
    communityKeyword = '';
    document.getElementById('communitySearchInput').value = '';
    document.getElementById('communityCityInput').value = city;
    loadCommunityPlans(1, false);
}

function loadMoreCommunity() {
    loadCommunityPlans(communityPage + 1, true);
}

function loadCommunityPanel() {
    communityPage = 1;
    loadCommunityTags();
    loadCommunityPlans(1, false);
}

// escapeHtml and formatTimeAgoAgo are in utils.js (shared)
