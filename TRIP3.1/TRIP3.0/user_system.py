# user_system.py
import hashlib
import uuid
import json
import re
import logging
from datetime import datetime
from flask import session
from db import get_connection

from config import PASSWORD_SALT

logger = logging.getLogger(__name__)

# 内存缓存 user_uuid → 内部 user_id 映射，减少重复 DB 查询
_user_id_cache = {}
_MAX_CACHE = 500

def get_internal_user_id(uid):
    """从 user_uuid 获取内部 user_id，优先从缓存或 session 获取。"""
    if not uid or uid.startswith('guest_'):
        return None
    from flask import session as flask_session
    if flask_session.get('user_db_id') and flask_session.get('user_id') == uid:
        return flask_session['user_db_id']
    if uid in _user_id_cache:
        return _user_id_cache[uid]
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            row = cursor.fetchone()
            if row:
                if len(_user_id_cache) < _MAX_CACHE:
                    _user_id_cache[uid] = row['id']
                return row['id']
    finally:
        conn.close()
    return None

def hash_password(pwd):
    """使用盐值加 SHA-256 哈希密码（向后兼容旧的无盐哈希）"""
    return hashlib.sha256((pwd + PASSWORD_SALT).encode()).hexdigest()

def _check_password(pwd, stored_hash):
    """验证密码：支持有盐（新）和无盐（旧）两种格式。返回 (valid, is_old_format)。"""
    # 先检查新格式（有盐）
    salted = hashlib.sha256((pwd + PASSWORD_SALT).encode()).hexdigest()
    if salted == stored_hash:
        return True, False
    # 向后兼容：检查旧格式（无盐）
    unsalted = hashlib.sha256(pwd.encode()).hexdigest()
    return (True, True) if unsalted == stored_hash else (False, False)

def log_action(user_id, action_type, detail=None):
    """记录用户行为（优化项12）"""
    if user_id.startswith('guest_'):
        return
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (user_id,))
            user = cursor.fetchone()
            if user:
                cursor.execute(
                    "INSERT INTO user_actions (user_id, action_type, action_detail) VALUES (%s, %s, %s)",
                    (user['id'], action_type, json.dumps(detail) if detail else None)
                )
        conn.commit()
    except Exception as e:
        logger.exception("log_action 异常")
    finally:
        conn.close()

def handle_register(data):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s OR phone = %s", (data['username'], data['phone']))
            if cursor.fetchone():
                return False, '用户名或手机号已存在'

            user_uuid = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO users (user_uuid, username, phone, password_hash, is_guest) VALUES (%s, %s, %s, %s, %s)",
                (user_uuid, data['username'], data['phone'], hash_password(data['password']), False)
            )
            user_id = cursor.lastrowid

            cursor.execute(
                "INSERT INTO user_preferences (user_id, interest_tags, travel_style, budget) VALUES (%s, %s, %s, %s)",
                (user_id, json.dumps([]), '适中', '中等')
            )
        conn.commit()
        log_action(user_uuid, 'register', {'username': data['username']})
        return True, '注册成功'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def handle_login(data):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, user_uuid, username, phone, avatar_url, password_hash FROM users WHERE username = %s OR phone = %s",
                (data['username'], data['username'])
            )
            user = cursor.fetchone()
            if not user:
                return False, '用户名或密码错误'
            valid, is_old = _check_password(data['password'], user['password_hash'])
            if not valid:
                return False, '用户名或密码错误'

            if is_old:
                # 升级旧格式哈希到有盐格式
                cursor.execute(
                    "UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(data['password']), user['id'])
                )
                conn.commit()

            session['user_id'] = user['user_uuid']
            session["user_db_id"] = user["id"]

            cursor.execute(
                "SELECT interest_tags, travel_style, budget FROM user_preferences WHERE user_id = %s",
                (user['id'],)
            )
            prefs = cursor.fetchone()
            preferences = {
                'interest_tags': json.loads(prefs['interest_tags']) if prefs and prefs['interest_tags'] else [],
                'travel_style': prefs['travel_style'] if prefs else '适中',
                'budget': prefs['budget'] if prefs else '中等'
            }
            log_action(user['user_uuid'], 'login')
            return True, {
                'user_id': user['user_uuid'],
                'username': user['username'],
                'phone': user['phone'],
                'avatar_url': user.get('avatar_url', '') or '',
                'preferences': preferences
            }
    finally:
        conn.close()

