// static/js/optimize.js
let _optimizePlanUuid = null;
let _optimizedHtml = '';
let _originalHtml = '';
let _optimizeTitle = '';
let _abortOptimize = null;

function showOptimizeModal() {
    if (!_currentSharePlanId) {
        showToast('请先打开一个行程', true);
        return;
    }
    _optimizePlanUuid = _currentSharePlanId;
    const originalBody = document.getElementById('travelDetailBody');
    _originalHtml = originalBody.innerHTML;
    _optimizedHtml = '';

    document.getElementById('optimizeResult').style.display = 'none';
    document.getElementById('optimizeLoading').style.display = 'none';
    document.getElementById('optimizeError').style.display = 'none';
    document.getElementById('compareBefore').innerHTML = '';
    document.getElementById('compareAfter').innerHTML = '';

    // 重置选项
    document.querySelectorAll('.optimize-option').forEach(b => b.classList.remove('selected'));
    document.querySelector('.optimize-option[data-type="route"]').classList.add('selected');

    showModal('optimizeModal');
}

function selectOptimize(btn) {
    document.querySelectorAll('.optimize-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function startOptimization() {
    const type = document.querySelector('.optimize-option.selected')?.dataset.type || 'route';

    document.getElementById('optimizeOptions').style.display = 'none';
    document.querySelector('#optimizeModal .optimize-start-btn').style.display = 'none';
    document.getElementById('optimizeLoading').style.display = 'block';
    document.getElementById('optimizeResult').style.display = 'none';
    document.getElementById('optimizeError').style.display = 'none';

    if (_abortOptimize) _abortOptimize.abort();
    _abortOptimize = new AbortController();

    try {
        const resp = await fetch('/api/optimize_plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_uuid: _optimizePlanUuid, optimize_type: type }),
            signal: _abortOptimize.signal
        });

        if (!resp.ok) {
            throw new Error('请求失败');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        _optimizedHtml = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        const d = JSON.parse(dataStr);
                        if (d.meta) {
                            _optimizeTitle = d.meta.title;
                        }
                        if (d.content) {
                            _optimizedHtml += d.content;
                        }
                    } catch (e) {
                            console.warn('优化流解析跳过:', e.message);
                        }
                }
            }
        }

        _optimizedHtml = _optimizedHtml
            .replace(/^```html\s*\n?/i, '')
            .replace(/^```\s*\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .replace(/GAODE_API_KEY_PLACEHOLDER/g, AMAP_KEY)
            .replace(/key=您的高德地图API密钥/g, `key=${AMAP_KEY}`)
            .replace(/key=你的高德地图密钥/g, `key=${AMAP_KEY}`);

        document.getElementById('optimizeLoading').style.display = 'none';

        document.getElementById('compareBefore').innerHTML = _originalHtml;
        document.getElementById('compareAfter').innerHTML = _optimizedHtml;

        document.getElementById('optimizeResult').style.display = 'block';
        showCompareTab('after');

    } catch (e) {
        if (e.name !== 'AbortError') {
            document.getElementById('optimizeLoading').style.display = 'none';
            document.getElementById('optimizeError').style.display = 'block';
            document.getElementById('optimizeError').innerHTML = `<i class="fas fa-exclamation-circle"></i> 优化失败：${e.message}`;
            document.getElementById('optimizeOptions').style.display = 'grid';
            document.querySelector('#optimizeModal .optimize-start-btn').style.display = 'block';
        }
    }
}

function showCompareTab(tab) {
    document.querySelectorAll('.compare-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.compare-panel').forEach(p => p.classList.remove('active'));
    if (tab === 'before') {
        document.querySelector('.compare-btn:nth-child(1)').classList.add('active');
        document.getElementById('compareBefore').classList.add('active');
    } else {
        document.querySelector('.compare-btn:nth-child(2)').classList.add('active');
        document.getElementById('compareAfter').classList.add('active');
        setTimeout(bindNavPoints, 100);
    }
}

async function acceptOptimization() {
    if (!_optimizedHtml) {
        showToast('没有可保存的优化结果', true);
        return;
    }
    try {
        const res = await fetch('/api/save_travel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: (_optimizeTitle || '未命名行程') + ' (优化版)',
                content: _optimizedHtml
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('优化版行程已保存');
            closeModal('optimizeModal');
        } else {
            showToast('保存失败', true);
        }
    } catch (e) {
        showToast('保存失败：' + e.message, true);
    }
}
