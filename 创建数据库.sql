-- 创建数据库
CREATE DATABASE zhiyouxing_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE zhiyouxing_core;

-- 1. 用户表
CREATE TABLE user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(20) UNIQUE NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    avatar_url VARCHAR(255),
    preferences TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 城市表
CREATE TABLE city (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    province VARCHAR(50) NOT NULL,
    lat DECIMAL(10,7),
    lng DECIMAL(10,7),
    is_hot TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 景点类型表
CREATE TABLE attraction_type (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(20) NOT NULL,
    parent_id INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 景点表
CREATE TABLE attraction (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    city_id INT NOT NULL,
    address VARCHAR(200),
    lat DECIMAL(10,7) NOT NULL,
    lng DECIMAL(10,7) NOT NULL,
    description TEXT,
    cover_image VARCHAR(255),
    images JSON,
    recommend_duration INT,
    ticket_price DECIMAL(10,2),
    open_time VARCHAR(100),
    status TINYINT DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (city_id) REFERENCES city(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 景点-类型关联表
CREATE TABLE attraction_type_map (
    attraction_id BIGINT,
    type_id INT,
    PRIMARY KEY (attraction_id, type_id),
    FOREIGN KEY (attraction_id) REFERENCES attraction(id) ON DELETE CASCADE,
    FOREIGN KEY (type_id) REFERENCES attraction_type(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 行程表
CREATE TABLE itinerary (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    start_date DATE,
    end_date DATE,
    days INT NOT NULL,
    total_budget DECIMAL(10,2),
    cities JSON,
    preferences JSON,
    travel_mode TINYINT DEFAULT 0,
    is_public TINYINT(1) DEFAULT 0,
    status TINYINT DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 每日计划表
CREATE TABLE daily_plan (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    itinerary_id BIGINT NOT NULL,
    day_number INT NOT NULL,
    attractions_order JSON NOT NULL,
    total_duration INT,
    total_transit_time INT,
    total_distance INT,
    hotel_id BIGINT,
    memo TEXT,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (itinerary_id) REFERENCES itinerary(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. 收藏表
CREATE TABLE favorite (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    target_type TINYINT NOT NULL,
    target_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uk_user_target (user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. 反馈表
CREATE TABLE feedback (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    content TEXT NOT NULL,
    contact VARCHAR(100),
    status TINYINT DEFAULT 0,
    created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. 路径缓存表（可选）
CREATE TABLE route_cache (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    origin_lng DECIMAL(10,7) NOT NULL,
    origin_lat DECIMAL(10,7) NOT NULL,
    dest_lng DECIMAL(10,7) NOT NULL,
    dest_lat DECIMAL(10,7) NOT NULL,
    travel_mode TINYINT NOT NULL,
    distance INT,
    duration INT,
    polyline TEXT,
    expired_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_route (origin_lng, origin_lat, dest_lng, dest_lat, travel_mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;