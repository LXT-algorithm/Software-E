# TRIP3 · 智能旅游规划平台

AI 驱动的智能旅游规划助手，基于 Flask + JavaScript SPA 架构，集成高德地图和 DeepSeek 大模型，为用户提供个性化的旅行规划、景点搜索、社交协作等一站式服务。

## 功能特性

### 🧠 AI 智能行程规划
- 输入目的地、天数、人数、预算等需求，AI 自动生成完整行程
- 支持**紧凑/休闲/小众**三种风格偏好
- 支持对已有行程进行 AI 智能优化
- DeepSeek API 流式输出，实时展示生成过程

### 🔍 景点搜索
- 关键词 + 城市搜索景点和餐厅
- 查看景点详情、评分、地址等信息
- 集成高德地图导航（PC 端跳转高德地图 APP）

### 🌤 天气与路线
- 查看目的地天气预报
- 获取驾车路线信息（距离、时长、过路费等）

### 👥 好友系统
- 搜索用户名/手机号添加好友
- 好友请求的发送/接收/处理
- 好友间实时聊天
- 未读消息提醒

### 🌐 社区行程
- 将自己的行程分享到社区
- 浏览他人分享的行程攻略
- 按城市筛选、按点赞/时间排序
- 点赞互动

### 📋 历史与收藏
- AI 生成的行程自动保存至历史记录
- 收藏喜欢的行程
- 支持「再用一次」基于原行程重新规划

### 📊 个人统计
- 查看旅行次数、总天数、覆盖城市等数据
- 最近活动时间线

### 🎨 界面特性
- 暗色模式切换
- 响应式设计
- 使用帮助弹窗

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Flask (Python) |
| 前端 | Vanilla JavaScript SPA, Jinja2 模板 |
| 地图服务 | 高德地图 API (Geocoding, POI 搜索, 天气, 导航) |
| AI 模型 | DeepSeek API (流式对话) |
| 数据库 | MySQL (utf8mb4) |
| 图标 | Font Awesome 6 |
| 样式 | 自定义 CSS + Tailwind CSS (仅 CDN) |

## 快速开始

### 前置条件

- Python 3.8+
- MySQL 5.7+
- 高德地图 API Key（[申请地址](https://console.amap.com/)）
- DeepSeek API Key（[申请地址](https://platform.deepseek.com/)）

### 安装步骤

1. **克隆项目**

```bash
git clone <repo-url>
cd TRIP3
```

2. **安装依赖**

```bash
pip install flask flask-cors mysql-connector-python requests python-dotenv deepseek-ai
```

3. **配置环境变量**

创建 `.env` 文件（或直接修改 `config.py`）：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
AMAP_JS_API_KEY=your_amap_js_api_key
AMAP_WEB_API_KEY=your_amap_web_api_key
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=travel_planner
SECRET_KEY=your_secret_key
```

4. **初始化数据库**

MySQL 中创建数据库 `travel_planner`，表结构由 `db.py` 和 `user_system.py` 自动创建。

5. **启动服务**

```bash
python app.py
```

访问 http://localhost:8848

## 项目结构

```
TRIP3/
├── app.py                 # Flask 应用主文件（路由定义）
├── config.py              # 配置项（API Key, 数据库等）
├── db.py                  # 数据库连接和建表
├── deepseek_client.py     # DeepSeek API 客户端（流式调用）
├── user_system.py         # 用户系统（注册/登录/好友/聊天/社区）
├── amap_utils.py          # 高德地图 API 工具函数
├── templates/
│   └── index.html         # 主页面模板（单页应用）
├── static/
│   ├── css/
│   │   └── style.css      # 全局样式
│   └── js/
│       ├── config.js      # 前端全局配置变量
│       ├── utils.js       # UI 工具函数（弹窗、暗色模式等）
│       ├── main.js        # 入口初始化 + 全局事件委托
│       ├── user.js        # 用户登录/注册/个人资料
│       ├── chat.js        # AI 对话（行程规划）
│       ├── map.js         # 高德地图加载
│       ├── scenery.js     # 景点搜索
│       ├── weather.js     # 天气查询
│       ├── travel.js      # 历史行程管理
│       ├── friend.js      # 好友系统 + 聊天
│       ├── community.js   # 社区行程
│       ├── stats.js       # 个人统计
│       └── optimize.js    # 行程优化
└── data/                  # 数据文件
```

## API 概览

### 用户系统
- `POST /api/register` — 注册
- `POST /api/login` — 登录
- `POST /api/guest` — 游客登录
- `POST /api/logout` — 退出
- `GET /api/current_user` — 获取当前用户
- `POST /api/update_profile` — 更新资料
- `POST /api/update_password` — 修改密码
- `POST /api/reset_password` — 重置密码
- `POST /api/upload_avatar` — 上传头像

### AI 行程规划
- `POST /plan_stream` — AI 生成行程（SSE 流式）
- `POST /api/replan` — 重新生成
- `POST /api/optimize_plan` — AI 优化行程

### 行程管理
- `POST /api/save_travel` — 保存行程
- `GET /api/travel/<uuid>` — 获取行程详情
- `DELETE /api/travel/<uuid>` — 删除行程
- `GET /api/get_history` — 获取历史记录
- `POST /api/favorite` — 收藏/取消收藏
- `GET /api/get_favorites` — 获取收藏列表

### 景点 & 天气
- `GET /api/scenery/search` — 搜索景点
- `GET /api/scenery/detail/<id>` — 景点详情
- `GET /api/cities` — 热门城市
- `GET /api/weather` — 天气查询
- `POST /api/route_info` — 路线信息
- `POST /api/rate_poi` — 评价景点

### 好友 & 聊天
- `GET /api/user/search?q=` — 搜索用户
- `POST /api/friend/request` — 发送好友请求
- `POST /api/friend/respond` — 处理请求
- `GET /api/friend/list` — 好友列表
- `GET /api/friend/requests` — 请求列表
- `POST /api/friend/remove` — 删除好友
- `POST /api/chat/send` — 发送消息
- `GET /api/chat/messages?with=&page=` — 聊天记录
- `GET /api/chat/conversations` — 会话列表
- `POST /api/chat/mark_read` — 标记已读

### 社区
- `POST /api/community/toggle_share` — 分享/取消分享
- `GET /api/community/plans` — 社区行程列表
- `GET /api/community/tags` — 社区标签
- `POST /api/community/like` — 点赞
- `GET /api/community/plan/<uuid>` — 社区行程详情
- `GET /api/community/stats` — 社区统计

### 其他
- `GET /api/user/stats` — 个人统计
- `GET /api/status` — 服务状态
- `GET /` — 主页面

## 使用指南

1. **首页** — 查看热门目的地，了解平台功能
2. **旅程规划** — 输入需求（如"北京3日游，2人，预算5000"），AI 自动生成行程
3. **景点搜索** — 按城市和关键词搜索景点、餐厅
4. **历史行程** — 查看和管理 AI 生成的旅行计划
5. **社区** — 浏览和分享旅行攻略
6. **好友** — 添加好友，实时聊天
7. **个人统计** — 查看旅行数据汇总

## 开发说明

- 以 `debug=True` 启动时，模板修改会自动生效
- 若修改模板不生效，请确认 `TEMPLATES_AUTO_RELOAD = True` 已设置
- JS 文件修改需硬刷新浏览器（Ctrl+F5）清除缓存

