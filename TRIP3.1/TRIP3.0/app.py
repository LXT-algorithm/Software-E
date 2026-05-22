# app.py
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, Response, stream_with_context
from flask_cors import CORS
import webbrowser
import threading
from functools import wraps
from config import AMAP_JS_API_KEY, SECRET_KEY, DEBUG
from amap_utils import search_scenery, get_scenery_detail, get_hot_cities, get_route_info, get_weather_by_city, get_weather_forecast, reverse_geocode, locate_by_ip
from user_system import (
    handle_register, handle_login, handle_guest, handle_logout, get_current_user,
    handle_update_preferences, handle_save_travel, get_user_history,
    toggle_favorite, get_user_favorites, log_action,
    delete_travel_plan, update_password, reset_password,
    toggle_community_share, get_community_plans, toggle_community_like,
    get_community_stats, get_community_tags, get_user_stats,
    search_users, send_friend_request, respond_friend_request,
    get_friend_list, get_friend_requests, remove_friend,
    send_chat_message, get_chat_messages, mark_messages_read, get_conversations
)
from deepseek_client import call_deepseek_stream, call_deepseek_optimize_stream
from expense_tracker import (
    add_expense, get_expenses, get_expense_summary, delete_expense,
    get_travel_budget, save_packing_items, load_packing_items
)
from db import get_connection
import os
from werkzeug.utils import secure_filename
from flask import send_from_directory
import uuid

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates')
app.secret_key = SECRET_KEY
app.config['TEMPLATES_AUTO_RELOAD'] = True
CORS(app, supports_credentials=True)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': '请先登录'}), 401
        return f(*args, **kwargs)
    return decorated

# -------------------- 用户 API --------------------
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    success, msg = handle_register(data)
    return jsonify({'success': success, 'message': msg})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    success, result = handle_login(data)
    if success:
        return jsonify({'success': True, 'user': result})
    return jsonify({'success': False, 'message': result})

@app.route('/api/guest', methods=['POST'])
def guest():
    user = handle_guest()
    return jsonify({'success': True, 'user': user})

@app.route('/api/logout', methods=['POST'])
def logout():
    handle_logout()
    return jsonify({'success': True})

@app.route('/api/current_user', methods=['GET'])
def current_user():
    user = get_current_user()
    if user:
        return jsonify({'success': True, 'user': user})
    return jsonify({'success': False, 'user': None})

@app.route('/api/update_preferences', methods=['POST'])
@login_required
def update_preferences():
    uid = session['user_id']
    data = request.get_json()
    success, msg = handle_update_preferences(uid, data)
    return jsonify({'success': success, 'message': msg})

@app.route('/api/save_travel', methods=['POST'])
@login_required
def save_travel():
    uid = session['user_id']
    data = request.get_json()
    plan_uuid = handle_save_travel(
        uid,
        data.get('title', '未命名行程'),
        data.get('content'),
        data.get('destination'),
        data.get('days', 1),
        data.get('people', 1),
        data.get('budget'),
        data.get('start_date')
    )
    if plan_uuid:
        return jsonify({'success': True, 'plan_uuid': plan_uuid})
    return jsonify({'success': False, 'message': '保存失败'})

@app.route('/api/get_history', methods=['GET'])
@login_required
def get_history():
    uid = session['user_id']
    history = get_user_history(uid)
    return jsonify({'success': True, 'history': history})

@app.route('/api/favorite', methods=['POST'])
@login_required
def add_favorite():
    uid = session['user_id']
    data = request.get_json()
    success, is_fav = toggle_favorite(uid, data.get('travel_id'))
    if success:
        return jsonify({'success': True, 'is_favorited': is_fav})
    return jsonify({'success': False, 'message': '操作失败'})

@app.route('/api/get_favorites', methods=['GET'])
@login_required
def get_favorites():
    uid = session['user_id']
    favs = get_user_favorites(uid)
    return jsonify({'success': True, 'favorites': favs})

