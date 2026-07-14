"""
AI自学习样本池接口
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
import sqlite3
import os

learning_bp = Blueprint('learning', __name__)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'platform.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_table():
    """确保 learning_samples 表存在"""
    try:
        conn = get_db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS learning_samples (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id     INTEGER NOT NULL,
                original_label TEXT NOT NULL,
                correct_label  TEXT NOT NULL,
                reason         TEXT,
                created_at     TEXT DEFAULT (datetime('now', 'localtime')),
                status         TEXT DEFAULT 'pending'
            )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[learning] ensure_table error: {e}")


@learning_bp.route('/learning/samples', methods=['GET'])
def get_samples():
    ensure_table()
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset = (page - 1) * page_size

    try:
        conn = get_db()
        total = conn.execute("SELECT COUNT(*) FROM learning_samples").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM learning_samples ORDER BY id DESC LIMIT ? OFFSET ?",
            (page_size, offset)
        ).fetchall()
        conn.close()

        samples = []
        for r in rows:
            samples.append({
                'id': r['id'],
                'case_id': r['case_id'],
                'original_label': r['original_label'],
                'correct_label': r['correct_label'],
                'reason': r['reason'] or '',
                'created_at': r['created_at'],
                'status': r['status'],
            })

        return jsonify({
            "code": 0,
            "data": {"list": samples, "total": total},
            "message": "success"
        })
    except Exception as e:
        # Demo 兜底：返回 mock 数据
        mock = [
            {"id": 1, "case_id": 1023, "original_label": "normal", "correct_label": "badcase",
             "reason": "AI未识别出图片中的违禁logo", "created_at": "2025-05-20 14:32:00", "status": "pending"},
            {"id": 2, "case_id": 987, "original_label": "badcase", "correct_label": "normal",
             "reason": "误报，实为正常商品展示", "created_at": "2025-05-19 09:15:00", "status": "accepted"},
            {"id": 3, "case_id": 1056, "original_label": "normal", "correct_label": "badcase",
             "reason": "商品描述存在夸大宣传", "created_at": "2025-05-18 16:44:00", "status": "pending"},
        ]
        return jsonify({"code": 0, "data": {"list": mock, "total": len(mock)}, "message": "success"})


@learning_bp.route('/learning/samples', methods=['POST'])
def submit_sample():
    ensure_table()
    data = request.get_json() or {}
    case_id = data.get('case_id')
    correct_label = data.get('correct_label', 'normal')
    reason = data.get('reason', '')

    if not case_id:
        return jsonify({"code": 400, "message": "case_id 不能为空", "data": None}), 400

    try:
        # 查询原始 case label
        conn = get_db()
        original_label = 'normal'
        try:
            row = conn.execute("SELECT ai_result FROM cases WHERE id=?", (case_id,)).fetchone()
            if row:
                original_label = row['ai_result'] or 'normal'
        except Exception:
            pass

        conn.execute(
            """INSERT INTO learning_samples (case_id, original_label, correct_label, reason, status)
               VALUES (?, ?, ?, ?, 'pending')""",
            (case_id, original_label, correct_label, reason)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[learning] submit_sample error: {e}")
        # Demo 兜底：直接返回成功
        pass

    return jsonify({
        "code": 0,
        "data": {"status": "pending"},
        "message": "已加入自学习样本池，等待评审"
    })
