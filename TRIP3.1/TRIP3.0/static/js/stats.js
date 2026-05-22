// static/js/stats.js

async function loadUserStats() {
    if (!currentUser || currentUser.is_guest) {
        document.getElementById('statsPanel').innerHTML = '<div style="padding:60px 20px; text-align:center; color:var(--color-muted);"><i class="fas fa-user-lock" style="font-size:32px;display:block;margin-bottom:12px;"></i>请先登录查看统计信息</div>';
        return;
    }
    try {
        const res = await fetch('/api/user/stats');
        const data = await res.json();
        if (!data.success || !data.stats) return;
        const s = data.stats;

        document.getElementById('statsSummary').innerHTML = `
            <div class="stat-card"><span class="stat-number">${s.total_plans}</span><span class="stat-label">总行程</span></div>
            <div class="stat-card"><span class="stat-number">${s.total_days}</span><span class="stat-label">总天数</span></div>
            <div class="stat-card"><span class="stat-number">${s.cities_count}</span><span class="stat-label">到访城市</span></div>
            <div class="stat-card"><span class="stat-number">¥${Number(s.total_budget).toFixed(0)}</span><span class="stat-label">总预算</span></div>
        `;

        renderMonthlyChart(s.monthly_trend);
        renderFavoriteCities(s.favorite_cities);
        renderBudgetBreakdown(s.budget_breakdown);
        renderActivityTimeline(s.recent_actions);
    } catch (e) {
        document.getElementById('statsPanel').innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--color-muted);">加载统计失败</div>';
    }
}

