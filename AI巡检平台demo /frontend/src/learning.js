// ===== AI自学习模块（从 CapabilityModule 拆分）=====
const LearningModule = {
  state: {
    samples: [],
    loading: false,
    total: 0,
  },

  render() {
    const { samples, loading, total } = this.state;
    return `
      <div class="page-container">
        <div class="page-header">
          <div>
            <h3>AI自学习</h3>
            <p>通过少样本学习和业务评测集，实现巡检模型和策略的持续优化与迭代</p>
          </div>
        </div>

        <div class="card">
          <div style="padding:20px">
            <!-- 功能介绍 Banner -->
            <div class="learning-banner">
              <div class="learning-banner-title">AI自学习系统</div>
              <div class="learning-banner-desc">通过少样本学习和业务评测集，实现巡检模型和策略的持续优化与迭代，提升巡检的准确性和适应性。</div>
              <div class="learning-flow">
                ${['发现误判','提交纠错','进入样本池','等待评审','模型迭代更新'].map((step, i, arr) => `
                  <div class="learning-flow-step">
                    <div class="learning-flow-dot">${i+1}</div>
                    <div class="learning-flow-label">${step}</div>
                  </div>
                  ${i < arr.length - 1 ? '<div class="learning-flow-arrow">→</div>' : ''}
                `).join('')}
              </div>
            </div>

            <!-- 操作说明 -->
            <div class="learning-guide">
              <div class="learning-guide-icon">i</div>
              <div>
                <b>如何使用纠错功能？</b>
                <div style="margin-top:4px;font-size:13px;color:#666">
                  在「巡检结果」→ Case详情页中，点击 <span style="color:#722ed1;font-weight:600">纠错</span> 按钮，
                  提交正确标注。系统将自动收集样本并送审，通过后自动加入模型训练集。
                </div>
              </div>
            </div>

            <!-- 样本池列表 -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px">
              <div style="font-size:15px;font-weight:600">自学习样本池
                <span style="font-size:12px;font-weight:400;color:#888;margin-left:8px">共 ${total} 条</span>
              </div>
              <button class="btn btn-sm" onclick="LearningModule.load()">刷新</button>
            </div>

            ${loading
              ? '<div class="loading" style="padding:40px"><div class="spinner"></div></div>'
              : this.renderSamples(samples)}
          </div>
        </div>
      </div>`;
  },

  renderSamples(samples) {
    if (samples.length === 0) {
      return `
        <div class="empty-state" style="padding:60px">
          <div></div>
          <p>暂无自学习样本</p>
          <small>在Case详情页点击"纠错"提交错误标注后，样本将出现在这里</small>
        </div>`;
    }
    const statusMap = {
      'pending':  '<span class="badge badge-warning">等待评审</span>',
      'accepted': '<span class="badge badge-success">已采纳</span>',
      'rejected': '<span class="badge badge-danger">已拒绝</span>',
    };
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Case ID</th><th>AI 原判断</th><th>人工标注</th><th>说明原因</th><th>提交时间</th><th>状态</th>
          </tr></thead>
          <tbody>
            ${samples.map(s => `
              <tr>
                <td><span style="font-family:monospace;font-size:12px;color:#1890ff">CASE-${String(s.case_id).padStart(4,'0')}</span></td>
                <td>${s.original_label === 'badcase' ? '<span style="color:#f5222d">存在问题</span>' : '<span style="color:#52c41a">未发现问题</span>'}</td>
                <td>${s.correct_label === 'badcase' ? '<span style="color:#f5222d">存在问题</span>' : '<span style="color:#52c41a">未发现问题</span>'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#666">${s.reason || '-'}</td>
                <td class="text-muted">${(s.created_at||'').substring(0,16)||'-'}</td>
                <td>${statusMap[s.status] || statusMap['pending']}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  async init() {
    await this.load();
    app.render();
  },

  async load() {
    this.state.loading = true;
    app.render();
    try {
      const res = await API.getLearningSamples({ page: 1, page_size: 20 });
      if (res.code === 0) {
        this.state.samples = res.data.list  || [];
        this.state.total   = res.data.total || 0;
      }
    } catch(e) {
      // Demo 兜底 mock 数据
      this.state.samples = [
        { case_id: 1023, original_label: 'normal', correct_label: 'badcase', reason: 'AI未识别出图片中的违禁logo', created_at: '2025-05-20 14:32', status: 'pending' },
        { case_id: 987,  original_label: 'badcase', correct_label: 'normal', reason: '误报，实为正常商品展示', created_at: '2025-05-19 09:15', status: 'accepted' },
        { case_id: 1056, original_label: 'normal', correct_label: 'badcase', reason: '商品描述存在夸大宣传', created_at: '2025-05-18 16:44', status: 'pending' },
      ];
      this.state.total = 3;
    }
    this.state.loading = false;
    app.render();
  },
};
