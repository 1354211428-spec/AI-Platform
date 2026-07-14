import json
import random
import string
from datetime import datetime

def success(data=None, message="success"):
    return {"code": 0, "message": message, "data": data}

def error(message="error", code=400):
    return {"code": code, "message": message, "data": None}

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)

def rows_to_list(rows):
    return [dict(r) for r in rows]

def parse_json_field(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except:
        return value

def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def random_id(prefix="", length=8):
    chars = string.ascii_uppercase + string.digits
    return prefix + ''.join(random.choices(chars, k=length))

def mock_ai_analyze(case_data, rules, threshold=0.85):
    """模拟AI分析结果（Demo用）"""
    confidence = round(random.uniform(0.7, 0.99), 3)
    is_badcase = confidence > threshold

    reasons = [
        "检测到内容与规则定义的异常特征高度吻合",
        "图像特征相似度超过阈值，疑似重复内容",
        "文本语义分析发现潜在违规词汇",
        "内容质量评分低于标准基线",
        "多维度综合评估结果为正常，置信度较高",
        "标题与图片内容一致性良好，未发现异常",
    ]

    if is_badcase:
        reason = random.choice(reasons[:4])
    else:
        reason = random.choice(reasons[4:])

    return {
        "ai_result": "badcase" if is_badcase else "normal",
        "ai_confidence": confidence,
        "ai_reason": reason,
        "hit_rules": json.dumps([rules[0]] if rules and is_badcase else [])
    }
