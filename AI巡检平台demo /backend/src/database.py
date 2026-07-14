import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'inspection.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 数据集表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dataset (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK(source_type IN ('excel','sql')),
            field_schema TEXT,
            record_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ready' CHECK(status IN ('ready','processing','failed')),
            file_path TEXT,
            sql_content TEXT,
            created_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 调度任务表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS schedule_job (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_id INTEGER,
            sql_content TEXT,
            cron_expr TEXT,
            params TEXT,
            status TEXT DEFAULT 'enabled',
            last_run_at DATETIME,
            last_run_status TEXT,
            FOREIGN KEY (dataset_id) REFERENCES dataset(id)
        )
    ''')

    # 巡检规则表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inspection_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rule_type TEXT,
            threshold REAL DEFAULT 0.85,
            prompt TEXT,
            compare_scope TEXT DEFAULT 'all_library',
            config TEXT,
            version INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            created_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 巡检任务表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inspection_task (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            scene TEXT NOT NULL,
            dataset_id INTEGER,
            preprocess_config TEXT,
            group_field TEXT,
            case_prefix TEXT DEFAULT 'CASE-',
            model TEXT DEFAULT 'mock_model',
            rule_ids TEXT,
            schedule_config TEXT,
            schedule_enabled INTEGER DEFAULT 0,
            schedule_period TEXT DEFAULT 'weekly',
            schedule_cron TEXT,
            date_field_name TEXT,
            date_field_offset INTEGER DEFAULT 7,
            status TEXT DEFAULT 'pending',
            created_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dataset_id) REFERENCES dataset(id)
        )
    ''')

    # 巡检版本表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inspection_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            total_count INTEGER DEFAULT 0,
            badcase_count INTEGER DEFAULT 0,
            badcase_rate REAL DEFAULT 0.0,
            normal_count INTEGER DEFAULT 0,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES inspection_task(id)
        )
    ''')

    # 巡检Case表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inspection_case (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            version_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            raw_data TEXT,
            screenshot_urls TEXT,
            ai_result TEXT CHECK(ai_result IN ('normal','badcase')),
            ai_confidence REAL,
            ai_reason TEXT,
            hit_rules TEXT,
            human_result TEXT,
            human_reason TEXT,
            in_training_set INTEGER DEFAULT 0,
            group_value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (version_id) REFERENCES inspection_version(id)
        )
    ''')

    # 操作日志表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            log_type TEXT,
            operator TEXT DEFAULT 'admin',
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")

    # 迁移：给已有表添加新字段（如果不存在）
    _migrate_db()