def handle_guest():
    guest_id = 'guest_' + str(uuid.uuid4())[:8]
    session['user_id'] = guest_id
    return {'user_id': guest_id, 'username': '游客', 'is_guest': True}

def handle_logout():
    session.pop('user_id', None)

def get_current_user():
    if 'user_id' not in session:
        return None
    uid = session['user_id']
    if uid.startswith('guest_'):
        return {'user_id': uid, 'username': '游客', 'is_guest': True}

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, user_uuid, username, phone, avatar_url FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            if not user:
                return None
            cursor.execute(
                "SELECT interest_tags, travel_style, budget FROM user_preferences WHERE user_id = %s",
                (user['id'],)
            )
            prefs = cursor.fetchone()
            preferences = {
                'interest_tags': json.loads(prefs['interest_tags']) if prefs and prefs['interest_tags'] else [],
                'travel_style': prefs['travel_style'] if prefs else '适中',
                'budget': prefs['budget'] if prefs else '中等'
            }
            return {
                'user_id': user['user_uuid'],
                'username': user['username'],
                'phone': user['phone'],
                'avatar_url': user['avatar_url'] or '',  # 新增
                'preferences': preferences
            }
    finally:
        conn.close()

def handle_update_preferences(uid, data):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, '用户不存在'

            user_id = user_db_id

            cursor.execute("SELECT user_id FROM user_preferences WHERE user_id = %s", (user_id,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO user_preferences (user_id, interest_tags, travel_style, budget) VALUES (%s, %s, %s, %s)",
                    (user_id, json.dumps([]), '适中', '中等')
                )

            updates = []
            params = []
            if 'interest_tags' in data:
                updates.append("interest_tags = %s")
                params.append(json.dumps(data['interest_tags']))
            if 'travel_style' in data:
                updates.append("travel_style = %s")
                params.append(data['travel_style'])
            if 'budget' in data:
                updates.append("budget = %s")
                params.append(data['budget'])

            if updates:
                params.append(user_id)
                cursor.execute(f"UPDATE user_preferences SET {', '.join(updates)} WHERE user_id = %s", params)
        conn.commit()
        return True, None
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def handle_save_travel(uid, title, content, destination=None, days=1, people=1, budget=None, start_date=None):
    logger.info(f"保存行程 用户: %s, 标题: %s", uid, title)
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:

                logger.warning("保存行程 用户不存在")
                return None

            plan_uuid = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO travel_plans (plan_uuid, user_id, title, destination, days, people_count, budget, start_date, content_html)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (plan_uuid, user_db_id, title, destination, days, people, budget, start_date, content)
            )
        conn.commit()
        log_action(uid, 'save_travel', {'title': title, 'plan_uuid': plan_uuid})
        logger.info(f"保存行程成功 plan_uuid: {plan_uuid}")
        return plan_uuid
    except Exception as e:
        conn.rollback()
        logger.error(f"保存行程失败: {e}")
        return None
    finally:
        conn.close()

def get_user_history(uid):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return []
            cursor.execute("""
                SELECT p.plan_uuid as id, p.title, p.created_at, p.is_public,
                       CASE WHEN f.plan_id IS NOT NULL THEN TRUE ELSE FALSE END as is_favorited
                FROM travel_plans p
                LEFT JOIN user_favorites f ON f.plan_id = p.id AND f.user_id = %s
                WHERE p.user_id = %s
                ORDER BY p.created_at DESC
            """, (user_db_id, user_db_id))
            plans = cursor.fetchall()
            for p in plans:
                p['created_at'] = p['created_at'].isoformat() if isinstance(p['created_at'], datetime) else p['created_at']
                p['is_favorited'] = bool(p['is_favorited'])
                p['is_public'] = bool(p['is_public'])
            return plans
    finally:
        conn.close()

