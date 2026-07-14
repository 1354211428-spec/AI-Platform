"""
AI巡检平台后端主入口
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify
from flask_cors import CORS

from src.database import init_db, seed_data
from src.routes_dataset import dataset_bp
from src.routes_task import task_bp
from src.routes_result import result_bp
from src.routes_ai import ai_bp
from src.routes_learning import learning_bp

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 注册蓝图
app.register_blueprint(dataset_bp, url_prefix='/api/v1')
app.register_blueprint(task_bp, url_prefix='/api/v1')
app.register_blueprint(result_bp, url_prefix='/api/v1')
app.register_blueprint(ai_bp, url_prefix='/api/v1')
app.register_blueprint(learning_bp, url_prefix='/api/v1')


@app.route('/api/v1/health', methods=['GET'])
def health():
    return jsonify({"code": 0, "message": "AI巡检平台后端运行正常", "data": {"version": "1.0.0"}})


@app.errorhandler(404)
def not_found(e):
    return jsonify({"code": 404, "message": "接口不存在", "data": None}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"code": 500, "message": f"服务器错误: {str(e)}", "data": None}), 500


if __name__ == '__main__':
    print("🚀 初始化数据库...")
    init_db()
    seed_data()
    print("✅ 数据库就绪")
    print("🌐 启动 AI 巡检平台后端服务 http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=True, use_reloader=False)