# -------------------- 景点搜索 API --------------------
@app.route('/api/scenery/search', methods=['GET'])
def api_scenery_search():
    keyword = request.args.get('keyword', '')
    city = request.args.get('city', '')
    page = int(request.args.get('page', 1))
    success, result = search_scenery(city, keyword, page)
    if success:
        return jsonify({
            'success': True,
            'scenery': result['pois'],
            'total': result['total'],
            'page': page,
            'has_more': result['has_more']
        })
    return jsonify({'success': False, 'message': result, 'scenery': []})

@app.route('/api/scenery/detail/<poi_id>', methods=['GET'])
def api_scenery_detail(poi_id):
    detail = get_scenery_detail(poi_id)
    if detail:
        return jsonify({'success': True, 'detail': detail})
    return jsonify({'success': False, 'message': '未找到详情'})

@app.route('/api/cities', methods=['GET'])
def api_cities():
    return jsonify({'success': True, 'cities': get_hot_cities()})

@app.route('/api/status', methods=['GET'])
def api_status():
    from config import DEEPSEEK_API_KEY, AMAP_WEB_API_KEY
    return jsonify({
        'has_deepseek_key': bool(DEEPSEEK_API_KEY),
        'has_amap_key': bool(AMAP_WEB_API_KEY)
    })

# -------------------- 路径规划 API（优化项5） --------------------
@app.route('/api/route_info', methods=['POST'])
def route_info():
    data = request.get_json()
    origin = data.get('origin')
    dest = data.get('dest')
    mode = data.get('mode', 'driving')
    if not origin or not dest:
        return jsonify({'success': False, 'message': '缺少坐标'})
    info = get_route_info(origin[0], origin[1], dest[0], dest[1], mode)
    if info:
        return jsonify({'success': True, 'distance': info['distance'], 'duration': info['duration']})
    return jsonify({'success': False, 'message': '无法获取路径信息'})

# -------------------- 天气查询 API --------------------
@app.route('/api/weather', methods=['GET'])
def api_weather():
    city = request.args.get('city', '')
    if not city:
        return jsonify({'success': False, 'message': '请输入城市'})
    data = get_weather_by_city(city)
    if data:
        return jsonify({'success': True, 'weather': data})
    return jsonify({'success': False, 'message': '无法获取天气信息'})

@app.route('/api/weather/forecast', methods=['GET'])
def api_weather_forecast():
    city = request.args.get('city', '')
    if not city:
        return jsonify({'success': False, 'message': '请输入城市'})
    data = get_weather_forecast(city)
    if data:
        return jsonify({'success': True, 'forecast': data})
    return jsonify({'success': False, 'message': '无法获取天气预报信息'})

@app.route('/api/geocode/reverse', methods=['GET'])
def api_reverse_geocode():
    lng = request.args.get('lng')
    lat = request.args.get('lat')
    if not lng or not lat:
        return jsonify({'success': False, 'message': '缺少坐标'})
    try:
        city = reverse_geocode(float(lng), float(lat))
        if city:
            return jsonify({'success': True, 'city': city})
        return jsonify({'success': False, 'message': '无法识别位置'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/geocode/ip', methods=['GET'])
def api_locate_by_ip():
    """IP定位，无需用户授权"""
    city = locate_by_ip()
    if city:
        return jsonify({'success': True, 'city': city})
    return jsonify({'success': False, 'message': '无法通过IP定位'})


# -------------------- 行程分享 API（无需登录） --------------------
@app.route('/api/share/<plan_uuid>', methods=['GET'])
def api_share_travel(plan_uuid):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT title, content_html, created_at FROM travel_plans WHERE plan_uuid = %s",
                (plan_uuid,)
            )
            plan = cursor.fetchone()
            if not plan:
                return jsonify({'success': False, 'message': '行程不存在'}), 404
            return jsonify({
                'success': True,
                'title': plan['title'],
                'content': plan['content_html'],
                'created_at': plan['created_at'].isoformat() if plan['created_at'] else None
            })
    finally:
        conn.close()

# -------------------- 流式生成 API（支持风格） --------------------
@app.route('/plan_stream', methods=['POST'])
def plan_stream():
    data = request.get_json()
    msg = data.get('message', '')
    style = data.get('style', '标准')
    history = data.get('history', [])
    if not msg:
        return jsonify({'error': '请输入需求'})

    # 记录搜索行为
    if 'user_id' in session:
        log_action(session['user_id'], 'generate_plan', {'message': msg, 'style': style})

    def generate():
        for chunk in call_deepseek_stream(msg, style, history):
            yield chunk
        yield "data: [DONE]\n\n"
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )

# -------------------- 重新规划 API（优化项1） --------------------
@app.route('/api/replan', methods=['POST'])
@login_required
def replan():
    data = request.get_json()
    attractions = data.get('attractions', [])
    days = data.get('days', 3)
    style = data.get('style', '标准')
    
    if not attractions:
        return jsonify({'success': False, 'message': '至少保留一个景点'})
    
    prompt = f"请根据以下景点重新规划{days}日游行程：\n"
    for a in attractions:
        prompt += f"- {a['name']} (坐标:{a['lng']},{a['lat']})\n"
    
    log_action(session['user_id'], 'replan', {'attractions_count': len(attractions)})
    
    def generate():
        for chunk in call_deepseek_stream(prompt, style):
            yield chunk
        yield "data: [DONE]\n\n"
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream'
    )

# -------------------- 行程详情 API（优化项3） --------------------
@app.route('/api/travel/<plan_uuid>', methods=['GET'])
@login_required
def get_travel_detail(plan_uuid):
    uid = session['user_id']
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'success': False, 'message': '用户不存在'}), 404

            cursor.execute(
                "SELECT title, content_html, created_at FROM travel_plans WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user['id'])
            )
            plan = cursor.fetchone()
            if not plan:
                return jsonify({'success': False, 'message': '行程不存在'}), 404

            return jsonify({
                'success': True,
                'title': plan['title'],
                'content': plan['content_html'],
                'created_at': plan['created_at'].isoformat() if plan['created_at'] else None
            })
    finally:
        conn.close()

# -------------------- 景点评分 API（优化项13） --------------------
@app.route('/api/rate_poi', methods=['POST'])
@login_required
def rate_poi():
    uid = session['user_id']
    data = request.get_json()
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'success': False, 'message': '用户不存在'})
            cursor.execute(
                "INSERT INTO user_ratings (user_id, poi_id, poi_name, rating, comment) VALUES (%s, %s, %s, %s, %s)",
                (user['id'], data['poi_id'], data['poi_name'], data['rating'], data['comment'])
            )
        conn.commit()
        log_action(uid, 'rate_poi', {'poi_id': data['poi_id'], 'rating': data['rating']})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

# -------------------- 删除行程 API --------------------
@app.route('/api/travel/<plan_uuid>', methods=['DELETE'])
@login_required
def api_delete_travel(plan_uuid):
    success, msg = delete_travel_plan(session['user_id'], plan_uuid)
    return jsonify({'success': success, 'message': msg})

# -------------------- 修改密码 API --------------------
@app.route('/api/update_password', methods=['POST'])
@login_required
def api_update_password():
    data = request.get_json()
    success, msg = update_password(session['user_id'], data.get('old_password', ''), data.get('new_password', ''))
    return jsonify({'success': success, 'message': msg})

# -------------------- 重置密码 API（无需登录） --------------------
@app.route('/api/reset_password', methods=['POST'])
def api_reset_password():
    data = request.get_json()
    username = data.get('username', '')
    phone = data.get('phone', '')
    new_password = data.get('new_password', '')
    if not username or not phone or not new_password:
        return jsonify({'success': False, 'message': '请填写完整'})
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': '密码至少6位'})
    success, msg = reset_password(username, phone, new_password)
    return jsonify({'success': success, 'message': msg})