def delete_travel_plan(uid, plan_uuid):
    """删除指定行程（需验证所有权）"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, '用户不存在'
            cursor.execute(
                "SELECT id FROM travel_plans WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user_db_id)
            )
            plan = cursor.fetchone()
            if not plan:
                return False, '行程不存在'
            cursor.execute("DELETE FROM travel_plans WHERE id = %s", (plan['id'],))
        conn.commit()
        log_action(uid, 'delete_travel', {'plan_uuid': plan_uuid})
        return True, '已删除'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def reset_password(username, phone, new_password):
    """重置密码（忘记密码流程）：验证用户名+手机号匹配后直接更新密码"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE username = %s AND phone = %s",
                (username, phone)
            )
            user = cursor.fetchone()
            if not user:
                return False, '用户名与手机号不匹配'
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(new_password), user['id'])
            )
        conn.commit()
        return True, '密码已重置，请使用新密码登录'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def update_password(uid, old_password, new_password):
    """修改密码"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, password_hash FROM users WHERE user_uuid = %s",
                (uid,)
            )
            user = cursor.fetchone()
            if not user:
                return False, '用户不存在'
            if not _check_password(old_password, user['password_hash'])[0]:
                return False, '原密码不正确'
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(new_password), user['id'])
            )
        conn.commit()
        return True, '密码已修改'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def toggle_favorite(uid, plan_uuid):
    """切换收藏状态：已收藏则删除，未收藏则添加"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, None
            cursor.execute("SELECT id FROM travel_plans WHERE plan_uuid = %s", (plan_uuid,))
            plan = cursor.fetchone()
            if not plan:
                return False, None

            cursor.execute(
                "SELECT 1 FROM user_favorites WHERE user_id = %s AND plan_id = %s",
                (user_db_id, plan['id'])
            )
            exists = cursor.fetchone() is not None

            if exists:
                cursor.execute(
                    "DELETE FROM user_favorites WHERE user_id = %s AND plan_id = %s",
                    (user_db_id, plan['id'])
                )
                conn.commit()
                log_action(uid, 'remove_favorite', {'plan_uuid': plan_uuid})
                return True, False  # 现在是未收藏
            else:
                cursor.execute(
                    "INSERT IGNORE INTO user_favorites (user_id, plan_id) VALUES (%s, %s)",
                    (user_db_id, plan['id'])
                )
                conn.commit()
                log_action(uid, 'add_favorite', {'plan_uuid': plan_uuid})
                return True, True   # 现在是已收藏
    except Exception as e:
        conn.rollback()
        logger.exception("toggle_favorite 异常")
        return False, None
    finally:
        conn.close()

def get_user_favorites(uid):
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return []
            cursor.execute(
                """SELECT p.plan_uuid as id, p.title, p.created_at
                   FROM travel_plans p
                   JOIN user_favorites f ON p.id = f.plan_id
                   WHERE f.user_id = %s
                   ORDER BY f.created_at DESC""",
                (user_db_id,)
            )
            favs = cursor.fetchall()
            for f in favs:
                f['created_at'] = f['created_at'].isoformat() if isinstance(f['created_at'], datetime) else f['created_at']
            return favs
    finally:
        conn.close()

# ==================== 社区功能 ====================

