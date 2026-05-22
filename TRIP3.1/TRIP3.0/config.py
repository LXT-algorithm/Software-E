# config.py
import os
from dotenv import load_dotenv

load_dotenv()

# DeepSeek API
# 安全警告：请通过 .env 文件或环境变量设置密钥
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions")

# 高德地图 API
# 安全警告：请通过 .env 文件或环境变量设置密钥
AMAP_JS_API_KEY = os.environ.get("AMAP_JS_API_KEY") or ""
AMAP_WEB_API_KEY = os.environ.get("AMAP_WEB_API_KEY") or ""

# 高德 API 端点
AMAP_IP_URL = "https://restapi.amap.com/v3/ip"
AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
AMAP_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
AMAP_POISEARCH_URL = "https://restapi.amap.com/v3/place/text"
AMAP_POIDETAIL_URL = "https://restapi.amap.com/v3/place/detail"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_DIRECTION_URL = "https://restapi.amap.com/v3/direction/driving"

# MySQL 数据库配置 — 生产环境必须通过环境变量设置
MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", 3306))
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "123456")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "travel_planner")
MYSQL_CHARSET = "utf8mb4"

# Flask 配置 — 生产环境必须修改 SECRET_KEY
SECRET_KEY = os.environ.get("SECRET_KEY", "dev_secret_key_change_in_production")
DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() in ("true", "1", "yes")

# 密码哈希盐值（增强密码安全性）
PASSWORD_SALT = os.environ.get("PASSWORD_SALT", "travel_planner_salt_2025")