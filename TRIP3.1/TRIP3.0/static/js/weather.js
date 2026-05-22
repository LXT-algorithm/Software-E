// static/js/weather.js — 天气查询功能（优化版）

const WEATHER_ICONS = {
    '晴': 'sun',
    '多云': 'cloud-sun',
    '阴': 'cloud',
    '小雨': 'cloud-rain',
    '中雨': 'cloud-showers-heavy',
    '大雨': 'cloud-rain',
    '雷阵雨': 'bolt',
    '暴雨': 'cloud-rain',
    '雪': 'snowflake',
    '小雪': 'snowflake',
    '中雪': 'snowflake',
    '大雪': 'snowflake',
    '雾': 'smog',
    '霾': 'smog',
    '大风': 'wind',
    '浮尘': 'smog',
};

const WEATHER_TIPS = {
    '晴': { tip: '天气晴朗，适合出行', color: '#ff9800' },
    '多云': { tip: '多云天气，体感舒适', color: '#78909c' },
    '阴': { tip: '阴天，注意保暖', color: '#607d8b' },
    '雨': { tip: '有雨，记得带伞', color: '#2196f3' },
    '雷': { tip: '雷雨天气，注意安全', color: '#1565c0' },
    '雪': { tip: '雪天路滑，注意防滑', color: '#00bcd4' },
    '雾': { tip: '能见度低，出行注意安全', color: '#9e9e9e' },
    '霾': { tip: '空气质量差，建议佩戴口罩', color: '#9e9e9e' },
    '大风': { tip: '风力较大，注意防风', color: '#607d8b' },
};
const HOT_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安', '三亚', '大理', '丽江', '厦门', '长沙', '武汉', '青岛', '南京'];
const WEATHER_HOT_CITIES_CONTAINER = 'weatherHotCities';

// 衣物推荐配置
const CLOTHING_ADVICE = {
    hot: { temp: 30, label: '酷热', items: ['🎽 短袖T恤', '🩳 短裤', '🧢 遮阳帽', '🕶️ 太阳镜'] },
    warm: { temp: 25, label: '较热', items: ['👕 短袖', '👖 薄长裤', '🧢 遮阳帽'] },
    mild: { temp: 20, label: '舒适', items: ['👕 长袖T恤', '👖 长裤', '🧥 薄外套'] },
    cool: { temp: 15, label: '微凉', items: ['🧥 薄外套', '👖 长裤', '🧣 薄围巾'] },
    cold: { temp: 10, label: '较冷', items: ['🧥 外套', '👖 长裤', '🧣 围巾'] },
    chilly: { temp: 5, label: '寒冷', items: ['🧥 毛衣', '🧥 厚外套', '🧣 围巾', '🧤 手套'] },
    freezing: { temp: -100, label: '严寒', items: ['🧥 羽绒服', '🧣 围巾', '🧤 手套', '🎩 保暖帽'] },
};

const ACCESSORY_ADVICE = {
    rain: { keywords: ['雨', '雷', '暴雨'], items: ['☂️ 雨伞', '🥾 防水鞋'] },
    snow: { keywords: ['雪'], items: ['☂️ 雨伞', '🥾 防滑鞋'] },
    sunny: { keywords: ['晴'], items: ['🕶️ 太阳镜', '🧴 防晒霜'] },
    hazy: { keywords: ['霾', '雾'], items: ['😷 口罩'] },
    windy: { keywords: ['大风'], items: ['🧥 防风外套'] },
};

function getClothingAdvice(temp) {
    const t = parseInt(temp);
    if (isNaN(t)) return [];
    for (const [key, level] of Object.entries(CLOTHING_ADVICE)) {
        if (t >= level.temp) return level.items;
    }
    return CLOTHING_ADVICE.freezing.items;
}

function getAccessoryAdvice(weather, temp) {
    const items = [];
    for (const [key, adv] of Object.entries(ACCESSORY_ADVICE)) {
        if (adv.keywords.some(kw => weather.includes(kw))) {
            items.push(...adv.items);
        }
    }
    // 晴天 + 高温额外推荐
    if (weather.includes('晴') && parseInt(temp) >= 30) {
        items.push('☂️ 遮阳伞');
    }
    return [...new Set(items)]; // 去重
}

function getWeatherIcon(weather) {
    for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
        if (weather.includes(key)) return icon;
    }
    return 'cloud';
}

function getWeatherColor(weather) {
    if (weather.includes('晴')) return '#ff9800';
    if (weather.includes('雨') || weather.includes('雷')) return '#2196f3';
    if (weather.includes('雪')) return '#00bcd4';
    if (weather.includes('雾') || weather.includes('霾')) return '#9e9e9e';
    if (weather.includes('云')) return '#78909c';
    return '#ff9800';
}

