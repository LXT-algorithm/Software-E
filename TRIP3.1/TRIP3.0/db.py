# db.py
import pymysql
from pymysql.cursors import DictCursor
from dbutils.pooled_db import PooledDB
from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_CHARSET

_pool = None

def get_pool():
    global _pool
    if _pool is None:
        _pool = PooledDB(
            creator=pymysql,
            maxconnections=10,
            mincached=2,
            maxcached=8,
            blocking=True,
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE,
            charset=MYSQL_CHARSET,
            cursorclass=DictCursor,
            autocommit=False
        )
    return _pool

def get_connection():
    """从连接池获取数据库连接"""
    return get_pool().connection()

def init_database():
    """初始化数据库和表（如果不存在则创建）"""
    # 先连接不带数据库的 MySQL，创建数据库
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        charset=MYSQL_CHARSET
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()
    finally:
        conn.close()

    # 连接目标数据库，创建表
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            # ========== 用户表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_uuid VARCHAR(36) UNIQUE NOT NULL,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    password_hash VARCHAR(128) NOT NULL,
                    avatar_url VARCHAR(255) DEFAULT NULL,
                    is_guest BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 用户偏好表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id INT PRIMARY KEY,
                    interest_tags JSON,
                    travel_style ENUM('轻松','适中','紧凑') DEFAULT '适中',
                    budget ENUM('经济','中等','舒适') DEFAULT '中等',
                    travel_mode ENUM('自驾','公共交通','步行') DEFAULT '公共交通',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 行程计划表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS travel_plans (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    plan_uuid VARCHAR(36) UNIQUE NOT NULL,
                    user_id INT NOT NULL,
                    title VARCHAR(100) NOT NULL,
                    destination VARCHAR(50),
                    days INT DEFAULT 1,
                    people_count INT DEFAULT 1,
                    budget DECIMAL(10,2),
                    content_html LONGTEXT NOT NULL,
                    is_favorite BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_user_created (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 行程项目明细表（预留） ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS plan_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    plan_id INT NOT NULL,
                    day_number INT NOT NULL,
                    order_in_day INT NOT NULL,
                    poi_name VARCHAR(100) NOT NULL,
                    poi_address VARCHAR(255),
                    poi_lng DECIMAL(10,7),
                    poi_lat DECIMAL(10,7),
                    poi_type VARCHAR(30),
                    stay_duration INT,
                    notes TEXT,
                    FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE,
                    INDEX idx_plan_day (plan_id, day_number)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 用户收藏表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_favorites (
                    user_id INT NOT NULL,
                    plan_id INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, plan_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== POI 缓存表（用于 API 调用缓存） ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS poi_cache (
                    cache_key VARCHAR(255) PRIMARY KEY,
                    data JSON NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 用户行为记录表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_actions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    action_type VARCHAR(50) NOT NULL,
                    action_detail JSON,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 用户景点评分表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_ratings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    poi_id VARCHAR(64) NOT NULL,
                    poi_name VARCHAR(100),
                    rating INT CHECK (rating BETWEEN 1 AND 5),
                    comment TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 景点主表（本地数据库） ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attractions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    poi_id VARCHAR(64) UNIQUE NOT NULL COMMENT '高德POI ID',
                    name VARCHAR(100) NOT NULL COMMENT '景点名称',
                    address VARCHAR(255) COMMENT '详细地址',
                    city VARCHAR(50) COMMENT '所在城市',
                    province VARCHAR(50) COMMENT '所在省份',
                    lng DECIMAL(10,7) COMMENT '经度',
                    lat DECIMAL(10,7) COMMENT '纬度',
                    tel VARCHAR(20) COMMENT '联系电话',
                    website VARCHAR(255) COMMENT '官网',
                    tag VARCHAR(200) COMMENT '标签（分号分隔）',
                    rating DECIMAL(2,1) COMMENT '高德评分',
                    cost DECIMAL(8,2) COMMENT '门票价格',
                    opening_hours VARCHAR(500) COMMENT '开放时间',
                    intro TEXT COMMENT '景点介绍',
                    photos JSON COMMENT '图片URL数组',
                    category ENUM('自然风光','人文古迹','公园乐园','博物馆','宗教场所','其他') DEFAULT '其他',
                    popularity INT DEFAULT 0 COMMENT '热度（搜索次数）',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_city (city),
                    INDEX idx_category (category),
                    INDEX idx_name (name(20))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 景点统计表（扩展数据） ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attraction_stats (
                    attraction_id INT PRIMARY KEY,
                    search_count INT DEFAULT 0 COMMENT '被搜索次数',
                    view_count INT DEFAULT 0 COMMENT '详情查看次数',
                    plan_used_count INT DEFAULT 0 COMMENT '被规划到行程次数',
                    avg_user_rating DECIMAL(2,1) DEFAULT 0 COMMENT '本站用户平均评分',
                    FOREIGN KEY (attraction_id) REFERENCES attractions(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 社区点赞表 ==========
            try:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS community_likes (
                        user_id INT NOT NULL,
                        plan_id INT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, plan_id),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
            except Exception:
                pass

            # ========== 好友请求表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS friend_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    from_user_id INT NOT NULL,
                    to_user_id INT NOT NULL,
                    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE KEY uk_friend_request (from_user_id, to_user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 好友关系表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS friends (
                    user_id INT NOT NULL,
                    friend_id INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, friend_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 聊天消息表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    from_user_id INT NOT NULL,
                    to_user_id INT NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_conv (from_user_id, to_user_id, created_at),
                    INDEX idx_unread (to_user_id, is_read)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== travel_plans 新增列迁移 ==========
            try:
                cursor.execute("ALTER TABLE travel_plans ADD COLUMN is_public BOOLEAN DEFAULT FALSE AFTER budget")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE travel_plans ADD COLUMN like_count INT DEFAULT 0 AFTER is_public")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE travel_plans ADD COLUMN tags VARCHAR(200) DEFAULT NULL AFTER like_count")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE travel_plans ADD COLUMN start_date DATE DEFAULT NULL AFTER tags")
            except Exception:
                pass

            # ========== 行程费用追踪表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS trip_expenses (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    plan_uuid VARCHAR(36) NOT NULL,
                    user_id INT NOT NULL,
                    category VARCHAR(20) NOT NULL COMMENT '交通/住宿/餐饮/门票/购物/其他',
                    amount DECIMAL(10,2) NOT NULL,
                    description VARCHAR(255) DEFAULT '',
                    expense_date DATE DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_plan (plan_uuid, user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # ========== 行李清单表 ==========
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS packing_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    plan_uuid VARCHAR(36) NOT NULL,
                    user_id INT NOT NULL,
                    item_name VARCHAR(100) NOT NULL,
                    is_checked BOOLEAN DEFAULT FALSE,
                    sort_order INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_plan (plan_uuid, user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

        conn.commit()
    finally:
        conn.close()


# 在模块导入时自动初始化数据库（失败不阻塞应用启动）
import logging
_logger = logging.getLogger(__name__)
try:
    init_database()
    _logger.info("数据库初始化完成")
except Exception as e:
    _logger.warning(f"数据库初始化失败: {e}")