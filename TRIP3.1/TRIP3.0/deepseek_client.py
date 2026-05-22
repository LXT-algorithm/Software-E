# deepseek_client.py
import json
import logging
import requests
import concurrent.futures
from config import DEEPSEEK_API_KEY, DEEPSEEK_API_URL
from amap_utils import search_poi

logger = logging.getLogger(__name__)

# 使用Session复用连接，减少握手延迟
session = requests.Session()

CITIES = frozenset([
    "北京","上海","广州","深圳","杭州","南京","苏州","成都","重庆","武汉",
    "西安","长沙","青岛","厦门","天津","郑州","昆明","大理","丽江","三亚"
])

def extract_city_from_message(message):
    for city in CITIES:
        if city in message:
            return city.replace("市", "")
    return None

def enrich_message_with_poi(user_message):
    """并行查询景点和餐厅POI，减少等待时间"""
    city = extract_city_from_message(user_message)
    if not city:
        return user_message
    logger.info(f"POI增强 城市: {city}")

    attractions, restaurants = None, None
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        fut_a = pool.submit(search_poi, city, "景点", "110000", 8)
        fut_r = pool.submit(search_poi, city, "餐厅", "050000", 8)
        # 最多等5秒，超时则跳过POI增强
        try:
            attractions = fut_a.result(timeout=5)
        except Exception as e:
            logger.warning(f"景点查询超时/失败: {e}")
        try:
            restaurants = fut_r.result(timeout=5)
        except Exception as e:
            logger.warning(f"餐厅查询超时/失败: {e}")

    if not attractions and not restaurants:
        return user_message
    poi_info = "\n\n【当地真实POI数据 - 请优先参考以下地点规划行程】\n"
    if attractions:
        poi_info += "\n🌟 热门景点（带坐标）：\n"
        for idx, a in enumerate(attractions, 1):
            poi_info += f"{idx}. {a['name']} | {a['address']} | 坐标:{a['lng']},{a['lat']} | 评分:{a['rating']}\n"
    if restaurants:
        poi_info += "\n🍜 推荐餐厅（带坐标）：\n"
        for idx, r in enumerate(restaurants, 1):
            poi_info += f"{idx}. {r['name']} | {r['address']} | 坐标:{r['lng']},{r['lat']} | 评分:{r['rating']}\n"
    poi_info += "\n请基于以上真实地点生成行程，确保坐标准确。\n"
    return user_message + poi_info

# 精简后的系统提示词（减少token消耗）
SYSTEM_PROMPT = """你是一位旅游行程规划师。根据用户需求生成完整旅行计划HTML。
要求：
1. 直接输出纯HTML，禁止使用任何markdown代码块包裹（包括```html），不要任何额外解释
2. 使用Tailwind CSS和Font Awesome，适配手机
3. 每个景点用 <span class="nav-point" data-name="景点名" data-lng="经度" data-lat="纬度">📍 景点名</span>
4. 包含标题、每日安排、交通餐饮、预算、注意事项
5. 如果提供了POI数据，务必使用真实坐标
6. HTML中如需引入高德地图JS，key写为 GAODE_API_KEY_PLACEHOLDER
7. 预算用格式：📊 预算明细 | 交通:XXXX元 | 住宿:XXXX元 | 餐饮:XXXX元 | 门票:XXXX元
8. 行李清单用：<div class="packing-list"><label><input type="checkbox"> 物品名</label>...</div>
"""

STYLE_PROMPTS = {
    '紧凑': "行程安排紧凑，每天尽可能多的景点。",
    '休闲': "行程安排轻松，每天不超过3个景点。",
    '小众': "优先推荐小众、人少的景点。",
    '标准': ""
}