function getWeatherTip(weather) {
    for (const [key, val] of Object.entries(WEATHER_TIPS)) {
        if (weather.includes(key)) return val;
    }
    return { tip: '天气多变，注意出行安全', color: '#78909c' };
}

function getTemperatureAdvice(temp) {
    const t = parseInt(temp);
    if (isNaN(t)) return '';
    if (t >= 37) return '🔥 高温预警：注意防暑降温，避免长时间户外活动';
    if (t >= 35) return '☀️ 高温天气：注意防晒补水';
    if (t <= -10) return '❄️ 极寒天气：注意防寒保暖';
    if (t <= 0) return '🥶 低温天气：注意保暖防冻';
    if (t <= 5) return '🌬️ 温度较低：建议添加衣物';
    return '';
}

function getWindAdvice(power) {
    const p = parseInt(power);
    if (isNaN(p)) return '';
    if (p >= 8) return '⚠️ 大风预警：尽量避免户外活动';
    if (p >= 6) return '🌪️ 风力较大：注意防风，户外活动需谨慎';
    if (p >= 4) return '🍃 风力稍大：户外活动注意防火';
    return '';
}

async function searchWeather() {
    const city = document.getElementById('weatherCityInput').value.trim();
    if (!city) return showToast('请输入城市名', true);
    await fetchWeatherAndForecast(city);
}

async function fetchWeatherAndForecast(city) {
    const btn = document.querySelector('#weatherPanel .btn-primary');
    const currentCard = document.getElementById('weatherCurrentCard');
    const forecastDiv = document.getElementById('weatherForecast');
    const tipDiv = document.getElementById('weatherTip');
    const cityDisplay = document.getElementById('weatherCityDisplay');

    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></span>';

    try {
        // 并行查询实时天气和预报
        const [liveRes, forecastRes] = await Promise.all([
            fetch(`/api/weather?city=${encodeURIComponent(city)}`),
            fetch(`/api/weather/forecast?city=${encodeURIComponent(city)}`)
        ]);
        const liveData = await liveRes.json();
        const forecastData = await forecastRes.json();

        if (!liveData.success) {
            currentCard.style.display = 'none';
            forecastDiv.style.display = 'none';
            tipDiv.style.display = 'none';
            showToast(liveData.message || '查询失败', true);
            return;
        }

        const w = liveData.weather;
        const icon = getWeatherIcon(w.weather);
        const color = getWeatherColor(w.weather);
        const tipInfo = getWeatherTip(w.weather);
        const tempAdvice = getTemperatureAdvice(w.temperature);
        const windAdvice = getWindAdvice(w.windpower);

        // 显示城市名
        cityDisplay.textContent = `📍 ${w.city}`;
        document.getElementById('weatherCityInput').value = w.city;

        // 实时天气卡片
        currentCard.style.display = 'block';
        currentCard.innerHTML = `
            <div class="weather-card" style="background:linear-gradient(135deg,${color}15,${color}08);border:1px solid ${color}30;">
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <div style="text-align:center;min-width:100px;">
                        <i class="fas fa-${icon}" style="font-size:56px;color:${color};"></i>
                        <div style="font-size:36px;font-weight:700;color:#222;margin-top:4px;">${w.temperature}°C</div>
                    </div>
                    <div style="flex:1;min-width:120px;">
                        <div style="font-size:18px;font-weight:600;color:#333;">${w.weather}</div>
                        <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;font-size:13px;color:#666;">
                            <span><i class="fas fa-wind" style="color:${color};"></i> ${w.windpower}级</span>
                            <span><i class="fas fa-tint" style="color:${color};"></i> ${w.humidity}% 湿度</span>
                        </div>
                        <div style="font-size:11px;color:#999;margin-top:6px;">更新: ${w.reporttime || ''}</div>
                    </div>
                </div>
            </div>
        `;

        // 天气建议
        tipDiv.style.display = 'block';
        let tips = [];
        if (tempAdvice) tips.push(tempAdvice);
        if (windAdvice) tips.push(windAdvice);
        tips.push(`💡 ${tipInfo.tip}`);
        tipDiv.innerHTML = tips.map(t => `
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;margin-bottom:4px;background:${tipInfo.color}10;border-radius:8px;font-size:13px;color:#555;">
                <span>${t}</span>
            </div>
        `).join('');

        // 3天预报
        if (forecastData.success && forecastData.forecast.forecast.length > 0) {
            forecastDiv.style.display = 'block';
            const casts = forecastData.forecast.forecast;
            const days = ['今天', '明天', '后天'];
            forecastDiv.innerHTML = `
                <div style="font-weight:600;font-size:14px;color:#444;margin-bottom:10px;">
                    <i class="fas fa-calendar-alt" style="color:${color};"></i> 未来天气趋势
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
                    ${casts.map((c, i) => {
                        const dayIcon = getWeatherIcon(c.dayweather);
                        const dayColor = getWeatherColor(c.dayweather);
                        return `
                            <div style="background:#fff;border-radius:10px;padding:12px 8px;text-align:center;border:1px solid #f0f0f0;">
                                <div style="font-size:13px;font-weight:600;color:#444;">${days[i] || c.date}</div>
                                <div style="font-size:11px;color:#999;margin:2px 0 6px;">${c.date}</div>
                                <i class="fas fa-${dayIcon}" style="font-size:24px;color:${dayColor};"></i>
                                <div style="font-size:13px;color:#555;margin:4px 0;">${c.dayweather}</div>
                                <div style="font-size:15px;font-weight:600;color:#333;">
                                    ${c.daytemp}°/${c.nighttemp}°
                                </div>
                                <div style="font-size:11px;color:#999;">
                                    <i class="fas fa-wind"></i> ${c.daypower}级
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            forecastDiv.style.display = 'none';
        }
    } catch (e) {
        document.getElementById('weatherCurrentCard').style.display = 'none';
        document.getElementById('weatherForecast').style.display = 'none';
        document.getElementById('weatherTip').style.display = 'none';
        showToast('网络错误: ' + e.message, true);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-redo"></i> 刷新';
}

// 定位查询天气
function getLocationWeather() {
    if (!navigator.geolocation) {
        return showToast('浏览器不支持定位', true);
    }
    const btn = document.getElementById('weatherLocateBtn');
    btn.innerHTML = '<span class="loading-spinner" style="width:14px;height:14px;border-width:2px;"></span>';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const res = await fetch(`/api/geocode/reverse?lng=${pos.coords.longitude}&lat=${pos.coords.latitude}`);
            const data = await res.json();
            if (data.success && data.city) {
                document.getElementById('weatherCityInput').value = data.city;
                await fetchWeatherAndForecast(data.city);
            } else {
                showToast('无法识别所在城市', true);
            }
        } catch (e) {
            showToast('定位服务异常', true);
        }
        btn.innerHTML = '<i class="fas fa-location-dot"></i>';
        btn.disabled = false;
    }, () => {
        showToast('定位失败，请手动输入城市名', true);
        btn.innerHTML = '<i class="fas fa-location-dot"></i>';
        btn.disabled = false;
    }, { timeout: 8000 });
}