function renderMonthlyChart(months) {
    const container = document.getElementById('monthlyChart');
    if (!months || months.length === 0) {
        container.innerHTML = '<p style="color:var(--color-muted);font-size:14px;">暂无数据</p>';
        return;
    }
    const maxCount = Math.max(...months.map(m => m.count), 1);
    const barWidth = Math.max(20, Math.min(40, 600 / months.length));
    const padding = 40;
    const height = 200;
    const width = Math.max(300, months.length * (barWidth + 10));

    let svg = `<svg viewBox="0 0 ${width} ${height + 30}" style="width:100%;height:auto;">`;
    months.forEach((m, i) => {
        const x = padding + i * (barWidth + 10);
        const barH = (m.count / maxCount) * (height - 10);
        const y = height - barH;
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barH, 2)}" rx="4" fill="var(--color-primary)" opacity="0.85">
            <title>${m.month}: ${m.count} 个行程</title>
        </rect>`;
        svg += `<text x="${x + barWidth/2}" y="${height + 16}" text-anchor="middle" font-size="10" fill="var(--color-muted)">${m.month.slice(5)}</text>`;
    });
    svg += '</svg>';
    container.innerHTML = svg;
}

function renderFavoriteCities(cities) {
    const container = document.getElementById('favoriteCitiesChart');
    if (!cities || cities.length === 0) {
        container.innerHTML = '<p style="color:var(--color-muted);font-size:14px;">暂无数据</p>';
        return;
    }
    const maxCount = Math.max(...cities.map(c => c.count), 1);
    const barHeight = 28;
    const gap = 8;
    const labelWidth = 80;

    let svg = `<svg viewBox="0 0 400 ${cities.length * (barHeight + gap) + 20}" style="width:100%;height:auto;">`;
    cities.forEach((c, i) => {
        const y = i * (barHeight + gap);
        const barW = (c.count / maxCount) * 260;
        svg += `<text x="${labelWidth - 8}" y="${y + barHeight/2 + 4}" text-anchor="end" font-size="12" fill="var(--color-ink)">${c.city}</text>`;
        svg += `<rect x="${labelWidth}" y="${y}" width="${Math.max(barW, 4)}" height="${barHeight}" rx="4" fill="var(--color-primary)" opacity="0.85">
            <title>${c.city}: ${c.count} 次</title>
        </rect>`;
        svg += `<text x="${labelWidth + barW + 6}" y="${y + barHeight/2 + 4}" font-size="11" fill="var(--color-muted)">${c.count}</text>`;
    });
    svg += '</svg>';
    container.innerHTML = svg;
}

function renderBudgetBreakdown(budget) {
    const container = document.getElementById('budgetChartContainer');
    if (!budget || budget.total_with_budget === 0) {
        container.innerHTML = '<p style="color:var(--color-muted);font-size:14px;">暂无预算数据</p>';
        return;
    }
    const categories = [
        { label: '交通', value: budget.transport },
        { label: '住宿', value: budget.hotel },
        { label: '餐饮', value: budget.food },
        { label: '门票', value: budget.tickets },
        { label: '其他', value: budget.other }
    ].filter(c => c.value > 0);

    const COLORS = ['#3b82f6', '#7c3aed', '#06b6d4', '#f59e0b', '#10b981'];
    const total = categories.reduce((s, c) => s + c.value, 0);
    if (total === 0) {
        container.innerHTML = '<p style="color:var(--color-muted);font-size:14px;">预算总计为零</p>';
        return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'budget-chart');
    const center = 100, radius = 85;
    let startAngle = -Math.PI / 2;
    categories.forEach((cat, i) => {
        const angle = (cat.value / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;
        const x1 = center + radius * Math.cos(startAngle);
        const y1 = center + radius * Math.sin(startAngle);
        const x2 = center + radius * Math.cos(endAngle);
        const y2 = center + radius * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const d = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', COLORS[i % COLORS.length]);
        path.setAttribute('stroke', 'var(--color-canvas)');
        path.setAttribute('stroke-width', '2');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${cat.label}: ¥${cat.value.toFixed(0)} (${(cat.value/total*100).toFixed(1)}%)`;
        path.appendChild(title);
        svg.appendChild(path);
        startAngle = endAngle;
    });

    const legend = document.createElement('div');
    legend.className = 'budget-legend';
    categories.forEach((cat, i) => {
        const item = document.createElement('div');
        item.className = 'budget-legend-item';
        item.innerHTML = `
            <span class="budget-dot" style="background:${COLORS[i % COLORS.length]}"></span>
            <span class="budget-label">${cat.label}</span>
            <span class="budget-amount">¥${cat.value.toFixed(0)}</span>
            <span class="budget-pct">${(cat.value/total*100).toFixed(1)}%</span>
        `;
        legend.appendChild(item);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'budget-chart-wrapper';
    wrapper.appendChild(svg);
    wrapper.appendChild(legend);
    container.innerHTML = '';
    container.appendChild(wrapper);
}

function renderActivityTimeline(actions) {
    const container = document.getElementById('activityTimeline');
    if (!actions || actions.length === 0) {
        container.innerHTML = '<p style="color:var(--color-muted);font-size:14px;">暂无活动</p>';
        return;
    }
    const TYPE_LABELS = {
        'generate_plan': '生成行程', 'save_travel': '保存行程',
        'replan': '重新规划', 'toggle_share': '切换分享',
        'add_favorite': '收藏行程', 'remove_favorite': '取消收藏',
        'delete_travel': '删除行程', 'rate_poi': '评价景点',
        'login': '登录', 'register': '注册',
        'community_like': '点赞社区', 'community_unlike': '取消点赞',
        'optimize_plan': 'AI优化'
    };
    const TYPE_ICONS = {
        'generate_plan': 'fa-robot', 'save_travel': 'fa-save',
        'replan': 'fa-sync-alt', 'toggle_share': 'fa-share-alt',
        'add_favorite': 'fa-heart', 'remove_favorite': 'fa-heart-broken',
        'delete_travel': 'fa-trash-alt', 'rate_poi': 'fa-star',
        'login': 'fa-sign-in-alt', 'register': 'fa-user-plus',
        'community_like': 'fa-thumbs-up', 'community_unlike': 'fa-thumbs-down',
        'optimize_plan': 'fa-magic'
    };

    container.innerHTML = '<div class="timeline">' +
        actions.map(a => {
            const label = TYPE_LABELS[a.type] || a.type;
            const icon = TYPE_ICONS[a.type] || 'fa-circle';
            const time = new Date(a.created_at).toLocaleString('zh-CN');
            return `
                <div class="timeline-item">
                    <div class="timeline-dot"><i class="fas ${icon}"></i></div>
                    <div class="timeline-content">
                        <span class="timeline-action">${label}</span>
                        <span class="timeline-time">${time}</span>
                    </div>
                </div>
            `;
        }).join('') + '</div>';
}
