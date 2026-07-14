"""
巡检结果模块路由 - 结果概览、Case详情、人工反馈
"""
import json
from flask import Blueprint, request, jsonify, send_file
from .database import get_db
from .utils import success, error, rows_to_list, row_to_dict, parse_json_field, now_str

result_bp = Blueprint('result', __name__)


# ==================== 结果概览（看板） ====================
@result_bp.route('/versions/<int:version_id>/overview', methods=['GET'])
def get_overview(version_id):
    conn = get_db()
    cursor = conn.cursor()

    # 版本基础信息
    cursor.execute("SELECT * FROM inspection_version WHERE id=?", (version_id,))
    version = row_to_dict(cursor.fetchone())
    if not version:
        conn.close()
        return jsonify(error("版本不存在", 404)), 404

    task_id = version['task_id']

    # 上一个版本对比
    cursor.execute("""
        SELECT * FROM inspection_version
        WHERE task_id=? AND version < ?
        ORDER BY version DESC LIMIT 1
    """, (task_id, version['version']))
    prev_version = row_to_dict(cursor.fetchone())

    # 分组统计
    group_field = request.args.get('group_field', 'group_value')
    cursor.execute("""
        SELECT group_value,
               COUNT(*) as total,
               SUM(CASE WHEN ai_result='badcase' THEN 1 ELSE 0 END) as badcase_count
        FROM inspection_case
        WHERE version_id=?
        GROUP BY group_value
        ORDER BY badcase_count DESC
    """, (version_id,))
    group_stats = rows_to_list(cursor.fetchall())

    # 获取任务信息（供批次详情页展示）
    cursor.execute("""
        SELECT t.id, t.name, t.scene, t.group_field, t.case_prefix, t.dataset_id, t.rule_ids
        FROM inspection_task t WHERE t.id = ?
    """, (task_id,))
    task = row_to_dict(cursor.fetchone()) or {}
    task['rule_ids'] = parse_json_field(task.get('rule_ids'))

    # 获取已应用的规则详情
    rule_ids = task.get('rule_ids') or []
    applied_rules = []
    if rule_ids:
        placeholders = ','.join('?' * len(rule_ids))
        cursor.execute(f"SELECT id, name, rule_type, threshold FROM inspection_rule WHERE id IN ({placeholders})", rule_ids)
        applied_rules = rows_to_list(cursor.fetchall())

    conn.close()

    # 计算对比数据
    diff = {}
    if prev_version:
        diff = {
            "total_count": version['total_count'] - prev_version['total_count'],
            "badcase_count": version['badcase_count'] - prev_version['badcase_count'],
            "badcase_rate": round(version['badcase_rate'] - prev_version['badcase_rate'], 2),
        }

    return jsonify(success({
        "version": version,
        "task": task,
        "applied_rules": applied_rules,
        "prev_version": prev_version,
        "diff": diff,
        "group_stats": group_stats,
        "metrics": {
            "total_count": version['total_count'],
            "badcase_count": version['badcase_count'],
            "normal_count": version['normal_count'],
            "badcase_rate": version['badcase_rate'],
            "inspection_score": round(100 - version['badcase_rate'], 1)
        }
    }))


