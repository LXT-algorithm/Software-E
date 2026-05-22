// static/js/chat.js
// 对话历史记录（最多保留最近 6 轮，用于 AI 记忆上下文）
let messageHistory = [];
const MAX_HISTORY_TURNS = 6;

// 快捷提问标签
const QUICK_PROMPTS = [
    { icon: 'fas fa-city', text: '北京3日游', prompt: '北京3日游，预算5000，2人' },
    { icon: 'fas fa-umbrella-beach', text: '周末放松游', prompt: '周末2日游，放松休闲，预算2000' },
    { icon: 'fas fa-route', text: '亲子游', prompt: '亲子游3天，适合带孩子玩' },
    { icon: 'fas fa-hiking', text: '自然风光', prompt: '自然风光3日游，喜欢山水' },
    { icon: 'fas fa-utensils', text: '美食之旅', prompt: '美食主题旅行3天，预算3000' },
    { icon: 'fas fa-suitcase-rolling', text: '行李清单', prompt: '请根据上文的行程生成一份行李清单，用包含checkbox的HTML列表格式：<div class="packing-list">格式，每项用<label><input type="checkbox"> 物品名</label>' },
    { icon: 'fas fa-chart-pie', text: '预算图表', prompt: '请为这个行程做详细的预算分配，列出交通、住宿、餐饮、门票、其他各多少钱，格式：预算明细 | 交通:XXXX元 | 住宿:XXXX元 | 餐饮:XXXX元 | 门票:XXXX元' },
];

function renderQuickPrompts() {
    const container = document.getElementById('quickPromptChips');
    if (!container) return;
    container.innerHTML = QUICK_PROMPTS.map((chip, i) => `
        <span class="prompt-chip" onclick="handlePromptChip(${i})">
            <i class="${chip.icon}"></i> ${chip.text}
        </span>
    `).join('');
}

function handlePromptChip(index) {
    const chip = QUICK_PROMPTS[index];
    if (!chip) return;
    document.getElementById('messageInput').value = chip.prompt;
    sendMessage();
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

/**
 * 从AI输出的markdown中可靠地提取HTML内容
 * 处理各种边缘情况：纯HTML、```html包裹、```包裹、无HTML标签的纯文本
 */
function extractHtmlFromAIOutput(raw) {
    if (!raw || !raw.trim()) return '';
    // 尝试提取 ```html ... ``` 块
    const m = raw.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
    if (m) {
        const content = m[1].trim();
        if (content) return content;
    }
    // 没有代码块：清理残留的 markdown 标记后返回
    return raw.replace(/^```(?:html)?\s*\n?/gm, '').replace(/```\s*$/gm, '').trim();
}

// 流式输出时实时去除 ```html 等 markdown 代码块标记
function stripCodeBlockMarkers(text) {
    return text.replace(/^```(?:html)?\s*\n?/gm, '').replace(/```\s*$/gm, '');
}

function addMessage(role, content, isHtml = false) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const cd = document.createElement('div');
    cd.className = 'message-content';
    if (isHtml || role === 'assistant') cd.innerHTML = content;
    else cd.textContent = content;
    div.appendChild(cd);
    const container = document.getElementById('chatMessages');
    container.appendChild(div);
    smartScroll(container);
    if (role === 'assistant') setTimeout(bindNavPoints, 100);
}

function addEditControls() {
    const last = document.querySelector('.message.assistant:last-child .message-content');
    if (!last) return;
    const bar = document.createElement('div');
    bar.className = 'flex gap-2 mt-4';
    bar.innerHTML = `<button class="btn btn-outline text-sm" onclick="replanCurrent()"><i class="fas fa-sync-alt"></i> 重新规划</button>
                     <button class="btn btn-outline text-sm" onclick="exportAsImage()"><i class="fas fa-download"></i> 导出图片</button>`;
    last.appendChild(bar);
    document.querySelectorAll('.nav-point').forEach(el => {
        const wrap = document.createElement('span');
        wrap.className = 'inline-block mr-1 mb-1';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
        const del = document.createElement('span');
        del.innerHTML = ' ✖';
        del.className = 'text-red-400 cursor-pointer hover:text-red-600';
        del.onclick = (e) => { e.stopPropagation(); wrap.remove(); };
        wrap.appendChild(del);
    });
}

function replanCurrent() {
    const attrs = [];
    document.querySelectorAll('.nav-point').forEach(el => {
        if (el.dataset.name) attrs.push({ name: el.dataset.name, lng: el.dataset.lng, lat: el.dataset.lat });
    });
    if (attrs.length === 0) return alert('没有景点');
    const days = prompt('游玩天数', '3');
    if (!days) return;
    sendMessage('重新规划', true, { attractions: attrs, days: parseInt(days) });
}