def toggle_community_share(uid, plan_uuid):
    """切换行程的 is_public 状态。返回 (success, new_state)"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, None
            cursor.execute(
                "SELECT id, is_public FROM travel_plans WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user_db_id)
            )
            plan = cursor.fetchone()
            if not plan:
                return False, None
            new_state = not plan['is_public']
            cursor.execute(
                "UPDATE travel_plans SET is_public = %s WHERE id = %s",
                (new_state, plan['id'])
            )
        conn.commit()
        log_action(uid, 'toggle_share', {'plan_uuid': plan_uuid, 'is_public': new_state})
        return True, new_state
    except Exception as e:
        conn.rollback()
        logger.exception("toggle_share 异常")
        return False, None
    finally:
        conn.close()

def get_community_plans(page=1, per_page=12, city=None, keyword=None, tag=None, sort='hot', uid=None):
    """获取公开行程的分页列表。返回 { plans, total, page, has_more }"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            conditions = ["tp.is_public = TRUE"]
            params = []
            if city:
                conditions.append("tp.destination LIKE %s")
                params.append(f"%{city}%")
            if keyword:
                conditions.append("(tp.title LIKE %s OR tp.content_html LIKE %s)")
                params.append(f"%{keyword}%")
                params.append(f"%{keyword}%")
            if tag:
                conditions.append("tp.tags LIKE %s")
                params.append(f"%{tag}%")

            where_clause = " AND ".join(conditions)

            cursor.execute(
                f"SELECT COUNT(*) as cnt FROM travel_plans tp WHERE {where_clause}",
                params
            )
            total = cursor.fetchone()['cnt']

            order = "tp.like_count DESC, tp.created_at DESC" if sort == 'hot' else "tp.created_at DESC"

            offset = (page - 1) * per_page
            cursor.execute(
                f"""SELECT tp.plan_uuid as id, tp.id as _db_id, tp.title, tp.destination, tp.days,
                           tp.budget, tp.like_count, tp.created_at,
                           u.username, u.avatar_url
                    FROM travel_plans tp
                    JOIN users u ON tp.user_id = u.id
                    WHERE {where_clause}
                    ORDER BY {order}
                    LIMIT %s OFFSET %s""",
                params + [per_page, offset]
            )
            plans = cursor.fetchall()

            # 获取当前用户点赞列表
            liked_set = set()
            if uid and not uid.startswith('guest_'):
                user_db_id = get_internal_user_id(uid)
                if user_db_id:
                    
                    db_ids = [p['_db_id'] for p in plans]
                    if db_ids:
                        placeholders = ','.join(['%s'] * len(db_ids))
                        cursor.execute(
                            f"SELECT plan_id FROM community_likes WHERE user_id = %s AND plan_id IN ({placeholders})",
                            (user_db_id, *db_ids)
                        )
                        for row in cursor.fetchall():
                            liked_set.add(row['plan_id'])

            for p in plans:
                p['created_at'] = p['created_at'].isoformat() if isinstance(p['created_at'], datetime) else p['created_at']
                p['budget'] = float(p['budget']) if p['budget'] else None
                p['is_liked'] = p['_db_id'] in liked_set
                del p['_db_id']

            return {
                'plans': plans,
                'total': total,
                'page': page,
                'has_more': (offset + per_page) < total
            }
    finally:
        conn.close()