# ==================== Case 列表 ====================
@result_bp.route('/versions/<int:version_id>/cases', methods=['GET'])
def list_cases(version_id):
    ai_result = request.args.get('ai_result', '')
    human_result = request.args.get('human_result', '')
    group_value = request.args.get('group_value', '')
    keyword = request.args.get('keyword', '')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset = (page - 1) * page_size

    conn = get_db()
    cursor = conn.cursor()

    where_clauses = ["version_id = ?"]
    params = [version_id]

    if ai_result:
        where_clauses.append("ai_result = ?")
        params.append(ai_result)
    if human_result:
        where_clauses.append("human_result = ?")
        params.append(human_result)
    if group_value:
        where_clauses.append("group_value = ?")
        params.append(group_value)
    if keyword:
        where_clauses.append("(case_id LIKE ? OR ai_reason LIKE ?)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])

    where_sql = "WHERE " + " AND ".join(where_clauses)

    cursor.execute(f"SELECT COUNT(*) FROM inspection_case {where_sql}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT * FROM inspection_case {where_sql}
        ORDER BY created_at ASC LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['raw_data'] = parse_json_field(r.get('raw_data'))
        r['hit_rules'] = parse_json_field(r.get('hit_rules'))

    return jsonify(success({
        "list": rows, "total": total,
        "page": page, "page_size": page_size
    }))


# ==================== Case 详情 ====================
@result_bp.route('/cases/<int:case_id>', methods=['GET'])
def get_case(case_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspection_case WHERE id=?", (case_id,))
    row = row_to_dict(cursor.fetchone())

    if not row:
        conn.close()
        return jsonify(error("Case不存在", 404)), 404

    # 获取操作日志
    cursor.execute("""
        SELECT * FROM operation_log WHERE task_id=? AND content LIKE ?
        ORDER BY created_at DESC LIMIT 10
    """, (row['task_id'], f"%{row['case_id']}%"))
    logs = rows_to_list(cursor.fetchall())
    conn.close()

    row['raw_data'] = parse_json_field(row.get('raw_data'))
    row['hit_rules'] = parse_json_field(row.get('hit_rules'))
    row['logs'] = logs

    return jsonify(success(row))


# ==================== 人工反馈 ====================
@result_bp.route('/cases/<int:case_id>/feedback', methods=['POST'])
def submit_feedback(case_id):
    data = request.get_json()
    human_result = data.get('human_result')  # 'confirmed' or 'rejected'
    human_reason = data.get('human_reason', '')
    in_training = data.get('in_training_set', True)

    if human_result not in ('confirmed', 'rejected'):
        return jsonify(error("human_result 必须为 confirmed 或 rejected")), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspection_case WHERE id=?", (case_id,))
    case = row_to_dict(cursor.fetchone())
    if not case:
        conn.close()
        return jsonify(error("Case不存在", 404)), 404

    cursor.execute("""
        UPDATE inspection_case
        SET human_result=?, human_reason=?, in_training_set=?
        WHERE id=?
    """, (human_result, human_reason, 1 if in_training else 0, case_id))

    # 写操作日志
    action_text = "驳回" if human_result == 'rejected' else "确认"
    cursor.execute("""
        INSERT INTO operation_log (task_id, log_type, operator, content)
        VALUES (?, 'user', 'admin', ?)
    """, (case['task_id'], f"admin {action_text} Case {case['case_id']}，原因：{human_reason or '无'}"))

    conn.commit()

    cursor.execute("SELECT * FROM inspection_case WHERE id=?", (case_id,))
    updated = row_to_dict(cursor.fetchone())
    conn.close()

    updated['raw_data'] = parse_json_field(updated.get('raw_data'))
    updated['hit_rules'] = parse_json_field(updated.get('hit_rules'))

    return jsonify(success(updated))


# ==================== 导出结果 ====================
@result_bp.route('/versions/<int:version_id>/export', methods=['GET'])
def export_results(version_id):
    import csv, io, tempfile, os
    from datetime import datetime

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*, v.version FROM inspection_case c
        JOIN inspection_version v ON c.version_id = v.id
        WHERE c.version_id=?
        ORDER BY c.created_at ASC
    """, (version_id,))
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    # 生成CSV内容
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Case ID', 'AI判定', '置信度', 'AI判定原因', '分组', '人工判定', '人工原因', '是否加入训练集', '时间'])
    for r in rows:
        writer.writerow([
            r['case_id'],
            r['ai_result'],
            r['ai_confidence'],
            r['ai_reason'],
            r['group_value'],
            r.get('human_result', ''),
            r.get('human_reason', ''),
            '是' if r.get('in_training_set') else '否',
            r['created_at']
        ])

    # 写临时文件
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8-sig')
    tmp.write(output.getvalue())
    tmp.close()

    return send_file(
        tmp.name,
        as_attachment=True,
        download_name=f"巡检结果_v{version_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv",
        mimetype='text/csv'
    )


# ==================== 综合结果看板 ====================
@result_bp.route('/result/dashboard', methods=['GET'])
def get_dashboard():
    """综合看板：全平台汇总指标 + 场景对比 + 趋势"""
    days = int(request.args.get('days', 7))
    scene_filter = request.args.get('scene', '')

    conn = get_db()
    cursor = conn.cursor()

    # ── 1. 全平台汇总（所有任务最新版本聚合）
    cursor.execute("""
        SELECT
            COUNT(DISTINCT t.id)                        AS task_count,
            SUM(v.total_count)                          AS total_inspected,
            SUM(v.badcase_count)                        AS total_badcase,
            COUNT(DISTINCT CASE WHEN t.status='running' THEN t.id END) AS active_task_count
        FROM inspection_task t
        JOIN inspection_version v ON v.task_id = t.id
        WHERE v.id = (
            SELECT id FROM inspection_version iv
            WHERE iv.task_id = t.id
            ORDER BY iv.version DESC LIMIT 1
        )
        {}
    """.format("AND t.scene LIKE ?" if scene_filter else ""),
        ([f"%{scene_filter}%"] if scene_filter else []))
    row = cursor.fetchone()
    total_inspected = row[1] or 0
    total_badcase   = row[2] or 0
    task_count      = row[0] or 0
    active_count    = row[3] or 0
    overall_rate    = round(total_badcase / total_inspected * 100, 2) if total_inspected else 0

    # ── 2. 场景对比（按scene分组）
    SCENE_MAP = {
        'product': '相似品识别',
        'search':  '搜索推荐',
        'live':    '直播回评',
    }
    scene_stats = {}
    for scene_key in ['product', 'search', 'live']:
        cursor.execute("""
            SELECT
                COUNT(DISTINCT t.id)  AS task_cnt,
                SUM(v.total_count)    AS total,
                SUM(v.badcase_count)  AS badcase,
                AVG(v.badcase_rate)   AS avg_rate
            FROM inspection_task t
            JOIN inspection_version v ON v.task_id = t.id
            WHERE t.scene = ?
              AND v.id = (
                  SELECT id FROM inspection_version iv
                  WHERE iv.task_id = t.id
                  ORDER BY iv.version DESC LIMIT 1
              )
        """, (scene_key,))
        sr = cursor.fetchone()
        sc_total   = sr[1] or 0
        sc_badcase = sr[2] or 0
        sc_rate    = round(sr[3] or 0, 2)
        sc_score   = round(100 - sc_rate, 1)
        scene_stats[scene_key] = {
            "label":      SCENE_MAP.get(scene_key, scene_key),
            "task_count": sr[0] or 0,
            "total":      sc_total,
            "badcase":    sc_badcase,
            "rate":       sc_rate,
            "score":      sc_score,
        }

    # ── 3. 近 N 天趋势（按 executed_at 日期汇聚）
    cursor.execute(f"""
        SELECT
            DATE(v.executed_at)       AS date,
            SUM(v.total_count)        AS total,
            SUM(v.badcase_count)      AS badcase,
            ROUND(AVG(v.badcase_rate),2) AS avg_rate
        FROM inspection_version v
        JOIN inspection_task t ON t.id = v.task_id
        WHERE v.executed_at >= DATE('now', '-{days} days')
        {"AND t.scene LIKE ?" if scene_filter else ""}
        GROUP BY DATE(v.executed_at)
        ORDER BY date ASC
    """, ([f"%{scene_filter}%"] if scene_filter else []))
    trend_rows = rows_to_list(cursor.fetchall())

    conn.close()

    return jsonify(success({
        "summary": {
            "total_inspected":     total_inspected,
            "total_badcase":       total_badcase,
            "overall_badcase_rate": overall_rate,
            "active_task_count":   active_count,
            "task_count":          task_count,
        },
        "scene_stats": scene_stats,
        "trend": trend_rows,
        "days": days,
    }))


# ==================== 全平台任务汇总列表 ====================
@result_bp.route('/result/task-summary', methods=['GET'])
def get_task_summary():
    """所有任务的最新版本结果汇总（含指标）"""
    scene   = request.args.get('scene', '')
    status  = request.args.get('status', '')
    keyword = request.args.get('keyword', '')
    page    = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset  = (page - 1) * page_size

    conn = get_db()
    cursor = conn.cursor()

    where_clauses = []
    params = []
    if scene:
        where_clauses.append("t.scene = ?")
        params.append(scene)
    if status:
        where_clauses.append("t.status = ?")
        params.append(status)
    if keyword:
        where_clauses.append("t.name LIKE ?")
        params.append(f"%{keyword}%")

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # 计数
    cursor.execute(f"SELECT COUNT(*) FROM inspection_task t {where_sql}", params)
    total = cursor.fetchone()[0]

    # 任务列表 + 最新版本指标
    cursor.execute(f"""
        SELECT
            t.id, t.name, t.scene, t.status, t.schedule_period,
            t.created_at, t.group_field, t.case_prefix,
            v.id          AS version_id,
            v.version     AS version_num,
            v.total_count,
            v.badcase_count,
            v.normal_count,
            v.badcase_rate,
            v.executed_at,
            -- 前一版本数据对比（badcase 数变化）
            pv.badcase_count AS prev_badcase_count
        FROM inspection_task t
        LEFT JOIN inspection_version v ON v.task_id = t.id
            AND v.id = (
                SELECT id FROM inspection_version iv
                WHERE iv.task_id = t.id
                ORDER BY iv.version DESC LIMIT 1
            )
        LEFT JOIN inspection_version pv ON pv.task_id = t.id
            AND pv.id = (
                SELECT id FROM inspection_version iv2
                WHERE iv2.task_id = t.id
                  AND iv2.version < COALESCE(v.version, 9999)
                ORDER BY iv2.version DESC LIMIT 1
            )
        {where_sql}
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    SCENE_LABEL = {
        'product': '相似品识别',
        'search':  '搜索推荐',
        'live':    '直播回评',
    }
    STATUS_LABEL = {
        'pending':   '等待中',
        'running':   '执行中',
        'done':      '已完成',
        'completed': '已完成',
        'failed':    '失败',
    }

    for r in rows:
        r['scene_label']  = SCENE_LABEL.get(r.get('scene', ''), r.get('scene', ''))
        r['status_label'] = STATUS_LABEL.get(r.get('status', ''), r.get('status', ''))
        # 计算 badcase 变化
        curr_bc = r.get('badcase_count') or 0
        prev_bc = r.get('prev_badcase_count')
        r['badcase_delta'] = (curr_bc - prev_bc) if prev_bc is not None else None
        r['inspection_score'] = round(100 - (r.get('badcase_rate') or 0), 1)

    return jsonify(success({
        "list": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }))


# ==================== 当日巡检统计 ====================
@result_bp.route('/result/summary-stats', methods=['GET'])
def get_summary_stats():
    """v4.0 新指标：巡检场景数、进行中任务数、日均任务量、周任务量"""
    conn = get_db()
    cursor = conn.cursor()

    # 1. 巡检场景数（distinct scene in tasks）
    try:
        cursor.execute("SELECT COUNT(DISTINCT scene) FROM inspection_task WHERE scene IS NOT NULL AND scene != ''")
        scene_count = cursor.fetchone()[0] or 0
    except Exception:
        scene_count = 4  # 兜底 mock

    # 2. 正在进行巡检数
    cursor.execute("SELECT COUNT(*) FROM inspection_task WHERE status='running'")
    running_count = cursor.fetchone()[0] or 0

    # 3. 日均任务总量（近30天总量 / 30）
    cursor.execute("""
        SELECT COUNT(*) FROM inspection_version
        WHERE DATE(executed_at, 'localtime') >= DATE('now', '-29 days', 'localtime')
    """)
    monthly_count = cursor.fetchone()[0] or 0
    daily_task_count = round(monthly_count / 30, 1)

    # 4. 近7天任务总量
    cursor.execute("""
        SELECT COUNT(*) FROM inspection_version
        WHERE DATE(executed_at, 'localtime') >= DATE('now', '-6 days', 'localtime')
    """)
    weekly_task_count = cursor.fetchone()[0] or 0

    conn.close()

    # Demo 兜底：数据库为空时使用 mock 数据
    if scene_count == 0 and running_count == 0 and weekly_task_count == 0:
        scene_count      = 4
        running_count    = 2
        daily_task_count = 12.5
        weekly_task_count = 87

    return jsonify(success({
        "scene_count":       scene_count,       # 巡检场景数
        "running_count":     running_count,      # 正在进行巡检数
        "daily_task_count":  daily_task_count,   # 每天巡检任务总量（日均）
        "weekly_task_count": weekly_task_count,  # 每周巡检任务总量
    }))


@result_bp.route('/result/daily-stats', methods=['GET'])
def get_daily_stats():
    """当日巡检统计：总数、进行中、已完成、问题数"""
    conn = get_db()
    cursor = conn.cursor()

    today = "DATE('now', 'localtime')"

    # 当日执行的版本数（以 executed_at 为准）
    cursor.execute(f"""
        SELECT
            COUNT(*)                                     AS total_today,
            SUM(CASE WHEN v.badcase_count > 0 THEN v.badcase_count ELSE 0 END) AS badcase_today,
            SUM(CASE WHEN v.total_count   > 0 THEN v.total_count   ELSE 0 END) AS inspected_today
        FROM inspection_version v
        WHERE DATE(v.executed_at, 'localtime') = {today}
    """)
    row = cursor.fetchone()
    total_today     = row[0] or 0
    badcase_today   = row[1] or 0
    inspected_today = row[2] or 0

    # 正在运行的任务数
    cursor.execute("SELECT COUNT(*) FROM inspection_task WHERE status='running'")
    running_count = cursor.fetchone()[0] or 0

    # 全平台任务总数 & 近7天新建任务数
    cursor.execute("SELECT COUNT(*) FROM inspection_task")
    total_tasks = cursor.fetchone()[0] or 0

    cursor.execute(f"""
        SELECT COUNT(*) FROM inspection_task
        WHERE DATE(created_at, 'localtime') >= DATE('now', '-6 days', 'localtime')
    """)
    week_new_tasks = cursor.fetchone()[0] or 0

    conn.close()

    return jsonify(success({
        "total_today":      total_today,      # 当日执行批次数
        "badcase_today":    badcase_today,     # 当日发现问题总数
        "inspected_today":  inspected_today,   # 当日巡检条数
        "running_count":    running_count,     # 正在执行任务数
        "total_tasks":      total_tasks,       # 全平台任务总数
        "week_new_tasks":   week_new_tasks,    # 近7日新建任务
    }))


# ==================== 管理概览统计 ====================
@result_bp.route('/result/overview-stats', methods=['GET'])
def get_overview_stats():
    """管理层概览看板：累计数据、同环比、趋势、任务健康列表"""
    conn = get_db()
    cursor = conn.cursor()

    # 1. 累计巡检 Case 数
    cursor.execute("SELECT COALESCE(SUM(total_count),0) FROM inspection_version")
    total_cases = cursor.fetchone()[0]

    # 2. 累计 badcase 数
    cursor.execute("SELECT COALESCE(SUM(badcase_count),0) FROM inspection_version")
    total_bad = cursor.fetchone()[0]

    badcase_rate = round(total_bad / total_cases * 100, 1) if total_cases > 0 else 0

    # 3. 巡检覆盖率：有版本记录的任务 / 全部任务
    cursor.execute("SELECT COUNT(DISTINCT task_id) FROM inspection_version")
    inspected_tasks = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM inspection_task")
    all_tasks = cursor.fetchone()[0]
    coverage_rate = round(inspected_tasks / all_tasks * 100, 1) if all_tasks > 0 else 0

    # 4. 平均巡检耗时（Demo：用 total_count 模拟，无真实耗时字段）
    avg_duration = 0.0

    # 5. 进行中任务数
    cursor.execute("SELECT COUNT(*) FROM inspection_task WHERE status='running'")
    running_tasks = cursor.fetchone()[0]

    # 6. 本周新增任务
    cursor.execute("""
        SELECT COUNT(*) FROM inspection_task
        WHERE DATE(created_at,'localtime') >= DATE('now','-6 days','localtime')
    """)
    new_tasks_week = cursor.fetchone()[0]

    # 7. 周环比 badcase 率（本周 vs 上周）
    cursor.execute("""
        SELECT COALESCE(AVG(badcase_rate),0) FROM inspection_version
        WHERE DATE(executed_at,'localtime') >= DATE('now','-6 days','localtime')
    """)
    rate_this_week = cursor.fetchone()[0]
    cursor.execute("""
        SELECT COALESCE(AVG(badcase_rate),0) FROM inspection_version
        WHERE DATE(executed_at,'localtime') >= DATE('now','-13 days','localtime')
          AND DATE(executed_at,'localtime') <  DATE('now','-6 days','localtime')
    """)
    rate_last_week = cursor.fetchone()[0]
    week_compare = round(rate_this_week - rate_last_week, 1)

    # 8. 月同比巡检总量
    cursor.execute("""
        SELECT COALESCE(SUM(total_count),0) FROM inspection_version
        WHERE strftime('%Y-%m', executed_at) = strftime('%Y-%m','now')
    """)
    total_this_month = cursor.fetchone()[0]
    cursor.execute("""
        SELECT COALESCE(SUM(total_count),0) FROM inspection_version
        WHERE strftime('%Y-%m', executed_at) = strftime('%Y-%m','now','-1 month')
    """)
    total_last_month = cursor.fetchone()[0]
    month_compare = round(
        (total_this_month - total_last_month) / max(total_last_month, 1) * 100, 1
    )

    # 9. 近7日每日趋势
    cursor.execute("""
        SELECT
            DATE(executed_at,'localtime') AS day,
            COALESCE(SUM(total_count),0)   AS total,
            COALESCE(SUM(badcase_count),0) AS bad
        FROM inspection_version
        WHERE DATE(executed_at,'localtime') >= DATE('now','-6 days','localtime')
        GROUP BY day
        ORDER BY day
    """)
    daily_trend = [{"date": r[0], "total": r[1], "bad": r[2]} for r in cursor.fetchall()]

    # 补全近7天（无数据的天填0）
    import datetime
    today = datetime.date.today()
    date_map = {d["date"]: d for d in daily_trend}
    daily_trend = []
    for i in range(6, -1, -1):
        d = str(today - datetime.timedelta(days=i))
        daily_trend.append(date_map.get(d, {"date": d, "total": 0, "bad": 0}))

    # 10. 任务健康表（取最新版本）
    cursor.execute("""
        SELECT
            t.id, t.name, t.status,
            v.version AS latest_version,
            v.badcase_rate,
            v.executed_at
        FROM inspection_task t
        LEFT JOIN inspection_version v ON v.id = (
            SELECT id FROM inspection_version
            WHERE task_id = t.id ORDER BY version DESC LIMIT 1
        )
        ORDER BY CASE WHEN v.badcase_rate IS NULL THEN 1 ELSE 0 END, v.badcase_rate DESC
        LIMIT 10
    """)
    task_health = [
        {
            "id":             r[0],
            "name":           r[1],
            "status":         r[2],
            "latest_version": r[3],
            "badcase_rate":   round(r[4], 1) if r[4] is not None else 0,
            "executed_at":    r[5] or '',
        }
        for r in cursor.fetchall()
    ]

    conn.close()

    return jsonify(success({
        "total_cases":    int(total_cases),
        "coverage_rate":  coverage_rate,
        "badcase_rate":   badcase_rate,
        "avg_duration":   avg_duration,
        "running_tasks":  int(running_tasks),
        "new_tasks_week": int(new_tasks_week),
        "week_compare":   week_compare,
        "month_compare":  month_compare,
        "daily_trend":    daily_trend,
        "task_health":    task_health,
    }))


# ==================== 跨批次分组记录列表 ====================
@result_bp.route('/result/group-records', methods=['GET'])
def get_group_records():
    """跨所有批次的分组记录（inspection_case）列表"""
    ai_result = request.args.get('ai_result', '')
    keyword   = request.args.get('keyword', '')
    task_id   = request.args.get('task_id', '')
    page      = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset    = (page - 1) * page_size

    conn = get_db()
    cursor = conn.cursor()

    where_clauses = []
    params = []
    if ai_result:
        where_clauses.append("c.ai_result = ?")
        params.append(ai_result)
    if keyword:
        where_clauses.append("(c.case_id LIKE ? OR c.group_value LIKE ?)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])
    if task_id:
        where_clauses.append("c.task_id = ?")
        params.append(int(task_id))

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    cursor.execute(f"SELECT COUNT(*) FROM inspection_case c {where_sql}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT
            c.id, c.case_id, c.task_id, c.version_id,
            c.ai_result, c.ai_confidence, c.group_value,
            c.human_result, c.created_at,
            t.name AS task_name,
            v.version AS version_num
        FROM inspection_case c
        LEFT JOIN inspection_task t ON t.id = c.task_id
        LEFT JOIN inspection_version v ON v.id = c.version_id
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    RESULT_LABEL = {
        'badcase': '存在问题',
        'normal':  '未发现问题',
    }
    for r in rows:
        r['result_label'] = RESULT_LABEL.get(r.get('ai_result', ''), r.get('ai_result', ''))
        r['batch_id'] = f"b_{r.get('version_id', '')}"

    return jsonify(success({
        "list":      rows,
        "total":     total,
        "page":      page,
        "page_size": page_size,
    }))