# -------------------- 更新个人资料 API --------------------
@app.route('/api/update_profile', methods=['POST'])
@login_required
def api_update_profile():
    uid = session['user_id']
    data = request.get_json()
    username = data.get('username', '').strip()
    phone = data.get('phone', '').strip()
    if not username or not phone:
        return jsonify({'success': False, 'message': '请填写完整'})
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE user_uuid = %s", (uid,)
            )
            user = cursor.fetchone()
            if not user:
                return jsonify({'success': False, 'message': '用户不存在'})
            # 检查用户名/手机号是否被其他用户占用
            cursor.execute(
                "SELECT id FROM users WHERE (username = %s OR phone = %s) AND id != %s",
                (username, phone, user['id'])
            )
            if cursor.fetchone():
                return jsonify({'success': False, 'message': '用户名或手机号已被使用'})
            cursor.execute(
                "UPDATE users SET username = %s, phone = %s WHERE id = %s",
                (username, phone, user['id'])
            )
        conn.commit()
        return jsonify({'success': True, 'message': '资料已更新', 'username': username, 'phone': phone})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

# -------------------- 社区功能 API --------------------
@app.route('/api/community/toggle_share', methods=['POST'])
@login_required
def api_toggle_share():
    uid = session['user_id']
    data = request.get_json()
    success, new_state = toggle_community_share(uid, data.get('plan_uuid', ''))
    if success:
        return jsonify({'success': True, 'is_public': new_state})
    return jsonify({'success': False, 'message': '操作失败'})

@app.route('/api/community/plans', methods=['GET'])
def api_community_plans():
    page = int(request.args.get('page', 1))
    city = request.args.get('city', '')
    keyword = request.args.get('keyword', '')
    tag = request.args.get('tag', '')
    sort = request.args.get('sort', 'hot')
    per_page = int(request.args.get('per_page', 12))
    uid = session.get('user_id')
    result = get_community_plans(page, per_page, city, keyword, tag, sort, uid)
    return jsonify({'success': True, **result})

@app.route('/api/community/tags', methods=['GET'])
def api_community_tags():
    return jsonify({'success': True, 'tags': get_community_tags()})

@app.route('/api/community/like', methods=['POST'])
@login_required
def api_community_like():
    uid = session['user_id']
    data = request.get_json()
    success, new_state, new_count = toggle_community_like(uid, data.get('plan_uuid', ''))
    if success:
        return jsonify({'success': True, 'is_liked': new_state, 'like_count': new_count})
    return jsonify({'success': False, 'message': '操作失败'})

@app.route('/api/community/stats', methods=['GET'])
def api_community_stats():
    return jsonify({'success': True, 'stats': get_community_stats()})