def toggle_community_like(uid, plan_uuid):
    """切换点赞状态，更新 like_count 计数器。返回 (success, is_liked, new_count)"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, None, None
            cursor.execute("SELECT id, is_public FROM travel_plans WHERE plan_uuid = %s", (plan_uuid,))
            plan = cursor.fetchone()
            if not plan:
                return False, None, None

            cursor.execute(
                "SELECT 1 FROM community_likes WHERE user_id = %s AND plan_id = %s",
                (user_db_id, plan['id'])
            )
            liked = cursor.fetchone() is not None

            if liked:
                cursor.execute(
                    "DELETE FROM community_likes WHERE user_id = %s AND plan_id = %s",
                    (user_db_id, plan['id'])
                )
                cursor.execute(
                    "UPDATE travel_plans SET like_count = GREATEST(like_count - 1, 0) WHERE id = %s",
                    (plan['id'],)
                )
            else:
                cursor.execute(
                    "INSERT INTO community_likes (user_id, plan_id) VALUES (%s, %s)",
                    (user_db_id, plan['id'])
                )
                cursor.execute(
                    "UPDATE travel_plans SET like_count = like_count + 1 WHERE id = %s",
                    (plan['id'],)
                )

            cursor.execute("SELECT like_count FROM travel_plans WHERE id = %s", (plan['id'],))
            new_count = cursor.fetchone()['like_count']

        conn.commit()
        log_action(uid, 'community_like' if not liked else 'community_unlike',
                   {'plan_uuid': plan_uuid})
        return True, not liked, new_count
    except Exception as e:
        conn.rollback()
        logger.exception("community_like 异常")
        return False, None, None
    finally:
        conn.close()

def get_community_stats():
    """返回社区范围统计信息"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) as cnt FROM travel_plans WHERE is_public = TRUE")
            total_plans = cursor.fetchone()['cnt']
            cursor.execute(
                "SELECT COUNT(DISTINCT user_id) as cnt FROM travel_plans WHERE is_public = TRUE"
            )
            total_users = cursor.fetchone()['cnt']
            cursor.execute("SELECT SUM(like_count) as cnt FROM travel_plans WHERE is_public = TRUE")
            total_likes = cursor.fetchone()['cnt'] or 0
            return {
                'total_plans': total_plans,
                'total_users': total_users,
                'total_likes': total_likes
            }
    finally:
        conn.close()

def get_community_tags():
    """从公开行程中聚合热门目的地标签"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT destination, COUNT(*) as cnt
                FROM travel_plans
                WHERE is_public = TRUE AND destination IS NOT NULL AND destination != ''
                GROUP BY destination
                ORDER BY cnt DESC
                LIMIT 12
            """)
            return [{'name': row['destination'], 'count': row['cnt']} for row in cursor.fetchall()]
    finally:
        conn.close()

# ==================== 好友系统 ====================

def search_users(query, exclude_uid=None):
    """搜索用户（排除当前用户），用于添加好友"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            exclude_id = None
            if exclude_uid and not exclude_uid.startswith('guest_'):
                user_db_id = get_internal_user_id(exclude_uid)
                if user_db_id:
                    
                    exclude_id = user_db_id

            cursor.execute(
                "SELECT id, user_uuid, username, avatar_url FROM users WHERE (username LIKE %s OR phone LIKE %s) AND is_guest = FALSE",
                (f"%{query}%", f"%{query}%")
            )
            users = []
            for row in cursor.fetchall():
                if exclude_id and row['id'] == exclude_id:
                    continue
                users.append({
                    'user_id': row['user_uuid'],
                    'username': row['username'],
                    'avatar_url': row['avatar_url'] or ''
                })
            return users
    finally:
        conn.close()

def send_friend_request(from_uid, to_username):
    """发送好友请求"""
    if from_uid.startswith('guest_'):
        return False, '游客无法发送好友请求'
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (from_uid,))
            from_user = cursor.fetchone()
            if not from_user:
                return False, '用户不存在'

            cursor.execute("SELECT id FROM users WHERE username = %s", (to_username,))
            to_user = cursor.fetchone()
            if not to_user:
                return False, '用户不存在'

            if from_user['id'] == to_user['id']:
                return False, '不能添加自己为好友'

            # 检查是否已是好友
            cursor.execute(
                "SELECT 1 FROM friends WHERE user_id = %s AND friend_id = %s",
                (from_user['id'], to_user['id'])
            )
            if cursor.fetchone():
                return False, '已经是好友'

            # 检查是否已有待处理的请求
            cursor.execute(
                "SELECT status FROM friend_requests WHERE from_user_id = %s AND to_user_id = %s",
                (from_user['id'], to_user['id'])
            )
            existing = cursor.fetchone()
            if existing:
                if existing['status'] == 'pending':
                    return False, '好友请求已发送，请等待对方处理'
                elif existing['status'] == 'accepted':
                    return False, '已经是好友'
                # rejected: 可以重新发送
                cursor.execute(
                    "UPDATE friend_requests SET status = 'pending', updated_at = NOW() WHERE from_user_id = %s AND to_user_id = %s",
                    (from_user['id'], to_user['id'])
                )
                conn.commit()
                log_action(from_uid, 'send_friend_request', {'to_username': to_username})
                return True, '好友请求已发送'

            cursor.execute(
                "INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (%s, %s)",
                (from_user['id'], to_user['id'])
            )
        conn.commit()
        log_action(from_uid, 'send_friend_request', {'to_username': to_username})
        return True, '好友请求已发送'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def respond_friend_request(uid, request_id, accept):
    """接受或拒绝好友请求"""
    if uid.startswith('guest_'):
        return False, '游客无法处理好友请求'
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, '用户不存在'

            cursor.execute(
                "SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE id = %s",
                (request_id,)
            )
            req = cursor.fetchone()
            if not req:
                return False, '请求不存在'
            if req['to_user_id'] != user_db_id:
                return False, '无权操作'
            if req['status'] != 'pending':
                return False, '请求已处理'

            new_status = 'accepted' if accept else 'rejected'
            cursor.execute(
                "UPDATE friend_requests SET status = %s, updated_at = NOW() WHERE id = %s",
                (new_status, request_id)
            )

            if accept:
                # 双向好友关系
                cursor.execute(
                    "INSERT IGNORE INTO friends (user_id, friend_id) VALUES (%s, %s), (%s, %s)",
                    (req['from_user_id'], req['to_user_id'], req['to_user_id'], req['from_user_id'])
                )
        conn.commit()
        action = 'accept_friend' if accept else 'reject_friend'
        log_action(uid, action, {'request_id': request_id})
        return True, '已接受好友请求' if accept else '已拒绝好友请求'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def get_friend_list(uid):
    """获取好友列表"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return []

            cursor.execute("""
                SELECT u.user_uuid, u.username, u.avatar_url
                FROM friends f
                JOIN users u ON f.friend_id = u.id
                WHERE f.user_id = %s
                ORDER BY u.username
            """, (user_db_id,))
            return [{
                'user_id': row['user_uuid'],
                'username': row['username'],
                'avatar_url': row['avatar_url'] or ''
            } for row in cursor.fetchall()]
    finally:
        conn.close()

