// static/js/expense.js — 费用追踪 + 行李清单

let _expensePlanUuid = null;

const PACKING_TEMPLATES = {
    beach: ['泳衣', '防晒霜', '太阳镜', '沙滩巾', '人字拖', '防水袋', '遮阳帽', '浮潜装备'],
    city: ['舒适步行鞋', '充电宝', '雨伞', '相机', '随身背包', '便携水杯', '纸巾湿巾'],
    hiking: ['登山鞋', '冲锋衣', '登山杖', '水壶', '头灯', '急救包', '干粮', '防晒帽'],
    business: ['正装', '笔记本电脑', '充电器', '名片', '记事本', '护照/证件', '洗漱包']
};

const EXPENSE_COLORS = ['#3b82f6', '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

const CATEGORY_ORDER = ['交通', '住宿', '餐饮', '门票', '购物', '其他'];

function switchTravelDetailTab(tab) {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.detail-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
    const contentId = 'detailTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(contentId)?.classList.add('active');

    if (tab === 'expenses' && _expensePlanUuid) {
        loadExpenses(_expensePlanUuid);
    } else if (tab === 'packing' && _expensePlanUuid) {
        loadPackingList(_expensePlanUuid);
    }
}

// ==================== 费用追踪 ====================

async function loadExpenses(planUuid) {
    _expensePlanUuid = planUuid;
    try {
        const res = await fetch(`/api/expense/list?plan_uuid=${planUuid}`);
        const data = await res.json();
        if (!data.success) return;

        renderExpenseSummary(data.summary, data.budget);
        renderExpenseList(data.expenses);
    } catch (e) {
        console.warn('加载费用失败:', e);
    }
}

function renderExpenseSummary(summary, budget) {
    const container = document.getElementById('expenseSummary');
    if (!container) return;

    const cats = summary?.categories || {};
    const total = summary?.total || 0;

    // Budget progress section
    let budgetHtml = '';
    if (budget && budget > 0) {
        const pct = Math.min((total / budget) * 100, 100);
        const barClass = pct >= 100 ? 'budget-over' : pct > 80 ? 'budget-warn' : 'budget-ok';
        budgetHtml = `
            <div class="budget-progress-container">
                <div class="budget-progress-labels">
                    <span>预算: <strong>¥${budget.toFixed(2)}</strong></span>
                    <span>花费: <strong>¥${total.toFixed(2)}</strong></span>
                    <span class="budget-pct-text ${barClass}">${total > budget ? '超支' : (pct > 80 ? '即将超支' : '预算内')}</span>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress-fill ${barClass}" style="width:${Math.min(pct, 100)}%"></div>
                </div>
                <div style="font-size:11px;color:var(--color-muted);text-align:right;margin-top:2px;">
                    ${(total / budget * 100).toFixed(1)}% 已使用
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        ${budgetHtml}
        <div class="expense-total">总计: <strong>¥${total.toFixed(2)}</strong></div>
        <div class="expense-cats">
            ${Object.entries(cats).map(([cat, amount]) => `
                <div class="expense-cat-item ${amount > 0 ? 'has-data' : ''}">
                    <span class="expense-cat-label">${cat}</span>
                    <span class="expense-cat-amount">¥${Number(amount).toFixed(2)}</span>
                </div>
            `).join('')}
        </div>
        <div id="expenseDonutChart"></div>
    `;

    if (total > 0) renderExpenseDonutChart(summary);
}

function renderExpenseDonutChart(summary) {
    const container = document.getElementById('expenseDonutChart');
    if (!container) return;
    const cats = summary?.categories || {};
    const total = summary?.total || 0;
    if (total <= 0) { container.innerHTML = ''; return; }

    // Use CATEGORY_ORDER to consistently order slices
    const entries = CATEGORY_ORDER.map(c => [c, Number(cats[c]) || 0]).filter(([, v]) => v > 0);

    const svgNS = 'http://www.w3.org/2000/svg';
    const size = 180, cx = 90, cy = 90, radius = 72, hole = 48;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:16px;margin:8px 0 12px;';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.cssText = 'width:140px;height:140px;flex-shrink:0;';

    let startAngle = -Math.PI / 2;
    const centerText = document.createElementNS(svgNS, 'text');
    centerText.setAttribute('x', cx);
    centerText.setAttribute('y', cy + 4);
    centerText.setAttribute('text-anchor', 'middle');
    centerText.setAttribute('font-size', '18');
    centerText.setAttribute('font-weight', '700');
    centerText.setAttribute('fill', 'var(--color-ink)');
    centerText.textContent = total.toFixed(0);
    svg.appendChild(centerText);

    const labelText = document.createElementNS(svgNS, 'text');
    labelText.setAttribute('x', cx);
    labelText.setAttribute('y', cy + 18);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('font-size', '10');
    labelText.setAttribute('fill', 'var(--color-muted)');
    labelText.textContent = '总花费';
    svg.appendChild(labelText);

    entries.forEach(([, value], i) => {
        const angle = (value / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;
        const largeArc = angle > Math.PI ? 1 : 0;
        const x1 = cx + radius * Math.cos(startAngle);
        const y1 = cy + radius * Math.sin(startAngle);
        const x2 = cx + radius * Math.cos(endAngle);
        const y2 = cy + radius * Math.sin(endAngle);
        const hx = cx + hole * Math.cos(endAngle);
        const hy = cy + hole * Math.sin(endAngle);
        const hx1 = cx + hole * Math.cos(startAngle);
        const hy1 = cy + hole * Math.sin(startAngle);

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${hx} ${hy} A ${hole} ${hole} 0 ${largeArc} 0 ${hx1} ${hy1} Z`);
        path.setAttribute('fill', EXPENSE_COLORS[i % EXPENSE_COLORS.length]);
        path.style.cssText = 'cursor:pointer;opacity:0.9;transition:opacity 0.15s;';
        path.onmouseenter = () => path.style.opacity = '0.7';
        path.onmouseleave = () => path.style.opacity = '0.9';

        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${entries[i][0]}: ¥${value.toFixed(2)} (${(value / total * 100).toFixed(1)}%)`;
        path.appendChild(title);
        svg.appendChild(path);
        startAngle = endAngle;
    });

    wrapper.appendChild(svg);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;';
    entries.forEach(([cat, value], i) => {
        const pct = ((value / total) * 100).toFixed(1);
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:6px;';
        item.innerHTML = `
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${EXPENSE_COLORS[i % EXPENSE_COLORS.length]};flex-shrink:0;"></span>
            <span style="color:var(--color-body);">${cat}</span>
            <span style="color:var(--color-muted-soft);margin-left:auto;">¥${value.toFixed(0)}</span>
            <span style="color:var(--color-muted);min-width:36px;text-align:right;">${pct}%</span>
        `;
        legend.appendChild(item);
    });
    wrapper.appendChild(legend);

    container.innerHTML = '';
    container.appendChild(wrapper);
}

function renderExpenseList(expenses) {
    if (!container) return;

    if (!expenses || expenses.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-receipt"></i><p style="font-size:12px;">暂无费用记录</p></div>';
        return;
    }

    container.innerHTML = expenses.map(e => `
        <div class="expense-item">
            <div class="expense-item-left">
                <span class="expense-cat-tag cat-${e.category}">${e.category}</span>
                <span class="expense-desc">${escapeHtml(e.description) || '无备注'}</span>
            </div>
            <div class="expense-item-right">
                <span class="expense-amount">¥${Number(e.amount).toFixed(2)}</span>
                <span class="expense-date">${e.expense_date || ''}</span>
                <button class="expense-del-btn" onclick="deleteExpense(${e.id})" title="删除">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteExpense(expenseId) {
    if (!confirm('确定删除这笔费用？')) return;
    try {
        const res = await fetch(`/api/expense/delete/${expenseId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('已删除');
            loadExpenses(_expensePlanUuid);
        } else {
            showToast(data.message, true);
        }
    } catch (e) {
        showToast('删除失败', true);
    }
}

async function addExpense() {
    const category = document.getElementById('expenseCategory').value;
    const amount = document.getElementById('expenseAmount').value;
    const description = document.getElementById('expenseDesc').value.trim();
    const expenseDate = document.getElementById('expenseDate').value || null;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        showToast('请输入有效金额', true);
        return;
    }

    try {
        const res = await fetch('/api/expense/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_uuid: _expensePlanUuid,
                category,
                amount: parseFloat(amount),
                description,
                expense_date: expenseDate
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('费用已添加');
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDesc').value = '';
            loadExpenses(_expensePlanUuid);
        } else {
            showToast(data.message, true);
        }
    } catch (e) {
        showToast('添加失败', true);
    }
}

// ==================== 行李清单 ====================

async function loadPackingList(planUuid) {
    _expensePlanUuid = planUuid;
    try {
        const res = await fetch(`/api/packing/load?plan_uuid=${planUuid}`);
        const data = await res.json();
        if (!data.success) return;
        renderPackingList(data.items || []);
    } catch (e) {
        console.warn('加载行李清单失败:', e);
    }
}

function renderPackingList(items) {
    const container = document.getElementById('packingList');
    if (!container) return;

    // Render template buttons
    const templateContainer = document.getElementById('packingTemplates');
    if (templateContainer) templateContainer.innerHTML = renderPackingTemplates();

    // Update progress bar
    const total = items.length;
    const checked = items.filter(i => i.checked).length;
    const pct = total > 0 ? Math.round(checked / total * 100) : 0;
    const fill = document.getElementById('packingProgressFill');
    const text = document.getElementById('packingProgressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `${checked}/${total} (${pct}%)`;

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;"><i class="fas fa-suitcase"></i><p style="font-size:12px;">暂无行李项目，添加一些吧</p></div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="packing-item ${item.checked ? 'packing-checked' : ''}">
            <label class="packing-checkbox">
                <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="togglePackingItem(${item.id}, this.checked)">
                <span class="packing-checkmark"></span>
            </label>
            <span class="packing-name">${escapeHtml(item.name)}</span>
            <button class="packing-del-btn" onclick="removePackingItem(${item.id})" title="删除">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function togglePackingItem(itemId, checked) {
    // Optimistic UI update + save to server
    const items = getCurrentPackingItems();
    const idx = items.findIndex(i => i.id === itemId);
    if (idx !== -1) items[idx].checked = checked;
    await savePackingItems(items);
}

async function removePackingItem(itemId) {
    const items = getCurrentPackingItems().filter(i => i.id !== itemId);
    await savePackingItems(items);
}

async function addPackingItem() {
    const input = document.getElementById('packingItemInput');
    const name = input.value.trim();
    if (!name) {
        showToast('请输入物品名称', true);
        return;
    }

    const items = getCurrentPackingItems();
    items.push({ name, checked: false });
    input.value = '';
    await savePackingItems(items);
}

function getCurrentPackingItems() {
    const container = document.getElementById('packingList');
    if (!container) return [];
    const items = [];
    container.querySelectorAll('.packing-item').forEach(el => {
        const cb = el.querySelector('input[type="checkbox"]');
        const nameEl = el.querySelector('.packing-name');
        if (nameEl) {
            // Extract id from the onchange attribute
            const onChange = cb.getAttribute('onchange') || '';
            const match = onChange.match(/togglePackingItem\((\d+)/);
            items.push({
                id: match ? parseInt(match[1]) : null,
                name: nameEl.textContent,
                checked: cb.checked
            });
        }
    });
    return items;
}

async function savePackingItems(items) {
    try {
        const res = await fetch('/api/packing/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_uuid: _expensePlanUuid, items })
        });
        const data = await res.json();
        if (data.success) {
            loadPackingList(_expensePlanUuid);
        } else {
            showToast('保存失败', true);
        }
    } catch (e) {
        showToast('保存失败', true);
    }
}

// ==================== 行李快速模板 ====================

function renderPackingTemplates() {
    return `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            <span style="font-size:11px;color:var(--color-muted);align-self:center;white-space:nowrap;">快速模板:</span>
            ${Object.entries(PACKING_TEMPLATES).map(([key, items]) => `
                <button class="packing-template-btn" onclick="applyPackingTemplate('${key}')">
                    ${getTemplateIcon(key)} ${getTemplateLabel(key)} (${items.length}项)
                </button>
            `).join('')}
        </div>
    `;
}

function getTemplateLabel(key) {
    return { beach: '海滩', city: '城市', hiking: '徒步', business: '商务' }[key] || key;
}

function getTemplateIcon(key) {
    return { beach: '🏖️', city: '🏙️', hiking: '🥾', business: '💼' }[key] || '📦';
}

async function applyPackingTemplate(templateKey) {
    const template = PACKING_TEMPLATES[templateKey];
    if (!template) return;

    const currentItems = getCurrentPackingItems();
    const existingNames = new Set(currentItems.map(i => i.name.toLowerCase().trim()));

    let added = 0;
    template.forEach(name => {
        if (!existingNames.has(name.toLowerCase().trim())) {
            currentItems.push({ name, checked: false });
            added++;
        }
    });

    if (added === 0) {
        showToast('物品都已存在，无需重复添加');
        return;
    }

    await savePackingItems(currentItems);
    showToast(`已添加 ${added} 项行李物品`);
}
