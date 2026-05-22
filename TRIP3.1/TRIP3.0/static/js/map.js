function loadAMap() {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
    script.onload = () => {
        AMap.plugin(['AMap.Geocoder'], () => { geocoder = new AMap.Geocoder(); });
    };
    document.head.appendChild(script);
}

function openNavigation(name, lng, lat) {
    window.open(`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=car`, '_blank');
}

function handleNavigate(name, lng, lat) {
    const validLng = (lng && lng !== 'null' && !isNaN(parseFloat(lng))) ? parseFloat(lng) : null;
    const validLat = (lat && lat !== 'null' && !isNaN(parseFloat(lat))) ? parseFloat(lat) : null;
    if (validLng !== null && validLat !== null) {
        openNavigation(name, validLng, validLat);
    } else if (geocoder) {
        geocoder.getLocation(name, (status, result) => {
            if (status === 'complete' && result.geocodes.length) {
                const loc = result.geocodes[0].location;
                openNavigation(name, loc.lng, loc.lat);
            } else alert(`无法获取「${name}」的坐标`);
        });
    } else alert('地图服务未初始化');
}

function handleNavClick(e) {
    e.stopPropagation();
    const el = e.currentTarget;
    handleNavigate(el.dataset.name, el.dataset.lng, el.dataset.lat);
}

function bindNavPoints() {
    document.querySelectorAll('.nav-point').forEach(el => {
        el.removeEventListener('click', handleNavClick);
        el.addEventListener('click', handleNavClick);
    });
}

function drawTravelMap(points) {
    if (!points || points.length === 0) {
        console.warn('没有可用的坐标点');
        return;
    }
    
    const container = document.getElementById('travelMapContainer');
    container.innerHTML = ''; // 清空容器
    
    // 等待 AMap 加载完成
    if (typeof AMap === 'undefined') {
        console.warn('AMap 尚未加载，延迟绘制...');
        setTimeout(() => drawTravelMap(points), 500);
        return;
    }
    
    try {
        const map = new AMap.Map(container, {
            zoom: 11,
            center: [points[0].lng, points[0].lat]
        });
        
        points.forEach((p, i) => {
            new AMap.Marker({
                position: [p.lng, p.lat],
                label: { content: `${i+1}`, direction: 'top' },
                map: map
            });
        });
        
        if (points.length > 1) {
            new AMap.Polyline({
                path: points.map(p => [p.lng, p.lat]),
                strokeColor: '#3b82f6',
                strokeWeight: 4,
                map: map
            });
            map.setFitView();
        }
    } catch (e) {
        console.error('地图绘制失败:', e);
        container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">地图加载失败，请重试</p>';
    }
}