def get_friend_requests(uid):
    """获取待处理的好友请求（收到的）"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return [], []

            # 收到的请求
            cursor.execute("""
                SELECT fr.id, fr.status, fr.created_at,
                       u.user_uuid, u.username, u.avatar_url
                FROM friend_requests fr
                JOIN users u ON fr.from_user_id = u.id
                WHERE fr.to_user_id = %s AND fr.status = 'pending'
                ORDER BY fr.created_at DESC
            """, (user_db_id,))
            received = [{
                'id': row['id'],
                'status': row['status'],
                'created_at': row['created_at'].isoformat() if isinstance(row['created_at'], datetime) else str(row['created_at']),
                'user': {
                    'user_id': row['user_uuid'],
                    'username': row['username'],
                    'avatar_url': row['avatar_url'] or ''
                }
            } for row in cursor.fetchall()]

            # 发出的请求
            cursor.execute("""
                SELECT fr.id, fr.status, fr.created_at,
                       u.user_uuid, u.username, u.avatar_url
                FROM friend_requests fr
                JOIN users u ON fr.to_user_id = u.id
                WHERE fr.from_user_id = %s
                ORDER BY fr.created_at DESC
            """, (user_db_id,))
            sent = [{
                'id': row['id'],
                'status': row['status'],
                'created_at': row['created_at'].isoformat() if isinstance(row['created_at'], datetime) else str(row['created_at']),
                'user': {
                    'user_id': row['user_uuid'],
                    'username': row['username'],
                    'avatar_url': row['avatar_url'] or ''
                }
            } for row in cursor.fetchall()]

            return received, sent
    finally:
        conn.close()

def remove_friend(uid, friend_uid):
    """删除好友"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return False, '用户不存在'
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (friend_uid,))
            friend = cursor.fetchone()
            if not friend:
                return False, '好友不存在'

            cursor.execute(
                "DELETE FROM friends WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s)",
                (user_db_id, friend['id'], friend['id'], user_db_id)
            )
        conn.commit()
        return True, '已删除好友'
    except Exception as e:
        return False, str(e)
    finally:
        conn.close()