async function exportAsImage() {
    const el = document.querySelector('.message.assistant:last-child .message-content');
    if (!el) return;
    try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff' });
        const link = document.createElement('a');
        link.download = `行程_${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL();
        link.click();
    } catch (e) { alert('截图失败'); }
}

async function enrichTravelWithRouteInfo() {
    const pts = [];
    document.querySelectorAll('.nav-point').forEach(el => {
        const lng = parseFloat(el.dataset.lng);
        const lat = parseFloat(el.dataset.lat);
        if (!isNaN(lng) && !isNaN(lat)) pts.push({ el, lng, lat });
    });
    // 并行请求路线信息
    const requests = [];
    for (let i = 0; i < pts.length - 1; i++) {
        requests.push(
            fetch('/api/route_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: [pts[i].lng, pts[i].lat], dest: [pts[i+1].lng, pts[i+1].lat] })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    const span = document.createElement('span');
                    span.className = 'route-info';
                    span.innerHTML = `🚗 ${(data.duration/60).toFixed(0)}分钟 ${(data.distance/1000).toFixed(1)}km`;
                    pts[i].el.parentNode.appendChild(span);
                }
            }).catch(() => {})
        );
    }
    await Promise.all(requests);
}

// 增强行李清单 checkbox 持久化
function enhancePackingLists() {
    document.querySelectorAll('.packing-list input[type="checkbox"]').forEach(cb => {
        const key = `packing_${cb.value || cb.id || Math.random()}`;
        const saved = localStorage.getItem(key);
        if (saved === 'checked') cb.checked = true;
        cb.addEventListener('change', () => {
            localStorage.setItem(key, cb.checked ? 'checked' : '');
        });
    });
}

// SVG 预算饼图
function tryRenderBudgetChart(container) {
    const text = container.textContent || container.innerText;
    const budgetRegex = /(交通|住宿|餐饮|门票|购物|其他)\s*[:：]\s*(\d+\.?\d*)\s*元/g;
    const categories = [];
    let match;
    while ((match = budgetRegex.exec(text)) !== null) {
        categories.push({ label: match[1], value: parseFloat(match[2]) });
    }
    if (categories.length < 2) return;

    const COLORS = ['#3b82f6', '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];
    categories.forEach((c, i) => { c.color = COLORS[i % COLORS.length]; });
    const total = categories.reduce((sum, c) => sum + c.value, 0);
    if (total === 0) return;

    // 构建 SVG 饼图
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'budget-chart');
    const center = 100, radius = 85;
    let startAngle = -Math.PI / 2;
    categories.forEach(cat => {
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
        path.setAttribute('fill', cat.color);
        path.setAttribute('stroke', 'var(--color-canvas)');
        path.setAttribute('stroke-width', '2');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${cat.label}: ${cat.value}元 (${(cat.value/total*100).toFixed(1)}%)`;
        path.appendChild(title);
        svg.appendChild(path);
        startAngle = endAngle;
    });

    // 图例
    const legend = document.createElement('div');
    legend.className = 'budget-legend';
    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'budget-legend-item';
        item.innerHTML = `
            <span class="budget-dot" style="background:${cat.color}"></span>
            <span class="budget-label">${cat.label}</span>
            <span class="budget-amount">${cat.value}元</span>
            <span class="budget-pct">${(cat.value/total*100).toFixed(1)}%</span>
        `;
        legend.appendChild(item);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'budget-chart-wrapper';
    wrapper.appendChild(svg);
    wrapper.appendChild(legend);

    const titleEl = document.createElement('div');
    titleEl.className = 'budget-chart-title';
    titleEl.innerHTML = '<i class="fas fa-chart-pie" style="color:var(--color-primary)"></i> 预算分配';

    const container2 = document.createElement('div');
    container2.className = 'budget-container';
    container2.appendChild(titleEl);
    container2.appendChild(wrapper);
    container.appendChild(container2);
}

