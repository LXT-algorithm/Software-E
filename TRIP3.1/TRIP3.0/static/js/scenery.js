async function searchScenery(page = 1) {
    const keyword = document.getElementById('sceneryKeyword').value;
    const city = document.getElementById('sceneryCity').value;
    if (page === 1) {
        currentKeyword = keyword; currentCity = city; currentPage = 1;
        document.getElementById('sceneryList').innerHTML = '<div style="text-align:center; padding:40px"><div class="loading-spinner"></div></div>';
        document.getElementById('sceneryError').style.display = 'none';
    }
    let url = `/api/scenery/search?page=${page}&offset=25`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (!keyword && !city) url += `&keyword=景点`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (data.scenery.length === 0) {
            if (page === 1) document.getElementById('sceneryList').innerHTML = '<div style="text-align:center; padding:40px;">😕 没有找到</div>';
            document.getElementById('loadMoreBtn').style.display = 'none';
            return;
        }
        if (page === 1) document.getElementById('sceneryList').innerHTML = '';
        data.scenery.forEach(item => {
            const card = document.createElement('div');
            card.className = 'scenery-card';
            card.onclick = () => showSceneryDetail(item.id);
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between"><h4>${item.name}</h4><span style="color:#222222">${item.rating ? '★'+item.rating : ''}</span></div>
                <p style="color:#6a6a6a; font-size:12px;">${item.address || item.cityname || ''}</p>
                <div>${item.tag ? '<span class="tag">'+item.tag.split(';')[0]+'</span>' : ''}</div>
            `;
            document.getElementById('sceneryList').appendChild(card);
        });
        document.getElementById('loadMoreBtn').style.display = data.has_more ? 'block' : 'none';
    } catch (e) {
        document.getElementById('sceneryError').innerText = '❌ ' + e.message;
        document.getElementById('sceneryError').style.display = 'block';
        if (page === 1) document.getElementById('sceneryList').innerHTML = '';
    }
}

function loadMore() { currentPage++; searchScenery(currentPage); }

function _attr(str) {
    return (str || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _jsStr(str) {
    return (str || '').toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

async function showSceneryDetail(id) {
    const res = await fetch(`/api/scenery/detail/${id}`);
    const data = await res.json();
    if (!data.success) return alert('获取详情失败');
    const s = data.detail;
    const sName = s.name || '';
    let html = `
        <div style="background:linear-gradient(135deg,#fff7ed,#fffbeb);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #fde68a;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <div style="width:40px;height:40px;border-radius:10px;background:#f59e0b20;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-ticket-alt" style="color:#f59e0b;font-size:18px;"></i>
                </div>
                <div>
                    <div style="font-weight:600;color:#92400e;font-size:15px;">景区预约信息</div>
                    <div style="font-size:12px;color:#b45309;">建议提前电话确认</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;color:#92400e80;">开放时间</div>
                    <div style="font-weight:500;color:#92400e;font-size:13px;">${_attr(s.opening_hours || '全天开放')}</div>
                </div>
                <div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;color:#92400e80;">门票参考</div>
                    <div style="font-weight:500;color:#92400e;font-size:13px;">${s.cost ? _attr(s.cost)+'元' : '免费/未知'}</div>
                </div>
                <div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;color:#92400e80;">联系电话</div>
                    <div style="font-weight:500;color:#92400e;font-size:13px;">${_attr(s.tel || '暂无')}</div>
                </div>
                <div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;color:#92400e80;">景区评分</div>
                    <div style="font-weight:500;color:#92400e;font-size:13px;">${s.rating ? '★ '+s.rating : '暂无评分'}</div>
                </div>
            </div>
            <div style="margin-top:10px;background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;">
                <div style="font-size:11px;color:#92400e80;">景区地址</div>
                <div style="font-weight:500;color:#92400e;font-size:13px;">${_attr(s.address || s.cityname || '未知')}</div>
            </div>
        </div>
        <p><strong>📝 介绍：</strong>${_attr(s.intro || '暂无')}</p>
        <button class="btn btn-primary" style="width:100%; margin-top:15px;" onclick="handleNavigate('${_jsStr(sName)}', ${s.lng}, ${s.lat})">🗺️ 高德地图导航</button>
    `;
    if (currentUser && !currentUser.is_guest) {
        html += `<div style="margin-top:15px; border-top:1px solid #eee; padding-top:15px;">
            <p><strong>你的评分：</strong></p>
            <div class="stars" data-poi="${_attr(s.id)}" data-name="${_attr(sName)}">${[1,2,3,4,5].map(n => `<i class="far fa-star" data-value="${n}" style="cursor:pointer; font-size:20px;"></i>`).join('')}</div>
            <textarea id="ratingComment" placeholder="评价..." style="width:100%; margin-top:8px;"></textarea>
            <button class="btn btn-primary" style="margin-top:8px;" onclick="submitRating('${_attr(s.id)}')">提交</button>
        </div>`;
    }
    document.getElementById('sceneryModalBody').innerHTML = html;
    document.querySelectorAll('.stars .fa-star').forEach(s => s.onclick = function() {
        const v = this.dataset.value;
        this.parentNode.querySelectorAll('.fa-star').forEach((st, i) => st.className = i < v ? 'fas fa-star' : 'far fa-star');
        this.parentNode.dataset.rating = v;
    });
    showModal('sceneryModal');
}

async function submitRating(poiId) {
    const stars = document.querySelector(`.stars[data-poi="${poiId}"]`);
    const rating = stars.dataset.rating;
    const comment = document.getElementById('ratingComment').value;
    const name = stars.dataset.name;
    if (!rating) return alert('请选择评分');
    const res = await fetch('/api/rate_poi', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({poi_id:poiId, poi_name:name, rating:parseInt(rating), comment}) });
    const data = await res.json();
    if (data.success) { showToast('感谢评价'); closeModal('sceneryModal'); }
    else alert(data.message);
}