@app.route('/api/community/plan/<plan_uuid>', methods=['GET'])
def api_community_plan_detail(plan_uuid):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT tp.title, tp.content_html, tp.destination, tp.days,
                       tp.budget, tp.like_count, tp.created_at,
                       u.username
                FROM travel_plans tp
                JOIN users u ON tp.user_id = u.id
                WHERE tp.plan_uuid = %s AND tp.is_public = TRUE
            """, (plan_uuid,))
            plan = cursor.fetchone()
            if not plan:
                return jsonify({'success': False, 'message': '行程不存在或未公开'}), 404
            return jsonify({
                'success': True,
                'title': plan['title'],
                'content': plan['content_html'],
                'destination': plan['destination'],
                'days': plan['days'],
                'budget': float(plan['budget']) if plan['budget'] else None,
                'like_count': plan['like_count'],
                'created_at': plan['created_at'].isoformat() if isinstance(plan['created_at'], datetime) else None,
                'author': plan['username']
            })
    finally:
        conn.close()

# -------------------- 个人统计 API --------------------
@app.route('/api/user/stats', methods=['GET'])
@login_required
def api_user_stats():
    uid = session['user_id']
    stats = get_user_stats(uid)
    if stats:
        return jsonify({'success': True, 'stats': stats})
    return jsonify({'success': False, 'message': '无法加载统计信息'})


# ==================== 好友系统 API ====================

@app.route('/api/user/search', methods=['GET'])
@login_required
def api_user_search():
    query = request.args.get('q', '').strip()
    if not query or len(query) < 1:
        return jsonify({'success': True, 'users': []})
    users = search_users(query, session['user_id'])
    return jsonify({'success': True, 'users': users})

@app.route('/api/friend/request', methods=['POST'])
@login_required
def api_friend_request():
    data = request.get_json()
    success, msg = send_friend_request(session['user_id'], data.get('username', ''))
    return jsonify({'success': success, 'message': msg})

@app.route('/api/friend/respond', methods=['POST'])
@login_required
def api_friend_respond():
    data = request.get_json()
    success, msg = respond_friend_request(session['user_id'], data.get('request_id'), data.get('accept', True))
    return jsonify({'success': success, 'message': msg})

@app.route('/api/friend/list', methods=['GET'])
@login_required
def api_friend_list():
    friends = get_friend_list(session['user_id'])
    return jsonify({'success': True, 'friends': friends})

@app.route('/api/friend/requests', methods=['GET'])
@login_required
def api_friend_requests():
    received, sent = get_friend_requests(session['user_id'])
    return jsonify({'success': True, 'received': received, 'sent': sent})

@app.route('/api/friend/remove', methods=['POST'])
@login_required
def api_friend_remove():
    data = request.get_json()
    success, msg = remove_friend(session['user_id'], data.get('friend_uid', ''))
    return jsonify({'success': success, 'message': msg})

# ==================== 聊天系统 API ====================

@app.route('/api/chat/send', methods=['POST'])
@login_required
def api_chat_send():
    data = request.get_json()
    success, msg = send_chat_message(session['user_id'], data.get('to_uid', ''), data.get('message', ''))
    return jsonify({'success': success, 'message': msg})

@app.route('/api/chat/messages', methods=['GET'])
@login_required
def api_chat_messages():
    with_uid = request.args.get('with', '')
    page = int(request.args.get('page', 1))
    messages = get_chat_messages(session['user_id'], with_uid, page)
    return jsonify({'success': True, 'messages': messages})

@app.route('/api/chat/mark_read', methods=['POST'])
@login_required
def api_chat_mark_read():
    data = request.get_json()
    mark_messages_read(session['user_id'], data.get('from_uid', ''))
    return jsonify({'success': True})

@app.route('/api/chat/conversations', methods=['GET'])
@login_required
def api_chat_conversations():
    convs = get_conversations(session['user_id'])
    return jsonify({'success': True, 'conversations': convs})

# ==================== 费用追踪 API ====================

@app.route('/api/expense/add', methods=['POST'])
@login_required
def api_expense_add():
    uid = session['user_id']
    data = request.get_json()
    success, result = add_expense(
        uid, data.get('plan_uuid', ''),
        data.get('category', ''),
        data.get('amount', 0),
        data.get('description', ''),
        data.get('expense_date')
    )
    if success:
        return jsonify({'success': True, 'expense_id': result})
    return jsonify({'success': False, 'message': result})

@app.route('/api/expense/list', methods=['GET'])
@login_required
def api_expense_list():
    uid = session['user_id']
    plan_uuid = request.args.get('plan_uuid', '')
    if not plan_uuid:
        return jsonify({'success': False, 'message': '缺少plan_uuid'})
    expenses = get_expenses(uid, plan_uuid)
    summary = get_expense_summary(uid, plan_uuid)
    budget = get_travel_budget(uid, plan_uuid)
    return jsonify({'success': True, 'expenses': expenses, 'summary': summary, 'budget': budget})

@app.route('/api/expense/delete/<int:expense_id>', methods=['DELETE'])
@login_required
def api_expense_delete(expense_id):
    uid = session['user_id']
    success, msg = delete_expense(uid, expense_id)
    return jsonify({'success': success, 'message': msg})

# ==================== 行李清单 API ====================

@app.route('/api/packing/save', methods=['POST'])
@login_required
def api_packing_save():
    uid = session['user_id']
    data = request.get_json()
    success = save_packing_items(uid, data.get('plan_uuid', ''), data.get('items', []))
    return jsonify({'success': success})

@app.route('/api/packing/load', methods=['GET'])
@login_required
def api_packing_load():
    uid = session['user_id']
    plan_uuid = request.args.get('plan_uuid', '')
    if not plan_uuid:
        return jsonify({'success': False, 'message': '缺少plan_uuid'})
    items = load_packing_items(uid, plan_uuid)
    return jsonify({'success': True, 'items': items})

# ==================== 未来行程倒计时 API ====================

@app.route('/api/upcoming_trips', methods=['GET'])
@login_required
def api_upcoming_trips():
    uid = session['user_id']
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'success': False, 'trips': []})
            cursor.execute("""
                SELECT plan_uuid, title, destination, start_date, days
                FROM travel_plans
                WHERE user_id = %s AND start_date IS NOT NULL AND start_date >= CURDATE()
                ORDER BY start_date ASC
                LIMIT 3
            """, (user['id'],))
            rows = cursor.fetchall()
            trips = []
            for r in rows:
                trips.append({
                    'plan_uuid': r['plan_uuid'],
                    'title': r['title'],
                    'destination': r['destination'] or '',
                    'start_date': r['start_date'].isoformat() if r['start_date'] else None,
                    'days': r['days']
                })
            return jsonify({'success': True, 'trips': trips})
    finally:
        conn.close()

# -------------------- AI 优化 API --------------------
@app.route('/api/optimize_plan', methods=['POST'])
@login_required
def api_optimize_plan():
    data = request.get_json()
    plan_uuid = data.get('plan_uuid', '')
    optimize_type = data.get('optimize_type', 'route')

    if optimize_type not in ('route', 'budget', 'attractions', 'family'):
        return jsonify({'success': False, 'message': '无效的优化类型'}), 400

    uid = session['user_id']
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'success': False, 'message': '用户不存在'}), 404
            cursor.execute(
                "SELECT title, content_html FROM travel_plans WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user['id'])
            )
            plan = cursor.fetchone()
            if not plan:
                return jsonify({'success': False, 'message': '行程不存在'}), 404
            plan_html = plan['content_html']
    finally:
        conn.close()

    log_action(uid, 'optimize_plan', {'plan_uuid': plan_uuid, 'optimize_type': optimize_type})

    def generate():
        yield f"data: {json.dumps({'meta': {'title': plan['title'], 'plan_uuid': plan_uuid, 'type': optimize_type}})}\n\n"
        for chunk in call_deepseek_optimize_stream(plan_html, optimize_type):
            yield chunk
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )

# -------------------- 前端页面 --------------------
@app.route('/')
def index():
    return render_template('index.html', js_api_key=AMAP_JS_API_KEY)

UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 确保上传目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/upload_avatar', methods=['POST'])
@login_required
def upload_avatar():
    """上传用户头像"""
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': '没有文件'}), 400
    
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'success': False, 'message': '文件名为空'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': '只支持 png, jpg, jpeg, gif'}), 400
    
    # 生成唯一文件名
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{session['user_id']}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    # 更新数据库中的 avatar_url
    avatar_url = f"/static/uploads/{filename}"
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (session['user_id'],))
            user = cursor.fetchone()
            if user:
                cursor.execute("UPDATE users SET avatar_url = %s WHERE id = %s", (avatar_url, user['id']))
                conn.commit()
                return jsonify({'success': True, 'avatar_url': avatar_url})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        conn.close()
    
    return jsonify({'success': False, 'message': '用户不存在'}), 404

# 用于访问上传的文件（可选，Flask 默认 static 可访问）
# -------------------- 启动 --------------------
def main():
    logger.info("=" * 60)
    logger.info("途灵 - 智能旅游规划助手")
    logger.info("=" * 60)
    logger.info("[服务启动] http://localhost:8848")
    threading.Timer(1.5, lambda: webbrowser.open("http://localhost:8848")).start()
    app.run(host='0.0.0.0', port=8848, debug=DEBUG)

if __name__ == "__main__":
    main()