def _compress_history(history, max_chars=800):
    """压缩对话历史为简短摘要，减少token消耗"""
    if not history:
        return []
    # 只保留最近的2轮对话，并截断内容
    recent = history[-4:]  # 最多4条（2轮）
    compressed = []
    for h in recent:
        content = h.get('content', '')
        if len(content) > max_chars // len(recent):
            content = content[:max_chars // len(recent)] + '...'
        compressed.append({"role": h.get('role', 'user'), "content": content})
    return compressed

def call_deepseek_stream(user_message, style='标准', history=None):
    if not DEEPSEEK_API_KEY:
        yield f"data: {json.dumps({'error': 'DeepSeek API 密钥未配置，请设置 DEEPSEEK_API_KEY 环境变量'})}\n\n"
        yield "data: [DONE]\n\n"
        return
    enhanced = enrich_message_with_poi(user_message)
    system_prompt = SYSTEM_PROMPT + STYLE_PROMPTS.get(style, '')
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    messages = [{"role": "system", "content": system_prompt}]

    # 插入压缩后的对话历史
    compressed = _compress_history(history)
    for h in compressed:
        messages.append({"role": h['role'], "content": h['content']})

    messages.append({"role": "user", "content": enhanced})
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 4096,          # 从8000减到4096，行程足够
        "stream": True
    }
    try:
        resp = session.post(DEEPSEEK_API_URL, headers=headers, json=payload, stream=True, timeout=60)
        # 检查HTTP状态码，非200说明API返回了错误
        if resp.status_code != 200:
            error_body = resp.text
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get('error', {}).get('message', error_body)
            except Exception:
                error_msg = error_body[:200]
            yield f"data: {json.dumps({'error': f'API错误 ({resp.status_code}): {error_msg}'})}\n\n"
            return

        for line in resp.iter_lines(decode_unicode=True):
            if line and line.startswith('data: '):
                data_str = line[6:]
                if data_str.strip() == '[DONE]':
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if delta:
                        yield f"data: {json.dumps({'content': delta})}\n\n"
                except:
                    continue
    except Exception as e:
        logger.error(f"DeepSeek API 调用失败: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


OPTIMIZE_SYSTEM_PROMPT = """你是一位专业的旅游行程优化师。用户将提供一个现有的旅行计划HTML，你需要根据其优化请求对其进行优化。

优化类型：
1. 路线优化（route）—— 重新安排景点顺序，优化路线，减少不必要的路程
2. 节省预算（budget）—— 在不影响核心体验的前提下，替换更经济的交通、住宿方案
3. 增加景点（attractions）—— 在原计划基础上增加更多值得去的景点
4. 亲子友好（family）—— 调整为更适合带孩子出行的安排

要求：
1. 保持原有格式（Tailwind CSS + Font Awesome）
2. 每个景点使用 <span class="nav-point" data-name="景点名" data-lng="经度" data-lat="纬度">📍 景点名</span>
3. 在优化后的HTML开头用 <div class="optimization-summary"> 说明具体做了哪些优化
4. 保持与原计划相同风格的HTML结构
5. 预算部分保持 📊 预算明细 | 交通:XXXX元 | 住宿:XXXX元 | 餐饮:XXXX元 | 门票:XXXX元 格式
"""

OPTIMIZE_TYPE_PROMPTS = {
    'route': '优化目标：优化路线，请重新安排景点访问顺序，使行程路线更加合理高效，减少折返和不必要的交通时间。请给出优化说明。',
    'budget': '优化目标：节省预算，请在保持核心游玩体验的前提下，优化交通方式和住宿选择，降低总花费。请给出具体的省钱建议。',
    'attractions': '优化目标：增加景点，请在原计划基础上补充更多值得一去的景点，丰富行程内容。注意保持行程可行性。',
    'family': '优化目标：亲子友好，请调整行程使其更适合带孩子的家庭出游，考虑孩子的体力和兴趣点，增加适合儿童的互动项目。'
}

def call_deepseek_optimize_stream(plan_html, optimize_type):
    """为优化生成调用 DeepSeek 流式 API"""
    if not DEEPSEEK_API_KEY:
        yield f"data: {json.dumps({'error': 'DeepSeek API 密钥未配置'})}\n\n"
        yield "data: [DONE]\n\n"
        return
    system_prompt = OPTIMIZE_SYSTEM_PROMPT + OPTIMIZE_TYPE_PROMPTS.get(optimize_type, '')
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"请优化以下行程计划：\n\n{plan_html}"}
    ]
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 8000,
        "stream": True
    }
    try:
        resp = session.post(DEEPSEEK_API_URL, headers=headers, json=payload, stream=True, timeout=120)
        if resp.status_code != 200:
            error_body = resp.text
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get('error', {}).get('message', error_body)
            except Exception:
                error_msg = error_body[:200]
            yield f"data: {json.dumps({'error': f'API错误 ({resp.status_code}): {error_msg}'})}\n\n"
            return
        for line in resp.iter_lines(decode_unicode=True):
            if line and line.startswith('data: '):
                data_str = line[6:]
                if data_str.strip() == '[DONE]':
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if delta:
                        yield f"data: {json.dumps({'content': delta})}\n\n"
                except:
                    continue
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"