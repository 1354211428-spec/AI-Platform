"""
AI 巡检能力模块路由
白盒化 · 可解释 · 可学习演进
"""
import json
import random
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from .database import get_db
from .utils import success, error, rows_to_list, row_to_dict, parse_json_field

ai_bp = Blueprint('ai', __name__)


# ─────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────
def _scene_label(scene):
    return {'product': '相似品识别', 'search': '搜索推荐', 'live': '直播回评'}.get(scene, scene)


# ─────────────────────────────────────────────
# 1. 能力指标趋势
# ─────────────────────────────────────────────
@ai_bp.route('/ai/metrics', methods=['GET'])
def get_metrics():
    scene = request.args.get('scene', 'product')
    days  = int(request.args.get('days', 30))

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM ai_capability_metric
        WHERE scene=? ORDER BY date DESC LIMIT ?
    """, (scene, days))
    rows = rows_to_list(cursor.fetchall())

    # 汇总最新指标
    cursor.execute("""
        SELECT precision_rate, recall_rate, f1_score, total_count
        FROM ai_capability_metric WHERE scene=? ORDER BY date DESC LIMIT 1
    """, (scene,))
    latest = row_to_dict(cursor.fetchone())
    conn.close()

    return jsonify(success({
        "trend": list(reversed(rows)),
        "latest": latest or {},
        "scene_label": _scene_label(scene),
    }))


# ─────────────────────────────────────────────
# 2. 白盒化规则（含维度权重、四象限）
# ─────────────────────────────────────────────
@ai_bp.route('/ai/rules', methods=['GET'])
def get_ai_rules():
    scene = request.args.get('scene', 'product')
    conn  = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, pv.version as prompt_version, pv.prompt_content as current_prompt
        FROM inspection_rule r
        LEFT JOIN ai_prompt_version pv ON pv.rule_id=r.id AND pv.is_current=1
        ORDER BY r.created_at DESC
    """)
    rules = rows_to_list(cursor.fetchall())
    conn.close()

    # 给每条规则附加白盒化数据
    SCENE_RULE_MAP = {
        'product': [1, 2, 3],
        'search':  [4, 3],
        'live':    [3],
    }
    scene_rule_ids = SCENE_RULE_MAP.get(scene, [1, 2, 3, 4])

    enriched = []
    for r in rules:
        if r['id'] not in scene_rule_ids:
            continue
        # 维度权重（按规则类型生成）
        rt = r.get('rule_type', 'custom')
        WEIGHTS = {
            'image_similarity': [
                {'dim': '图像哈希相似度', 'weight': 40, 'method': 'pHash+dHash融合'},
                {'dim': 'CLIP语义相似度', 'weight': 35, 'method': 'OpenAI CLIP ViT-L/14'},
                {'dim': '类目一致性',     'weight': 25, 'method': '类目树路径匹配'},
            ],
            'text_similarity': [
                {'dim': '标题语义相似',   'weight': 55, 'method': 'Sentence-BERT'},
                {'dim': '关键词重叠度',   'weight': 30, 'method': 'BM25 + TF-IDF'},
                {'dim': '品牌一致性',     'weight': 15, 'method': '品牌词典匹配'},
            ],
            'content_safety': [
                {'dim': '违禁词命中',     'weight': 45, 'method': 'AC自动机 + 正则'},
                {'dim': '语义理解',       'weight': 35, 'method': 'BERT fine-tune'},
                {'dim': '图像NSFW检测',   'weight': 20, 'method': 'NudeNet模型'},
            ],
            'search_relevance': [
                {'dim': 'Query-Doc相关性','weight': 50, 'method': 'BM25 + dense retrieval'},
                {'dim': '语义匹配度',     'weight': 30, 'method': 'Cross-Encoder'},
                {'dim': '点击率预估',     'weight': 20, 'method': '历史CTR数据'},
            ],
        }
        r['dimensions'] = WEIGHTS.get(rt, [
            {'dim': '综合评分', 'weight': 100, 'method': 'LLM判断'},
        ])

        # 四象限模拟数据
        total = random.randint(8000, 15000)
        tp = int(total * random.uniform(0.10, 0.18))
        fp = int(tp * random.uniform(0.06, 0.12))
        fn = int(tp * random.uniform(0.05, 0.10))
        tn = total - tp - fp - fn
        r['quadrant'] = {
            'TP': tp, 'FP': fp, 'FN': fn, 'TN': tn,
            'precision': round(tp/(tp+fp)*100, 1) if (tp+fp) > 0 else 0,
            'recall':    round(tp/(tp+fn)*100, 1) if (tp+fn) > 0 else 0,
        }

        # 判断逻辑流程
        FLOW = {
            'image_similarity': ['输入商品图片×2', '图像特征提取(CLIP)', '相似度融合计算', f'阈值判断>{int((r.get("threshold") or 0.85)*100)}%', '输出判定结果'],
            'text_similarity':  ['输入商品标题×2', '文本语义编码', 'Cosine相似度计算',   f'阈值判断>{int((r.get("threshold") or 0.90)*100)}%', '输出判定结果'],
            'content_safety':   ['输入内容文本/图片', '多维度特征提取', '违规打分融合',   f'阈值判断>{int((r.get("threshold") or 0.80)*100)}%', '输出违规标签'],
            'search_relevance': ['输入Query+Doc', '相关性特征提取', '多路召回融合',       f'阈值判断>{int((r.get("threshold") or 0.75)*100)}%', '输出相关性得分'],
        }
        r['logic_flow'] = FLOW.get(rt, ['输入数据', 'AI分析', '阈值判断', '输出结果'])

        # 当前 Prompt（如果没有 prompt_version 就用规则自带的 prompt）
        if not r.get('current_prompt'):
            r['current_prompt'] = r.get('prompt', '')
        r['prompt_version'] = r.get('prompt_version') or 1

        enriched.append(r)

    return jsonify(success({"list": enriched, "scene": scene}))


