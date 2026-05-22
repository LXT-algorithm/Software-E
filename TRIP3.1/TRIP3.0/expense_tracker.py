# expense_tracker.py — 行程费用追踪 + 行李清单持久化
import json
import logging
from datetime import datetime
from db import get_connection
from user_system import get_internal_user_id

logger = logging.getLogger(__name__)

# ==================== 费用追踪 ====================

CATEGORIES = ('交通', '住宿', '餐饮', '门票', '购物', '其他')

def add_expense(uid, plan_uuid, category, amount, description='', expense_date=None):
    """添加一笔费用记录"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return False, '用户不存在'
    if category not in CATEGORIES:
        return False, '无效分类'
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """INSERT INTO trip_expenses (plan_uuid, user_id, category, amount, description, expense_date)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (plan_uuid, user_id, category, amount, description, expense_date)
            )
        conn.commit()
        return True, cursor.lastrowid
    except Exception as e:
        conn.rollback()
        logger.exception("添加费用失败")
        return False, str(e)
    finally:
        conn.close()

def get_expenses(uid, plan_uuid):
    """获取某行程的所有费用记录"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT id, category, amount, description, expense_date, created_at
                   FROM trip_expenses
                   WHERE plan_uuid = %s AND user_id = %s
                   ORDER BY expense_date DESC, id DESC""",
                (plan_uuid, user_id)
            )
            rows = cursor.fetchall()
            expenses = []
            for r in rows:
                expenses.append({
                    'id': r['id'],
                    'category': r['category'],
                    'amount': float(r['amount']),
                    'description': r['description'] or '',
                    'expense_date': r['expense_date'].isoformat() if r['expense_date'] else None,
                    'created_at': r['created_at'].isoformat() if isinstance(r['created_at'], datetime) else str(r['created_at'])
                })
            return expenses
    finally:
        conn.close()

def get_expense_summary(uid, plan_uuid):
    """获取费用分类汇总"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return {}
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT category, COALESCE(SUM(amount), 0) as total
                   FROM trip_expenses
                   WHERE plan_uuid = %s AND user_id = %s
                   GROUP BY category""",
                (plan_uuid, user_id)
            )
            rows = cursor.fetchall()
            summary = {c: 0.0 for c in CATEGORIES}
            total = 0.0
            for r in rows:
                summary[r['category']] = float(r['total'])
                total += float(r['total'])
            return {'categories': summary, 'total': total}
    finally:
        conn.close()

def delete_expense(uid, expense_id):
    """删除一条费用记录"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return False, '用户不存在'
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM trip_expenses WHERE id = %s AND user_id = %s",
                (expense_id, user_id)
            )
            deleted = cursor.rowcount
        conn.commit()
        if deleted:
            return True, '已删除'
        return False, '记录不存在'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()


def get_travel_budget(uid, plan_uuid):
    """获取行程的预算金额"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT budget FROM travel_plans WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user_id)
            )
            row = cursor.fetchone()
            return float(row['budget']) if row and row.get('budget') else None
    finally:
        conn.close()


# ==================== 行李清单持久化 ====================

def save_packing_items(uid, plan_uuid, items):
    """保存行李清单（全量替换）"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return False
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM packing_items WHERE plan_uuid = %s AND user_id = %s",
                (plan_uuid, user_id)
            )
            for i, item in enumerate(items):
                cursor.execute(
                    "INSERT INTO packing_items (plan_uuid, user_id, item_name, is_checked, sort_order) VALUES (%s, %s, %s, %s, %s)",
                    (plan_uuid, user_id, item.get('name', ''), item.get('checked', False), i)
                )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        logger.exception("保存行李清单失败")
        return False
    finally:
        conn.close()

def load_packing_items(uid, plan_uuid):
    """加载行李清单"""
    user_id = get_internal_user_id(uid)
    if not user_id:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT id, item_name, is_checked, sort_order
                   FROM packing_items
                   WHERE plan_uuid = %s AND user_id = %s
                   ORDER BY sort_order ASC, id ASC""",
                (plan_uuid, user_id)
            )
            return [{
                'id': r['id'],
                'name': r['item_name'],
                'checked': bool(r['is_checked'])
            } for r in cursor.fetchall()]
    finally:
        conn.close()