# ==================== 聊天系统 ====================

def send_chat_message(from_uid, to_uid, message):
    """发送聊天消息"""
    if from_uid.startswith('guest_'):
        return False, '游客无法发送消息'
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (from_uid,))
            from_user = cursor.fetchone()
            if not from_user:
                return False, '用户不存在'
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (to_uid,))
            to_user = cursor.fetchone()
            if not to_user:
                return False, '接收方不存在'

            # 检查是否好友
            cursor.execute(
                "SELECT 1 FROM friends WHERE user_id = %s AND friend_id = %s",
                (from_user['id'], to_user['id'])
            )
            if not cursor.fetchone():
                return False, '不是好友关系'

            cursor.execute(
                "INSERT INTO chat_messages (from_user_id, to_user_id, message) VALUES (%s, %s, %s)",
                (from_user['id'], to_user['id'], message)
            )
        conn.commit()
        return True, '消息已发送'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def get_chat_messages(uid, other_uid, page=1, per_page=50):
    """获取与某好友的聊天记录"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return []
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (other_uid,))
            other = cursor.fetchone()
            if not other:
                return []

            offset = (page - 1) * per_page
            cursor.execute("""
                SELECT m.id, m.message, m.is_read, m.created_at,
                       CASE WHEN m.from_user_id = %s THEN %s ELSE %s END as direction
                FROM chat_messages m
                WHERE (m.from_user_id = %s AND m.to_user_id = %s)
                   OR (m.from_user_id = %s AND m.to_user_id = %s)
                ORDER BY m.created_at DESC
                LIMIT %s OFFSET %s
            """, (user_db_id, uid, other_uid,
                  user_db_id, other['id'],
                  other['id'], user_db_id,
                  per_page, offset))

            messages = []
            for row in cursor.fetchall():
                messages.append({
                    'id': row['id'],
                    'message': row['message'],
                    'is_read': bool(row['is_read']),
                    'created_at': row['created_at'].isoformat() if isinstance(row['created_at'], datetime) else str(row['created_at']),
                    'is_me': row['direction'] == uid
                })
            messages.reverse()
            return messages
    finally:
        conn.close()

def mark_messages_read(uid, from_uid):
    """标记与某人的消息为已读"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (uid,))
            user = cursor.fetchone()
            cursor.execute("SELECT id FROM users WHERE user_uuid = %s", (from_uid,))
            from_user = cursor.fetchone()
            if user and from_user:
                cursor.execute(
                    "UPDATE chat_messages SET is_read = TRUE WHERE from_user_id = %s AND to_user_id = %s AND is_read = FALSE",
                    (from_user['id'], user['id'])
                )
                conn.commit()
        return True
    except Exception as e:
        logger.exception("mark_read 异常")
        return False
    finally:
        conn.close()