// 首页天气组件：浏览器定位 → IP 兜底 → 手动输入
async function initHomeWeather() {
    const widget = document.getElementById('homeWeatherWidget');
    if (!widget) return;

    function showFallback(msg) {
        document.getElementById('homeWeatherCity').textContent = msg || '无法获取位置';
        document.getElementById('homeWeatherLoading').style.display = 'none';
        document.getElementById('homeWeatherTemp').textContent = '--';
        document.getElementById('homeWeatherDesc').textContent = '请手动输入城市名';
        document.getElementById('homeWeatherFallback').style.display = 'block';
    }

    async function fetchWeatherByCity(city) {
        document.getElementById('homeWeatherCity').textContent = `📍 ${city}`;
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        return data.weather;
    }

    async function renderWeather(w) {
        const icon = getWeatherIcon(w.weather);
        const color = getWeatherColor(w.weather);
        const clothingItems = getClothingAdvice(w.temperature);
        const accessoryItems = getAccessoryAdvice(w.weather, w.temperature);

        document.getElementById('homeWeatherIcon').textContent = '';
        document.getElementById('homeWeatherIcon').innerHTML = `<i class="fas fa-${icon}" style="font-size:28px;color:${color};"></i>`;
        document.getElementById('homeWeatherTemp').textContent = `${w.temperature}°C`;
        document.getElementById('homeWeatherDesc').textContent = `${w.weather} · ${w.city}`;
        document.getElementById('homeWeatherCity').textContent = `📍 ${w.city}`;
        document.getElementById('homeWeatherLoading').style.display = 'none';

        const recDiv = document.getElementById('homeClothingRec');
        const clothDiv = document.getElementById('homeClothingItems');
        const accDiv = document.getElementById('homeAccessoryItems');
        clothDiv.innerHTML = clothingItems.map(item =>
            `<span style="padding:2px 8px;background:#f5f3ff;border-radius:999px;font-size:11px;color:#7c3aed;">${item}</span>`
        ).join('');
        if (accessoryItems.length > 0) {
            accDiv.innerHTML = '<span style="font-size:11px;color:#999;margin-right:2px;">☂️ 建议携带:</span> '
                + accessoryItems.map(item =>
                    `<span style="padding:2px 8px;background:#fff7ed;border-radius:999px;font-size:11px;color:#b45309;">${item}</span>`
                ).join('');
        } else {
            accDiv.innerHTML = '';
        }
        recDiv.style.display = 'block';
    }

    // 1) 浏览器定位
    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            const geoRes = await fetch(`/api/geocode/reverse?lng=${pos.coords.longitude}&lat=${pos.coords.latitude}`);
            const geo = await geoRes.json();
            if (geo.success && geo.city) {
                const w = await fetchWeatherByCity(geo.city);
                await renderWeather(w);
                return;
            }
        } catch (_) { /* 浏览器定位失败，走 IP 兜底 */ }
    }

    // 2) IP 定位兜底（无需用户授权）
    try {
        const ipRes = await fetch('/api/geocode/ip');
        const ipData = await ipRes.json();
        if (ipData.success && ipData.city) {
            const w = await fetchWeatherByCity(ipData.city);
            await renderWeather(w);
            return;
        }
    } catch (_) { /* IP 定位失败 */ }

    // 3) 全部失败 → 手动输入
    showFallback('定位失败，请手动输入');
}

