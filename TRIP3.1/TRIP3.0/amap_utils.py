# amap_utils.py
import requests
import json
import logging
from datetime import datetime
from config import AMAP_WEB_API_KEY, AMAP_POISEARCH_URL, AMAP_POIDETAIL_URL, AMAP_DIRECTION_URL, AMAP_WEATHER_URL, AMAP_REGEO_URL, AMAP_IP_URL
from db import get_connection

logger = logging.getLogger(__name__)

# 复用 Session 减少 TCP 握手
_amap_session = requests.Session()

def call_amap_api(url, params, timeout=6):
    """调用高德API，带超时和连接复用"""
    if not AMAP_WEB_API_KEY:
        return False, "高德Web服务Key未配置"
    params["key"] = AMAP_WEB_API_KEY
    try:
        resp = _amap_session.get(url, params=params, timeout=timeout)
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        if data.get("status") == "1":
            return True, data
        else:
            return False, data.get("info", "未知错误")
    except requests.Timeout:
        return False, "高德API超时"
    except Exception as e:
        return False, f"网络异常: {str(e)}"

def search_poi(city, keywords, types=None, offset=10):
    """用于增强AI消息的POI搜索（带缓存）"""
    cache_key = f"poi_{city}_{keywords}_{types}_{offset}"
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT data, updated_at FROM poi_cache WHERE cache_key = %s", (cache_key,))
            row = cursor.fetchone()
            if row and (datetime.now() - row['updated_at']).days < 7:
                return json.loads(row['data'])
    except Exception as e:
        logger.warning(f"缓存读取失败: {e}")
    finally:
        conn.close()

    params = {
        "keywords": keywords,
        "city": city,
        "offset": offset,
        "page": 1,
        "output": "json",
        "extensions": "base"
    }
    if types:
        params["types"] = types
    success, result = call_amap_api(AMAP_POISEARCH_URL, params)
    pois = []
    if success:
        for poi in result.get("pois", []):
            loc = poi.get("location", "").split(",")
            if len(loc) >= 2:
                lng, lat = loc[0], loc[1]
            else:
                continue
            biz_ext = poi.get("biz_ext")
            if isinstance(biz_ext, dict):
                rating = biz_ext.get("rating", "暂无")
                tel = biz_ext.get("tel", poi.get("tel", ""))
            else:
                rating = "暂无"
                tel = poi.get("tel", "")
            pois.append({
                "name": poi.get("name"),
                "address": poi.get("address"),
                "lng": lng,
                "lat": lat,
                "rating": rating,
                "tel": tel
            })

    if pois:
        conn = get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "REPLACE INTO poi_cache (cache_key, data) VALUES (%s, %s)",
                    (cache_key, json.dumps(pois))
                )
            conn.commit()
        except Exception as e:
            logger.warning(f"缓存写入失败: {e}")
        finally:
            conn.close()
    return pois

def _search_scenery_from_amap(city, keyword, page=1, offset=25):
    """原始高德 API 搜索（内部函数）"""
    params = {
        "keywords": keyword or "景点",
        "types": "110000",
        "city": city,
        "page": page,
        "offset": offset,
        "extensions": "all"
    }
    success, result = call_amap_api(AMAP_POISEARCH_URL, params)
    if not success:
        return False, result
    pois = result.get("pois", [])
    formatted = []
    for poi in pois:
        loc = poi.get("location", "").split(",")
        tag_raw = poi.get("tag", "")
        if isinstance(tag_raw, list):
            tag = ";".join(tag_raw) if tag_raw else ""
        elif tag_raw is None:
            tag = ""
        else:
            tag = str(tag_raw)

        biz_ext = poi.get("biz_ext")
        if isinstance(biz_ext, dict):
            rating_raw = biz_ext.get("rating")
            cost = biz_ext.get("cost", "")
            opening_hours = biz_ext.get("opening_hours", "")
        else:
            rating_raw = None
            cost = ""
            opening_hours = ""

        rating = str(rating_raw) if rating_raw is not None else ""
        opening_hours = str(opening_hours) if opening_hours else ""

        formatted.append({
            "id": poi.get("id"),
            "name": poi.get("name"),
            "address": poi.get("address"),
            "lng": float(loc[0]) if len(loc) > 0 else None,
            "lat": float(loc[1]) if len(loc) > 1 else None,
            "cityname": poi.get("cityname"),
            "tel": poi.get("tel") or "",
            "tag": tag,
            "rating": rating,
            "cost": cost,
            "opening_hours": opening_hours
        })
    return True, {
        "pois": formatted,
        "total": int(result.get("count", 0)),
        "has_more": len(pois) == offset
    }