def get_conversations(uid):
    """获取用户的会话列表"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return []

            cursor.execute("""
                SELECT g.other_id, g.unread_count, m.message as last_message, m.created_at as last_time,
                       u.user_uuid, u.username, u.avatar_url
                FROM (
                    SELECT
                        CASE WHEN cm.from_user_id = %s THEN cm.to_user_id ELSE cm.from_user_id END as other_id,
                        SUM(CASE WHEN cm.to_user_id = %s AND cm.is_read = FALSE THEN 1 ELSE 0 END) as unread_count,
                        MAX(cm.id) as last_msg_id
                    FROM chat_messages cm
                    WHERE cm.from_user_id = %s OR cm.to_user_id = %s
                    GROUP BY other_id
                ) g
                JOIN chat_messages m ON m.id = g.last_msg_id
                JOIN users u ON u.id = g.other_id
                ORDER BY m.created_at DESC
            """, (user_db_id, user_db_id, user_db_id, user_db_id))

            return [{
                'user': {
                    'user_id': row['user_uuid'],
                    'username': row['username'],
                    'avatar_url': row['avatar_url'] or ''
                },
                'last_message': row['last_message'],
                'last_time': row['last_time'].isoformat() if isinstance(row['last_time'], datetime) else str(row['last_time']),
                'unread_count': row['unread_count']
            } for row in cursor.fetchall()]
    finally:
        conn.close()

def get_user_stats(uid):
    """聚合用户的旅行统计数据"""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            user_db_id = get_internal_user_id(uid)
            if not user_db_id:
                
                return None
            user_id = user_db_id

            cursor.execute("""
                SELECT COUNT(*) as total_plans,
                       COALESCE(SUM(days), 0) as total_days,
                       COALESCE(SUM(budget), 0) as total_budget
                FROM travel_plans WHERE user_id = %s
            """, (user_id,))
            summary = cursor.fetchone()
            total_plans = summary['total_plans']
            total_days = summary['total_days']
            total_budget = float(summary['total_budget'])

            cursor.execute(
                "SELECT destination FROM travel_plans WHERE user_id = %s AND destination IS NOT NULL",
                (user_id,)
            )
            dest_rows = cursor.fetchall()
            city_counts = {}
            for row in dest_rows:
                cities = [c.strip() for c in row['destination'].split(',') if c.strip()]
                for c in cities:
                    city_counts[c] = city_counts.get(c, 0) + 1
            cities_visited = sorted(city_counts.keys())
            favorite_cities = sorted(city_counts.items(), key=lambda x: -x[1])[:5]

            cursor.execute("""
                SELECT DATE_FORMAT(created_at, '%%Y-%%m') as month,
                       COUNT(*) as cnt
                FROM travel_plans
                WHERE user_id = %s
                GROUP BY month
                ORDER BY month ASC
            """, (user_id,))
            monthly_trend = cursor.fetchall()

            cursor.execute(
                "SELECT content_html FROM travel_plans WHERE user_id = %s AND budget > 0",
                (user_id,)
            )
            content_rows = cursor.fetchall()
            total_transport = 0
            total_hotel = 0
            total_food = 0
            total_tickets = 0
            total_other = 0
            budget_count = 0
            budget_regex = re.compile(
                r'(交通|住宿|餐饮|门票|购物|其他)\s*[:：]\s*(\d+\.?\d*)\s*元'
            )
            for row in content_rows:
                matches = budget_regex.findall(row['content_html'])
                if matches:
                    budget_count += 1
                    for label, amount in matches:
                        amount = float(amount)
                        if label == '交通':
                            total_transport += amount
                        elif label == '住宿':
                            total_hotel += amount
                        elif label == '餐饮':
                            total_food += amount
                        elif label == '门票':
                            total_tickets += amount
                        else:
                            total_other += amount

            cursor.execute("""
                SELECT action_type, action_detail, created_at
                FROM user_actions
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 20
            """, (user_id,))
            recent_actions = cursor.fetchall()

            return {
                'total_plans': total_plans,
                'total_days': total_days,
                'total_budget': total_budget,
                'cities_visited': cities_visited,
                'cities_count': len(cities_visited),
                'favorite_cities': [{'city': c, 'count': n} for c, n in favorite_cities],
                'monthly_trend': [{'month': r['month'], 'count': r['cnt']} for r in monthly_trend],
                'budget_breakdown': {
                    'transport': total_transport,
                    'hotel': total_hotel,
                    'food': total_food,
                    'tickets': total_tickets,
                    'other': total_other,
                    'total_with_budget': budget_count
                },
                'recent_actions': [{
                    'type': r['action_type'],
                    'detail': json.loads(r['action_detail']) if r['action_detail'] else None,
                    'created_at': r['created_at'].isoformat() if isinstance(r['created_at'], datetime) else str(r['created_at'])
                } for r in recent_actions]
            }
    finally:
        conn.close()