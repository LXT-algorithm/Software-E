# sync_attractions.py
import pymysql
import requests
import time
import json
from config import AMAP_WEB_API_KEY, MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE

AMAP_POI_URL = "https://restapi.amap.com/v3/place/text"

# 要采集的城市列表
CITIES = ["北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "重庆", "武汉", "西安"]

# 高德分类代码到本地分类的映射
TYPES_MAP = {
    "110000": "自然风光",
    "110100": "自然风光",
    "140000": "人文古迹",
    "140100": "人文古迹",
    "080000": "博物馆",
    "080100": "博物馆",
    "060000": "公园乐园",
    "060100": "公园乐园",
}

def get_connection():
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER,
        password=MYSQL_PASSWORD, database=MYSQL_DATABASE, charset='utf8mb4'
    )

def fetch_pois(city, page=1, size=25):
    """从高德拉取景点数据"""
    params = {
        "key": AMAP_WEB_API_KEY,
        "keywords": "景点",
        "city": city,
        "types": "110000|140000|080000|060000",
        "offset": size,
        "page": page,
        "extensions": "all",
        "output": "json"
    }
    try:
        resp = requests.get(AMAP_POI_URL, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "1":
                return data.get("pois", [])
    except Exception as e:
        print(f"请求失败: {e}")
    return []

def clean_text(text, max_length=None):
    """清洗文本，截断过长内容，处理 None 值"""
    if text is None:
        return ""
    # 转为字符串并去除首尾空格
    text = str(text).strip()
    # 替换可能影响 SQL 的特殊字符（可选）
    text = text.replace("\x00", "")  # 移除空字符
    if max_length and len(text) > max_length:
        text = text[:max_length]
    return text

def save_poi(conn, poi):
    """保存或更新景点数据"""
    poi_id = poi.get("id")
    if not poi_id:
        print(f"  跳过无ID的POI: {poi.get('name')}")
        return

    loc = poi.get("location", "").split(",")
    lng = float(loc[0]) if len(loc) > 0 and loc[0] else None
    lat = float(loc[1]) if len(loc) > 1 and loc[1] else None

    biz = poi.get("biz_ext", {})
    if isinstance(biz, list):
        biz = {}

    # 确定分类
    poi_type = poi.get("type", "")
    category = "其他"
    for code, name in TYPES_MAP.items():
        if code in poi_type:
            category = name
            break

    name = clean_text(poi.get("name"), 100)
    address = clean_text(poi.get("address"), 255)
    cityname = clean_text(poi.get("cityname"), 50)
    pname = clean_text(poi.get("pname"), 50)
    tel = clean_text(poi.get("tel"), 20)
    tag = clean_text(poi.get("tag"), 200)

    rating = biz.get("rating")
    try:
        rating = float(rating) if rating else None
    except:
        rating = None

    cost = biz.get("cost")
    try:
        cost = float(cost) if cost else None
    except:
        cost = None

    opening_hours = clean_text(biz.get("opening_hours"), 500)
    intro = clean_text(poi.get("description"), 2000)
    photos = None  # 暂时跳过，避免 JSON 复杂处理

    sql = """
    INSERT INTO attractions
    (poi_id, name, address, city, province, lng, lat, tel, tag, rating, cost, opening_hours, intro, photos, category)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        name = VALUES(name), address = VALUES(address), city = VALUES(city), province = VALUES(province),
        lng = VALUES(lng), lat = VALUES(lat), tel = VALUES(tel), tag = VALUES(tag),
        rating = VALUES(rating), cost = VALUES(cost), opening_hours = VALUES(opening_hours),
        intro = VALUES(intro), category = VALUES(category),
        updated_at = CURRENT_TIMESTAMP
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, (
                poi_id, name, address, cityname, pname, lng, lat, tel,
                tag, rating, cost, opening_hours, intro, photos, category
            ))
        conn.commit()
    except Exception as e:
        print(f"  保存失败 [{poi_id} - {name}]: {e}")
        # 可选：打印参数用于调试（注意可能包含敏感信息）
        # print(f"    参数: {(poi_id, name, address, cityname, pname, lng, lat, tel, tag, rating, cost, opening_hours, intro, photos, category)}")

def sync_city(conn, city, max_pages=4):
    """同步单个城市的景点数据"""
    print(f"正在同步 {city} ...")
    page = 1
    total = 0
    while page <= max_pages:
        pois = fetch_pois(city, page, 25)
        if not pois:
            break
        for poi in pois:
            save_poi(conn, poi)
            total += 1
        page += 1
        time.sleep(0.5)
    print(f"{city} 同步完成，共处理 {total} 条记录")

def main():
    conn = get_connection()
    try:
        for city in CITIES:
            sync_city(conn, city)
    finally:
        conn.close()
    print("全部同步完成！")

if __name__ == "__main__":
    main()