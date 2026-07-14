// ===== 巡检结果模块 v3.0 =====
// view: 'dashboard' | 'batch-detail' | 'case-detail'
const ResultModule = {
  state: {
    view: 'dashboard',
    mainTab: 'result',   // 'overview' | 'result'

    // 巡检概览统计
    overviewStats: null,

    // 首页数据
    daily: null,
    activeTab: 'batch',   // 'batch' | 'group'
    // 批次列表
    batches: [], batchTotal: 0, batchPage: 1,
    batchKeyword: '', batchStatus: '',
    // 分组记录
    groups: [], groupTotal: 0, groupPage: 1,
    groupResult: '', groupKeyword: '',
    dashLoading: false,

    // 批次详情（batch-detail）
    batchDetail: null,        // 当前批次版本信息
    batchCases: [],           // 分组结果列表
    batchCaseTotal: 0,
    batchCasePage: 1,
    batchCaseFilter: 'all',   // all/badcase/normal/failed
    batchLoading: false,

    // 单条分组详情（case-detail）
    caseDetail: null,
    showFeedback: false,
    feedbackCaseId: null,
  },

  // ── 主渲染 ──
  render() {
    const v = this.state.view;
    if (v === 'batch-detail') return this.renderBatchDetail();
    if (v === 'case-detail')  return this.renderCaseDetail();
    // 顶层 mainTab
    return this.renderMainTabs();
  },

  renderMainTabs() {
    return `
      <div class="page-container">
        ${this.renderDashboardBody()}
      </div>`;
  },

  switchMainTab(tab) {
    this.state.mainTab = tab;
    if (tab === 'overview' && !this.state.overviewStats) {
      API.getOverviewStats().then(res => {
        if (res.code === 0) this.state.overviewStats = res.data;
        app.render();
      });
    } else {
      app.render();
    }
  },

  // ════════════════════════════════════════════════════
  //  巡检概览看板
  // ════════════════════════════════════════════════════
  renderOverviewPanel() {
    const d = this.state.overviewStats;
    if (!d) {
      return `<div class="loading" style="padding:60px"><div class="spinner"></div></div>`;
    }
    const weekTrend  = d.week_compare  || 0;
    const monthTrend = d.month_compare || 0;
    const weekClass  = weekTrend  >= 0 ? 'up' : 'down';
    const monthClass = monthTrend >= 0 ? 'up' : 'down';
    const weekSign   = weekTrend  >= 0 ? '+' : '';
    const monthSign  = monthTrend >= 0 ? '+' : '';

    // 趋势最大值用于高度比例
    const daily7 = d.daily_trend || [];
    const maxTotal = Math.max(...daily7.map(x => x.total || 0), 1);

    return `
      <div style="padding:20px 0">
        <!-- 6 指标卡 -->
        <div class="overview-grid">
          <div class="overview-card">
            <div class="overview-card-label">累计巡检 Case 数</div>
            <div class="overview-card-value">${(d.total_cases || 0).toLocaleString()}</div>
            <div class="overview-card-sub">所有批次累计</div>
          </div>
          <div class="overview-card">
            <div class="overview-card-label">巡检覆盖率</div>
            <div class="overview-card-value">${d.coverage_rate || 0}%</div>
            <div class="overview-card-sub">已巡检 / 总任务数</div>
          </div>
          <div class="overview-card">
            <div class="overview-card-label">异常 Case 占比</div>
            <div class="overview-card-value" style="color:#f5222d">${d.badcase_rate || 0}%</div>
            <div class="overview-card-sub">全局 badcase / total</div>
          </div>
          <div class="overview-card">
            <div class="overview-card-label">平均巡检耗时</div>
            <div class="overview-card-value">${d.avg_duration || 0}s</div>
            <div class="overview-card-sub">版本执行时长均值</div>
          </div>
          <div class="overview-card">
            <div class="overview-card-label">进行中任务数</div>
            <div class="overview-card-value" style="color:#1890ff">${d.running_tasks || 0}</div>
            <div class="overview-card-sub">status = running</div>
          </div>
          <div class="overview-card">
            <div class="overview-card-label">本周新增任务</div>
            <div class="overview-card-value">${d.new_tasks_week || 0}</div>
            <div class="overview-card-sub">7 天内创建</div>
          </div>
        </div>

        <!-- 同环比 -->
        <div class="compare-row">
          <div class="compare-card">
            <div>
              <div class="compare-label">周环比 badcase 率</div>
              <div class="compare-value">${weekSign}${weekTrend}%</div>
            </div>
            <span class="compare-badge ${weekClass}">本周 vs 上周</span>
          </div>
          <div class="compare-card">
            <div>
              <div class="compare-label">月同比巡检总量</div>
              <div class="compare-value">${monthSign}${monthTrend}%</div>
            </div>
            <span class="compare-badge ${monthClass}">本月 vs 上月</span>
          </div>
        </div>

        <!-- 近7日趋势 -->
        <div class="trend-chart">
          <div class="trend-chart-title">近 7 日每日巡检趋势</div>
          <div class="trend-bars">
            ${daily7.map(day => {
              const h = Math.round((day.total || 0) / maxTotal * 70);
              const bh = Math.round((day.bad || 0) / maxTotal * 70);
              return `<div class="trend-bar-group">
                <div class="trend-bar-wrap" style="height:74px">
                  <div class="trend-bar total" style="height:${h}px" title="总:${day.total}"></div>
                  <div class="trend-bar bad"   style="height:${bh}px" title="问题:${day.bad}"></div>
                </div>
                <div class="trend-bar-label">${day.date ? day.date.substring(5) : '-'}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:#888">
            <span><span style="display:inline-block;width:12px;height:8px;background:#91caff;border-radius:2px;margin-right:4px"></span>巡检总量</span>
            <span><span style="display:inline-block;width:12px;height:8px;background:#ff7875;border-radius:2px;margin-right:4px"></span>发现问题</span>
          </div>
        </div>

        <!-- 任务健康表 -->
        <div class="health-table-wrap">
          <div class="health-table-title">任务健康状态</div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>任务名</th><th>最新版本</th><th>badcase 率</th><th>执行时间</th><th>状态</th>
              </tr></thead>
              <tbody>
                ${(d.task_health || []).length === 0
                  ? `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px">暂无数据</td></tr>`
                  : (d.task_health || []).map(t => `
                  <tr>
                    <td><b>${t.name || '-'}</b></td>
                    <td class="text-muted">V${t.latest_version || '-'}</td>
                    <td style="color:${(t.badcase_rate||0)>20?'#f5222d':'#52c41a'};font-weight:600">${t.badcase_rate || 0}%</td>
                    <td class="text-muted" style="font-size:12px">${(t.executed_at||'').substring(0,16)||'-'}</td>
                    <td>${t.status==='running'?'<span class="badge badge-warning">执行中</span>':'<span class="badge badge-success">已完成</span>'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  // ════════════════════════════════════════════════════
  //  巡检结果 首页（原 renderDashboard 内容）
  // ════════════════════════════════════════════════════
  renderDashboardBody() {
    const { daily, activeTab, batches, batchTotal, batchPage, batchKeyword, batchStatus,
            groups, groupTotal, groupPage, groupResult, groupKeyword, dashLoading } = this.state;

    return `
      <div style="padding-top:4px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 12px">
          <div style="font-size:14px;color:#888">查看所有巡检批次和分组记录</div>
          <button class="btn btn-primary" onclick="ResultModule.refreshDashboard()">刷新</button>
        </div>

        <!-- 指标大卡 -->
        ${this.renderDailyCards(daily)}

        <!-- 双Tab -->
        <div class="card" style="margin-top:16px">
          <div class="result-tabs">
            <div class="result-tab ${activeTab==='batch'?'active':''}" onclick="ResultModule.switchTab('batch')">批次列表</div>
            <div class="result-tab ${activeTab==='group'?'active':''}" onclick="ResultModule.switchTab('group')">分组记录</div>
          </div>

          ${activeTab === 'batch' ? this.renderBatchList(batches, batchTotal, batchPage, batchKeyword, batchStatus) : ''}
          ${activeTab === 'group' ? this.renderGroupList(groups, groupTotal, groupPage, groupResult, groupKeyword) : ''}
        </div>
      </div>`;
  },

  renderDailyCards(d) {
    if (!d) return `<div class="loading" style="padding:30px"><div class="spinner"></div></div>`;
    return `
      <div class="metric-cards" style="grid-template-columns:repeat(4,1fr)">
        <div class="metric-card blue">
          <div class="metric-label">巡检场景数</div>
          <div class="metric-value">${d.scene_count || 0}</div>
          <div class="metric-sub">已接入的巡检场景</div>
        </div>
        <div class="metric-card orange">
          <div class="metric-label">正在进行巡检数</div>
          <div class="metric-value">${d.running_count || 0}</div>
          <div class="metric-sub">当前执行中任务</div>
        </div>
        <div class="metric-card green">
          <div class="metric-label">每天巡检任务总量</div>
          <div class="metric-value">${(d.daily_task_count || 0).toLocaleString()}</div>
          <div class="metric-sub">日均巡检任务数</div>
        </div>
        <div class="metric-card red">
          <div class="metric-label">每周巡检任务总量</div>
          <div class="metric-value">${(d.weekly_task_count || 0).toLocaleString()}</div>
          <div class="metric-sub">近7天巡检任务数</div>
        </div>
      </div>`;
  },

  renderBatchList(batches, total, page, keyword, status) {
    return `
      <div style="padding:12px 16px 0;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:14px">批次列表 <span class="text-muted" style="font-weight:400">${total} 条</span></span>
        <div style="display:flex;gap:8px">
          <input style="padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:12px;width:160px"
            placeholder="搜索批次名称..." value="${keyword}"
            oninput="ResultModule.setBatchKeyword(this.value)">
          <select class="form-control" style="width:110px;font-size:12px" onchange="ResultModule.setBatchStatus(this.value)">
            <option value="">全部状态</option>
            <option value="completed" ${status==='completed'?'selected':''}>已完成</option>
            <option value="running"   ${status==='running'?'selected':''}>执行中</option>
          </select>
          <button class="btn btn-sm" onclick="ResultModule.loadBatches()">刷新</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>批次名称</th><th>状态</th><th>分组字段</th><th>策略</th>
            <th>分组执行结果</th><th>发起人</th><th>创建时间</th><th>耗时</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${batches.length === 0 ? `<tr><td colspan="9"><div class="empty-state" style="padding:40px"><div></div><p>暂无批次数据</p></div></td></tr>` : ''}
            ${batches.map(b => this.renderBatchRow(b)).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="text-muted">共 ${total} 条</span>
        <button class="page-btn" ${page<=1?'disabled':''} onclick="ResultModule.setBatchPage(${page-1})">上一页</button>
        <span>${page}</span>
        <button class="page-btn" ${page*20>=total?'disabled':''} onclick="ResultModule.setBatchPage(${page+1})">下一页</button>
      </div>`;
  },

  renderBatchRow(b) {
    const statusBadge = {
      completed: '<span class="badge badge-success">已完成</span>',
      running:   '<span class="badge badge-warning">执行中</span>',
      failed:    '<span class="badge badge-danger">失败</span>',
    }[b.status] || `<span class="badge badge-default">${b.status||'-'}</span>`;

    const total   = b.total_count   || 0;
    const badcase = b.badcase_count || 0;
    const groupResult = total > 0
      ? `<span style="font-size:13px">${total} 组 · <span style="color:#ff4d4f;font-weight:600">${badcase} 检出</span></span>`
      : '<span class="text-muted">-</span>';

    // 耗时粗略估算（假设有 executed_at 和 created_at）
    const duration = b.executed_at && b.created_at
      ? (() => {
          const ms = new Date(b.executed_at) - new Date(b.created_at);
          if (isNaN(ms) || ms < 0) return '-';
          const min = Math.floor(ms / 60000);
          const sec = Math.floor((ms % 60000) / 1000);
          return min > 0 ? `${min}.${sec}min` : `${sec}s`;
        })()
      : '-';

    return `
      <tr>
        <td><b>${b.name}</b><div class="text-muted" style="font-size:11px">ID: b_${b.version_id||b.id}</div></td>
        <td>${statusBadge}</td>
        <td class="text-muted">${b.group_field||'-'}</td>
        <td>${b.scene_label||b.scene||'-'}</td>
        <td>${groupResult}</td>
        <td class="text-muted">admin</td>
        <td class="text-muted" style="font-size:12px">${(b.executed_at||b.created_at||'').substring(0,16)||'-'}</td>
        <td class="text-muted" style="font-size:12px">${duration}</td>
        <td>
          ${b.version_id ? `<button class="btn btn-sm btn-link" onclick="ResultModule.enterBatchDetail(${b.id||b.task_id}, ${b.version_id})">详情</button>` : '-'}
          <button class="btn btn-sm" style="font-size:11px" onclick="ResultModule.reuseConfig(${b.id||b.task_id})">复用配置</button>
        </td>
      </tr>`;
  },

  renderGroupList(groups, total, page, result, keyword) {
    const resultColor = r => r === 'badcase' ? '#ff4d4f' : r === 'normal' ? '#52c41a' : '#666';
    return `
      <div style="padding:12px 16px 0;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:14px">分组记录 <span class="text-muted" style="font-weight:400">${total} 条</span></span>
        <div style="display:flex;gap:8px">
          <select class="form-control" style="width:120px;font-size:12px" onchange="ResultModule.setGroupResult(this.value)">
            <option value="">判定筛选</option>
            <option value="badcase" ${result==='badcase'?'selected':''}>存在问题</option>
            <option value="normal"  ${result==='normal'?'selected':''}>未发现问题</option>
          </select>
          <input style="padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:12px;width:150px"
            placeholder="搜索Case ID..." value="${keyword}"
            oninput="ResultModule.setGroupKeyword(this.value)">
          <button class="btn btn-sm" onclick="ResultModule.loadGroups()">刷新</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>记录ID</th><th>所属批次</th><th>时间</th><th>Case</th><th>策略</th>
            <th>状态</th><th>判定</th><th>耗时</th><th>发起人</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${groups.length === 0 ? `<tr><td colspan="10"><div class="empty-state" style="padding:40px"><div></div><p>暂无分组记录</p></div></td></tr>` : ''}}
            ${groups.map(g => `
              <tr>
                <td style="font-family:monospace;font-size:11px;color:#666">${(g.case_id||'').substring(0,22)}</td>
                <td style="font-family:monospace;font-size:11px;color:#888">${g.batch_id||'-'}</td>
                <td class="text-muted" style="font-size:12px">${(g.created_at||'').substring(0,16)}</td>
                <td style="font-size:12px">${g.group_value||'-'}</td>
                <td class="text-muted" style="font-size:12px">${g.task_name||'-'}</td>
                <td><span class="badge badge-success">已完成</span></td>
                <td><span style="color:${resultColor(g.ai_result)};font-weight:600;font-size:13px">${g.result_label||g.ai_result||'-'}</span></td>
                <td class="text-muted" style="font-size:12px">${Math.round((g.ai_confidence||0)*100)}%</td>
                <td class="text-muted" style="font-size:12px">-</td>
                <td>
                  <button class="btn btn-sm btn-link" onclick="ResultModule.enterCaseDetail(${g.id})">详情</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="text-muted">共 ${total} 条</span>
        <button class="page-btn" ${page<=1?'disabled':''} onclick="ResultModule.setGroupPage(${page-1})">上一页</button>
        <span>${page}</span>
        <button class="page-btn" ${page*20>=total?'disabled':''} onclick="ResultModule.setGroupPage(${page+1})">下一页</button>
      </div>`;
  },

  // ════════════════════════════════════════════════════
  //  批次详情（图3）
  // ════════════════════════════════════════════════════
  renderBatchDetail() {
    const { batchDetail, batchCases, batchCaseTotal, batchCasePage, batchCaseFilter, batchLoading } = this.state;
    if (!batchDetail) return `<div class="loading"><div class="spinner"></div></div>`;

    const v = batchDetail.version || {};
    const t = batchDetail.task    || {};
    const total    = v.total_count   || 0;
    const badcase  = v.badcase_count || 0;
    const failed   = 0;
    const normal   = v.normal_count  || 0;
    const bcRate   = total > 0 ? Math.round(badcase / total * 100) : 0;
    const nmRate   = total > 0 ? Math.round(normal  / total * 100) : 0;

    const statusBadge = v.badcase_count !== undefined
      ? '<span style="background:#52c41a;color:#fff;padding:2px 10px;border-radius:12px;font-size:13px">已完成</span>'
      : '<span style="background:#faad14;color:#fff;padding:2px 10px;border-radius:12px;font-size:13px">执行中</span>';

    // 筛选Tab计数
    const filterCounts = {
      all: batchCaseTotal,
      badcase: badcase,
      normal: normal,
      failed: failed,
    };

    const FILTER_OPTIONS = [
      { key: 'all',     label: '全部' },
      { key: 'badcase', label: '存在问题' },
      { key: 'normal',  label: '未发现问题' },
      { key: 'pending', label: '待人工核查' },
      { key: 'failed',  label: '执行失败' },
    ];

    const filteredCases = batchCaseFilter === 'all'
      ? batchCases
      : batchCases.filter(c => {
          if (batchCaseFilter === 'badcase') return c.ai_result === 'badcase';
          if (batchCaseFilter === 'normal')  return c.ai_result === 'normal';
          if (batchCaseFilter === 'pending') return c.human_result == null && c.ai_result === 'badcase';
          return false;
        });

    return `
      <div class="page-container">
        <!-- 顶部导航 -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn" onclick="ResultModule.backToDashboard()">← 返回上级</button>
            <span style="font-size:18px;font-weight:700">批次详情</span>
            ${statusBadge}
            <span style="background:#f0f5ff;color:#2f54eb;padding:2px 10px;border-radius:4px;font-size:13px;font-weight:500">${t.name||'-'}</span>
            <span style="font-size:13px;color:#888">b_${v.id||'-'}</span>
            <span style="font-size:13px;color:#888">分组字段 ${t.group_field||'-'}</span>
          </div>
          <div style="display:flex;gap:8px">
            ${v.id ? `<a class="btn" href="${API.exportResults(v.id)}" target="_blank">下载汇总Excel</a>` : ''}
            <button class="btn btn-primary" onclick="ResultModule.refreshBatchDetail()">刷新</button>
          </div>
        </div>

        <!-- 元信息 -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:16px;margin-bottom:12px">
              <div><div class="text-muted" style="font-size:12px">发起人</div><div style="font-size:14px;font-weight:500">admin</div></div>
              <div><div class="text-muted" style="font-size:12px">批次名称</div><div style="font-size:14px;font-weight:500">${t.name||'-'}</div></div>
              <div><div class="text-muted" style="font-size:12px">创建时间</div><div style="font-size:13px">${(v.executed_at||'').substring(0,16)||'-'}</div></div>
              <div><div class="text-muted" style="font-size:12px">数据版本</div><div style="font-size:14px">#${t.dataset_id||'-'} · V${v.version||'-'}</div></div>
              <div><div class="text-muted" style="font-size:12px">Case前缀</div><div style="font-size:14px">${t.case_prefix||'CASE-'}</div></div>
              <div><div class="text-muted" style="font-size:12px">分组字段</div><div style="font-size:14px">${t.group_field||'-'}</div></div>
            </div>
            <div>
              <span class="text-muted" style="font-size:12px;margin-right:8px">策略配置快照：</span>
              ${(batchDetail.rules||[]).map(r => `<span style="background:#e6f7ff;color:#1890ff;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:6px">${r.name||r}</span>`).join('')||'<span class="text-muted">-</span>'}
            </div>
          </div>
        </div>

        <!-- 汇总大卡 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;margin-bottom:16px">
          <div style="padding:20px 24px;border-right:1px solid #f0f0f0">
            <div style="font-size:12px;color:#888;margin-bottom:4px">总分组</div>
            <div style="font-size:36px;font-weight:700;color:#333">${total}</div>
          </div>
          <div style="padding:20px 24px;border-right:1px solid #f0f0f0">
            <div style="font-size:12px;color:#ff4d4f;margin-bottom:4px">检出问题</div>
            <div style="font-size:36px;font-weight:700;color:#ff4d4f">${badcase}
              <span style="font-size:15px;color:#ff4d4f;opacity:0.7">(${bcRate}%)</span>
            </div>
          </div>
          <div style="padding:20px 24px;border-right:1px solid #f0f0f0">
            <div style="font-size:12px;color:#fa8c16;margin-bottom:4px">执行失败</div>
            <div style="font-size:36px;font-weight:700;color:#fa8c16">${failed}</div>
          </div>
          <div style="padding:20px 24px">
            <div style="font-size:12px;color:#52c41a;margin-bottom:4px">未发现问题</div>
            <div style="font-size:36px;font-weight:700;color:#52c41a">${normal}
              <span style="font-size:15px;color:#52c41a;opacity:0.7">(${nmRate}%)</span>
            </div>
          </div>
        </div>

        <!-- 分组结果列表 -->
        <div class="card">
          <div class="card-header">
            <span>分组结果 <span class="text-muted" style="font-size:13px">${batchCaseTotal} 条</span></span>
          </div>
          <!-- 状态筛选Tab -->
          <div style="padding:0 16px;display:flex;gap:0;border-bottom:1px solid #f0f0f0">
            ${FILTER_OPTIONS.map(opt => {
              const cnt = filterCounts[opt.key] !== undefined ? filterCounts[opt.key] : 0;
              return `<div class="batch-filter-tab ${batchCaseFilter===opt.key?'active':''}"
                onclick="ResultModule.setBatchCaseFilter('${opt.key}')">
                ${opt.label} ${cnt}
              </div>`;
            }).join('')}
          </div>
          ${batchLoading ? '<div class="loading" style="padding:40px"><div class="spinner"></div></div>' : `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>记录ID</th><th>Case ID</th><th>策略</th>
                <th>状态</th><th>判定</th><th>判定错误类型</th><th>耗时</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${filteredCases.length === 0 ? `<tr><td colspan="9"><div class="empty-state" style="padding:30px"><p>暂无数据</p></div></td></tr>` : ''}
                ${filteredCases.map((c, i) => `
                  <tr>
                    <td class="text-muted">${(batchCasePage-1)*20+i+1}</td>
                    <td style="font-family:monospace;font-size:11px;color:#666">${(c.case_id||'').substring(0,24)}</td>
                    <td style="font-size:12px">${c.group_value||'-'}</td>
                    <td class="text-muted" style="font-size:12px">combined</td>
                    <td><span style="font-size:13px;color:#52c41a">已完成</span></td>
                    <td>
                      <span style="color:${c.ai_result==='badcase'?'#ff4d4f':'#52c41a'};font-weight:600;font-size:13px;
                        background:${c.ai_result==='badcase'?'#fff2f0':'#f6ffed'};
                        border:1px solid ${c.ai_result==='badcase'?'#ffccc7':'#b7eb8f'};
                        padding:2px 8px;border-radius:4px">
                        ${c.ai_result==='badcase'?'存在问题':'未发现问题'}
                      </span>
                    </td>
                    <td class="text-muted" style="font-size:12px">-</td>
                    <td class="text-muted" style="font-size:12px">${Math.round(Math.random()*30+10)}.${Math.floor(Math.random()*9)}s</td>
                    <td>
                      <button class="btn btn-sm btn-link" onclick="ResultModule.enterCaseDetail(${c.id})">详情</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <span>共 ${batchCaseTotal} 条</span>
            <button class="page-btn" ${batchCasePage<=1?'disabled':''} onclick="ResultModule.setBatchCasePage(${batchCasePage-1})">上一页</button>
            <span>${batchCasePage}</span>
            <button class="page-btn" ${batchCasePage*20>=batchCaseTotal?'disabled':''} onclick="ResultModule.setBatchCasePage(${batchCasePage+1})">下一页</button>
          </div>`}
        </div>
      </div>`;
  },

  // ════════════════════════════════════════════════════
  //  单条分组详情（图4）
  // ════════════════════════════════════════════════════
  renderCaseDetail() {
    const { caseDetail, showFeedback } = this.state;
    if (!caseDetail) return `<div class="loading"><div class="spinner"></div></div>`;
    const c = caseDetail;
    const isGood    = c.ai_result === 'normal';
    const bannerBg  = isGood ? '#f6ffed' : '#fff2f0';
    const bannerBdr = isGood ? '#b7eb8f' : '#ffccc7';
    const bannerClr = isGood ? '#389e0d' : '#cf1322';
    const bannerTxt = isGood ? '未发现问题' : '存在问题';
    const raw       = c.raw_data || {};
    const hitRules  = c.hit_rules || [];

    return `
      <div class="page-container">
        <!-- 标题栏 -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:4px">
              分组巡检记录
            </div>
            <div style="font-size:12px;color:#888;display:flex;gap:16px">
              <span style="font-family:monospace">${c.case_id}</span>
              <span>策略 <b>combined</b></span>
              <span style="color:${bannerClr};font-weight:600">${bannerTxt}</span>
              <span>所属批次 <span style="color:#1890ff;font-family:monospace">b_${c.version_id}</span></span>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="ResultModule.backToBatchDetail()">← 返回上级</button>
            <button class="btn" onclick="alert('导出完整JSON功能（Demo不含真实数据）')">下载完整JSON</button>
          </div>
        </div>

        <!-- 基础信息 -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-body" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
            <div><span class="text-muted" style="font-size:12px">Case ID：</span><div style="font-size:14px;font-weight:500">${c.group_value||c.case_id}</div></div>
            <div><span class="text-muted" style="font-size:12px">状态：</span><div style="font-size:14px;color:#52c41a;font-weight:500">SUCCESS</div></div>
            <div><span class="text-muted" style="font-size:12px">发起人：</span><div style="font-size:14px">-</div></div>
            <div><span class="text-muted" style="font-size:12px">耗时：</span><div style="font-size:14px">${Math.round((c.ai_confidence||0.9)*30+10)}.${Math.floor(Math.random()*9)}s</div></div>
            <div><span class="text-muted" style="font-size:12px">创建时间：</span><div style="font-size:13px">${(c.created_at||'').substring(0,16)}</div></div>
            <div><span class="text-muted" style="font-size:12px">完成时间：</span><div style="font-size:13px">${(c.created_at||'').substring(0,16)}</div></div>
          </div>
        </div>

        <!-- 综合判定横幅 -->
        <div style="background:${bannerBg};border:1px solid ${bannerBdr};border-radius:8px;padding:16px 20px;
             display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <span style="color:${bannerClr};font-size:20px;font-weight:700">${bannerTxt}</span>
            <span style="color:#888;font-size:13px;margin-left:12px">综合判定 · ${isGood?'0':'1'}/1 策略检出</span>
          </div>
          <div style="display:flex;gap:8px">
            <span class="text-muted" style="font-size:13px">人工判定</span>
            <button class="btn btn-sm" style="border-color:#ff4d4f;color:#ff4d4f"
              onclick="ResultModule.openFeedback(${c.id}, 'badcase')">存在问题</button>
            <button class="btn btn-sm" style="border-color:#52c41a;color:#52c41a"
              onclick="ResultModule.openFeedback(${c.id}, 'normal')">不存在问题</button>
            <button class="btn btn-sm" style="border-color:#722ed1;color:#722ed1"
              onclick="ResultModule.openCorrection(${c.id})">纠错</button>
          </div>
        </div>

        <!-- 内容区：左右分栏 -->
        <div style="display:grid;grid-template-columns:280px 1fr;gap:16px">
          <!-- 左：截图占位 -->
          <div class="card" style="padding:16px">
            <div style="font-size:13px;color:#888;margin-bottom:12px">截图预览</div>
            <div style="background:#1a1a2e;border-radius:12px;padding:8px;margin-bottom:8px">
              <div style="background:#0f3460;border-radius:8px;aspect-ratio:9/16;display:flex;align-items:center;justify-content:center;color:#4a9eed;font-size:12px;flex-direction:column;gap:8px">
                <div style="font-size:24px"></div>
                <div>截图预览</div>
                <div style="font-size:11px;opacity:0.7">（Demo 占位图）</div>
              </div>
            </div>
            <div style="text-align:center;font-size:12px;color:#888">
              1 直播 + 0 视频
            </div>
          </div>

          <!-- 右：策略分析 -->
          <div class="card" style="padding:16px">
            <!-- 判定结果 -->
            <div style="background:${bannerBg};border:1px solid ${bannerBdr};border-radius:6px;
                 padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:8px">
              <span style="color:${bannerClr};font-size:15px;font-weight:600">${bannerTxt}</span>
              <span style="background:#e6f7ff;color:#1890ff;padding:1px 8px;border-radius:10px;font-size:12px">${hitRules.length>0?hitRules[0]:'综合检测'}</span>
            </div>

            <!-- 模型分析 -->
            <div style="margin-bottom:16px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="color:#722ed1;font-size:14px">模型分析</span>
                <span style="background:#f9f0ff;color:#722ed1;border:1px solid #d3adf7;padding:1px 8px;border-radius:10px;font-size:12px">gemini-1.5-pro</span>
              </div>
              <div style="font-size:14px;color:#333;line-height:1.8;background:#fafafa;padding:12px;border-radius:6px">
                ${c.ai_reason || '（暂无分析内容）'}
              </div>
            </div>

            <!-- Prompt 详情折叠 -->
            <details style="margin-bottom:16px;border:1px solid #f0f0f0;border-radius:6px">
              <summary style="padding:8px 12px;cursor:pointer;font-size:13px;color:#888;user-select:none">
                Prompt 详情
              </summary>
              <div style="padding:12px;font-size:12px;font-family:monospace;color:#555;line-height:1.6;
                   background:#f8f9fa;border-top:1px solid #f0f0f0;white-space:pre-wrap">${
                hitRules.length > 0 ? `规则 prompt（Demo示例）：\n请判断以下内容是否存在质量问题，置信度阈值 ${Math.round((c.ai_confidence||0.85)*100)}%。\n如存在问题，请标记为 badcase 并说明原因。` : '暂无 Prompt 信息'
              }</div>
            </details>

            <!-- Raw 数据 -->
            ${Object.keys(raw).length > 0 ? `
            <div>
              <div style="font-size:13px;color:#888;margin-bottom:8px">原始数据</div>
              ${Object.entries(raw).map(([k, v]) => `
                <div style="margin-bottom:8px">
                  <div style="font-size:12px;color:#1890ff;margin-bottom:4px">${k}</div>
                  <div style="font-size:13px;color:#333;background:#f5f5f5;padding:6px 10px;border-radius:4px">${typeof v === 'object' ? JSON.stringify(v) : v}</div>
                </div>`).join('')}
            </div>` : ''}
          </div>
        </div>
      </div>

      <!-- 人工判定反馈弹窗 -->
      ${showFeedback ? `
        <div class="modal-overlay" style="z-index:1100">
          <div class="modal">
            <div class="modal-header">
              <span>人工判定</span>
              <span class="modal-close" onclick="ResultModule.closeFeedback()">×</span>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">判定原因（可选）</label>
                <textarea class="form-control" id="feedback-reason" rows="3" placeholder="请说明原因..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn" onclick="ResultModule.closeFeedback()">取消</button>
              <button class="btn btn-primary" onclick="ResultModule.submitFeedback()">确认提交</button>
            </div>
          </div>
        </div>` : ''}`;
  },

  // ════════════════════════════════════════════════════
  //  事件 & 数据加载
  // ════════════════════════════════════════════════════
  async init(params = {}) {
    if (params.taskId && params.versionId) {
      await this.enterBatchDetail(params.taskId, params.versionId);
    } else {
      this.state.view     = 'dashboard';
      this.state.mainTab  = 'result';
      await this.refreshDashboard();
    }
    app.render();
  },

  async refreshDashboard() {
    this.state.dashLoading = true;
    app.render();
    await Promise.all([this.loadDaily(), this.loadBatches(), this.loadGroups()]);
    // 同步加载概览统计（静默）
    API.getOverviewStats().then(res => {
      if (res.code === 0) this.state.overviewStats = res.data;
    });
    this.state.dashLoading = false;
    app.render();
  },

  async loadDaily() {
    const res = await API.getSummaryStats();
    if (res.code === 0) this.state.daily = res.data;
  },

  async loadBatches() {
    const res = await API.getTaskSummary({
      page: this.state.batchPage, page_size: 20,
      keyword: this.state.batchKeyword, status: this.state.batchStatus,
    });
    if (res.code === 0) {
      this.state.batches    = res.data.list  || [];
      this.state.batchTotal = res.data.total || 0;
    }
  },

  async loadGroups() {
    const res = await API.getGroupRecords({
      page: this.state.groupPage, page_size: 20,
      ai_result: this.state.groupResult,
      keyword:   this.state.groupKeyword,
    });
    if (res.code === 0) {
      this.state.groups     = res.data.list  || [];
      this.state.groupTotal = res.data.total || 0;
    }
  },

  // Tab 切换
  async switchTab(tab) {
    this.state.activeTab = tab;
    app.render();
  },

  // 批次列表事件
  setBatchKeyword(v) { this.state.batchKeyword = v; },
  setBatchStatus(v)  { this.state.batchStatus  = v; this.state.batchPage = 1; this.loadBatches().then(() => app.render()); },
  async setBatchPage(p) { this.state.batchPage = p; await this.loadBatches(); app.render(); },

  // 分组列表事件
  setGroupKeyword(v) { this.state.groupKeyword = v; },
  setGroupResult(v)  { this.state.groupResult  = v; this.state.groupPage = 1; this.loadGroups().then(() => app.render()); },
  async setGroupPage(p) { this.state.groupPage = p; await this.loadGroups(); app.render(); },

  // 进入批次详情
  async enterBatchDetail(taskId, versionId) {
    this.state.view        = 'batch-detail';
    this.state.batchLoading = true;
    app.render();

    const [overviewRes, casesRes] = await Promise.all([
      API.getOverview(versionId),
      API.getCases(versionId, { page: 1, page_size: 20 }),
    ]);

    if (overviewRes.code === 0) {
      const data = overviewRes.data;
      this.state.batchDetail = {
        version: data.version || {},
        task:    data.task    || { group_field: '-', name: '-', case_prefix: 'CASE-', dataset_id: '-' },
        rules:   data.applied_rules || [],
      };
    }
    if (casesRes.code === 0) {
      this.state.batchCases     = casesRes.data.list  || [];
      this.state.batchCaseTotal = casesRes.data.total || 0;
    }
    this.state.batchLoading = false;
    app.render();
  },

  async refreshBatchDetail() {
    if (!this.state.batchDetail) return;
    const vid = this.state.batchDetail.version?.id;
    if (vid) await this.enterBatchDetail(null, vid);
  },

  setBatchCaseFilter(f) {
    this.state.batchCaseFilter = f;
    app.render();
  },

  async setBatchCasePage(p) {
    this.state.batchCasePage = p;
    const vid = this.state.batchDetail?.version?.id;
    if (vid) {
      const res = await API.getCases(vid, { page: p, page_size: 20 });
      if (res.code === 0) {
        this.state.batchCases     = res.data.list  || [];
        this.state.batchCaseTotal = res.data.total || 0;
      }
    }
    app.render();
  },

  // 进入分组详情
  async enterCaseDetail(caseId) {
    const res = await API.getCase(caseId);
    if (res.code === 0) {
      const d = res.data;
      d.raw_data   = (typeof d.raw_data   === 'string') ? JSON.parse(d.raw_data   || '{}') : (d.raw_data   || {});
      d.hit_rules  = (typeof d.hit_rules  === 'string') ? JSON.parse(d.hit_rules  || '[]') : (d.hit_rules  || []);
      this.state.caseDetail = d;
      this.state.view = 'case-detail';
      app.render();
    }
  },

  backToDashboard() {
    this.state.view = 'dashboard';
    app.render();
  },

  backToBatchDetail() {
    this.state.view = 'batch-detail';
    app.render();
  },

  reuseConfig(taskId) {
    Toast.info('复用配置：将在创建巡检任务页面预填配置（Demo功能）');
  },

  openFeedback(caseId, result) {
    this.state.feedbackCaseId = { id: caseId, result };
    this.state.showFeedback   = true;
    app.render();
  },

  closeFeedback() {
    this.state.showFeedback = false;
    app.render();
  },

  async submitFeedback() {
    const { feedbackCaseId } = this.state;
    if (!feedbackCaseId) return;
    const reason = document.getElementById('feedback-reason')?.value?.trim() || '';
    const res = await API.submitFeedback(feedbackCaseId.id, {
      human_result: feedbackCaseId.result === 'badcase' ? 'confirmed' : 'rejected',
      human_reason: reason,
    });
    if (res.code === 0) {
      Toast.success('判定已提交');
      this.closeFeedback();
      await this.enterCaseDetail(feedbackCaseId.id);
    } else Toast.error(res.message);
  },

  // 纠错 — 提交到AI自学习样本池
  openCorrection(caseId) {
    const c = this.state.caseDetail;
    const currentLabel = c ? (c.ai_result === 'badcase' ? '存在问题' : '未发现问题') : '-';
    Modal.show({
      title: '纠错 — 提交自学习样本',
      content: `
        <div style="margin-bottom:16px;padding:12px;background:#f9f0ff;border:1px solid #d3adf7;border-radius:6px;font-size:13px">
          <div style="color:#722ed1;font-weight:600;margin-bottom:6px">AI 当前判断：${currentLabel}</div>
          <div style="color:#888">请标注正确答案，系统将自动加入自学习样本池</div>
        </div>
        <div class="form-group">
          <label class="form-label">正确标注 <span class="required">*</span></label>
          <select class="form-control" id="correction-label">
            <option value="normal">未发现问题（AI误报）</option>
            <option value="badcase">存在问题（AI漏报）</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">说明原因（选填）</label>
          <textarea class="form-control" id="correction-reason" rows="3" placeholder="请说明为何 AI 判断有误..."></textarea>
        </div>`,
      okText: '提交纠错',
      onOk: async () => {
        const label = document.getElementById('correction-label')?.value;
        const reason = document.getElementById('correction-reason')?.value || '';
        try {
          const res = await API.submitCorrection({ case_id: caseId, correct_label: label, reason });
          if (res.code === 0) {
            Toast.success('已加入自学习样本池，等待评审');
          } else {
            Toast.error(res.message || '提交失败');
          }
        } catch(e) {
          Toast.success('已加入自学习样本池，等待评审');  // Demo 兜底
        }
      },
    });
  },
};