def _save_amap_pois_to_db(pois, city):
    """将高德返回的 POI 批量保存到本地数据库"""
    if not pois:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            for poi in pois:
                lng = float(poi.get('lng')) if poi.get('lng') else None
                lat = float(poi.get('lat')) if poi.get('lat') else None
                sql = """
                INSERT INTO attractions (poi_id, name, address, city, lng, lat, tel, tag, rating, cost, opening_hours, intro, category)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    name=VALUES(name), address=VALUES(address), city=VALUES(city),
                    lng=VALUES(lng), lat=VALUES(lat), tel=VALUES(tel), tag=VALUES(tag),
                    rating=VALUES(rating), cost=VALUES(cost), opening_hours=VALUES(opening_hours),
                    intro=VALUES(intro), updated_at=CURRENT_TIMESTAMP
                """
                cursor.execute(sql, (
                    poi.get('id'), poi.get('name'), poi.get('address'), poi.get('cityname', city),
                    lng, lat, poi.get('tel', ''), poi.get('tag', ''),
                    poi.get('rating'), poi.get('cost'), poi.get('opening_hours', ''),
                    '', '其他'
                ))
        conn.commit()
    except Exception as e:
        logger.warning(f"保存高德数据失败: {e}")
    finally:
        conn.close()

def _save_single_poi_to_db(detail):
    """保存单条 POI 详情到本地数据库"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO attractions (poi_id, name, address, city, lng, lat, tel, tag, rating, cost, opening_hours, intro, photos, category)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name=VALUES(name), address=VALUES(address), city=VALUES(city),
                lng=VALUES(lng), lat=VALUES(lat), tel=VALUES(tel), tag=VALUES(tag),
                rating=VALUES(rating), cost=VALUES(cost), opening_hours=VALUES(opening_hours),
                intro=VALUES(intro), photos=VALUES(photos), updated_at=CURRENT_TIMESTAMP
            """
            cursor.execute(sql, (
                detail.get('id'), detail.get('name'), detail.get('address'), detail.get('cityname', ''),
                detail.get('lng'), detail.get('lat'), detail.get('tel', ''), detail.get('tag', ''),
                detail.get('rating'), detail.get('cost'), detail.get('opening_hours', ''),
                detail.get('intro', ''), json.dumps(detail.get('photos', [])), '其他'
            ))
        conn.commit()
    except Exception as e:
        logger.warning(f"保存详情失败: {e}")
    finally:
        conn.close()

def search_scenery(city, keyword, page=1, offset=25):
    """优先从本地数据库查询景点"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT poi_id as id, name, address, lng, lat, city as cityname, tel, tag, 
                       rating, cost, opening_hours, intro
                FROM attractions WHERE 1=1
            """
            params = []
            if city:
                sql += " AND city = %s"
                params.append(city)
            if keyword:
                sql += " AND (name LIKE %s OR tag LIKE %s)"
                kw = f"%{keyword}%"
                params.extend([kw, kw])

            # 获取总数
            count_sql = f"SELECT COUNT(*) as total FROM ({sql}) t"
            cursor.execute(count_sql, params)
            total = cursor.fetchone()['total']

            # 排序和分页
            sql += " ORDER BY popularity DESC, rating DESC LIMIT %s OFFSET %s"
            params.append(offset)
            params.append((page-1) * offset)

            cursor.execute(sql, params)
            rows = cursor.fetchall()

            if rows:
                pois = []
                for row in rows:
                    pois.append({
                        "id": row['id'],
                        "name": row['name'],
                        "address": row['address'],
                        "lng": float(row['lng']) if row['lng'] else None,
                        "lat": float(row['lat']) if row['lat'] else None,
                        "cityname": row['cityname'],
                        "tel": row['tel'] or "",
                        "tag": row['tag'] or "",
                        "rating": str(row['rating']) if row['rating'] else "",
                        "cost": str(row['cost']) if row['cost'] else "",
                        "opening_hours": row['opening_hours'] or "",
                    })
                return True, {
                    "pois": pois,
                    "total": total,
                    "has_more": len(pois) == offset and (page * offset) < total
                }
    except Exception as e:
        logger.warning(f"本地数据库查询失败: {e}")
    finally:
        conn.close()

    # 本地无数据，降级调用高德 API
    logger.info("本地无数据 降级调用高德 API")
    success, result = _search_scenery_from_amap(city, keyword, page, offset)
    if success:
        _save_amap_pois_to_db(result['pois'], city)
    return success, result