// 首页手动查询天气
async function homeWeatherManual() {
    const input = document.getElementById('homeWeatherInput');
    const city = input.value.trim();
    if (!city) return;
    const widget = document.getElementById('homeWeatherWidget');
    if (!widget) return;

    document.getElementById('homeWeatherCity').textContent = `📍 ${city}`;
    document.getElementById('homeWeatherLoading').style.display = 'inline';
    document.getElementById('homeWeatherFallback').style.display = 'none';

    try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const w = data.weather;
        const icon = getWeatherIcon(w.weather);
        const color = getWeatherColor(w.weather);
        const clothingItems = getClothingAdvice(w.temperature);
        const accessoryItems = getAccessoryAdvice(w.weather, w.temperature);

        document.getElementById('homeWeatherIcon').textContent = '';
        document.getElementById('homeWeatherIcon').innerHTML = `<i class="fas fa-${icon}" style="font-size:28px;color:${color};"></i>`;
        document.getElementById('homeWeatherTemp').textContent = `${w.temperature}°C`;
        document.getElementById('homeWeatherDesc').textContent = `${w.weather} · ${w.city}`;
        document.getElementById('homeWeatherLoading').style.display = 'none';

        const recDiv = document.getElementById('homeClothingRec');
        const clothDiv = document.getElementById('homeClothingItems');
        const accDiv = document.getElementById('homeAccessoryItems');
        clothDiv.innerHTML = clothingItems.map(item =>
            `<span style="padding:2px 8px;background:#f5f3ff;border-radius:999px;font-size:11px;color:#7c3aed;">${item}</span>`
        ).join('');
        if (accessoryItems.length > 0) {
            accDiv.innerHTML = '<span style="font-size:11px;color:#999;margin-right:2px;">☂️ 建议携带:</span> '
                + accessoryItems.map(item =>
                    `<span style="padding:2px 8px;background:#fff7ed;border-radius:999px;font-size:11px;color:#b45309;">${item}</span>`
                ).join('');
        } else {
            accDiv.innerHTML = '';
        }
        recDiv.style.display = 'block';
    } catch (e) {
        document.getElementById('homeWeatherLoading').style.display = 'none';
        document.getElementById('homeWeatherFallback').style.display = 'block';
        document.getElementById('homeWeatherDesc').textContent = '查询失败，请重试';
    }
}

// 初始化：热门城市 + 自动定位
document.addEventListener('DOMContentLoaded', () => {
    // 渲染热门城市快速查询
    const container = document.getElementById(WEATHER_HOT_CITIES_CONTAINER);
    if (container) {
        container.innerHTML = HOT_CITIES.map(c =>
            `<span style="padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #e5e7eb;font-size:12px;color:#555;cursor:pointer;transition:all 0.15s;"
                   onmouseover="this.style.borderColor='#3b82f6';this.style.color='#3b82f6'"
                   onmouseout="this.style.borderColor='#e5e7eb';this.style.color='#555'"
                   onclick="quickWeather('${c}')">${c}</span>`
        ).join('');
    }
    setTimeout(initHomeWeather, 100);

    // 自动定位
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            () => getLocationWeather(),
            () => {},
            { timeout: 5000 }
        );
    }
});

function quickWeather(city) {
    document.getElementById('weatherCityInput').value = city;
    fetchWeatherAndForecast(city);
}
