"""
巡检任务模块路由 - 任务管理、规则管理、执行巡检
"""
import json
import random
import time
import threading
from flask import Blueprint, request, jsonify
from .database import get_db
from .utils import success, error, rows_to_list, row_to_dict, parse_json_field, now_str, mock_ai_analyze, random_id

task_bp = Blueprint('task', __name__)


# ==================== 规则列表 ====================
@task_bp.route('/rules', methods=['GET'])
def list_rules():
    keyword   = request.args.get('keyword', '')
    page      = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 100))
    offset    = (page - 1) * page_size

    conn = get_db()
    cursor = conn.cursor()

    where = "WHERE 1=1"
    params = []
    if keyword:
        where += " AND name LIKE ?"
        params.append(f"%{keyword}%")

    cursor.execute(f"SELECT COUNT(*) FROM inspection_rule {where}", params)
    total = cursor.fetchone()[0]
    cursor.execute(f"SELECT * FROM inspection_rule {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                   params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(success({"list": rows, "total": total}))


# ==================== 创建规则 ====================
@task_bp.route('/rules', methods=['POST'])
def create_rule():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify(error("规则名称不能为空")), 400

    conn = get_db()
    cursor = conn.cursor()

    # 尝试写入 scene / description 字段（表结构允许时）
    try:
        cursor.execute("""
            INSERT INTO inspection_rule (name, rule_type, threshold, prompt, compare_scope, config, scene, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin')
        """, (
            name,
            data.get('rule_type', 'custom'),
            data.get('threshold', 0.85),
            data.get('prompt', ''),
            data.get('compare_scope', 'all_library'),
            data.get('config', '{}'),
            data.get('scene', ''),
            data.get('description', ''),
        ))
    except Exception:
        cursor.execute("""
            INSERT INTO inspection_rule (name, rule_type, threshold, prompt, compare_scope, config, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'admin')
        """, (
            name,
            data.get('rule_type', 'custom'),
            data.get('threshold', 0.85),
            data.get('prompt', ''),
            data.get('compare_scope', 'all_library'),
            data.get('config', '{}'),
        ))

    rule_id = cursor.lastrowid
    conn.commit()
    cursor.execute("SELECT * FROM inspection_rule WHERE id = ?", (rule_id,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    return jsonify(success(row))


# ==================== 更新规则 ====================
@task_bp.route('/rules/<int:rule_id>', methods=['PUT'])
def update_rule(rule_id):
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()

    # 获取现有数据，只更新传入的字段
    cursor.execute("SELECT * FROM inspection_rule WHERE id=?", (rule_id,))
    existing = row_to_dict(cursor.fetchone())
    if not existing:
        conn.close()
        return jsonify(error("规则不存在", 404)), 404

    try:
        cursor.execute("""
            UPDATE inspection_rule
            SET name=?, rule_type=?, threshold=?, prompt=?, compare_scope=?,
                is_active=?, version=?, scene=?, description=?, config=?
            WHERE id=?
        """, (
            data.get('name',          existing.get('name')),
            data.get('rule_type',     existing.get('rule_type')),
            data.get('threshold',     existing.get('threshold', 0.85)),
            data.get('prompt',        existing.get('prompt', '')),
            data.get('compare_scope', existing.get('compare_scope', 'all_library')),
            1 if data.get('is_active', bool(existing.get('is_active', 1))) else 0,
            data.get('version',       existing.get('version', 1)),
            data.get('scene',         existing.get('scene', '')),
            data.get('description',   existing.get('description', '')),
            data.get('config',        existing.get('config', '{}')),
            rule_id
        ))
    except Exception:
        cursor.execute("""
            UPDATE inspection_rule
            SET name=?, rule_type=?, threshold=?, prompt=?, compare_scope=?, is_active=?, version=?
            WHERE id=?
        """, (
            data.get('name',          existing.get('name')),
            data.get('rule_type',     existing.get('rule_type')),
            data.get('threshold',     existing.get('threshold', 0.85)),
            data.get('prompt',        existing.get('prompt', '')),
            data.get('compare_scope', existing.get('compare_scope', 'all_library')),
            1 if data.get('is_active', bool(existing.get('is_active', 1))) else 0,
            data.get('version',       existing.get('version', 1)),
            rule_id
        ))

    conn.commit()
    cursor.execute("SELECT * FROM inspection_rule WHERE id = ?", (rule_id,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    return jsonify(success(row))


# ==================== 删除规则 ====================
@task_bp.route('/rules/<int:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inspection_rule WHERE id=?", (rule_id,))
    conn.commit()
    conn.close()
    return jsonify(success({"deleted_id": rule_id}))


# ==================== 巡检任务列表 ====================
@task_bp.route('/tasks', methods=['GET'])
def list_tasks():
    keyword = request.args.get('keyword', '')
    status = request.args.get('status', '')
    scene = request.args.get('scene', '')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset = (page - 1) * page_size

    conn = get_db()
    cursor = conn.cursor()

    where_clauses = []
    params = []
    if keyword:
        where_clauses.append("t.name LIKE ?")
        params.append(f"%{keyword}%")
    if status:
        where_clauses.append("t.status = ?")
        params.append(status)
    if scene:
        where_clauses.append("t.scene = ?")
        params.append(scene)

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    cursor.execute(f"SELECT COUNT(*) FROM inspection_task t {where_sql}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT t.*, d.name as dataset_name,
               (SELECT MAX(version) FROM inspection_version WHERE task_id=t.id) as latest_version,
               (SELECT executed_at FROM inspection_version WHERE task_id=t.id ORDER BY version DESC LIMIT 1) as last_executed_at
        FROM inspection_task t
        LEFT JOIN dataset d ON t.dataset_id = d.id
        {where_sql}
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['rule_ids'] = parse_json_field(r.get('rule_ids'))

    return jsonify(success({"list": rows, "total": total, "page": page, "page_size": page_size}))


# ==================== 创建巡检任务 ====================
@task_bp.route('/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify(error("任务名称不能为空")), 400
    # scene 可选，前端不再需要填写，默认 'general'
    scene = data.get('scene', 'general') or 'general'

    # ---- 新版 schedule 对象（向下兼容旧字段）----
    sched = data.get('schedule') or {}
    freq_unit     = sched.get('freq_unit', 'day')        # 'day'|'week'|'month'
    freq_interval = int(sched.get('freq_interval', 1))
    week_days     = sched.get('week_days', [])           # [0..6]
    month_day     = int(sched.get('month_day', 1))
    exec_time     = sched.get('exec_time', '02:00')
    end_mode      = sched.get('end_mode', 'count')       # 'count'|'date'
    end_count     = int(sched.get('end_count', 30))
    end_date      = sched.get('end_date', '')

    # 兼容旧字段（若新对象为空则 fallback）
    if not sched:
        old_days   = data.get('schedule_days', [])
        freq_unit  = 'week' if old_days else 'day'
        week_days  = []   # 旧版用字符串，新版用 index，不做转换
        exec_time  = data.get('schedule_time', '02:00')
        end_count  = int(data.get('schedule_cycles', 30))

    period_map = {'day': 'daily', 'week': 'weekly', 'month': 'monthly'}
    schedule_period  = period_map.get(freq_unit, 'daily')
    schedule_enabled = 1 if data.get('schedule_enabled', False) else 0

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO inspection_task
        (name, scene, dataset_id, preprocess_config, group_field, case_prefix, model, rule_ids,
         schedule_config, schedule_enabled, schedule_period, schedule_cron,
         date_field_name, date_field_offset, field_mapping, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
    """, (
        name,
        scene,
        data.get('dataset_id'),
        json.dumps(data.get('preprocess_config', {})),
        data.get('group_field', ''),
        data.get('case_prefix', 'CASE-'),
        data.get('model', 'mock_model'),
        json.dumps(data.get('rule_ids', [])),
        json.dumps({
            'freq_unit':     freq_unit,
            'freq_interval': freq_interval,
            'week_days':     week_days,
            'month_day':     month_day,
            'exec_time':     exec_time,
            'end_mode':      end_mode,
            'end_count':     end_count,
            'end_date':      end_date,
        }),
        schedule_enabled,
        schedule_period,
        data.get('schedule_cron', ''),
        data.get('date_field_name', ''),
        data.get('date_field_offset', 7),
        json.dumps(data.get('field_mapping', {})),   # v11.0: 字段映射
    ))
    task_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM inspection_task WHERE id = ?", (task_id,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    row['rule_ids'] = parse_json_field(row.get('rule_ids'))
    row['field_mapping'] = parse_json_field(row.get('field_mapping')) or {}
    return jsonify(success(row))


# ==================== 任务详情 ====================
@task_bp.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.*, d.name as dataset_name
        FROM inspection_task t
        LEFT JOIN dataset d ON t.dataset_id = d.id
        WHERE t.id = ?
    """, (task_id,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    if not row:
        return jsonify(error("任务不存在", 404)), 404
    row['rule_ids'] = parse_json_field(row.get('rule_ids'))
    row['field_mapping'] = parse_json_field(row.get('field_mapping')) or {}
    return jsonify(success(row))


# ==================== 手动发起巡检 ====================
@task_bp.route('/tasks/<int:task_id>/execute', methods=['POST'])
def execute_task(task_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM inspection_task WHERE id = ?", (task_id,))
    task = row_to_dict(cursor.fetchone())
    if not task:
        conn.close()
        return jsonify(error("任务不存在", 404)), 404

    # 创建新版本
    cursor.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM inspection_version WHERE task_id = ?", (task_id,))
    next_version = cursor.fetchone()[0]

    cursor.execute("""
        INSERT INTO inspection_version (task_id, version, total_count, badcase_count, badcase_rate, normal_count)
        VALUES (?, ?, 0, 0, 0.0, 0)
    """, (task_id, next_version))
    version_id = cursor.lastrowid

    # 更新任务状态
    cursor.execute("UPDATE inspection_task SET status='running' WHERE id=?", (task_id,))
    conn.commit()
    conn.close()

    # 后台异步执行
    thread = threading.Thread(target=_run_inspection, args=(task_id, version_id, next_version, task))
    thread.daemon = True
    thread.start()

    return jsonify(success({
        "task_id": task_id,
        "version_id": version_id,
        "version": next_version,
        "message": "巡检任务已启动"
    }))


def _run_inspection(task_id, version_id, version_num, task):
    """后台执行巡检（模拟AI分析）"""
    import time

    # 模拟数据量
    total = random.randint(20, 50)
    case_prefix = task.get('case_prefix', 'CASE-')
    group_field_name = task.get('group_field', 'category')
    categories = ["服装", "鞋包", "3C数码", "家居", "美妆"]

    badcase_count = 0
    normal_count = 0

    conn = get_db()
    cursor = conn.cursor()

    # 获取规则
    rule_ids = parse_json_field(task.get('rule_ids')) or []
    rules = []
    if rule_ids:
        placeholders = ','.join(['?' for _ in rule_ids])
        cursor.execute(f"SELECT * FROM inspection_rule WHERE id IN ({placeholders})", rule_ids)
        rules = [row_to_dict(r) for r in cursor.fetchall()]

    try:
        for i in range(total):
            time.sleep(0.05)  # 模拟处理时间

            group_val = random.choice(categories)
            ai_res = mock_ai_analyze({}, [r['name'] for r in rules], threshold=0.75)

            case_id = f"{case_prefix}{version_num:02d}-{i + 1:04d}"
            raw_data = json.dumps({
                "item_id": random.randint(10000, 99999),
                "item_title": f"示例商品_{i + 1}",
                group_field_name: group_val,
                "price": round(random.uniform(10, 500), 2)
            })

            cursor.execute("""
                INSERT INTO inspection_case
                (case_id, version_id, task_id, raw_data, ai_result, ai_confidence, ai_reason, hit_rules, group_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                case_id, version_id, task_id, raw_data,
                ai_res['ai_result'], ai_res['ai_confidence'],
                ai_res['ai_reason'], ai_res['hit_rules'], group_val
            ))

            if ai_res['ai_result'] == 'badcase':
                badcase_count += 1
            else:
                normal_count += 1

        # 更新版本统计
        badcase_rate = round(badcase_count / total * 100, 2) if total > 0 else 0
        cursor.execute("""
            UPDATE inspection_version
            SET total_count=?, badcase_count=?, normal_count=?, badcase_rate=?
            WHERE id=?
        """, (total, badcase_count, normal_count, badcase_rate, version_id))

        # 更新任务状态
        cursor.execute("UPDATE inspection_task SET status='completed' WHERE id=?", (task_id,))

        # 写日志
        cursor.execute("""
            INSERT INTO operation_log (task_id, log_type, operator, content)
            VALUES (?, 'ai', 'system', ?)
        """, (task_id, f"巡检版本v{version_num}执行完成，共{total}条，Badcase {badcase_count}条，Badcase率{badcase_rate}%"))

        conn.commit()
    except Exception as e:
        cursor.execute("UPDATE inspection_task SET status='failed' WHERE id=?", (task_id,))
        conn.commit()
    finally:
        conn.close()


# ==================== 任务进度查询 ====================
@task_bp.route('/tasks/<int:task_id>/progress', methods=['GET'])
def get_progress(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM inspection_task WHERE id=?", (task_id,))
    task = row_to_dict(cursor.fetchone())

    cursor.execute("""
        SELECT v.*, COUNT(c.id) as processed_count
        FROM inspection_version v
        LEFT JOIN inspection_case c ON c.version_id = v.id
        WHERE v.task_id = ?
        ORDER BY v.version DESC LIMIT 1
    """, (task_id,))
    version = row_to_dict(cursor.fetchone())
    conn.close()

    if not task:
        return jsonify(error("任务不存在", 404)), 404

    return jsonify(success({
        "status": task['status'],
        "version": version
    }))


# ==================== 版本列表 ====================
@task_bp.route('/tasks/<int:task_id>/versions', methods=['GET'])
def list_versions(task_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM inspection_version WHERE task_id=? ORDER BY version DESC
    """, (task_id,))
    rows = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(success({"list": rows, "total": len(rows)}))


# ==================== 操作日志 ====================
@task_bp.route('/tasks/<int:task_id>/logs', methods=['GET'])
def get_logs(task_id):
    log_type = request.args.get('log_type', '')
    conn = get_db()
    cursor = conn.cursor()
    if log_type:
        cursor.execute("SELECT * FROM operation_log WHERE task_id=? AND log_type=? ORDER BY created_at DESC", (task_id, log_type))
    else:
        cursor.execute("SELECT * FROM operation_log WHERE task_id=? ORDER BY created_at DESC", (task_id,))
    rows = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(success({"list": rows, "total": len(rows)}))