async function sendMessage(customMsg = null, isReplan = false, replanData = null) {
    let msg = customMsg || document.getElementById('messageInput').value.trim();
    const style = document.getElementById('travelStyleSelect').value;
    if (!msg || isSending) return;
    if (!isReplan) {
        document.getElementById('messageInput').value = '';
        addMessage('user', msg);
    }
    isSending = true;
    document.getElementById('sendBtn').disabled = true;
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'message assistant';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    // 使用打字指示器代替纯文本
    contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    assistantDiv.appendChild(contentDiv);
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.appendChild(assistantDiv);

    pauseBtn.style.display = 'block';
    autoScrollEnabled = true;

    let accumulated = '';
    let pendingContent = '';
    let renderTimer = null;
    let lastUpdate = Date.now();

    const timer = setInterval(() => {
        if (Date.now() - lastUpdate > 3000) {
            contentDiv.innerHTML = '<div class="typing-indicator" style="opacity:0.6"><span></span><span></span><span></span></div><div style="font:var(--text-caption-sm);color:var(--color-muted);margin-top:4px;">AI 思考中...</div>';
        }
    }, 1000);

    function flushContent() {
        if (pendingContent) {
            accumulated += pendingContent;
            // 流式渲染时实时去除 ```html 标记，避免用户看到
            contentDiv.innerHTML = stripCodeBlockMarkers(accumulated);
            smartScroll(messagesContainer);
            pendingContent = '';
        }
        renderTimer = null;
    }

    try {
        const url = isReplan ? '/api/replan' : '/plan_stream';
        const baseBody = isReplan ? { attractions: replanData.attractions, days: replanData.days, style } : { message: msg, style };
        baseBody.history = messageHistory;
        const body = JSON.stringify(baseBody);
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: abortController.signal });
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lastUpdate = Date.now();
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') {
                        clearInterval(timer);
                        if (renderTimer) clearTimeout(renderTimer);
                        flushContent();
                        let finalHtml = extractHtmlFromAIOutput(accumulated)
                            .replace(/GAODE_API_KEY_PLACEHOLDER/g, AMAP_KEY)
                            .replace(/key=您的高德地图API密钥/g, `key=${AMAP_KEY}`)
                            .replace(/key=你的高德地图密钥/g, `key=${AMAP_KEY}`);
                        if (!finalHtml) finalHtml = '<p style="color:var(--color-muted);padding:20px;text-align:center;">AI返回的内容为空，请重试</p>';
                        contentDiv.innerHTML = finalHtml;
                        bindNavPoints();
                        addEditControls();
                        enhancePackingLists();
                        tryRenderBudgetChart(contentDiv);

                        // 后台异步保存，不阻塞展示
                        if (currentUser && !currentUser.is_guest) {
                            fetch('/api/save_travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: msg.substring(0, 30), content: finalHtml }) })
                                .then(r => r.json()).then(d => { if (d.success) showToast('行程已自动保存'); })
                                .catch(() => {});
                        }

                        // 对话历史
                        messageHistory.push({ role: 'user', content: msg });
                        messageHistory.push({ role: 'assistant', content: stripHtml(finalHtml).substring(0, 500) });
                        if (messageHistory.length > MAX_HISTORY_TURNS * 2) {
                            messageHistory = messageHistory.slice(-MAX_HISTORY_TURNS * 2);
                        }

                        // 后台异步路线信息获取（不阻塞展示）
                        enrichTravelWithRouteInfo().catch(() => {});
                        pauseBtn.style.display = 'none';
                        return;
                    }
                    try {
                        const d = JSON.parse(dataStr);
                        if (d.content) {
                            pendingContent += d.content;
                            if (!renderTimer) {
                                renderTimer = setTimeout(flushContent, 30);
                            }
                        } else if (d.error) {
                            clearInterval(timer);
                            if (renderTimer) clearTimeout(renderTimer);
                            throw new Error(d.error);
                        }
                    } catch (e) {
                        if (!(e instanceof SyntaxError)) throw e;
                    }
                }
            }
        }
    } catch (e) {
        clearInterval(timer);
        if (renderTimer) clearTimeout(renderTimer);
        contentDiv.innerHTML = `<span style="color:red">❌ ${e.message}</span>`;
    } finally {
        isSending = false;
        document.getElementById('sendBtn').disabled = false;
        abortController = null;
        pauseBtn.style.display = 'none';
    }
}

function clearHistory() {
    messageHistory = [];
    showToast('对话记忆已清除');
}

// ==================== Collapsible Prompt Area ====================
function togglePromptArea() {
    const area = document.querySelector('.prompt-area');
    const btn = document.getElementById('promptToggleBtn');
    if (!area || !btn) return;
    const collapsed = area.classList.toggle('collapsed');
    btn.classList.toggle('collapsed', collapsed);
    btn.title = collapsed ? '展开提示区' : '折叠提示区';
    localStorage.setItem('prompt_area_collapsed', collapsed ? '1' : '0');
}

// Initialize collapsed state
document.addEventListener('DOMContentLoaded', () => {
    const area = document.querySelector('.prompt-area');
    const btn = document.getElementById('promptToggleBtn');
    if (area && btn && localStorage.getItem('prompt_area_collapsed') === '1') {
        area.classList.add('collapsed');
        btn.classList.add('collapsed');
        btn.title = '展开提示区';
    }
});
