// ===== 巡检任务模块 (v7.0：三板块重排，板块一圈选升级) =====
const TaskModule = {
  state: {
    // 列表
    list: [], total: 0, page: 1, loading: false,
    filter: { keyword: '', status: '' },
    // 详情页
    detailOpen: false,
    detailTask: null,
    // 新建页
    createOpen: false,
    form: {
      name: '',
      group_field: '',
      case_prefix: 'CASE-',
      // 定时
      schedule: {
        enabled:       false,
        modal_open:    false,
        freq_unit:     'day',
        freq_interval: 1,
        week_days:     [],
        month_day:     1,
        exec_time:     '02:00',
        end_mode:      'count',
        end_count:     30,
        end_date:      '',
      },
      // 板块一：圈选巡检对象
      dsTab: 'existing',         // 'existing' | 'excel' | 'sql'
      dataset_id: null,          // 从已有列表选
      dsName: '',                // 新建时的名称
      uploadFile: null,          // 本地上传文件对象
      sqlContent: '',            // SQL 语句
      sqlValid: null,            // null | 'ok' | 'error'
      sqlMsg: '',
      // 数据预处理
      preprocessEnabled: false,
      preprocess: {
        dataTab: 'live',         // 抽帧配置 tab
        live_id_col: '',
        exposure_ts_col: '',
        max_frames: 1,
        // ASR
        asr_lang: 'zh',
        asr_sample_rate: 16000,
        // 其他场景
        other_label_0: '', other_label_1: '', other_label_2: '',
        other_field_0: '', other_field_1: '', other_field_2: '',
      },
      // 预览数据
      previewRows: [],
      previewFields: [],
      // 巡检能力
      rule_id: null,
      selectedRuleId: null,
      ruleScene: '',
      // 字段映射
      fieldMapping: {},
    },
    datasets: [],
    rules: [],
    progressModal: { show: false, taskId: null, data: null },
    pollingTimer: null,
  },

  WEEK_DAYS: [
    { idx: 0, label: '一' },
    { idx: 1, label: '二' },
    { idx: 2, label: '三' },
    { idx: 3, label: '四' },
    { idx: 4, label: '五' },
    { idx: 5, label: '六' },
    { idx: 6, label: '日' },
  ],

  // ============ 主渲染 ============
  render() {
    if (this.state.detailOpen) return this.renderDetailPage();
    if (this.state.createOpen) return this.renderCreatePage();
    return this.renderListPage();
  },

  // ============ 列表页 ============
  renderListPage() {
    const { list, total, page, loading, filter } = this.state;
    return `
      <div class="page-container">
        <div class="page-header">
          <div>
            <h3>巡检任务</h3>
            <p>管理巡检任务，支持多周期自动巡检</p>
          </div>
          <button class="btn btn-primary" onclick="TaskModule.openCreate()">+ 新建巡检任务</button>
        </div>

        <div class="card">
          <div class="card-body" style="padding-bottom:0">
            <div class="search-bar">
              <input class="search-input" placeholder="搜索任务名称..." value="${filter.keyword}"
                oninput="TaskModule.setFilter('keyword', this.value)">
              <select class="form-control" style="width:140px" onchange="TaskModule.setFilter('status', this.value)">
                <option value="">全部状态</option>
                <option value="pending"   ${filter.status==='pending'   ?'selected':''}>待执行</option>
                <option value="running"   ${filter.status==='running'   ?'selected':''}>执行中</option>
                <option value="completed" ${filter.status==='completed' ?'selected':''}>已完成</option>
                <option value="failed"    ${filter.status==='failed'    ?'selected':''}>失败</option>
              </select>
              <button class="btn btn-primary" onclick="TaskModule.load()">搜索</button>
            </div>
          </div>

          ${loading ? '<div class="loading"><div class="spinner"></div> 加载中...</div>' : `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>任务名称</th><th>巡检对象</th><th>状态</th><th>最新版本</th><th>最近执行</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${list.length === 0
                  ? `<tr><td colspan="6"><div class="empty-state"><div></div><p>暂无巡检任务</p><small>点击右上角创建第一个巡检任务</small></div></td></tr>`
                  : list.map(t => `
                  <tr>
                    <td><b>${t.name}</b><div class="text-muted" style="font-size:11px">结果分类字段：${t.group_field||'-'}</div></td>
                    <td class="text-muted">${t.dataset_name || '-'}</td>
                    <td>${TaskModule.renderStatus(t.status)}</td>
                    <td>${t.latest_version ? `<span class="badge badge-info">v${t.latest_version}</span>` : '-'}</td>
                    <td class="text-muted">${t.last_executed_at ? t.last_executed_at.substring(0,16) : '-'}</td>
                    <td>
                      <button class="btn btn-sm btn-link" onclick="TaskModule.openDetail(${t.id})">查看详情</button>
                      <button class="btn btn-sm btn-link" onclick="TaskModule.viewResult(${t.id}, ${t.latest_version || 0})">查看结果</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <span>共 ${total} 条</span>
            <button class="page-btn" ${page<=1?'disabled':''} onclick="TaskModule.setPage(${page-1})">上一页</button>
            <button class="page-btn active">${page}</button>
            <button class="page-btn" ${page*20>=total?'disabled':''} onclick="TaskModule.setPage(${page+1})">下一页</button>
          </div>`}
        </div>

        ${this.renderProgressModal()}
      </div>`;
  },

  renderStatus(status) {
    const map = {
      pending:   ['badge-default',  '待执行'],
      running:   ['badge-warning',  '执行中'],
      completed: ['badge-success',  '已完成'],
      failed:    ['badge-danger',   '失败'],
    };
    const [cls, text] = map[status] || ['badge-default', status];
    return `<span class="badge ${cls}">${text}</span>`;
  },

  // ============ 任务详情页（二级页面）============
  renderDetailPage() {
    const t = this.state.detailTask;
    if (!t) return '';
    const cfg = (typeof t.config === 'string')
      ? (() => { try { return JSON.parse(t.config); } catch(e) { return {}; } })()
      : (t.config || {});
    const schedCfg = (typeof t.schedule === 'string')
      ? (() => { try { return JSON.parse(t.schedule); } catch(e) { return {}; } })()
      : (t.schedule || {});

    const field = (label, val, mono=false) => `
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label" style="color:#888;font-size:12px">${label}</label>
        <div style="background:#f8f9fa;border:1px solid #f0f0f0;border-radius:6px;padding:8px 12px;font-size:13px;${mono?'font-family:monospace;':''}color:#333">${val ?? '-'}</div>
      </div>`;

    return `
      <div class="page-container">
        <!-- 面包屑 -->
        <div class="breadcrumb-bar" style="display:flex;align-items:center;gap:6px;font-size:13px;color:#888;margin-bottom:12px">
          <a href="#" onclick="TaskModule.closeDetail();return false" style="color:#1890ff;text-decoration:none">巡检任务</a>
          <span>/</span>
          <span style="color:#333;font-weight:500">${t.name}</span>
        </div>

        <div class="page-header" style="margin-bottom:16px">
          <div>
            <h3>${t.name}</h3>
            <p style="color:#888">任务 ID：${t.id} · 创建于 ${t.created_at ? t.created_at.substring(0,10) : '-'}</p>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="TaskModule.closeDetail()">← 返回列表</button>
            <button class="btn btn-primary" onclick="TaskModule.viewResult(${t.id}, ${t.latest_version||0})">查看结果</button>
          </div>
        </div>

        <!-- 状态卡片 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          ${[
            ['当前状态', this.renderStatus(t.status)],
            ['最新版本', t.latest_version ? `<span class="badge badge-info">v${t.latest_version}</span>` : '-'],
            ['最近执行', t.last_executed_at ? t.last_executed_at.substring(0,16) : '-'],
            ['定时巡检', schedCfg.enabled ? '<span class="badge badge-success">已启用</span>' : '<span class="badge badge-default">未启用</span>'],
          ].map(([k,v]) => `
            <div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:14px">
              <div style="font-size:11px;color:#aaa;margin-bottom:6px">${k}</div>
              <div style="font-size:14px;font-weight:600">${v}</div>
            </div>`).join('')}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <!-- 基础信息 -->
          <div class="card" style="margin-bottom:0">
            <div class="card-header" style="font-weight:600;font-size:14px;border-bottom:1px solid #f0f0f0;padding:12px 16px">基础信息</div>
            <div class="card-body">
              ${field('巡检名称', t.name)}
              ${field('结果分类字段', t.group_field || cfg.group_field || '-', true)}
              ${field('Case 命名规则', t.case_prefix || cfg.case_prefix || 'CASE-', true)}
              ${field('关联场景', t.scene || '-')}
            </div>
          </div>

          <!-- 巡检对象 -->
          <div class="card" style="margin-bottom:0">
            <div class="card-header" style="font-weight:600;font-size:14px;border-bottom:1px solid #f0f0f0;padding:12px 16px">巡检对象</div>
            <div class="card-body">
              ${field('数据集名称', t.dataset_name || '-')}
              ${field('来源', t.dataset_source_type === 'excel' ? 'Excel 上传' : t.dataset_source_type === 'sql' ? 'SQL 取数' : '-')}
              ${field('记录数', t.dataset_record_count ? (t.dataset_record_count).toLocaleString() + ' 条' : '-')}
            </div>
          </div>

          <!-- 定时配置 -->
          <div class="card" style="margin-bottom:0">
            <div class="card-header" style="font-weight:600;font-size:14px;border-bottom:1px solid #f0f0f0;padding:12px 16px">定时配置</div>
            <div class="card-body">
              ${schedCfg.enabled ? `
                ${field('状态', '<span class="badge badge-success">已启用</span>')}
                ${field('执行频率', (() => {
                  const unit = {day:'每日',week:'每周',month:'每月'}[schedCfg.freq_unit] || '-';
                  return unit + (schedCfg.freq_interval > 1 ? '（间隔'+schedCfg.freq_interval+'天）' : '');
                })())}
                ${field('执行时间', schedCfg.exec_time || '-')}
                ${field('结束方式', schedCfg.end_mode === 'count' ? '执行 '+schedCfg.end_count+' 次后结束' : '结束日期：'+(schedCfg.end_date||'-'))}
              ` : `<div style="padding:24px;text-align:center;color:#aaa;font-size:13px">未启用定时自动巡检</div>`}
            </div>
          </div>

          <!-- 执行历史 -->
          <div class="card" style="margin-bottom:0">
            <div class="card-header" style="font-weight:600;font-size:14px;border-bottom:1px solid #f0f0f0;padding:12px 16px">执行历史</div>
            <div class="card-body">
              ${[
                { ver: t.latest_version || 1, time: t.last_executed_at || '-', status: t.status || 'pending' },
              ].map(h => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">
                  <span style="font-size:13px">v${h.ver}</span>
                  <span class="text-muted" style="font-size:12px">${typeof h.time === 'string' ? h.time.substring(0,16) : '-'}</span>
                  ${this.renderStatus(h.status)}
                </div>`).join('')}
              <div style="text-align:center;margin-top:12px">
                <button class="btn btn-sm btn-link" onclick="TaskModule.viewResult(${t.id}, ${t.latest_version||0})">查看完整结果 →</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },
  renderCreatePage() {
    const { form, datasets, rules } = this.state;
    const selectedRule = rules.find(r => r.id === form.selectedRuleId);
    const dsHasData = form.dataset_id || form.dsTab !== 'existing';

    return `
      <div class="page-container">
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn" onclick="TaskModule.closeCreate()">← 返回列表</button>
            <div>
              <h3>新建巡检任务</h3>
              <p>填写以下信息完成任务配置</p>
            </div>
          </div>
          <button class="btn btn-primary" onclick="TaskModule.createTask()">创建并执行</button>
        </div>

        <!-- ═══ 板块一：圈选巡检对象 ═══ -->
        <div class="create-section">
          <div class="create-section-header">
            <span class="create-section-num">01</span>
            <span class="create-section-title">圈选巡检对象</span>
            ${dsHasData ? `<span class="badge badge-success" style="margin-left:12px">已配置</span>` : `<span class="badge badge-warning" style="margin-left:12px">必填</span>`}
          </div>
          <div class="create-section-body">

            <!-- Tab 切换：已有数据集 / Excel上传 / SQL取数 -->
            <div class="ds-source-tabs">
              ${[
                { key: 'existing', label: '从已有数据集选择' },
                { key: 'excel',    label: 'Excel 上传' },
                { key: 'sql',      label: 'SQL 取数' },
              ].map(t => `
                <div class="ds-source-tab ${form.dsTab === t.key ? 'active' : ''}"
                     onclick="TaskModule.switchDsTab('${t.key}')">${t.label}</div>
              `).join('')}
            </div>

            <!-- Tab 内容 -->
            <div class="ds-source-body">
              ${form.dsTab === 'existing' ? this.renderDsExisting(datasets, form) : ''}
              ${form.dsTab === 'excel'    ? this.renderDsExcel(form) : ''}
              ${form.dsTab === 'sql'      ? this.renderDsSql(form) : ''}
            </div>

            <!-- 数据预处理 -->
            <div class="preprocess-toggle-row" style="margin-top:16px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:500">
                <input type="checkbox" ${form.preprocessEnabled ? 'checked' : ''}
                  onchange="TaskModule.togglePreprocess(this.checked)">
                启用数据预处理
              </label>
              <span style="font-size:12px;color:#888;margin-left:8px">勾选后对上传数据进行视频抽帧、ASR 处理等操作</span>
            </div>

            ${form.preprocessEnabled ? this.renderPreprocessInline(form.preprocess) : ''}

            <!-- 数据预览（有预览数据时展示）-->
            ${form.previewRows.length > 0 ? this.renderDataPreview(form.previewRows, form.previewFields) : ''}
          </div>
        </div>

        <!-- ═══ 板块二：选择巡检能力 ═══ -->
        <div class="create-section">
          <div class="create-section-header">
            <span class="create-section-num">02</span>
            <span class="create-section-title">选择巡检能力</span>
            ${form.rule_id ? `<span class="badge badge-success" style="margin-left:12px">已选择</span>` : `<span class="badge badge-warning" style="margin-left:12px">建议选一个</span>`}
          </div>
          <div class="create-section-body">
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
              <span style="font-size:13px;color:#666;white-space:nowrap">场景筛选：</span>
              <select class="form-control" style="width:180px"
                onchange="TaskModule.setRuleScene(this.value)">
                <option value="">全部场景</option>
                ${[...(new Set(rules.map(r => r.scene).filter(Boolean)))].map(s =>
                  `<option value="${s}" ${form.ruleScene===s?'selected':''}>${s}</option>`
                ).join('')}
              </select>
              <span style="font-size:12px;color:#aaa">${
                (form.ruleScene ? rules.filter(r=>r.scene===form.ruleScene) : rules).length
              } 个能力</span>
            </div>
            <div class="split-layout" id="rule-split-layout">
              <div class="split-left">
                ${(form.ruleScene ? rules.filter(r=>r.scene===form.ruleScene) : rules).length === 0 ? `
                  <div style="padding:24px;text-align:center;color:#aaa;font-size:13px">暂无巡检能力</div>` :
                  (form.ruleScene ? rules.filter(r=>r.scene===form.ruleScene) : rules).map(r => {
                    const capType = CapabilityModule.CAPABILITY_TYPES.find(t=>t.key===(r.rule_type||'workflow')) || { label: r.rule_type || 'Workflow 驱动', color:'#1890ff', bg:'#e6f7ff' };
                    const isSim = r.rule_type === 'similarity';
                    return `
                  <div class="split-left-item ${form.rule_id===r.id?'active':''}"
                       onclick="TaskModule.selectRuleOnly(${r.id})">
                    <div style="width:14px;height:14px;border-radius:50%;border:2px solid ${form.rule_id===r.id?'#1890ff':'#ccc'};background:${form.rule_id===r.id?'#1890ff':'#fff'};flex-shrink:0;margin-right:10px"></div>
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
                      <small class="text-muted">${capType.label}${isSim ? ` · 阈值 ${Math.round((r.threshold||0.85)*100)}%` : ''}</small>
                    </div>
                  </div>`;
                  }).join('')}
              </div>
              <div class="split-right" id="rule-detail-panel">
                ${selectedRule ? this.renderRuleDetailWhitebox(selectedRule) : `
                  <div class="empty-state" style="padding:60px 20px">
                    <div></div>
                    <p>从左侧选择巡检能力查看详情</p>
                  </div>`}
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ 板块三：字段映射 ═══ -->
        <div class="create-section">
          <div class="create-section-header">
            <span class="create-section-num">03</span>
            <span class="create-section-title">字段映射</span>
            ${form.rule_id
              ? `<span class="badge badge-success" style="margin-left:12px">已配置</span>`
              : `<span class="badge badge-default" style="margin-left:12px">选择巡检能力后配置</span>`}
          </div>
          <div class="create-section-body">
            ${this.renderFieldMapping(form, datasets, rules)}
          </div>
        </div>

        <!-- ═══ 板块四：配置巡检 ═══ -->
        <div class="create-section">
          <div class="create-section-header">
            <span class="create-section-num">04</span>
            <span class="create-section-title">配置巡检</span>
          </div>
          <div class="create-section-body">
            <div class="grid-3">
              <div class="form-group">
                <label class="form-label">巡检名称 <span class="required">*</span></label>
                <input class="form-control" id="create-name" value="${form.name}"
                  placeholder="例：搜索推荐质量巡检-2026W21"
                  oninput="TaskModule.state.form.name=this.value">
              </div>
              <div class="form-group">
                <label class="form-label">结果分类字段 <span class="required">*</span></label>
                <input class="form-control" id="create-group" value="${form.group_field}"
                  placeholder="例：keyword / user_id / category"
                  oninput="TaskModule.state.form.group_field=this.value">
              </div>
              <div class="form-group">
                <label class="form-label">Case 命名规则</label>
                <input class="form-control" id="create-prefix" value="${form.case_prefix}"
                  placeholder="CASE-"
                  oninput="TaskModule.state.form.case_prefix=this.value">
              </div>
            </div>

            <div class="schedule-toggle-row">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:500">
                <input type="checkbox" id="sch-enabled"
                  ${form.schedule.enabled ? 'checked' : ''}
                  onchange="TaskModule.toggleSchedule(this.checked)">
                启用定时自动巡检
              </label>
            </div>

            ${form.schedule.enabled ? this.renderScheduleInline() : ''}
          </div>
        </div>

        <!-- 底部操作 -->
        <div style="display:flex;justify-content:flex-end;gap:12px;padding:16px 0 32px">
          <button class="btn" onclick="TaskModule.closeCreate()">取消</button>
          <button class="btn btn-primary" style="min-width:120px" onclick="TaskModule.createTask()">创建并执行</button>
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  板块三：字段映射
  // ══════════════════════════════════════════════════
  renderFieldMapping(form, datasets, rules) {
    // 未选择能力时的提示
    if (!form.rule_id) {
      return `
        <div style="padding:24px;text-align:center;color:#aaa;font-size:13px;background:#fafafa;border-radius:6px;border:1px dashed #e0e0e0">
          请先在「02 选择巡检能力」中选择一个能力，系统将自动列出该能力所需的输入字段
        </div>`;
    }

    // 获取选中能力的 input 字段
    const rule = rules.find(r => r.id === form.rule_id);
    let inputFields = [];
    if (rule) {
      try {
        const cfg = typeof rule.config === 'string' ? JSON.parse(rule.config) : (rule.config || {});
        inputFields = cfg.input_params || [];
      } catch(e) {}
    }
    // Demo 兜底字段
    if (inputFields.length === 0) {
      inputFields = [
        { name: 'request_id',  type: 'string', desc: '请求唯一ID' },
        { name: 'timestamp',   type: 'string', desc: '时间戳' },
        { name: 'log_content', type: 'string', desc: '日志内容' },
        { name: 'service',     type: 'string', desc: '服务名称' },
        { name: 'env',         type: 'string', desc: '环境标识' },
      ];
    }

    // 获取数据集可用字段（用于下拉建议）
    let dsFields = [];
    const selDs = datasets.find(d => d.id === form.dataset_id);
    if (selDs && selDs.field_schema) {
      try {
        const schema = typeof selDs.field_schema === 'string'
          ? JSON.parse(selDs.field_schema) : selDs.field_schema;
        dsFields = Array.isArray(schema) ? schema.map(f => f.name || f) : [];
      } catch(e) {}
    }
    // Demo 兜底字段（上传了文件但还没有 field_schema）
    if (dsFields.length === 0 && (form.uploadFile || form.sqlContent)) {
      dsFields = ['req_id','ts','content','svc','environment','item_id','user_id','category','score','label'];
    }

    const datalistId = 'fm-ds-fields';
    const datalist = dsFields.length > 0
      ? `<datalist id="${datalistId}">${dsFields.map(f=>`<option value="${f}">`).join('')}</datalist>`
      : '';

    return `
      ${datalist}
      <div class="fm-hint">
        将「巡检能力」所需的每个 Input 字段，映射到「数据集」中对应的字段名，两侧字段名可能不同但含义相同。
      </div>
      <div class="fm-table-wrap">
        <table class="fm-table">
          <thead>
            <tr>
              <th style="width:40%">巡检能力 Input 字段</th>
              <th style="width:22%;text-align:center">类型</th>
              <th style="width:38%">数据集字段映射 <span style="font-weight:400;font-size:11px;color:#aaa">（下拉选择或手动输入）</span></th>
            </tr>
          </thead>
          <tbody>
            ${inputFields.map(f => {
              const fname = f.name || f;
              const ftype = f.type || 'string';
              const fdesc = f.desc || '';
              const mapped = form.fieldMapping[fname] || '';
              return `
                <tr>
                  <td>
                    <div class="fm-field-name">${fname}</div>
                    ${fdesc ? `<div class="fm-field-desc">${fdesc}</div>` : ''}
                  </td>
                  <td style="text-align:center">
                    <span class="fm-type-badge">${ftype}</span>
                  </td>
                  <td>
                    <div class="fm-map-cell">
                      <span class="fm-arrow">←</span>
                      <input class="form-control fm-input"
                        list="${datalistId}"
                        placeholder="${dsFields.length > 0 ? '选择或输入字段名' : '输入数据集字段名'}"
                        value="${mapped}"
                        oninput="TaskModule.setFieldMapping('${fname}', this.value)">
                      ${mapped ? `<span class="fm-mapped-ok">✓</span>` : ''}
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${inputFields.length > 0 ? `
        <div class="fm-actions">
          <button class="btn btn-sm" onclick="TaskModule.autoMapFields()" style="font-size:12px">
            🔄 智能自动匹配
          </button>
          <span style="font-size:12px;color:#888;margin-left:8px">
            已映射 ${Object.values(form.fieldMapping).filter(Boolean).length} / ${inputFields.length} 个字段
          </span>
        </div>` : ''}`;
  },

  // ══════════════════════════════════════════════════
  //  板块一：三种数据源 Tab 内容
  // ══════════════════════════════════════════════════
  renderDsExisting(datasets, form) {
    if (datasets.length === 0) {
      return `
        <div class="empty-state" style="padding:30px">
          <div></div>
          <p>暂无就绪的巡检对象</p>
          <button class="btn" onclick="app.switchPage('dataset')">去圈选巡检对象 →</button>
        </div>`;
    }
    return `
      <div class="dataset-grid">
        ${datasets.map(ds => `
          <div class="dataset-select-card ${form.dataset_id === ds.id ? 'selected' : ''}"
               onclick="TaskModule.selectDataset(${ds.id})">
            <div class="ds-select-info">
              <div class="ds-select-name">${ds.name}</div>
              <div class="ds-select-meta">
                <span class="badge ${ds.source_type === 'excel' ? 'badge-info' : 'badge-warning'}" style="font-size:11px">${ds.source_type === 'excel' ? 'Excel' : 'SQL取数'}</span>
                <span style="margin-left:6px">${(ds.record_count||0).toLocaleString()} 条</span>
              </div>
              ${ds.field_schema ? `<div class="ds-select-fields">字段：${(Array.isArray(ds.field_schema) ? ds.field_schema : []).slice(0,4).map(f=>f.name||f).join('、')}${(Array.isArray(ds.field_schema)&&ds.field_schema.length>4)?'...':''}</div>` : ''}
            </div>
            ${form.dataset_id === ds.id ? '<div class="ds-select-check"></div>' : ''}
          </div>`).join('')}
      </div>`;
  },

  renderDsExcel(form) {
    return `
      <div class="ds-upload-area">
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">数据集名称 <span class="required">*</span></label>
          <input class="form-control" id="task-ds-name" value="${form.dsName}"
            placeholder="请输入数据集名称"
            oninput="TaskModule.state.form.dsName=this.value" style="max-width:320px">
        </div>
        <div class="upload-zone" id="task-upload-zone"
             onclick="document.getElementById('task-file-input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="TaskModule.handleFileDrop(event)">
          <div class="upload-icon"></div>
          <p>拖拽文件到此处，或<b style="color:#1890ff">点击选择文件</b></p>
          <small>支持 .xlsx .xls .csv，文件大小 ≤ 100MB</small>
          <div id="task-file-name" style="margin-top:8px;color:#1890ff;font-size:13px">
            ${form.uploadFile ? '已选择：' + (form.uploadFile.name || '') : ''}
          </div>
        </div>
        <input type="file" id="task-file-input" accept=".xlsx,.xls,.csv" style="display:none"
          onchange="TaskModule.handleFileSelect(this)">
        ${form.uploadFile ? `
          <div style="margin-top:10px;display:flex;gap:10px">
            <button class="btn btn-sm btn-primary" onclick="TaskModule.previewUpload()">预览数据</button>
            <span style="font-size:12px;color:#52c41a;align-self:center">✓ 文件已选择</span>
          </div>` : ''}
      </div>`;
  },

  renderDsSql(form) {
    return `
      <div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">数据集名称 <span class="required">*</span></label>
          <input class="form-control" id="task-sql-ds-name" value="${form.dsName}"
            placeholder="请输入数据集名称"
            oninput="TaskModule.state.form.dsName=this.value" style="max-width:320px">
        </div>
        <div class="form-group">
          <label class="form-label">
            SQL 语句 <span class="required">*</span>
            <button class="btn btn-sm btn-link" onclick="TaskModule.validateSql()" style="margin-left:8px">验证语法</button>
            <button class="btn btn-sm btn-link" onclick="TaskModule.estimateSql()">预估数据量</button>
          </label>
          <textarea class="sql-editor" id="task-sql-content"
            placeholder="SELECT item_id, item_title, category FROM dw.table WHERE dt='\${date}' LIMIT 10000"
            oninput="TaskModule.state.form.sqlContent=this.value">${form.sqlContent}</textarea>
          <div id="task-sql-result" style="margin-top:8px;font-size:13px;min-height:20px">
            ${form.sqlMsg ? `<span style="color:${form.sqlValid==='ok'?'#52c41a':'#f5222d'}">${form.sqlMsg}</span>` : ''}
          </div>
        </div>
        ${form.sqlContent ? `
          <button class="btn btn-sm btn-primary" onclick="TaskModule.previewSql()">预览数据</button>` : ''}
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  板块一：数据预处理（平铺展开）
  // ══════════════════════════════════════════════════
  renderPreprocessInline(p) {
    const fieldOpts = ['live_id','item_id','position','show_index','exposure_ts','user_id','category','date','scene','source','label'];
    const datalistHtml = `<datalist id="pp-field-list">${fieldOpts.map(f=>`<option value="${f}">`).join('')}</datalist>`;
    return `
      <div class="preprocess-inline-box">
        <div class="preprocess-inline-title">数据预处理配置</div>
        <div class="preprocess-inline-body">

          <!-- 视频抽帧 -->
          <div class="preprocess-block">
            <div class="preprocess-block-title">
              <span class="preprocess-block-icon">🎬</span> 视频抽帧
            </div>
            <div class="preprocess-tabs">
              ${[{key:'live',label:'直播场景'},{key:'video',label:'短视频场景'}].map(t => `
                <div class="preprocess-tab ${p.dataTab===t.key?'active':''}"
                     onclick="TaskModule.setPP('dataTab','${t.key}')">${t.label}</div>
              `).join('')}
            </div>
            <div class="preprocess-grid3" style="margin-top:10px">
              <div class="form-group">
                <label class="form-label">${p.dataTab==='live'?'直播间 ID 列':'视频 ID 列'}</label>
                <input class="form-control" list="pp-field-list" placeholder="字段名"
                  value="${p.dataTab==='live'?p.live_id_col:p.live_id_col}"
                  oninput="TaskModule.setPP('live_id_col',this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">${p.dataTab==='live'?'曝光时间列':'发布时间列'}</label>
                <input class="form-control" list="pp-field-list" placeholder="字段名"
                  value="${p.exposure_ts_col}"
                  oninput="TaskModule.setPP('exposure_ts_col',this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">最大抽帧数</label>
                <input class="form-control" type="number" min="1" max="20"
                  value="${p.max_frames}"
                  oninput="TaskModule.setPP('max_frames',parseInt(this.value)||1)">
              </div>
            </div>
            ${datalistHtml}
          </div>

          <!-- ASR 处理 -->
          <div class="preprocess-block">
            <div class="preprocess-block-title">
              <span class="preprocess-block-icon">🎙️</span> ASR 语音识别处理
            </div>
            <div class="preprocess-grid3" style="margin-top:10px">
              <div class="form-group">
                <label class="form-label">语言</label>
                <select class="form-control"
                  onchange="TaskModule.setPP('asr_lang',this.value)">
                  <option value="zh" ${p.asr_lang==='zh'?'selected':''}>中文（普通话）</option>
                  <option value="en" ${p.asr_lang==='en'?'selected':''}>英文</option>
                  <option value="zh-yue" ${p.asr_lang==='zh-yue'?'selected':''}>粤语</option>
                  <option value="auto" ${p.asr_lang==='auto'?'selected':''}>自动识别</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">采样率（Hz）</label>
                <select class="form-control"
                  onchange="TaskModule.setPP('asr_sample_rate',parseInt(this.value))">
                  <option value="8000"  ${p.asr_sample_rate===8000 ?'selected':''}>8000</option>
                  <option value="16000" ${p.asr_sample_rate===16000?'selected':''}>16000（推荐）</option>
                  <option value="44100" ${p.asr_sample_rate===44100?'selected':''}>44100</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">输出字段名</label>
                <input class="form-control" placeholder="asr_text" value="asr_text" disabled>
              </div>
            </div>
          </div>

          <!-- 其他 -->
          <div class="preprocess-block" style="border-bottom:none">
            <div class="preprocess-block-title">
              <span class="preprocess-block-icon">⚙️</span> 其他处理
            </div>
            <div style="font-size:12px;color:#888;margin-bottom:10px">自定义字段提取标签及映射</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              ${[0,1,2].map(i => `
                <div style="display:flex;gap:8px;align-items:center">
                  <input class="form-control" placeholder="标签名${i+1}" style="width:100px;flex-shrink:0"
                    value="${p['other_label_'+i]}"
                    oninput="TaskModule.setPP('other_label_${i}',this.value)">
                  <span style="color:#aaa">→</span>
                  <input class="form-control" list="pp-field-list" placeholder="字段名${i+1}"
                    value="${p['other_field_'+i]}"
                    oninput="TaskModule.setPP('other_field_${i}',this.value)">
                </div>`).join('')}
            </div>
          </div>

        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  板块一：数据预览（最多10条）
  // ══════════════════════════════════════════════════
  renderDataPreview(rows, fields) {
    if (!rows || rows.length === 0) return '';
    const cols = fields && fields.length > 0 ? fields : Object.keys(rows[0] || {});
    return `
      <div class="data-preview-box">
        <div class="data-preview-title">
          数据预览
          <span style="font-size:12px;font-weight:400;color:#888;margin-left:8px">共展示 ${rows.length} 条</span>
        </div>
        <div class="table-wrap" style="max-height:260px;overflow:auto">
          <table style="font-size:12px">
            <thead><tr>${cols.map(c=>`<th style="white-space:nowrap">${c}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.slice(0,10).map(row => `
                <tr>${cols.map(c => `<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${String(row[c]??'')}">${row[c] ?? '-'}</td>`).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ============ 自定义周期弹窗（保留兼容）============
  getScheduleSummary() {
    const s = this.state.form.schedule;
    const unitLabel = { day: '日', week: '周', month: '月' }[s.freq_unit] || '日';
    let freqDesc = `每 ${s.freq_interval} ${unitLabel}`;

    if (s.freq_unit === 'week') {
      const days = s.week_days.map(i => this.WEEK_DAYS[i]?.label || i).join('、');
      freqDesc += days ? `，周${days}` : '';
    } else if (s.freq_unit === 'month') {
      freqDesc += `，第 ${s.month_day} 天`;
    }

    const endDesc = s.end_mode === 'count'
      ? `重复 ${s.end_count} 次`
      : `至 ${s.end_date || '未设置'}`;

    return `${freqDesc} ${s.exec_time} 执行，${endDesc}`;
  },

  renderScheduleModal() {
    const s = this.state.form.schedule;
    const END_COUNTS = [10, 20, 30, 60, 90, 180, 365];
    // 生成每月第1-28天选项
    const monthDayOpts = Array.from({length: 28}, (_, i) => i + 1)
      .map(d => `<option value="${d}" ${s.month_day === d ? 'selected' : ''}>每个月的第 ${d} 天</option>`)
      .join('');

    return `
      <div class="sched-modal-mask" onclick="TaskModule.handleModalMaskClick(event)">
        <div class="sched-modal-box" onclick="event.stopPropagation()">
          <div class="sched-modal-title">自定义周期</div>

          <!-- 重复频率 -->
          <div class="sched-section-label">重复频率</div>
          <div class="sched-freq-row">
            <label>每</label>
            <input class="sched-num-input" type="number" min="1" max="99"
              value="${s.freq_interval}"
              onchange="TaskModule.setSchedule('freq_interval', parseInt(this.value)||1)">
            <select class="sched-unit-select"
              onchange="TaskModule.setSchedule('freq_unit', this.value)">
              <option value="day"   ${s.freq_unit==='day'  ?'selected':''}>日</option>
              <option value="week"  ${s.freq_unit==='week' ?'selected':''}>周</option>
              <option value="month" ${s.freq_unit==='month'?'selected':''}>月</option>
            </select>
          </div>

          ${s.freq_unit === 'week' ? `
          <div class="week-day-picker">
            ${this.WEEK_DAYS.map(d => `
              <div class="week-day-btn ${s.week_days.includes(d.idx) ? 'selected' : ''}"
                   onclick="TaskModule.toggleWeekDay(${d.idx})">${d.label}</div>
            `).join('')}
          </div>` : ''}

          ${s.freq_unit === 'month' ? `
          <div class="sched-month-row">
            <select class="sched-month-select"
              onchange="TaskModule.setSchedule('month_day', parseInt(this.value))">
              ${monthDayOpts}
            </select>
          </div>` : ''}

          <!-- 执行时间 -->
          <div class="sched-time-row">
            <label>执行时间：</label>
            <input class="sched-time-input" type="time" value="${s.exec_time}"
              onchange="TaskModule.setSchedule('exec_time', this.value)">
          </div>

          <!-- 结束时间 -->
          <div class="sched-section-label" style="margin-top:18px">结束时间</div>
          <div class="sched-end-section">
            <div class="sched-end-row">
              <input type="radio" id="end-count" name="end-mode" value="count"
                ${s.end_mode==='count'?'checked':''}
                onchange="TaskModule.setSchedule('end_mode','count')">
              <label for="end-count">重复</label>
              <select class="sched-count-select" ${s.end_mode!=='count'?'disabled':''}
                onchange="TaskModule.setSchedule('end_count', parseInt(this.value))">
                ${END_COUNTS.map(n => `<option value="${n}" ${s.end_count===n?'selected':''}>${n}</option>`).join('')}
              </select>
              <span>次后</span>
            </div>
            <div class="sched-end-row">
              <input type="radio" id="end-date" name="end-mode" value="date"
                ${s.end_mode==='date'?'checked':''}
                onchange="TaskModule.setSchedule('end_mode','date')">
              <label for="end-date">到指定日期</label>
              <input class="sched-date-input" type="date"
                value="${s.end_date || new Date(Date.now()+30*86400000).toISOString().slice(0,10)}"
                ${s.end_mode!=='date'?'disabled':''}
                onchange="TaskModule.setSchedule('end_date', this.value)">
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="sched-modal-footer">
            <button class="btn" onclick="TaskModule.cancelScheduleModal()">取消</button>
            <button class="btn btn-primary" onclick="TaskModule.confirmScheduleModal()">确定</button>
          </div>
        </div>
      </div>`;
  },

  // ============ 定时配置平铺区（内联展示，不弹窗）============
  renderScheduleInline() {
    const s = this.state.form.schedule;
    const END_COUNTS = [10, 20, 30, 60, 90, 180, 365];
    const monthDayOpts = Array.from({length: 28}, (_, i) => i + 1)
      .map(d => `<option value="${d}" ${s.month_day === d ? 'selected' : ''}>第 ${d} 天</option>`)
      .join('');

    return `
      <div class="schedule-inline-box">
        <div class="schedule-inline-title">定时配置</div>
        <div class="schedule-inline-body">
          <!-- 第一行：频率 -->
          <div class="schedule-inline-row">
            <label class="schedule-inline-label">执行频率</label>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px">每</span>
              <input class="form-control" type="number" min="1" max="99" style="width:64px;height:32px;padding:0 8px"
                value="${s.freq_interval}"
                onchange="TaskModule.setSchedule('freq_interval', parseInt(this.value)||1)">
              <select class="form-control" style="width:80px;height:32px"
                onchange="TaskModule.setSchedule('freq_unit', this.value)">
                <option value="day"   ${s.freq_unit==='day'  ?'selected':''}>日</option>
                <option value="week"  ${s.freq_unit==='week' ?'selected':''}>周</option>
                <option value="month" ${s.freq_unit==='month'?'selected':''}>月</option>
              </select>
              ${s.freq_unit === 'week' ? `
                <div class="week-day-picker" style="margin:0">
                  ${this.WEEK_DAYS.map(d => `
                    <div class="week-day-btn ${s.week_days.includes(d.idx) ? 'selected' : ''}"
                         onclick="TaskModule.toggleWeekDay(${d.idx})">${d.label}</div>
                  `).join('')}
                </div>` : ''}
              ${s.freq_unit === 'month' ? `
                <select class="form-control" style="width:120px;height:32px"
                  onchange="TaskModule.setSchedule('month_day', parseInt(this.value))">
                  ${monthDayOpts}
                </select>` : ''}
            </div>
          </div>
          <!-- 第二行：执行时间 -->
          <div class="schedule-inline-row">
            <label class="schedule-inline-label">执行时间</label>
            <input class="form-control" type="time" style="width:140px;height:32px"
              value="${s.exec_time}"
              onchange="TaskModule.setSchedule('exec_time', this.value)">
          </div>
          <!-- 第三行：结束方式 -->
          <div class="schedule-inline-row">
            <label class="schedule-inline-label">结束方式</label>
            <div style="display:flex;align-items:center;gap:16px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                <input type="radio" name="inline-end-mode" value="count"
                  ${s.end_mode==='count'?'checked':''}
                  onchange="TaskModule.setSchedule('end_mode','count')">
                重复
                <select class="form-control" style="width:80px;height:28px;padding:0 6px;font-size:12px" ${s.end_mode!=='count'?'disabled':''}
                  onchange="TaskModule.setSchedule('end_count', parseInt(this.value))">
                  ${END_COUNTS.map(n => `<option value="${n}" ${s.end_count===n?'selected':''}>${n}</option>`).join('')}
                </select>
                次后
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                <input type="radio" name="inline-end-mode" value="date"
                  ${s.end_mode==='date'?'checked':''}
                  onchange="TaskModule.setSchedule('end_mode','date')">
                到
                <input class="form-control" type="date" style="width:148px;height:28px;padding:0 6px;font-size:12px"
                  value="${s.end_date || new Date(Date.now()+30*86400000).toISOString().slice(0,10)}"
                  ${s.end_mode!=='date'?'disabled':''}
                  onchange="TaskModule.setSchedule('end_date', this.value)">
              </label>
            </div>
          </div>
          <!-- 摘要 -->
          <div style="margin-top:10px;padding:8px 12px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;font-size:12px;color:#389e0d">
            当前配置：${this.getScheduleSummary()}
          </div>
        </div>
      </div>`;
  },

  // ============ 白盒详情（板块三右侧，复用 CapabilityModule 新版展示）============
  renderRuleDetailWhitebox(r) {
    // 直接复用 capability.js v4.0 的展示逻辑
    const cfg = (typeof r.config === 'string')
      ? (() => { try { return JSON.parse(r.config); } catch(e) { return {}; } })()
      : (r.config || {});

    // 旧 rule_type → 新 capability_type 映射
    const oldToNew = {
      ai_analysis:    'prompt',
      freq_control:   'other',
      similarity:     'other',
      rule_threshold: 'other',
      workflow:       'workflow',
    };
    const capTypeKey = oldToNew[r.rule_type] || r.rule_type || 'workflow';
    const otherSub = ['freq_control','similarity','rule_threshold','custom'].includes(r.rule_type)
      ? r.rule_type
      : (cfg.other_sub_type || 'freq_control');

    const CAPABILITY_TYPES = CapabilityModule.CAPABILITY_TYPES;
    const capType = CAPABILITY_TYPES.find(t => t.key === capTypeKey) || CAPABILITY_TYPES[0];
    const metrics = CapabilityModule.getMockMetrics(capTypeKey === 'other' ? otherSub : capTypeKey);

    // 获取白盒内容（输入参数 + 输出参数只读展示）
    const whiteboxContent = CapabilityModule.renderWhiteboxDetail(capTypeKey, cfg, r, otherSub);
    const exampleContent  = CapabilityModule.renderCapabilityExample(capTypeKey, otherSub);
    const paramsContent   = CapabilityModule.renderParamsMappingReadonly(cfg);

    return `
      <div style="padding:16px;overflow-y:auto;max-height:100%">
        <!-- 基础信息 -->
        <div class="cap-modal-grid2" style="margin-bottom:12px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="color:#888;font-size:12px">巡检名称</label>
            <div style="font-size:14px;font-weight:700;padding:4px 0">${r.name}</div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="color:#888;font-size:12px">场景</label>
            <div style="font-size:14px;padding:4px 0">${r.scene || '-'}</div>
          </div>
        </div>
        <div class="cap-modal-grid2" style="margin-bottom:12px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="color:#888;font-size:12px">能力类型</label>
            <div style="padding:4px 0">
              <span style="background:${capType.bg};color:${capType.color};font-size:12px;padding:2px 10px;border-radius:10px">${capType.label}</span>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="color:#888;font-size:12px">描述</label>
            <div style="font-size:13px;color:#666;padding:4px 0">${r.description || '-'}</div>
          </div>
        </div>

        <!-- 核心指标 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
          ${[['准确率',metrics.precision,'#1890ff'],['召回率',metrics.recall,'#52c41a'],['F1-Score',metrics.f1,'#722ed1']].map(([k,v,c])=>`
            <div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:17px;font-weight:700;color:${c}">${v}</div>
              <div style="font-size:11px;color:#888;margin-top:2px">${k}</div>
            </div>`).join('')}
        </div>

        <!-- 白盒配置 -->
        <div class="cap-modal-section-title" style="font-size:12px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:8px 0 6px;border-top:1px solid #f0f0f0">配置详情</div>
        ${whiteboxContent}

        <!-- 参数映射 -->
        ${paramsContent}

        <!-- 运行示例 -->
        <div class="cap-modal-section-title" style="font-size:12px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:8px 0 6px;border-top:1px solid #f0f0f0">运行示例</div>
        ${exampleContent}
      </div>`;
  },

  // 旧 renderRuleDetail 保留（兼容其他调用）
  renderRuleDetail(r) {
    return this.renderRuleDetailWhitebox(r);
  },

  // 进度弹窗
  renderProgressModal() {
    const pm = this.state.progressModal;
    if (!pm.show || !pm.data) return '';
    const d = pm.data;
    const pct = d.progress || 0;
    const stageIcon = s => ({ pending: '[ ]', running: '[...]', completed: '[ok]', failed: '[!]' }[s] || '[ ]');
    return `
      <div class="progress-modal-overlay">
        <div class="progress-modal-box">
          <div class="progress-modal-header">
            <span>巡检执行中</span>
            <button class="btn btn-sm" onclick="TaskModule.closeProgressModal()">最小化</button>
          </div>
          <div class="progress-modal-body">
            <div><b>${d.task_name || '巡检任务'}</b>
              ${d.version ? `<span class="badge badge-info" style="margin-left:6px">v${d.version}</span>` : ''}</div>
            <div class="progress-bar-wrap" style="margin:12px 0">
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width:${pct}%"></div>
              </div>
              <span class="progress-bar-label">${pct}%</span>
            </div>
            <div class="text-muted" style="font-size:13px">
              已处理：${d.processed||0} / ${d.total||0} 条 &nbsp;|&nbsp; 预估剩余：约 ${Math.ceil(((d.total||0)-(d.processed||0))/10)} 秒
            </div>
            <div style="margin-top:12px">
              ${(d.stages||[]).map(s => `
                <div style="font-size:13px;margin:4px 0">
                  ${stageIcon(s.status)} ${s.name} ${s.status==='completed'?'<span class="badge badge-success">完成</span>':s.status==='running'?`<span class="badge badge-warning">${s.progress||0}%</span>`:'<span class="badge badge-default">待开始</span>'}
                </div>`).join('')}
            </div>
          </div>
          ${d.status === 'completed' ? `
          <div class="progress-modal-footer">
            <button class="btn btn-primary" onclick="TaskModule.closeProgressModal();TaskModule.viewResult(${pm.taskId}, 1)">
              查看结果
            </button>
          </div>` : ''}
        </div>
      </div>`;
  },

  // ============ 事件处理 ============
  async init() { await this.load(); },

  async load() {
    this.state.loading = true;
    app.render();
    const res = await API.getTasks({ page: this.state.page, ...this.state.filter });
    if (res.code === 0) { this.state.list = res.data.list; this.state.total = res.data.total; }
    this.state.loading = false;
    app.render();
  },

  setFilter(key, val) { this.state.filter[key] = val; this.state.page = 1; },
  setPage(p) { this.state.page = p; this.load(); },
  setRuleScene(val) { this.state.form.ruleScene = val; app.render(); },

  // 任务详情页
  openDetail(taskId) {
    const task = this.state.list.find(t => t.id === taskId);
    if (!task) { Toast.error('未找到任务'); return; }
    this.state.detailTask = task;
    this.state.detailOpen = true;
    app.render();
  },

  closeDetail() {
    this.state.detailOpen = false;
    this.state.detailTask = null;
    app.render();
  },

  async openCreate() {
    const [dsRes, ruleRes] = await Promise.all([
      API.getDatasets({ page_size: 100, status: 'ready' }),
      API.getRules(),
    ]);
    this.state.datasets = (dsRes.data?.list || []).filter(d => d.status === 'ready');
    this.state.rules    = ruleRes.data?.list || [];
    this.state.form = {
      name: '', group_field: '', case_prefix: 'CASE-',
      schedule: {
        enabled: false, modal_open: false,
        freq_unit: 'day', freq_interval: 1,
        week_days: [], month_day: 1,
        exec_time: '02:00',
        end_mode: 'count', end_count: 30, end_date: '',
      },
      // 板块一：圈选巡检对象
      dsTab: 'existing',
      dataset_id: null,
      dsName: '',
      uploadFile: null,
      sqlContent: '',
      sqlValid: null,
      sqlMsg: '',
      preprocessEnabled: false,
      preprocess: {
        dataTab: 'live',
        live_id_col: '', exposure_ts_col: '', max_frames: 1,
        asr_lang: 'zh', asr_sample_rate: 16000,
        other_label_0: '', other_label_1: '', other_label_2: '',
        other_field_0: '', other_field_1: '', other_field_2: '',
      },
      previewRows: [],
      previewFields: [],
      // 板块二：巡检能力
      rule_id: null, selectedRuleId: this.state.rules[0]?.id || null,
      ruleScene: '',
      // 板块三：字段映射
      fieldMapping: {},
    };
    this.state.createOpen = true;
    app.render();
  },

  closeCreate() {
    this.state.createOpen = false;
    app.render();
  },

  toggleSchedule(val) {
    this.state.form.schedule.enabled = val;
    app.render();
  },

  // 打开弹窗（暂存原值，取消时回滚）
  openScheduleModal() {
    this.state.form.schedule._backup = { ...this.state.form.schedule };
    this.state.form.schedule.modal_open = true;
    app.render();
  },

  cancelScheduleModal() {
    const bk = this.state.form.schedule._backup;
    if (bk) {
      Object.assign(this.state.form.schedule, bk);
      delete this.state.form.schedule._backup;
    }
    this.state.form.schedule.modal_open = false;
    app.render();
  },

  confirmScheduleModal() {
    delete this.state.form.schedule._backup;
    this.state.form.schedule.modal_open = false;
    app.render();
  },

  handleModalMaskClick(e) {
    // 点击遮罩关闭（等同取消）
    if (e.target === e.currentTarget) this.cancelScheduleModal();
  },

  setSchedule(key, val) {
    this.state.form.schedule[key] = val;
    app.render();
  },

  toggleWeekDay(idx) {
    const days = this.state.form.schedule.week_days;
    const pos  = days.indexOf(idx);
    if (pos === -1) days.push(idx);
    else days.splice(pos, 1);
    app.render();
  },

  selectDataset(id) {
    this.state.form.dataset_id = (this.state.form.dataset_id === id) ? null : id;
    app.render();
  },

  // ══ 板块一：数据源 Tab 切换 ══
  switchDsTab(tab) {
    this.state.form.dsTab = tab;
    app.render();
  },

  // ══ 板块一：文件上传处理 ══
  handleFileSelect(input) {
    if (input.files[0]) {
      this.state.form.uploadFile = input.files[0];
      if (!this.state.form.dsName) {
        this.state.form.dsName = input.files[0].name.replace(/\.[^.]+$/, '');
      }
      app.render();
    }
  },

  handleFileDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('task-upload-zone');
    if (zone) zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      this.state.form.uploadFile = file;
      if (!this.state.form.dsName) {
        this.state.form.dsName = file.name.replace(/\.[^.]+$/, '');
      }
      app.render();
    }
  },

  // ══ 板块一：SQL 验证 / 预估 ══
  async validateSql() {
    const sql = document.getElementById('task-sql-content')?.value;
    if (!sql) { Toast.error('请先输入 SQL'); return; }
    this.state.form.sqlContent = sql;
    try {
      const res = await API.validateSql(sql);
      if (res.data.valid) {
        this.state.form.sqlValid = 'ok';
        this.state.form.sqlMsg = 'SQL 语法正确 ✓';
      } else {
        this.state.form.sqlValid = 'error';
        this.state.form.sqlMsg = res.data.errors.join('; ');
      }
    } catch(e) {
      this.state.form.sqlValid = 'ok';
      this.state.form.sqlMsg = 'SQL 语法正确 ✓（Demo 模式）';
    }
    app.render();
  },

  async estimateSql() {
    const sql = document.getElementById('task-sql-content')?.value;
    if (!sql) { Toast.error('请先输入 SQL'); return; }
    this.state.form.sqlContent = sql;
    try {
      const res = await API.estimateSql(sql);
      const d = res.data;
      this.state.form.sqlValid = 'ok';
      this.state.form.sqlMsg = `预估数据量：${d.estimated_rows.toLocaleString()} 条 | 预估耗时：${Math.round(d.estimated_seconds/60)} 分钟 | 约 ${d.estimated_size_mb} MB`;
    } catch(e) {
      this.state.form.sqlValid = 'ok';
      this.state.form.sqlMsg = '预估数据量：约 50,000 条 | 预估耗时：2 分钟（Demo）';
    }
    app.render();
  },

  // ══ 板块一：数据预览 ══
  async previewUpload() {
    // Demo mock 数据预览
    const mockFields = ['item_id','item_title','category','price','score'];
    const mockRows = Array.from({length:10}, (_,i) => ({
      item_id: `ITEM_${100000+i}`,
      item_title: ['快手大牌直播好货','美妆护肤专场','零食大礼包','数码好物推荐','运动健康精选'][i%5],
      category: ['服饰','美妆','食品','数码','运动'][i%5],
      price: (99 + i * 11.5).toFixed(2),
      score: (0.8 + Math.random() * 0.2).toFixed(3),
    }));
    this.state.form.previewRows  = mockRows;
    this.state.form.previewFields = mockFields;
    app.render();
    // 平滑滚动到预览区
    setTimeout(() => {
      const el = document.querySelector('.data-preview-box');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  },

  async previewSql() {
    const sql = document.getElementById('task-sql-content')?.value;
    if (!sql) { Toast.error('请先输入 SQL'); return; }
    this.state.form.sqlContent = sql;
    await this.previewUpload(); // 复用 mock 预览
  },

  // ══ 板块一：数据预处理 ══
  togglePreprocess(enabled) {
    this.state.form.preprocessEnabled = enabled;
    app.render();
  },

  setPP(key, val) {
    this.state.form.preprocess[key] = val;
    app.render();
  },

  // 单选巡检能力
  selectRuleOnly(id) {
    this.state.form.rule_id = id;
    this.state.form.selectedRuleId = id;
    // 切换能力时重置字段映射
    this.state.form.fieldMapping = {};
    const rule = this.state.rules.find(r => r.id === id);
    const panel = document.getElementById('rule-detail-panel');
    if (panel && rule) panel.innerHTML = this.renderRuleDetail(rule);
    document.querySelectorAll('.split-left-item').forEach((el, i) => {
      el.classList.toggle('active', this.state.rules[i]?.id === id);
      const dot = el.querySelector('div[style]');
      if (dot && this.state.rules[i]) {
        const sel = this.state.rules[i].id === id;
        dot.style.borderColor = sel ? '#1890ff' : '#ccc';
        dot.style.background  = sel ? '#1890ff' : '#fff';
      }
    });
    // 重绘字段映射板块
    app.render();
  },

  // 设置字段映射
  setFieldMapping(capField, dsField) {
    this.state.form.fieldMapping[capField] = dsField;
    // 仅更新映射数量显示（不全局重绘）
    const badge = document.querySelector('.fm-actions span');
    const total = Object.keys(this.state.form.fieldMapping).length;
    const mapped = Object.values(this.state.form.fieldMapping).filter(Boolean).length;
    if (badge) badge.textContent = `已映射 ${mapped} / ${total} 个字段`;
    const okEl = document.querySelector(`input[oninput*="'${capField}'"]`)?.nextElementSibling;
    if (okEl && dsField) { okEl.textContent = '✓'; okEl.style.display = ''; }
  },

  // 智能自动匹配（模糊匹配策略）
  autoMapFields() {
    const form = this.state.form;
    const rule = this.state.rules.find(r => r.id === form.rule_id);
    if (!rule) return;

    let inputFields = [];
    try {
      const cfg = typeof rule.config === 'string' ? JSON.parse(rule.config) : (rule.config || {});
      inputFields = cfg.input_params || [];
    } catch(e) {}
    if (inputFields.length === 0) {
      inputFields = ['request_id','timestamp','log_content','service','env'].map(n => ({ name: n }));
    }

    const selDs = this.state.datasets.find(d => d.id === form.dataset_id);
    let dsFields = [];
    if (selDs?.field_schema) {
      try {
        const schema = typeof selDs.field_schema === 'string'
          ? JSON.parse(selDs.field_schema) : selDs.field_schema;
        dsFields = Array.isArray(schema) ? schema.map(f => f.name || f) : [];
      } catch(e) {}
    }
    if (dsFields.length === 0) {
      dsFields = ['req_id','ts','content','svc','environment','item_id','user_id','category','score','label'];
    }

    // 简单同名 / 缩写匹配策略
    const mapping = {};
    inputFields.forEach(f => {
      const fname = f.name || f;
      const exact = dsFields.find(d => d === fname);
      if (exact) { mapping[fname] = exact; return; }
      // 忽略下划线、大小写的模糊匹配
      const norm = s => s.toLowerCase().replace(/[_\-\.]/g, '');
      const fuzzy = dsFields.find(d => norm(d) === norm(fname));
      if (fuzzy) { mapping[fname] = fuzzy; return; }
      // 包含关系
      const partial = dsFields.find(d => norm(d).includes(norm(fname)) || norm(fname).includes(norm(d)));
      if (partial) mapping[fname] = partial;
    });

    form.fieldMapping = { ...form.fieldMapping, ...mapping };
    const count = Object.values(form.fieldMapping).filter(Boolean).length;
    Toast.success(`已自动匹配 ${count} 个字段`);
    app.render();
  },

  async createTask() {
    const { form } = this.state;
    // 读取 DOM 最新值
    form.name         = document.getElementById('create-name')?.value?.trim()   || form.name;
    form.group_field  = document.getElementById('create-group')?.value?.trim()  || form.group_field;
    form.case_prefix  = document.getElementById('create-prefix')?.value?.trim() || form.case_prefix;

    if (!form.name)       { Toast.error('请填写巡检名称'); return; }
    if (!form.group_field){ Toast.error('请填写结果分类字段'); return; }
    if (!form.dataset_id) { Toast.error('请选择巡检对象'); return; }
    if (!form.rule_id && !confirm('尚未选择巡检能力，确定继续创建？')) return;

    const res = await API.createTask({
      name:             form.name,
      scene:            'general',
      dataset_id:       form.dataset_id,
      group_field:      form.group_field,
      case_prefix:      form.case_prefix,
      rule_ids:         form.rule_id ? [form.rule_id] : [],
      schedule_enabled: form.schedule.enabled,
      schedule:         form.schedule,
      field_mapping:    form.fieldMapping || {},   // v11.0: 字段映射
    });
    if (res.code === 0) {
      Toast.success('任务创建成功，开始执行巡检...');
      this.state.createOpen = false;
      await this.load();
      const execRes = await API.executeTask(res.data.id);
      if (execRes.code === 0) {
        Toast.info('巡检任务已启动...');
        this.startPolling(res.data.id);
      }
    } else Toast.error(res.message);
  },

  async execute(taskId) {
    const res = await API.executeTask(taskId);
    if (res.code === 0) {
      Toast.info('巡检任务已启动...');
      this.load();
      this.startPolling(taskId);
    } else Toast.error(res.message);
  },

  startPolling(taskId) {
    if (this.state.pollingTimer) clearInterval(this.state.pollingTimer);
    this.state.progressModal = { show: true, taskId, data: { progress: 0, processed: 0, total: 0, stages: [], status: 'running' } };
    app.render();
    this.state.pollingTimer = setInterval(async () => {
      const res = await API.getProgress(taskId);
      if (res.code === 0) {
        this.state.progressModal.data = res.data;
        if (res.data.status !== 'running') {
          clearInterval(this.state.pollingTimer);
          this.state.pollingTimer = null;
          if (res.data.status === 'completed') Toast.success('巡检完成！');
          this.load();
        }
        const overlay = document.querySelector('.progress-modal-overlay');
        if (overlay) overlay.outerHTML = this.renderProgressModal();
        else app.render();
      }
    }, 2000);
  },

  closeProgressModal() {
    this.state.progressModal.show = false;
    app.render();
  },

  async viewResult(taskId, version) {
    if (!version) { Toast.info('该任务尚未执行，请先发起巡检'); return; }
    const res = await API.getVersions(taskId);
    if (res.code === 0 && res.data.list.length > 0) {
      app.switchPage('result', { versionId: res.data.list[0].id, taskId });
    }
  },
};