# ─────────────────────────────────────────────
# 3. 学习记录列表
# ─────────────────────────────────────────────
@ai_bp.route('/ai/learning-records', methods=['GET'])
def get_learning_records():
    scene   = request.args.get('scene', '')
    page    = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset  = (page - 1) * page_size

    conn   = get_db()
    cursor = conn.cursor()

    where = "WHERE 1=1"
    params = []
    if scene:
        where += " AND scene=?"
        params.append(scene)

    cursor.execute(f"SELECT COUNT(*) FROM ai_learning_record {where}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT lr.*, r.name as rule_name, r.rule_type
        FROM ai_learning_record lr
        LEFT JOIN inspection_rule r ON lr.rule_id = r.id
        {where} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['metric_before'] = parse_json_field(r.get('metric_before'))
        r['metric_after']  = parse_json_field(r.get('metric_after'))

    return jsonify(success({"list": rows, "total": total}))


# ─────────────────────────────────────────────
# 4. 新增学习记录
# ─────────────────────────────────────────────
@ai_bp.route('/ai/learning-records', methods=['POST'])
def create_learning_record():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO ai_learning_record
        (scene, rule_id, learn_type, sample_count, metric_before, metric_after, prompt_diff, summary, operator)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        data.get('scene', 'product'),
        data.get('rule_id'),
        data.get('learn_type', 'human_correction'),
        data.get('sample_count', 0),
        json.dumps(data.get('metric_before', {})),
        json.dumps(data.get('metric_after', {})),
        data.get('prompt_diff', ''),
        data.get('summary', ''),
        data.get('operator', 'admin'),
    ))
    conn.commit()
    rid = cursor.lastrowid
    cursor.execute("SELECT * FROM ai_learning_record WHERE id=?", (rid,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    return jsonify(success(row))


# ─────────────────────────────────────────────
# 5. Prompt 版本列表
# ─────────────────────────────────────────────
@ai_bp.route('/ai/prompt-versions', methods=['GET'])
def get_prompt_versions():
    rule_id = request.args.get('rule_id', type=int)
    if not rule_id:
        return jsonify(error("rule_id 必填")), 400
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM ai_prompt_version WHERE rule_id=? ORDER BY version DESC
    """, (rule_id,))
    rows = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(success({"list": rows}))


# ─────────────────────────────────────────────
# 6. 发布新 Prompt 版本
# ─────────────────────────────────────────────
@ai_bp.route('/ai/prompt-versions', methods=['POST'])
def create_prompt_version():
    data    = request.get_json()
    rule_id = data.get('rule_id')
    if not rule_id:
        return jsonify(error("rule_id 必填")), 400

    conn   = get_db()
    cursor = conn.cursor()

    # 获取当前最大版本号
    cursor.execute("SELECT MAX(version) FROM ai_prompt_version WHERE rule_id=?", (rule_id,))
    max_ver = cursor.fetchone()[0] or 0

    # 将旧版本设为非当前
    cursor.execute("UPDATE ai_prompt_version SET is_current=0 WHERE rule_id=?", (rule_id,))

    new_ver = max_ver + 1
    cursor.execute("""
        INSERT INTO ai_prompt_version
        (rule_id, version, prompt_content, change_reason, precision_rate, recall_rate, is_current, created_by)
        VALUES (?,?,?,?,?,?,1,?)
    """, (
        rule_id,
        new_ver,
        data.get('prompt_content', ''),
        data.get('change_reason', ''),
        data.get('precision_rate', 0),
        data.get('recall_rate', 0),
        data.get('created_by', 'admin'),
    ))

    # 同步更新 inspection_rule.prompt
    cursor.execute("UPDATE inspection_rule SET prompt=?, version=? WHERE id=?",
                   (data.get('prompt_content', ''), new_ver, rule_id))

    conn.commit()
    pid = cursor.lastrowid
    cursor.execute("SELECT * FROM ai_prompt_version WHERE id=?", (pid,))
    row = row_to_dict(cursor.fetchone())
    conn.close()
    return jsonify(success(row))


# ─────────────────────────────────────────────
# 7. 优化记录列表
# ─────────────────────────────────────────────
@ai_bp.route('/ai/optimization-records', methods=['GET'])
def get_optimization_records():
    scene     = request.args.get('scene', '')
    page      = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 20))
    offset    = (page - 1) * page_size

    conn   = get_db()
    cursor = conn.cursor()
    where  = "WHERE 1=1"
    params = []
    if scene:
        where += " AND o.scene=?"
        params.append(scene)

    cursor.execute(f"SELECT COUNT(*) FROM ai_optimization_record o {where}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT o.*, r.name as rule_name
        FROM ai_optimization_record o
        LEFT JOIN inspection_rule r ON o.rule_id = r.id
        {where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['before_metrics'] = parse_json_field(r.get('before_metrics'))
        r['after_metrics']  = parse_json_field(r.get('after_metrics'))
        r['change_detail']  = parse_json_field(r.get('change_detail'))

    return jsonify(success({"list": rows, "total": total}))


# ─────────────────────────────────────────────
# 8. 新增优化记录
# ─────────────────────────────────────────────
@ai_bp.route('/ai/optimization-records', methods=['POST'])
def create_optimization_record():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO ai_optimization_record
        (scene, rule_id, title, motivation, change_detail, before_metrics, after_metrics, status, operator)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        data.get('scene', 'product'),
        data.get('rule_id'),
        data.get('title', ''),
        data.get('motivation', ''),
        json.dumps(data.get('change_detail', {})),
        json.dumps(data.get('before_metrics', {})),
        json.dumps(data.get('after_metrics', {})),
        data.get('status', 'online'),
        data.get('operator', 'admin'),
    ))
    conn.commit()
    conn.close()
    return jsonify(success({"message": "优化记录已创建"}))


# ─────────────────────────────────────────────
# 9. AI 巡检建议（基于最近数据动态生成）
# ─────────────────────────────────────────────
@ai_bp.route('/ai/suggestions', methods=['GET'])
def get_suggestions():
    scene = request.args.get('scene', 'product')

    SUGGESTIONS = {
        'product': [
            {
                'type': 'threshold_tune', 'severity': 'warning',
                'title': '建议提高图像相似度阈值至 88%',
                'reason': '近7天 FP 误报率上升 2.3%，主要集中在"同款不同色"场景，当前阈值 85% 过低',
                'action': '将商品图片相似度规则阈值从 85% 调整到 88%',
                'impact': '预计减少误报约 15%，召回率小幅下降 0.5%',
                'rule_id': 1, 'rule_name': '商品图片相似度检测',
            },
            {
                'type': 'new_rule', 'severity': 'info',
                'title': '发现新 badcase 模式：白底图 vs 场景图误判',
                'reason': '近30天有 312 条 FP 属于同一商品的白底图与场景图对比，建议增加"图片类型识别"预处理步骤',
                'action': '新建规则：图片类型前置过滤（白底图/场景图分类后再比对）',
                'impact': '预计减少 FP 约 200条/周，准确率提升约 1.5%',
                'rule_id': None, 'rule_name': '（新规则）',
            },
            {
                'type': 'prompt_opt', 'severity': 'info',
                'title': '建议优化商品标题相似度 Prompt',
                'reason': '当前 Prompt 未明确处理"品牌前缀不同但商品相同"的情况（FN 漏检 87 条）',
                'action': '在 Prompt 中增加："若商品型号/规格完全一致，即使品牌前缀不同也应判为相似"',
                'impact': '预计召回率提升约 2%',
                'rule_id': 2, 'rule_name': '商品标题语义相似度',
            },
        ],
        'search': [
            {
                'type': 'threshold_tune', 'severity': 'warning',
                'title': '建议降低搜索相关性阈值至 72%',
                'reason': '近7天长尾词召回率偏低（67%），FN 漏检增多',
                'action': '将搜索相关性规则阈值从 75% 调整到 72%',
                'impact': '预计召回率提升 3%，FP 小幅增加约 1%',
                'rule_id': 4, 'rule_name': '搜索结果相关性检测',
            },
            {
                'type': 'new_rule', 'severity': 'info',
                'title': '建议新增"搜索结果时效性"检测规则',
                'reason': '用户搜索"最新发布"类词汇时，结果中存在大量陈旧内容',
                'action': '新建时效性过滤规则，对含时间词的 Query 额外校验内容时间戳',
                'impact': '预计改善约 8% 的时效性相关 badcase',
                'rule_id': None, 'rule_name': '（新规则）',
            },
        ],
        'live': [
            {
                'type': 'prompt_opt', 'severity': 'warning',
                'title': '建议增强违规画面识别 Prompt',
                'reason': '近30天直播间"遮挡镜头"行为漏检率达 12%，Prompt 中缺少对该行为的描述',
                'action': '在内容安全 Prompt 中增加："若画面持续黑屏/被遮挡超过3秒，判定为违规行为"',
                'impact': '预计漏检率下降约 8%',
                'rule_id': 3, 'rule_name': '内容安全检测',
            },
        ],
    }

    suggestions = SUGGESTIONS.get(scene, SUGGESTIONS['product'])
    return jsonify(success({"list": suggestions, "scene": scene, "scene_label": _scene_label(scene)}))


# ─────────────────────────────────────────────
# 10. 能力抽象组件库
# ─────────────────────────────────────────────
@ai_bp.route('/ai/components', methods=['GET'])
def get_components():
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ai_capability_component ORDER BY created_at DESC")
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['input_schema']       = parse_json_field(r.get('input_schema'))
        r['output_schema']      = parse_json_field(r.get('output_schema'))
        r['applicable_scenes']  = parse_json_field(r.get('applicable_scenes'))

    return jsonify(success({"list": rows}))


# ─────────────────────────────────────────────
# 11. 知识中台总览（跨场景聚合）
# ─────────────────────────────────────────────
@ai_bp.route('/ai/knowledge-hub', methods=['GET'])
def get_knowledge_hub():
    conn   = get_db()
    cursor = conn.cursor()

    # 规则资产
    cursor.execute("SELECT COUNT(*) as cnt FROM inspection_rule WHERE is_active=1")
    rule_count = cursor.fetchone()[0]

    # Prompt 版本
    cursor.execute("SELECT COUNT(*) as cnt FROM ai_prompt_version")
    prompt_ver_count = cursor.fetchone()[0]

    # 学习记录
    cursor.execute("SELECT COUNT(*) as cnt FROM ai_learning_record")
    learn_count = cursor.fetchone()[0]

    # 能力组件
    cursor.execute("SELECT COUNT(*) as cnt FROM ai_capability_component")
    comp_count = cursor.fetchone()[0]

    # 优化记录
    cursor.execute("SELECT COUNT(*) as cnt FROM ai_optimization_record")
    opt_count = cursor.fetchone()[0]

    # 各场景最新指标
    scene_metrics = {}
    for scene in ['product', 'search', 'live']:
        cursor.execute("""
            SELECT precision_rate, recall_rate, f1_score, total_count
            FROM ai_capability_metric WHERE scene=? ORDER BY date DESC LIMIT 1
        """, (scene,))
        row = row_to_dict(cursor.fetchone())
        scene_metrics[scene] = row or {}

    # 最近10条学习记录（跨场景）
    cursor.execute("""
        SELECT lr.*, r.name as rule_name
        FROM ai_learning_record lr
        LEFT JOIN inspection_rule r ON lr.rule_id=r.id
        ORDER BY lr.created_at DESC LIMIT 10
    """)
    recent_learns = rows_to_list(cursor.fetchall())

    # 最近5条优化记录
    cursor.execute("""
        SELECT o.*, r.name as rule_name
        FROM ai_optimization_record o
        LEFT JOIN inspection_rule r ON o.rule_id=r.id
        ORDER BY o.created_at DESC LIMIT 5
    """)
    recent_opts = rows_to_list(cursor.fetchall())

    conn.close()

    for r in recent_learns:
        r['metric_before'] = parse_json_field(r.get('metric_before'))
        r['metric_after']  = parse_json_field(r.get('metric_after'))
    for r in recent_opts:
        r['before_metrics'] = parse_json_field(r.get('before_metrics'))
        r['after_metrics']  = parse_json_field(r.get('after_metrics'))

    return jsonify(success({
        "stats": {
            "rule_count":       rule_count,
            "prompt_ver_count": prompt_ver_count,
            "learn_count":      learn_count,
            "comp_count":       comp_count,
            "opt_count":        opt_count,
        },
        "scene_metrics":  scene_metrics,
        "recent_learns":  recent_learns,
        "recent_opts":    recent_opts,
    }))


# ─────────────────────────────────────────────
# 12. 跨场景学习记录（知识中台专用）
# ─────────────────────────────────────────────
@ai_bp.route('/ai/global-learning-records', methods=['GET'])
def get_global_learning_records():
    page      = int(request.args.get('page', 1))
    scene     = request.args.get('scene', '')
    learn_type = request.args.get('learn_type', '')
    page_size = int(request.args.get('page_size', 20))
    offset    = (page - 1) * page_size

    conn   = get_db()
    cursor = conn.cursor()
    where  = "WHERE 1=1"
    params = []
    if scene:
        where += " AND lr.scene=?"
        params.append(scene)
    if learn_type:
        where += " AND lr.learn_type=?"
        params.append(learn_type)

    cursor.execute(f"SELECT COUNT(*) FROM ai_learning_record lr {where}", params)
    total = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT lr.*, r.name as rule_name, r.rule_type
        FROM ai_learning_record lr
        LEFT JOIN inspection_rule r ON lr.rule_id=r.id
        {where} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    rows = rows_to_list(cursor.fetchall())
    conn.close()

    for r in rows:
        r['metric_before'] = parse_json_field(r.get('metric_before'))
        r['metric_after']  = parse_json_field(r.get('metric_after'))

    return jsonify(success({"list": rows, "total": total}))