def _migrate_db():
    """安全地给已有表添加新列（如果不存在），并创建新表"""
    conn = get_db()
    cursor = conn.cursor()

    # inspection_rule 新增 compare_scope
    try:
        cursor.execute("ALTER TABLE inspection_rule ADD COLUMN compare_scope TEXT DEFAULT 'all_library'")
        conn.commit()
        print("✅ 迁移: inspection_rule.compare_scope 已添加")
    except Exception:
        pass

    # inspection_rule 新增 scene / description（v3.0）
    for col, col_def in [("scene", "TEXT DEFAULT ''"), ("description", "TEXT DEFAULT ''")]:
        try:
            cursor.execute(f"ALTER TABLE inspection_rule ADD COLUMN {col} {col_def}")
            conn.commit()
            print(f"✅ 迁移: inspection_rule.{col} 已添加")
        except Exception:
            pass

    # inspection_task 新增定时相关字段
    new_task_cols = [
        ("schedule_enabled", "INTEGER DEFAULT 0"),
        ("schedule_period",  "TEXT DEFAULT 'weekly'"),
        ("schedule_cron",    "TEXT"),
        ("date_field_name",  "TEXT"),
        ("date_field_offset","INTEGER DEFAULT 7"),
        ("field_mapping",    "TEXT DEFAULT '{}'"),   # v11.0: 字段映射 JSON
    ]
    for col, col_def in new_task_cols:
        try:
            cursor.execute(f"ALTER TABLE inspection_task ADD COLUMN {col} {col_def}")
            conn.commit()
            print(f"✅ 迁移: inspection_task.{col} 已添加")
        except Exception:
            pass

    # ── AI 能力模块新表 ──────────────────────────────────────

    # AI 能力指标快照
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_capability_metric (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scene TEXT NOT NULL,
            date DATE NOT NULL,
            precision_rate REAL DEFAULT 0,
            recall_rate REAL DEFAULT 0,
            f1_score REAL DEFAULT 0,
            false_positive INTEGER DEFAULT 0,
            false_negative INTEGER DEFAULT 0,
            total_count INTEGER DEFAULT 0,
            rule_version TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # AI 学习记录
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_learning_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scene TEXT NOT NULL,
            rule_id INTEGER,
            learn_type TEXT NOT NULL,
            sample_count INTEGER DEFAULT 0,
            metric_before TEXT,
            metric_after TEXT,
            prompt_diff TEXT,
            summary TEXT,
            operator TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Prompt 版本管理
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_prompt_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            prompt_content TEXT,
            change_reason TEXT,
            precision_rate REAL DEFAULT 0,
            recall_rate REAL DEFAULT 0,
            is_current INTEGER DEFAULT 0,
            created_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rule_id) REFERENCES inspection_rule(id)
        )
    ''')

    # AI 优化记录
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_optimization_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scene TEXT NOT NULL,
            rule_id INTEGER,
            title TEXT NOT NULL,
            motivation TEXT,
            change_detail TEXT,
            before_metrics TEXT,
            after_metrics TEXT,
            status TEXT DEFAULT 'online',
            operator TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 能力抽象组件库
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_capability_component (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            version TEXT DEFAULT 'v1.0',
            category TEXT,
            description TEXT,
            input_schema TEXT,
            output_schema TEXT,
            applicable_scenes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ AI 能力模块表迁移/创建完成")


def seed_result_dashboard_data():
    """补充综合结果看板所需的多场景任务+版本演示数据"""
    import random
    from datetime import datetime, timedelta

    conn   = get_db()
    cursor = conn.cursor()

    # 只在任务数量 < 6 时才补充（避免重复）
    cursor.execute("SELECT COUNT(*) FROM inspection_task")
    if cursor.fetchone()[0] >= 6:
        conn.close()
        return

    # 确保有规则可用
    cursor.execute("SELECT id FROM inspection_rule ORDER BY id LIMIT 4")
    rule_ids = [r[0] for r in cursor.fetchall()]
    if not rule_ids:
        conn.close()
        return

    # 确保有数据集可用
    cursor.execute("SELECT id FROM dataset ORDER BY id LIMIT 2")
    dataset_ids = [r[0] for r in cursor.fetchall()]
    if not dataset_ids:
        conn.close()
        return

    TASKS = [
        # name, scene, status, schedule_type, rule_ids
        ("搜索相关性周度巡检",       "search",  "completed", "weekly",  [rule_ids[3] if len(rule_ids)>3 else rule_ids[0]]),
        ("搜索推荐质量日常巡检",     "search",  "running",   "daily",   [rule_ids[3] if len(rule_ids)>3 else rule_ids[0]]),
        ("直播内容安全巡检-周",      "live",    "completed", "weekly",  [rule_ids[2] if len(rule_ids)>2 else rule_ids[0]]),
        ("商品相似度-补充场景巡检",  "product", "completed", "once",    [rule_ids[0]]),
    ]

    now = datetime.now()
    inserted_task_ids = []
    for task_name, scene, status, sched, t_rule_ids in TASKS:
        dataset_id = dataset_ids[0]
        cursor.execute("""
            INSERT INTO inspection_task
            (name, scene, dataset_id, status, schedule_period, group_field, case_prefix, rule_ids, created_by)
            VALUES (?,?,?,?,?,?,?,?,'admin')
        """, (
            task_name, scene, dataset_id, status, sched,
            "category", "CASE",
            json.dumps(t_rule_ids)
        ))
        tid = cursor.lastrowid
        inserted_task_ids.append((tid, scene, status))

    conn.commit()

    # 为每个新任务插入 1~2 个版本（含 cases）
    SCENE_RATES = {
        'product': {'base_bc': 0.085, 'total': 9800},
        'search':  {'base_bc': 0.062, 'total': 15600},
        'live':    {'base_bc': 0.038, 'total': 4200},
    }

    CATEGORIES = {
        'product': ['服装', '鞋包', '3C数码', '家居', '美妆'],
        'search':  ['电子产品', '服装', '食品', '运动'],
        'live':    ['带货直播', '娱乐直播', '游戏直播'],
    }

    AI_REASONS = {
        'product': [
            "检测到两商品主图高度相似(CLIP相似度: {sim}%)，疑似相似品",
            "商品标题语义相似度 {sim}%，存在相似品风险",
            "图片哈希相似度超过阈值({sim}%)，判定为相似品",
        ],
        'search':  [
            "搜索词与结果内容相关性不足({sim}%)，低于基准线75%",
            "搜索结果包含时效性内容但发布时间超过90天",
            "关键词匹配得分{sim}%，低于相关性阈值",
        ],
        'live':    [
            "检测到画面违规内容，置信度 {sim}%",
            "弹幕违禁词命中，内容安全分数 {sim}%",
            "视频流连续{sec}秒出现遮挡画面",
        ],
    }

    for tid, scene, status in inserted_task_ids:
        rate_cfg = SCENE_RATES.get(scene, {'base_bc': 0.08, 'total': 5000})
        cats     = CATEGORIES.get(scene, ['分组A', '分组B'])
        reasons  = AI_REASONS.get(scene, ["AI判定为badcase"])

        versions_to_create = 2 if status == 'completed' else 1
        for ver_num in range(1, versions_to_create + 1):
            exec_at = (now - timedelta(days=(versions_to_create - ver_num) * 7 + random.randint(1, 5))).strftime('%Y-%m-%d %H:%M:%S')

            total    = rate_cfg['total'] + random.randint(-1000, 1000)
            bc_rate  = round(rate_cfg['base_bc'] + random.uniform(-0.01, 0.02), 4)
            bc_count = int(total * bc_rate)
            nm_count = total - bc_count

            cursor.execute("""
                INSERT INTO inspection_version
                (task_id, version, total_count, badcase_count, normal_count, badcase_rate, executed_at)
                VALUES (?,?,?,?,?,?,?)
            """, (tid, ver_num, total, bc_count, nm_count,
                  round(bc_rate * 100, 2),
                  exec_at))
            vid = cursor.lastrowid

            # 插入 15 条 case（混合 badcase / normal）
            for ci in range(15):
                is_bad       = ci < int(15 * bc_rate * 2)  # 控制比例
                ai_conf      = round(random.uniform(0.82, 0.99), 3)
                sim_val      = int(ai_conf * 100)
                reason_tmpl  = random.choice(reasons)
                ai_reason    = reason_tmpl.format(sim=sim_val, sec=random.randint(3, 10))
                cat          = cats[ci % len(cats)]
                case_id_str  = f"CASE-{tid:03d}-{ver_num}-{ci+1:03d}"

                cursor.execute("""
                    INSERT INTO inspection_case
                    (task_id, version_id, case_id, ai_result, ai_confidence, ai_reason,
                     group_value, hit_rules, raw_data, in_training_set)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    tid, vid, case_id_str,
                    'badcase' if is_bad else 'normal',
                    ai_conf, ai_reason,
                    cat,
                    json.dumps([f"规则-{r}" for r in [rule_ids[0]]]),
                    json.dumps({"item_id": f"ITEM_{random.randint(10000,99999)}", "category": cat}),
                    0
                ))

            conn.commit()

    conn.close()
    print("✅ 综合看板演示任务数据插入完成")

def seed_data():
    """插入演示数据"""
    conn = get_db()
    cursor = conn.cursor()

    # 检查是否已有数据
    cursor.execute("SELECT COUNT(*) FROM inspection_rule")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # 插入默认规则
    rules = [
        ("商品图片相似度检测", "image_similarity", 0.85,
         "你是一个电商商品质量审核专家。请判断以下两件商品图片是否高度相似（相似度超过{threshold}），若相似请标记为badcase。\n输出JSON格式：{\"is_badcase\": true/false, \"confidence\": 0.0-1.0, \"reason\": \"判定原因\"}"),
        ("商品标题语义相似度", "text_similarity", 0.90,
         "请判断以下两个商品标题在语义上是否高度相似，判断是否为重复商品。\n输出JSON格式：{\"is_badcase\": true/false, \"confidence\": 0.0-1.0, \"reason\": \"判定原因\"}"),
        ("内容安全检测", "content_safety", 0.80,
         "请检测以下内容是否包含违规信息（违禁词、虚假宣传、低俗内容等）。\n输出JSON格式：{\"is_badcase\": true/false, \"confidence\": 0.0-1.0, \"reason\": \"判定原因\"}"),
        ("搜索结果相关性检测", "search_relevance", 0.75,
         "请评估搜索词与搜索结果内容的相关性是否达标。\n输出JSON格式：{\"is_badcase\": true/false, \"confidence\": 0.0-1.0, \"reason\": \"判定原因\"}"),
    ]
    cursor.executemany(
        "INSERT INTO inspection_rule (name, rule_type, threshold, prompt) VALUES (?,?,?,?)",
        rules
    )

    # 插入演示数据集
    cursor.execute("""
        INSERT INTO dataset (name, source_type, field_schema, record_count, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        "商品推荐数据集-示例",
        "excel",
        '[{"name":"item_id","type":"number"},{"name":"item_title","type":"text"},{"name":"item_url","type":"url"},{"name":"category","type":"tag"},{"name":"price","type":"number"}]',
        120,
        "ready",
        "admin"
    ))

    cursor.execute("""
        INSERT INTO dataset (name, source_type, field_schema, record_count, status, sql_content, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        "搜索词数据集-示例",
        "sql",
        '[{"name":"keyword","type":"text"},{"name":"search_date","type":"date"},{"name":"click_count","type":"number"}]',
        56,
        "ready",
        "SELECT keyword, search_date, click_count FROM dw.search_keyword_table WHERE dt='${date}' LIMIT 1000",
        "admin"
    ))

    conn.commit()
    conn.close()
    print("✅ 演示数据插入完成")

    # 追加 AI 能力模块种子数据（独立检查，可重复运行）
    seed_ai_data()
    # 追加综合结果看板演示数据
    seed_result_dashboard_data()


def seed_ai_data():
    """插入 AI 能力模块演示数据"""
    import random
    from datetime import datetime, timedelta

    conn   = get_db()
    cursor = conn.cursor()

    # 已有数据则跳过
    cursor.execute("SELECT COUNT(*) FROM ai_capability_metric")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # ── 1. 指标快照（过去 30 天，三个场景）──
    base_metrics = {
        'product': {'p': 93.0, 'r': 90.0, 'total': 12000},
        'search':  {'p': 88.0, 'r': 85.0, 'total': 45000},
        'live':    {'p': 97.0, 'r': 95.0, 'total': 2300000},
    }
    metric_rows = []
    for i in range(30):
        dt = (datetime.now() - timedelta(days=29-i)).strftime('%Y-%m-%d')
        for scene, base in base_metrics.items():
            p     = round(base['p'] + random.uniform(-0.5, 1.5), 1)
            r     = round(base['r'] + random.uniform(-0.5, 1.5), 1)
            f1    = round(2*p*r/(p+r) if (p+r) > 0 else 0, 1)
            total = base['total'] + random.randint(-500, 500)
            tp    = int(total * random.uniform(0.10, 0.16))
            fp    = int(tp * 0.08)
            fn    = int(tp * 0.08)
            metric_rows.append((scene, dt, p, r, f1, fp, fn, total, f'v{random.randint(2,4)}'))
    cursor.executemany("""
        INSERT INTO ai_capability_metric
        (scene, date, precision_rate, recall_rate, f1_score, false_positive, false_negative, total_count, rule_version)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, metric_rows)

    # ── 2. 学习记录 ──
    LEARN_TYPES = ['human_correction', 'batch_label', 'prompt_opt', 'model_finetune']
    LEARN_DATA = [
        ('product', 1, 'batch_label', 320, 93.0, 91.0, 94.3, 92.1,
         '', '批量纠错：同款不同色误判修复，新增320个标注样本'),
        ('product', 1, 'prompt_opt', 0, 91.5, 89.5, 93.0, 91.0,
         '增加颜色差异条件：若两件商品颜色明显不同(超过{color_diff_threshold}%)，则降低相似度权重',
         'Prompt优化v3：增加颜色差异过滤条件，减少同款不同色FP'),
        ('product', 2, 'human_correction', 158, 89.0, 86.0, 90.5, 87.5,
         '', '人工纠错：品牌前缀不同但型号相同的商品标题重新标注'),
        ('search', 4, 'prompt_opt', 0, 88.0, 83.0, 89.5, 85.5,
         '新增时效性判断：对含有"最新"、"最近"词汇的query，额外校验内容发布时间',
         'Prompt优化：增加时效性检测分支，改善长尾词召回'),
        ('search', 3, 'batch_label', 420, 96.0, 94.5, 97.3, 95.8,
         '', '内容安全检测增量标注：扩充直播违规弹幕样本库'),
        ('live', 3, 'prompt_opt', 0, 95.0, 93.0, 96.4, 95.2,
         '新增遮挡镜头识别：若画面持续黑屏超过3秒，判定违规行为',
         'Prompt优化：增加遮挡镜头行为识别条件，降低漏检率'),
        ('live', 3, 'human_correction', 200, 94.0, 92.0, 95.0, 93.0,
         '', '人工纠错：夜间低光照场景误判修复'),
    ]
    for (scene, rule_id, ltype, cnt, pb, rb, pa, ra, pdiff, summary) in LEARN_DATA:
        mb = json.dumps({'precision': pb, 'recall': rb})
        ma = json.dumps({'precision': pa, 'recall': ra})
        dt = (datetime.now() - timedelta(days=random.randint(1, 29))).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            INSERT INTO ai_learning_record
            (scene, rule_id, learn_type, sample_count, metric_before, metric_after, prompt_diff, summary, operator, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (scene, rule_id, ltype, cnt, mb, ma, pdiff, summary, 'admin', dt))

    # ── 3. Prompt 版本 ──
    PROMPT_VERSIONS = [
        # (rule_id, ver, content, reason, p, r, is_current)
        (1, 1,
         '你是一个商品质量审核专家。请判断以下两件商品图片是否相似，相似度超过{threshold}则为badcase。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str}',
         '初始版本', 90.5, 88.0, 0),
        (1, 2,
         '你是一个电商商品质量审核专家。请判断以下两件商品图片是否高度相似（相似度超过{threshold}），若相似请标记为badcase。注意：颜色差异大的商品不应判为相似。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str}',
         '增加颜色差异条件', 92.1, 90.5, 0),
        (1, 3,
         '你是一个电商商品质量审核专家。请判断以下两件商品图片是否高度相似（相似度超过{threshold}），若相似请标记为badcase。\n判断要点：\n1. 商品主体形状是否相同\n2. 颜色是否高度一致（色差超过30%可判为不同款）\n3. 品牌Logo是否一致\n4. 功能特征是否相同\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str,"matched_points":list}',
         '细化判断要点，增加品牌Logo和功能特征检测', 94.3, 92.1, 1),
        (2, 1,
         '请判断以下两个商品标题是否语义相似，是否为重复商品。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str}',
         '初始版本', 88.0, 85.5, 0),
        (2, 2,
         '请判断以下两个商品标题在语义上是否高度相似，判断是否为重复商品。注意：若商品型号/规格完全一致，即使品牌前缀不同也应判为相似。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str}',
         '新增型号/规格一致性判断', 90.5, 87.5, 1),
        (3, 1,
         '请检测以下内容是否包含违规信息（违禁词、虚假宣传、低俗内容等）。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str,"violation_type":str}',
         '初始版本', 96.0, 94.0, 0),
        (3, 2,
         '请检测以下直播/商品内容是否包含违规信息（违禁词、虚假宣传、低俗内容、遮挡镜头等）。\n重点检测：1)违禁商品词 2)虚假疗效宣传 3)诱导打赏话术 4)画面违规行为\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str,"violation_type":str,"severity":"high/medium/low"}',
         '增加直播场景违规类型和严重程度标注', 97.3, 95.8, 1),
        (4, 1,
         '请评估搜索词与搜索结果内容的相关性是否达标。\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str}',
         '初始版本', 86.0, 82.0, 0),
        (4, 2,
         '请评估搜索词与搜索结果内容的相关性是否达标。评估维度：\n1. 主题相关性（搜索词是否出现在结果中）\n2. 语义相关性（内容是否与搜索意图匹配）\n3. 时效性（含时间词的query需校验内容时间）\n输出JSON：{"is_badcase":bool,"confidence":float,"reason":str,"relevance_score":float}',
         '增加语义相关性和时效性检测维度', 89.5, 85.5, 1),
    ]
    for (rule_id, ver, content, reason, p, r, is_curr) in PROMPT_VERSIONS:
        dt = (datetime.now() - timedelta(days=random.randint(1, 60))).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            INSERT INTO ai_prompt_version
            (rule_id, version, prompt_content, change_reason, precision_rate, recall_rate, is_current, created_by, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (rule_id, ver, content, reason, p, r, is_curr, 'admin', dt))

    # ── 4. 优化记录 ──
    OPT_DATA = [
        ('product', 1, '商品图片相似度：降低同款不同色误判',
         '近7天FP误报率上升2.3%，主要集中在"同款不同色"场景，白底图vs场景图对比误判',
         '{"type": "prompt_update", "from_version": 2, "to_version": 3, "threshold_change": "85%→85%（不变）", "prompt_key_change": "增加颜色差异条件和品牌Logo检测"}',
         '{"precision": 92.1, "recall": 90.5, "fp_rate": 7.9, "daily_count": 12000}',
         '{"precision": 94.3, "recall": 92.1, "fp_rate": 5.7, "daily_count": 12800}',
         'online'),
        ('product', 2, '商品标题相似度：修复品牌前缀不同漏检问题',
         '人工审核发现87条漏检(FN)，主要原因是品牌前缀不同但商品型号相同的情况未被识别',
         '{"type": "prompt_update", "from_version": 1, "to_version": 2, "key_change": "新增型号/规格一致性条件"}',
         '{"precision": 88.0, "recall": 85.5, "fn_count": 87}',
         '{"precision": 90.5, "recall": 87.5, "fn_count": 42}',
         'online'),
        ('search', 4, '搜索相关性：提升长尾词召回率',
         '长尾词搜索场景召回率仅67%，用户反馈相关内容被遗漏',
         '{"type": "threshold_tune", "from": 0.75, "to": 0.72, "prompt_update": "增加语义匹配评分维度"}',
         '{"precision": 88.0, "recall": 83.0, "long_tail_recall": 67.0}',
         '{"precision": 89.5, "recall": 85.5, "long_tail_recall": 79.0}',
         'online'),
        ('live', 3, '直播违规：增加遮挡镜头行为识别',
         '遮挡镜头行为漏检率达12%，现有Prompt未包含对该行为的描述',
         '{"type": "prompt_update", "from_version": 1, "to_version": 2, "key_change": "新增遮挡镜头违规场景描述"}',
         '{"precision": 95.0, "recall": 93.0, "miss_rate": 12.0}',
         '{"precision": 96.4, "recall": 95.2, "miss_rate": 4.8}',
         'online'),
    ]
    for (scene, rule_id, title, motivation, cd, bm, am, status) in OPT_DATA:
        dt = (datetime.now() - timedelta(days=random.randint(1, 30))).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            INSERT INTO ai_optimization_record
            (scene, rule_id, title, motivation, change_detail, before_metrics, after_metrics, status, operator, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (scene, rule_id, title, motivation, cd, bm, am, status, 'admin', dt))

    # ── 5. 能力组件库 ──
    COMPONENTS = [
        ('图像特征提取器', 'v1.2', 'image',
         '基于 CLIP ViT-L/14 的图像语义特征提取，支持批量处理，输出512维特征向量',
         '{"image_url": "string", "batch_size": "int(default=32)"}',
         '{"feature_vector": "float[512]", "processing_time_ms": "int"}',
         '["product", "live"]'),
        ('语义相似度计算器', 'v2.0', 'text',
         '基于 Sentence-BERT 的语义相似度计算，支持中英文双语，输出 0-1 相似度分数',
         '{"text_a": "string", "text_b": "string"}',
         '{"similarity_score": "float[0-1]", "confidence": "float"}',
         '["product", "search"]'),
        ('内容安全检测器', 'v4.1', 'multimodal',
         '多模态内容安全检测，支持文本+图片联合判断，覆盖违禁词/暴力/色情/虚假宣传等多类别',
         '{"text": "string(optional)", "image_url": "string(optional)", "categories": "list(optional)"}',
         '{"is_violation": "bool", "violation_type": "string", "confidence": "float", "severity": "high/medium/low"}',
         '["product", "search", "live"]'),
        ('视频帧分析器', 'v1.0', 'video',
         '从视频流中按策略抽帧，并对每帧进行AI分析，支持自定义抽帧间隔和分辨率',
         '{"video_url": "string", "frame_interval_sec": "int(default=5)", "resolution": "string(default=720p)"}',
         '{"frames": [{"timestamp": "int", "screenshot_url": "string", "analysis": "object"}]}',
         '["live"]'),
        ('多模态融合打分器', 'v1.3', 'multimodal',
         '将图像特征、文本语义、类目信息等多路信号融合，输出综合相似/违规打分',
         '{"signals": [{"type": "image/text/category", "score": "float", "weight": "float"}]}',
         '{"final_score": "float", "is_badcase": "bool", "signal_breakdown": "object"}',
         '["product", "search", "live"]'),
        ('Prompt 模板引擎', 'v2.1', 'text',
         '管理和渲染 Prompt 模板，支持变量替换、版本控制、AB测试',
         '{"template_id": "string", "variables": "object"}',
         '{"rendered_prompt": "string", "template_version": "int"}',
         '["product", "search", "live"]'),
        ('搜索相关性评估器', 'v1.5', 'text',
         '评估 Query-Document 相关性，融合 BM25 + Cross-Encoder 双路召回打分',
         '{"query": "string", "document": "string"}',
         '{"relevance_score": "float[0-1]", "bm25_score": "float", "semantic_score": "float"}',
         '["search"]'),
    ]
    for (name, ver, cat, desc, inp, out, scenes) in COMPONENTS:
        cursor.execute("""
            INSERT INTO ai_capability_component
            (name, version, category, description, input_schema, output_schema, applicable_scenes)
            VALUES (?,?,?,?,?,?,?)
        """, (name, ver, cat, desc, inp, out, scenes))

    conn.commit()
    conn.close()
    print("✅ AI 能力模块种子数据插入完成")

if __name__ == '__main__':
    init_db()
    seed_data()