def get_scenery_detail(poi_id):
    """获取景点详情（先查本地，再调高德）"""
    # 先查本地
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT poi_id as id, name, address, lng, lat, city as cityname, tel, tag,
                       rating, cost, opening_hours, intro, photos
                FROM attractions WHERE poi_id = %s
            """, (poi_id,))
            row = cursor.fetchone()
            if row:
                return {
                    "id": row['id'],
                    "name": row['name'],
                    "address": row['address'],
                    "lng": float(row['lng']) if row['lng'] else None,
                    "lat": float(row['lat']) if row['lat'] else None,
                    "cityname": row['cityname'],
                    "tel": row['tel'] or "",
                    "tag": row['tag'] or "",
                    "intro": row['intro'] or "",
                    "rating": str(row['rating']) if row['rating'] else "",
                    "cost": str(row['cost']) if row['cost'] else "",
                    "opening_hours": row['opening_hours'] or "",
                    "photos": json.loads(row['photos']) if row['photos'] else []
                }
    except Exception as e:
        logger.warning(f"本地详情查询失败: {e}")
    finally:
        conn.close()

    # 调用高德
    params = {"id": poi_id, "extensions": "all"}
    success, result = call_amap_api(AMAP_POIDETAIL_URL, params)
    if not success or not result.get("pois"):
        return None
    poi = result["pois"][0]
    loc = poi.get("location", "").split(",")

    biz_ext = poi.get("biz_ext")
    if isinstance(biz_ext, dict):
        rating = biz_ext.get("rating", "")
        cost = biz_ext.get("cost", "")
        opening_hours = biz_ext.get("opening_hours", "")
    else:
        rating = ""
        cost = ""
        opening_hours = ""

    detail = {
        "id": poi.get("id"),
        "name": poi.get("name"),
        "address": poi.get("address"),
        "lng": loc[0] if len(loc) > 0 else None,
        "lat": loc[1] if len(loc) > 1 else None,
        "tel": poi.get("tel", ""),
        "tag": poi.get("tag", ""),
        "intro": poi.get("description", ""),
        "rating": rating,
        "cost": cost,
        "opening_hours": opening_hours,
        "photos": poi.get("photos", [])
    }
    # 保存到本地
    _save_single_poi_to_db(detail)
    return detail

def get_route_info(origin_lng, origin_lat, dest_lng, dest_lat, mode='driving'):
    url = AMAP_DIRECTION_URL
    params = {
        "origin": f"{origin_lng},{origin_lat}",
        "destination": f"{dest_lng},{dest_lat}",
        "extensions": "base"
    }
    success, data = call_amap_api(url, params)
    if success:
        route = data.get('route', {})
        paths = route.get('paths', [])
        if paths:
            return {
                'distance': paths[0].get('distance', '0'),
                'duration': paths[0].get('duration', '0')
            }
    return None

def get_hot_cities():
    return [
        {"name": "北京市", "adcode": "110000"}, {"name": "上海市", "adcode": "310000"},
        {"name": "广州市", "adcode": "440100"}, {"name": "深圳市", "adcode": "440300"},
        {"name": "杭州市", "adcode": "330100"}, {"name": "南京市", "adcode": "320100"},
        {"name": "成都市", "adcode": "510100"}, {"name": "重庆市", "adcode": "500000"},
        {"name": "武汉市", "adcode": "420100"}, {"name": "西安市", "adcode": "610100"},
    ]

def get_weather_by_city(city_name):
    """查询城市实时天气（调用高德天气 API）"""
    city = city_name.replace("市", "").strip()
    params = {"city": city, "extensions": "base", "output": "json"}
    success, data = call_amap_api(AMAP_WEATHER_URL, params)
    if success and data.get("lives"):
        live = data["lives"][0]
        return {
            "city": live.get("city", city),
            "weather": live.get("weather", ""),
            "temperature": live.get("temperature", ""),
            "windpower": live.get("windpower", ""),
            "humidity": live.get("humidity", ""),
            "reporttime": live.get("reporttime", "")
        }
    return None


def reverse_geocode(lng, lat):
    """逆地理编码：坐标转城市名"""
    params = {"location": f"{lng},{lat}", "radius": 1000, "output": "json"}
    success, data = call_amap_api(AMAP_REGEO_URL, params)
    if success and data.get("regeocode"):
        ac = data["regeocode"].get("addressComponent", {})
        city = ac.get("city") or ac.get("province", "")
        return city.replace("市", "").strip() if city else None
    return None


def locate_by_ip():
    """IP定位：获取客户端所在城市（无需用户授权）"""
    params = {"output": "json"}
    success, data = call_amap_api(AMAP_IP_URL, params)
    if success and data.get("status") == "1":
        city = data.get("city") or data.get("province", "")
        return city.replace("市", "").strip() if city else None
    return None


def get_weather_forecast(city_name):
    """查询城市3天天气预报（高德 extensions=all）"""
    city = city_name.replace("市", "").strip()
    params = {"city": city, "extensions": "all", "output": "json"}
    success, data = call_amap_api(AMAP_WEATHER_URL, params)
    if not success or not data:
        return None
    forecast = []
    if data.get("forecasts"):
        casts = data["forecasts"][0].get("casts", [])
        today = datetime.now().day
        for c in casts:
            forecast.append({
                "date": c.get("date", ""),
                "dayweather": c.get("dayweather", ""),
                "nightweather": c.get("nightweather", ""),
                "daytemp": c.get("daytemp", ""),
                "nighttemp": c.get("nighttemp", ""),
                "daywind": c.get("daywind", ""),
                "nightwind": c.get("nightwind", ""),
                "daypower": c.get("daypower", ""),
                "nightpower": c.get("nightpower", "")
            })
    return {
        "city": data["forecasts"][0]["city"] if data.get("forecasts") else city,
        "forecast": forecast
    }