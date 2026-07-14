// ===== AI巡检能力模块 v4.0（5种能力类型白盒展示 + AI自学习 Tab）=====
const CapabilityModule = {

  // ——— 能力类型定义（4+1 结构）———
  CAPABILITY_TYPES: [
    { key: 'workflow',       label: 'Workflow 驱动',  color: '#1890ff', bg: '#e6f7ff' },
    { key: 'prompt',         label: 'Prompt 驱动',    color: '#52c41a', bg: '#f6ffed' },
    { key: 'agent',          label: 'Agent 驱动',     color: '#722ed1', bg: '#f9f0ff' },
    { key: 'skill',          label: 'Skill 驱动',     color: '#fa8c16', bg: '#fff7e6' },
    { key: 'other',          label: '其他',            color: '#8c8c8c', bg: '#f5f5f5' },
  ],

  // 「其他」子类型（对应旧5种模板的后3种）
  OTHER_SUB_TYPES: [
    { key: 'freq_control',   label: '内容频控' },
    { key: 'similarity',     label: '商品相似度' },
    { key: 'rule_threshold', label: '规则阈值' },
    { key: 'custom',         label: '新需求支持' },
  ],

  SCENES: ['视频流推荐', 'B端直播间', '搜索推荐', '商品推荐'],
  MODELS: ['Gemini 1.5 Pro', 'GPT-4o', 'Qwen-Max', 'Claude 3.5 Sonnet'],

  // ——— 状态 ———
  state: {
    mainTab: 'dev',    // 'dev' | 'learning'（去掉 biz）
    rules: [],
    loading: false,

    // 研发视角
    devSearch: '',
    devPage: 1, devTotal: 0,

    // 详情页（二级页面，非弹窗）
    detailOpen: false,
    detailRule: null,
    detailEditing: false,  // 是否处于编辑态

    // 新建弹窗（保留用于新建）
    modal: {
      open: false,
      mode: 'create',
      id: null,
      name: '',
      scene: '',
      capability_type: 'workflow',  // 能力类型（新）
      other_sub_type: 'freq_control',
      description: '',
      // workflow
      workflow_id: '',
      workflow_input: '',
      workflow_note: '',
      // prompt
      ai_model: 'Gemini 1.5 Pro',
      ai_instruction: '',
      prompt_temperature: 0.7,
      prompt_max_tokens: 2048,
      prompt_max_input: 4096,
      prompt_timeout: 30,
      // agent
      agent_tools: '',
      agent_top_k: 5,
      // skill
      skill_id: '',
      skill_input: '',
      // other - freq
      freq_min_item_interval: 3,
      freq_min_spu_interval: 5,
      freq_min_category_interval: 2,
      freq_author_cooldown: 300,
      // other - similarity
      sim_sub_rule: 'ADJACENT',
      sim_threshold: 0.85,
      sim_max_positions: 10,
      sim_step: 2,
      sim_min_pairs: 3,
      sim_rpc_timeout: 500,
      // other - threshold
      threshold_target_field: '',
      threshold_fallback_field: '',
      threshold_low: 0,
      threshold_high: 100,
      threshold_label_low: '偏低',
      threshold_label_high: '偏高',
      threshold_label_normal: '正常',
      // 参数映射（所有能力类型通用）
      input_params:  [{ name: '', type: 'string', desc: '' }],
      output_params: [{ name: '', type: 'string', desc: '' }],
    },

    // AI自学习
    learningSamples: [],
    learningLoading: false,
    learningTotal: 0,
  },

  // ══════════════════════════════════════════════════
  //  主渲染（左右分栏）
  // ══════════════════════════════════════════════════
  render() {
    const { loading, modal, detailOpen } = this.state;
    // 保留旧的二级页面编辑态（如有）
    if (detailOpen && this.state.detailEditing) return this.renderDetailEditPage();

    return `
      <div class="cap-split-layout">

        <!-- ═══ 左侧：能力列表 ═══ -->
        <div class="cap-split-left">
          <div class="cap-split-left-header">
            <div style="font-weight:700;font-size:15px;color:#1a1a1a">能力列表</div>
            <button class="btn btn-sm btn-primary" onclick="CapabilityModule.openModal('create')" style="padding:4px 12px;font-size:12px">+ 新建</button>
          </div>
          <div class="cap-split-search">
            <input class="form-control" style="width:100%;font-size:12px" placeholder="搜索能力名称..."
              value="${this.state.devSearch}"
              oninput="CapabilityModule.setDevSearch(this.value)"
              onkeydown="if(event.key==='Enter')CapabilityModule.loadRules()">
          </div>

          <div class="cap-list-body">
            ${loading
              ? '<div style="padding:40px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>'
              : this.state.rules.length === 0
                ? '<div style="padding:40px;text-align:center;color:#aaa;font-size:13px">暂无巡检能力</div>'
                : this.state.rules.map(r => this.renderListItem(r)).join('')
            }
          </div>
        </div>

        <!-- ═══ 右侧：能力详情（垂直下滑） ═══ -->
        <div class="cap-split-right" id="cap-detail-panel">
          ${this.state.detailRule
            ? this.renderDetailPanel(this.state.detailRule)
            : `<div class="cap-empty-hint">
                <div style="font-size:40px;margin-bottom:16px">📋</div>
                <div style="font-size:15px;font-weight:600;color:#333;margin-bottom:8px">从左侧选择巡检能力</div>
                <div style="font-size:13px;color:#aaa">查看能力详情、指标、Input/Output 及评测集</div>
               </div>`
          }
        </div>

      </div>

      <!-- 新建弹窗 -->
      ${modal.open ? this.renderCapModal() : ''}`;
  },

  // ══ 左侧列表项 ══
  renderListItem(r) {
    const capType = this.CAPABILITY_TYPES.find(t => t.key === (r.rule_type||'workflow')) || this.CAPABILITY_TYPES[0];
    const metrics = this.getMockMetrics(r.rule_type || 'workflow');
    const isSelected = this.state.detailRule?.id === r.id;
    const statusMap = { published: { label: '已发布', color: '#52c41a' }, draft: { label: '草稿', color: '#faad14' } };
    const status = statusMap[r.status || 'published'] || statusMap['published'];
    const ver = r.version || 'V1.0';
    return `
      <div class="cap-list-item ${isSelected ? 'active' : ''}"
           onclick="CapabilityModule.selectRule(${r.id})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div style="font-weight:600;font-size:13px;color:${isSelected?'#1890ff':'#1a1a1a'};line-height:1.4;flex:1;margin-right:6px">${r.name}</div>
          <span style="font-size:11px;color:${status.color};background:${status.color}18;padding:1px 7px;border-radius:8px;white-space:nowrap;flex-shrink:0">${status.label}</span>
        </div>
        <div style="font-size:11px;color:#aaa">${ver} &nbsp;·&nbsp; ${r.created_at ? r.created_at.substring(0,10) : '-'}</div>
      </div>`;
  },

  // 兼容旧 renderRuleCard（保留但不再使用）
  renderRuleCard(r) {
    const capType = this.CAPABILITY_TYPES.find(t => t.key === (r.rule_type||'workflow'))
                  || this.CAPABILITY_TYPES[0];
    const otherSub = (r.rule_type === 'other' && r.other_sub_type)
      ? (this.OTHER_SUB_TYPES.find(s => s.key === r.other_sub_type)?.label || r.other_sub_type)
      : '';
    const displayLabel = r.rule_type === 'other' && otherSub ? `其他 · ${otherSub}` : capType.label;
    const metrics = this.getMockMetrics(r.rule_type || 'workflow');

    return `
      <div class="cap-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px">${r.name}</div>
            <div style="font-size:12px;color:#888">${r.scene || '-'}</div>
          </div>
          <span style="background:${capType.bg};color:${capType.color};font-size:11px;padding:2px 10px;border-radius:10px;white-space:nowrap">${displayLabel}</span>
        </div>
        ${r.description ? `<div style="font-size:13px;color:#666;margin-bottom:12px;line-height:1.6">${r.description}</div>` : ''}

        <!-- 核心指标 -->
        <div class="cap-metrics">
          <div class="cap-metric-item">
            <div class="cap-metric-val">${metrics.precision}</div>
            <div class="cap-metric-key">准确率</div>
          </div>
          <div class="cap-metric-item">
            <div class="cap-metric-val">${metrics.recall}</div>
            <div class="cap-metric-key">召回率</div>
          </div>
          <div class="cap-metric-item">
            <div class="cap-metric-val">${metrics.f1}</div>
            <div class="cap-metric-key">F1-Score</div>
          </div>
        </div>

        <div style="font-size:12px;color:#aaa;margin:10px 0 12px">${r.created_at ? r.created_at.substring(0,10) : '-'}</div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-primary" onclick="CapabilityModule.openDetailPage(${r.id})">查看详情</button>
        </div>
      </div>`;
  },

  getMockMetrics(type) {
    const map = {
      workflow:       { precision: '94.2%', recall: '91.8%', f1: '92.9%' },
      prompt:         { precision: '89.5%', recall: '87.3%', f1: '88.4%' },
      agent:          { precision: '96.1%', recall: '93.4%', f1: '94.7%' },
      skill:          { precision: '91.7%', recall: '89.2%', f1: '90.4%' },
      freq_control:   { precision: '99.1%', recall: '98.6%', f1: '98.8%' },
      similarity:     { precision: '93.8%', recall: '90.5%', f1: '92.1%' },
      rule_threshold: { precision: '97.3%', recall: '96.1%', f1: '96.7%' },
      other:          { precision: '90.0%', recall: '88.5%', f1: '89.2%' },
    };
    return map[type] || map['other'];
  },

  // ══════════════════════════════════════════════════
  //  右侧详情面板（5板块垂直下滑）
  // ══════════════════════════════════════════════════
  renderDetailPanel(r) {
    const cfg = (typeof r.config === 'string')
      ? (() => { try { return JSON.parse(r.config); } catch(e) { return {}; } })()
      : (r.config || {});
    const capTypeKey = r.rule_type || 'workflow';
    const capType = this.CAPABILITY_TYPES.find(t => t.key === capTypeKey) || this.CAPABILITY_TYPES[0];
    const metrics = this.getMockMetrics(capTypeKey);
    const ver = r.version || 'V1.2';
    const statusBadge = `<span class="cap-status-badge">✓ 已发布</span>`;

    // Input/Output 字段 mock
    const inputFields = cfg.input_params?.length
      ? cfg.input_params
      : [
          { name: 'request_id', type: 'string', required: '是', example: 'req_2024S201234' },
          { name: 'timestamp',  type: 'string', required: '是', example: '2024-05-20 12:34:56' },
          { name: 'log_content',type: 'string', required: '是', example: 'POST /api/order ...' },
          { name: 'service',    type: 'string', required: '否', example: 'order-service' },
          { name: 'env',        type: 'string', required: '否', example: 'prod' },
        ];
    const outputFields = cfg.output_params?.length
      ? cfg.output_params
      : [
          { name: 'is_error',      type: 'boolean', required: '是', example: 'true' },
          { name: 'error_type',    type: 'string',  required: '是', example: 'TimeoutError' },
          { name: 'error_message', type: 'string',  required: '否', example: '请求超时' },
          { name: 'affected_scope',type: 'string',  required: '否', example: '订单创建接口' },
          { name: 'confidence',    type: 'number',  required: '是', example: '0.92' },
        ];

    // 近7天趋势 mock（SVG折线）
    const trendData = {
      P: [0.91, 0.92, 0.90, 0.93, 0.92, 0.91, parseFloat(metrics.precision) / 100],
      R: [0.89, 0.90, 0.88, 0.91, 0.89, 0.90, parseFloat(metrics.recall) / 100],
      F1:[0.90, 0.91, 0.89, 0.92, 0.90, 0.90, parseFloat(metrics.f1) / 100],
    };
    const trendDates = ['05-14','05-15','05-16','05-17','05-18','05-19','05-20'];

    // 业务规则 mock
    const goodRules = cfg.good_rules || [
      '正确识别异常（应为异常且判为异常）',
      '准确提取错误类型和关键信息',
      '置信度 >= 0.80',
    ];
    const badRules = cfg.bad_rules || [
      '漏报：实际异常但未识别出来',
      '误报：实际正常但被判为异常',
      '错误类型识别错误或信息抽取不完整',
    ];

    // 黄金评测集 mock
    const evalSet = cfg.eval_set || {
      total: 1000,
      labeled: 1000,
      positive_ratio: '62%',
      updated_at: '2024-05-20',
      sources: [
        { name: '线上日志', strategy: '人工逐条标注', annotators: 3, period: '2024-05-18 ~ 05-20' },
        { name: '历史工单', strategy: '人工逐条标注', annotators: 3, period: '2024-05-18 ~ 05-20' },
      ],
    };

    return `
      <div class="cap-detail-scroll">

        <!-- 顶部标题行 -->
        <div class="cap-detail-topbar">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="cap-detail-icon">
              ${capTypeKey === 'prompt' ? '🤖' : capTypeKey === 'agent' ? '🕵️' : capTypeKey === 'skill' ? '⚡' : '🔧'}
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:18px;font-weight:700;color:#1a1a1a">${r.name}</span>
                ${statusBadge}
                <span style="font-size:14px;color:#1890ff;font-weight:600">${ver}</span>
              </div>
              <div style="font-size:12px;color:#aaa;margin-top:2px">
                创建时间：${r.created_at ? r.created_at.substring(0,10) : '-'} &nbsp;·&nbsp; 更新时间：${r.created_at ? r.created_at.substring(0,10) : '-'}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" onclick="CapabilityModule.startDetailEdit()">编辑</button>
            <button class="btn btn-sm" style="background:#f5f5f5;border-color:#d9d9d9">版本管理</button>
            <button class="btn btn-sm btn-primary">发布能力</button>
          </div>
        </div>

        <div class="cap-detail-body">

          <!-- ① 能力基础信息 -->
          <div class="cap-section">
            <div class="cap-section-title"><span class="cap-section-num">1</span> 能力基础信息</div>
            <div class="cap-section-body">
              <div class="cap-info-row">
                <span class="cap-info-label">能力名称</span>
                <span class="cap-info-value">${r.name}</span>
              </div>
              <div class="cap-info-row">
                <span class="cap-info-label">场景</span>
                <span class="cap-info-value">${r.scene || '-'}</span>
              </div>
              <div class="cap-info-row">
                <span class="cap-info-label">能力类型</span>
                <span class="cap-info-value">
                  <span style="background:${capType.bg};color:${capType.color};padding:2px 10px;border-radius:10px;font-size:12px">${capType.label}</span>
                </span>
              </div>
              <div class="cap-info-row" style="align-items:flex-start">
                <span class="cap-info-label">能力定义</span>
                <span class="cap-info-value" style="white-space:normal;line-height:1.7">
                  ${r.description || (capTypeKey === 'prompt'
                    ? '在综合搜索场景下，当用户搜索具有强电商意图的词时（如品牌名、商品品类名），系统必须在首屏出现特定的电商承接卡片。如果首屏出现的卡片不属于我们规定的【4种正常出卡类型】之一，则判定为承接异常（Badcase）。'
                    : '基于规则引擎对业务数据进行自动化质量检测，识别异常数据并输出检测结果和置信度。')}
                </span>
              </div>
            </div>
          </div>

          <!-- ② 能力交付水准与 F1 -->
          <div class="cap-section cap-section-metrics">
            <div class="cap-section-title"><span class="cap-section-num">2</span> 能力交付水准与 F1</div>
            <div style="display:flex;gap:16px">
              <div class="cap-section-body" style="flex:1;padding:0">
                <div class="cap-metrics-row">
                  ${[
                    ['Precision（准）', metrics.precision, '#1890ff'],
                    ['Recall（召）',   metrics.recall,   '#52c41a'],
                    ['F1',            metrics.f1,       '#722ed1'],
                  ].map(([label, val, color]) => `
                    <div class="cap-metric-big">
                      <div class="cap-metric-big-label">${label}</div>
                      <div class="cap-metric-big-val" style="color:${color}">${parseFloat(val)/100}</div>
                    </div>`).join('')}
                </div>
              </div>
              <!-- 趋势图（SVG） -->
              <div class="cap-trend-box">
                <div class="cap-trend-title">指标趋势（近7天）
                  <span style="margin-left:8px">
                    <span class="cap-trend-legend" style="color:#1890ff">— P</span>
                    <span class="cap-trend-legend" style="color:#52c41a">— R</span>
                    <span class="cap-trend-legend" style="color:#722ed1">— F1</span>
                  </span>
                </div>
                ${this.renderTrendSVG(trendData, trendDates)}
              </div>
            </div>
          </div>

          <!-- ③ 能力 Input/Output 及示例 -->
          <div class="cap-section">
            <div class="cap-section-title"><span class="cap-section-num">3</span> 能力 Input / Output</div>
            <div class="cap-section-body" style="padding:0">
              <div class="cap-io-split">
                <!-- Input 表 -->
                <div class="cap-io-table-wrap">
                  <div class="cap-io-table-title" style="color:#1890ff">Input 字段</div>
                  <table class="cap-io-table">
                    <thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>示例值</th></tr></thead>
                    <tbody>
                      ${inputFields.map(f => `
                        <tr>
                          <td style="font-family:monospace;font-size:12px;color:#262626">${f.name||f}</td>
                          <td style="color:#1890ff;font-size:12px">${f.type||'string'}</td>
                          <td>${(f.required==='是'||f.required===true)?'<span style="color:#52c41a">是</span>':'<span style="color:#aaa">否</span>'}</td>
                          <td style="color:#666;font-size:12px">${f.example||f.desc||'-'}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
                <div class="cap-io-arrow">→</div>
                <!-- Output 表 -->
                <div class="cap-io-table-wrap">
                  <div class="cap-io-table-title" style="color:#52c41a">Output 字段</div>
                  <table class="cap-io-table">
                    <thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>示例值</th></tr></thead>
                    <tbody>
                      ${outputFields.map(f => `
                        <tr>
                          <td style="font-family:monospace;font-size:12px;color:#262626">${f.name||f}</td>
                          <td style="color:#52c41a;font-size:12px">${f.type||'string'}</td>
                          <td>${(f.required==='是'||f.required===true)?'<span style="color:#52c41a">是</span>':'<span style="color:#aaa">否</span>'}</td>
                          <td style="color:#666;font-size:12px">${f.example||f.desc||'-'}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Input → Output 示例 -->
              <div class="cap-section-title" style="margin-top:16px;padding:0 16px"><span class="cap-section-num" style="font-size:12px">示例</span> Input → Output</div>
              <div class="cap-example-split" style="padding:0 16px 16px">
                <div class="cap-example-box">
                  <div class="cap-example-label">Input 示例</div>
                  <pre class="cap-example-code">{
  "request_id": "req_2024S201234",
  "timestamp": "2024-05-20 12:34:56",
  "log_content": "POST /api/order create\\nerror: java.net.SocketTimeoutException: Read timed out.",
  "service": "order-service",
  "env": "prod"
}</pre>
                </div>
                <div class="cap-example-arrow">→</div>
                <div class="cap-example-box">
                  <div class="cap-example-label">Output 示例</div>
                  <pre class="cap-example-code">{
  "is_error": true,
  "error_type": "TimeoutError",
  "error_message": "请求超时",
  "affected_scope": "订单创建接口",
  "confidence": 0.92
}</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- ④ 巡检的业务规则 -->
          <div class="cap-section">
            <div class="cap-section-title"><span class="cap-section-num">4</span> 巡检的业务规则</div>
            <div class="cap-rules-split">
              <div class="cap-rules-good">
                <div class="cap-rules-rule-title"><span style="color:#52c41a;font-size:16px">✅</span> 什么是好（Good）</div>
                ${goodRules.map(rule => `<div class="cap-rules-item">• ${rule}</div>`).join('')}
              </div>
              <div class="cap-rules-bad">
                <div class="cap-rules-rule-title"><span style="color:#f5222d;font-size:16px">❌</span> 什么是坏（Bad）</div>
                ${badRules.map(rule => `<div class="cap-rules-item">• ${rule}</div>`).join('')}
              </div>
            </div>
          </div>

          <!-- ⑤ 黄金评测集 -->
          <div class="cap-section">
            <div class="cap-section-title"><span class="cap-section-num">5</span> 黄金评测集</div>
            <div class="cap-section-body">
              <div class="cap-eval-stats">
                ${[
                  ['总样本数', evalSet.total.toLocaleString()],
                  ['人工标注数', `${evalSet.labeled.toLocaleString()} (${Math.round(evalSet.labeled/evalSet.total*100)}%)`],
                  ['正例占比', evalSet.positive_ratio],
                  ['更新时间', evalSet.updated_at],
                ].map(([k,v]) => `
                  <div class="cap-eval-stat">
                    <div class="cap-eval-stat-label">${k}</div>
                    <div class="cap-eval-stat-val">${v}</div>
                  </div>`).join('')}
              </div>
              <table class="cap-io-table" style="margin-top:14px">
                <thead><tr><th>数据来源</th><th>标注策略</th><th>标注人</th><th>抽样时间</th></tr></thead>
                <tbody>
                  ${evalSet.sources.map(s => `
                    <tr>
                      <td>${s.name}</td>
                      <td>${s.strategy}</td>
                      <td>${s.annotators} 人</td>
                      <td style="color:#1890ff">${s.period}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
              <div style="text-align:center;margin-top:12px">
                <button class="btn btn-sm btn-link">查看评测集详情 →</button>
              </div>
            </div>
          </div>

        </div>
      </div>`;
  },

  // SVG 折线趋势图
  renderTrendSVG(data, dates) {
    const W = 280, H = 100, padL = 8, padR = 8, padT = 10, padB = 20;
    const n = dates.length;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const minV = 0.85, maxV = 1.0;
    const scaleX = i => padL + i * innerW / (n - 1);
    const scaleY = v => padT + innerH - (v - minV) / (maxV - minV) * innerH;
    const colors = { P: '#1890ff', R: '#52c41a', F1: '#722ed1' };
    let svgContent = '';
    for (const [key, vals] of Object.entries(data)) {
      const pts = vals.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');
      svgContent += `<polyline points="${pts}" fill="none" stroke="${colors[key]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      vals.forEach((v, i) => {
        svgContent += `<circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(v).toFixed(1)}" r="2.5" fill="${colors[key]}"/>`;
      });
    }
    // X 轴标签（每隔2个）
    dates.forEach((d, i) => {
      if (i % 2 === 0) {
        svgContent += `<text x="${scaleX(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#aaa">${d}</text>`;
      }
    });
    // Y 轴参考线
    [0.875, 0.9, 0.925, 0.95].forEach(v => {
      const y = scaleY(v).toFixed(1);
      svgContent += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#f0f0f0" stroke-width="0.8"/>`;
      svgContent += `<text x="${padL - 2}" y="${parseFloat(y)+3}" text-anchor="end" font-size="8" fill="#ccc">${v.toFixed(2)}</text>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${svgContent}</svg>`;
  },

  // ══════════════════════════════════════════════════
  //  能力选择（左列表点击）
  // ══════════════════════════════════════════════════
  selectRule(ruleId) {
    const rule = this.state.rules.find(r => r.id === ruleId);
    if (!rule) return;
    this.state.detailRule = rule;
    this.state.detailEditing = false;
    // 只重绘右侧面板，避免左侧滚动重置
    const panel = document.getElementById('cap-detail-panel');
    if (panel) {
      panel.innerHTML = this.renderDetailPanel(rule);
      // 更新左侧列表 active 态
      document.querySelectorAll('.cap-list-item').forEach(el => {
        el.classList.remove('active');
        const nameEl = el.querySelector('div[style*="font-weight:600"]');
        if (nameEl && nameEl.textContent.trim() === rule.name) {
          el.classList.add('active');
          nameEl.style.color = '#1890ff';
        }
      });
    } else {
      app.render();
    }
  },

  // ══════════════════════════════════════════════════
  //  编辑态（独立页面）
  // ══════════════════════════════════════════════════
  renderDetailEditPage() {
    const r = this.state.detailRule;
    if (!r) return '';
    const { modal: m } = this.state;
    const capType = this.CAPABILITY_TYPES.find(t => t.key === m.capability_type) || this.CAPABILITY_TYPES[0];
    return `
      <div class="page-container">
        <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#888;margin-bottom:12px">
          <a href="#" onclick="CapabilityModule.cancelDetailEdit();return false" style="color:#1890ff;text-decoration:none">巡检能力</a>
          <span>/</span>
          <span style="color:#333;font-weight:500">${r.name}</span>
          <span>/</span>
          <span style="color:#333">编辑</span>
        </div>
        <div class="page-header" style="margin-bottom:16px">
          <h3>编辑巡检能力</h3>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="CapabilityModule.cancelDetailEdit()">取消</button>
            <button class="btn btn-primary" onclick="CapabilityModule.saveDetailEdit()">保存</button>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <div class="cap-modal-grid2" style="margin-bottom:12px">
              <div class="form-group">
                <label class="form-label">巡检名称 <span class="required">*</span></label>
                <input class="form-control" id="cap-name" value="${m.name}"
                  oninput="CapabilityModule.setModal('name',this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">场景 <span class="required">*</span></label>
                <input class="form-control" id="cap-scene" value="${m.scene}"
                  oninput="CapabilityModule.setModal('scene',this.value)"
                  list="cap-scene-list">
                <datalist id="cap-scene-list">${this.SCENES.map(s => `<option value="${s}">`).join('')}</datalist>
              </div>
            </div>
            <div class="cap-modal-grid2" style="margin-bottom:12px">
              <div class="form-group">
                <label class="form-label">能力类型 <span class="required">*</span></label>
                <select class="form-control" onchange="CapabilityModule.setModal('capability_type',this.value)">
                  ${this.CAPABILITY_TYPES.map(t =>
                    `<option value="${t.key}" ${m.capability_type===t.key?'selected':''}>${t.label}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">描述</label>
                <input class="form-control" value="${m.description}"
                  oninput="CapabilityModule.setModal('description',this.value)">
              </div>
            </div>
            <div class="cap-modal-section-title">
              <span style="background:${capType.bg};color:${capType.color};padding:2px 10px;border-radius:10px;font-size:12px">${capType.label}</span> 配置
            </div>
            ${this.renderCapabilityFields(m.capability_type)}
            ${this.renderParamsMappingEditor()}
          </div>
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  能力详情页（旧二级页面，保留兼容）
  // ══════════════════════════════════════════════════
  renderDetailPage() {
    return this.renderDetailEditPage();
  },

  openDetailPage(ruleId) {
    // 兼容旧的"查看详情"调用，转为 selectRule
    this.selectRule(ruleId);
  },

  closeDetailPage() {
    this.state.detailOpen = false;
    this.state.detailRule = null;
    this.state.detailEditing = false;
    app.render();
  },

  startDetailEdit() {
    const r = this.state.detailRule;
    if (!r) return;
    const cfg = (typeof r.config === 'string')
      ? (() => { try { return JSON.parse(r.config); } catch(e) { return {}; } })()
      : (r.config || {});
    const oldTypeMap = { ai_analysis: 'prompt', freq_control: 'other', similarity: 'other', rule_threshold: 'other', workflow: 'workflow' };
    const capType = oldTypeMap[r.rule_type] || r.rule_type || 'workflow';
    const otherSub = ['freq_control','similarity','rule_threshold','custom'].includes(r.rule_type) ? r.rule_type : (cfg.other_sub_type || 'freq_control');
    const m = this.state.modal;
    Object.assign(m, {
      open: false, mode: 'edit', id: r.id,
      name: r.name, scene: r.scene || '', description: r.description || '',
      capability_type: capType,
      other_sub_type: capType === 'other' ? otherSub : 'freq_control',
      input_params:  cfg.input_params  || [{ name: '', type: 'string', desc: '' }],
      output_params: cfg.output_params || [{ name: '', type: 'string', desc: '' }],
      ...cfg,
    });
    this.state.detailEditing = true;
    this.state.detailOpen = true;  // 进入编辑态二级页面
    app.render();
  },

  cancelDetailEdit() {
    this.state.detailEditing = false;
    this.state.detailOpen = false;
    app.render();
  },

  async saveDetailEdit() {
    // 复用 saveRule 逻辑，然后刷新详情
    await this.saveRule(true);
  },

  // ══════════════════════════════════════════════════
  //  AI自学习 Tab（已迁移到 LearningModule）
  // ══════════════════════════════════════════════════
  renderLearningView() {
    return LearningModule.render();
  },

  // ══════════════════════════════════════════════════
  //  新建/编辑 Modal
  // ══════════════════════════════════════════════════
  renderCapModal() {
    const m = this.state.modal;
    const capType = this.CAPABILITY_TYPES.find(t => t.key === m.capability_type) || this.CAPABILITY_TYPES[0];
    return `
      <div class="cap-modal-mask" onclick="CapabilityModule.handleMaskClick(event)">
        <div class="cap-modal-box" id="cap-modal-inner">
          <div class="cap-modal-title">${m.mode==='edit'?'编辑':'新建'}巡检能力</div>

          <!-- 基础字段 -->
          <div class="cap-modal-grid2">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">巡检名称 <span class="required">*</span></label>
              <input class="form-control" id="cap-name" value="${m.name}"
                oninput="CapabilityModule.setModal('name',this.value)" placeholder="请输入唯一名称">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">场景 <span class="required">*</span></label>
              <input class="form-control" id="cap-scene" value="${m.scene}"
                oninput="CapabilityModule.setModal('scene',this.value)"
                list="cap-scene-list" placeholder="输入或选择场景">
              <datalist id="cap-scene-list">
                ${this.SCENES.map(s => `<option value="${s}">`).join('')}
              </datalist>
            </div>
          </div>

          <div class="cap-modal-grid2" style="margin-top:12px">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">能力类型 <span class="required">*</span></label>
              <select class="form-control" id="cap-tpl"
                onchange="CapabilityModule.setModal('capability_type',this.value)">
                ${this.CAPABILITY_TYPES.map(t =>
                  `<option value="${t.key}" ${m.capability_type===t.key?'selected':''}>${t.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">描述（选填）</label>
              <input class="form-control" value="${m.description}"
                oninput="CapabilityModule.setModal('description',this.value)" placeholder="简要描述该能力用途">
            </div>
          </div>

          <!-- 能力配置区 -->
          <div class="cap-modal-section-title">
            <span style="background:${capType.bg};color:${capType.color};padding:2px 10px;border-radius:10px;font-size:12px">${capType.label}</span>
            配置
          </div>
          ${this.renderCapabilityFields(m.capability_type)}

          <!-- 参数映射区（所有类型通用）-->
          ${this.renderParamsMappingEditor()}

          <div class="cap-modal-footer">
            <button class="btn" onclick="CapabilityModule.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="CapabilityModule.saveRule()">
              ${m.mode==='edit'?'保存':'创建'}
            </button>
          </div>
        </div>
      </div>`;
  },

  renderCapabilityFields(type) {
    const m = this.state.modal;

    if (type === 'workflow') return `
      <div class="form-group">
        <label class="form-label">工作流 ID <span class="required">*</span></label>
        <input class="form-control" value="${m.workflow_id}"
          oninput="CapabilityModule.setModal('workflow_id',this.value)"
          placeholder="如 wf-12345678，接入外部工作流系统的唯一ID">
      </div>
      <div class="form-group">
        <label class="form-label">输入参数说明</label>
        <textarea class="form-control" rows="3"
          placeholder='{"item_id":"商品ID","scene":"场景标识","snapshot_url":"截图URL"}'
          oninput="CapabilityModule.setModal('workflow_input',this.value)">${m.workflow_input}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">工作流说明</label>
        <textarea class="form-control" rows="2"
          placeholder="简要说明该工作流的业务逻辑和处理步骤..."
          oninput="CapabilityModule.setModal('workflow_note',this.value)">${m.workflow_note}</textarea>
      </div>`;

    if (type === 'prompt') return `
      <div class="cap-modal-grid2">
        <div class="form-group">
          <label class="form-label">模型</label>
          <select class="form-control" onchange="CapabilityModule.setModal('ai_model',this.value)">
            ${this.MODELS.map(mo => `<option value="${mo}" ${m.ai_model===mo?'selected':''}>${mo}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Temperature（温度）</label>
          <input class="form-control" type="number" step="0.1" min="0" max="2" value="${m.prompt_temperature}"
            oninput="CapabilityModule.setModal('prompt_temperature',+this.value)">
        </div>
      </div>
      <div class="cap-modal-grid3">
        <div class="form-group">
          <label class="form-label">Max Output Tokens</label>
          <input class="form-control" type="number" min="1" value="${m.prompt_max_tokens}"
            oninput="CapabilityModule.setModal('prompt_max_tokens',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Max Input Tokens</label>
          <input class="form-control" type="number" min="1" value="${m.prompt_max_input}"
            oninput="CapabilityModule.setModal('prompt_max_input',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">推理超时时间（s）</label>
          <input class="form-control" type="number" min="1" value="${m.prompt_timeout}"
            oninput="CapabilityModule.setModal('prompt_timeout',+this.value)">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Prompt 模板 <span class="required">*</span></label>
        <textarea class="form-control" rows="6"
          placeholder="你是一名商品巡检专家。给定商品信息如下：\n商品ID: {{item_id}}\n场景: {{scene}}\n请判断该商品是否符合平台规范..."
          oninput="CapabilityModule.setModal('ai_instruction',this.value)">${m.ai_instruction}</textarea>
      </div>`;

    if (type === 'agent') return `
      <div class="cap-modal-grid2">
        <div class="form-group">
          <label class="form-label">模型</label>
          <select class="form-control" onchange="CapabilityModule.setModal('ai_model',this.value)">
            ${this.MODELS.map(mo => `<option value="${mo}" ${m.ai_model===mo?'selected':''}>${mo}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">向量检索 Top-K</label>
          <input class="form-control" type="number" min="1" max="20" value="${m.agent_top_k}"
            oninput="CapabilityModule.setModal('agent_top_k',+this.value)">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">可用工具列表（Tool Call）</label>
        <textarea class="form-control" rows="3"
          placeholder="search_product_db, check_compliance_rule, fetch_violation_history"
          oninput="CapabilityModule.setModal('agent_tools',this.value)">${m.agent_tools}</textarea>
        <div style="font-size:12px;color:#aaa;margin-top:4px">多个工具用逗号分隔</div>
      </div>
      <div class="form-group">
        <label class="form-label">任务目标 Prompt</label>
        <textarea class="form-control" rows="4"
          placeholder="请通过多步推理分析商品 {{item_id}} 在场景 {{scene}} 下是否违规..."
          oninput="CapabilityModule.setModal('ai_instruction',this.value)">${m.ai_instruction}</textarea>
      </div>`;

    if (type === 'skill') return `
      <div class="form-group">
        <label class="form-label">Skill ID <span class="required">*</span></label>
        <input class="form-control" value="${m.skill_id}"
          oninput="CapabilityModule.setModal('skill_id',this.value)"
          placeholder="如 sk-compliance-check-v2，平台定义的 Skill 唯一标识">
      </div>
      <div class="form-group">
        <label class="form-label">输入参数配置</label>
        <textarea class="form-control" rows="3"
          placeholder='{"item_id":"{{item_id}}","scene":"{{scene}}","category":"{{category}}"}'
          oninput="CapabilityModule.setModal('skill_input',this.value)">${m.skill_input}</textarea>
      </div>`;

    // other
    return `
      <div class="form-group">
        <label class="form-label">子类型 <span class="required">*</span></label>
        <select class="form-control" onchange="CapabilityModule.setModal('other_sub_type',this.value)">
          ${this.OTHER_SUB_TYPES.map(s =>
            `<option value="${s.key}" ${m.other_sub_type===s.key?'selected':''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
      ${this.renderOtherSubFields(m.other_sub_type)}`;
  },

  renderOtherSubFields(subType) {
    const m = this.state.modal;
    if (subType === 'freq_control') return `
      <div class="cap-modal-grid2">
        <div class="form-group">
          <label class="form-label">跨刷同 item 最小间隔（条）</label>
          <input class="form-control" type="number" min="1" value="${m.freq_min_item_interval}"
            oninput="CapabilityModule.setModal('freq_min_item_interval',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">跨刷同 SPU 最小间隔（条）</label>
          <input class="form-control" type="number" min="1" value="${m.freq_min_spu_interval}"
            oninput="CapabilityModule.setModal('freq_min_spu_interval',+this.value)">
        </div>
      </div>
      <div class="cap-modal-grid2">
        <div class="form-group">
          <label class="form-label">跨刷同类目最小间隔（条）</label>
          <input class="form-control" type="number" min="1" value="${m.freq_min_category_interval}"
            oninput="CapabilityModule.setModal('freq_min_category_interval',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">同作者冷却时间（秒）</label>
          <input class="form-control" type="number" min="0" value="${m.freq_author_cooldown}"
            oninput="CapabilityModule.setModal('freq_author_cooldown',+this.value)">
        </div>
      </div>`;

    if (subType === 'similarity') return `
      <div class="form-group">
        <label class="form-label">子规则类型</label>
        <div class="sub-rule-picker">
          <button class="sub-rule-btn ${m.sim_sub_rule==='ADJACENT'?'active':''}"
            onclick="CapabilityModule.setModal('sim_sub_rule','ADJACENT')">ADJACENT（相邻）</button>
          <button class="sub-rule-btn ${m.sim_sub_rule==='STEPPED'?'active':''}"
            onclick="CapabilityModule.setModal('sim_sub_rule','STEPPED')">STEPPED（间隔）</button>
        </div>
      </div>
      <div class="cap-modal-grid3">
        <div class="form-group">
          <label class="form-label">相似度阈值</label>
          <input class="form-control" type="number" step="0.01" min="0" max="1" value="${m.sim_threshold}"
            oninput="CapabilityModule.setModal('sim_threshold',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">最大坑位数</label>
          <input class="form-control" type="number" min="1" value="${m.sim_max_positions}"
            oninput="CapabilityModule.setModal('sim_max_positions',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">RPC 超时（ms）</label>
          <input class="form-control" type="number" min="100" value="${m.sim_rpc_timeout}"
            oninput="CapabilityModule.setModal('sim_rpc_timeout',+this.value)">
        </div>
      </div>`;

    if (subType === 'rule_threshold') return `
      <div class="cap-modal-grid2">
        <div class="form-group">
          <label class="form-label">目标字段</label>
          <input class="form-control" value="${m.threshold_target_field}"
            oninput="CapabilityModule.setModal('threshold_target_field',this.value)" placeholder="如 score">
        </div>
        <div class="form-group">
          <label class="form-label">备选字段</label>
          <input class="form-control" value="${m.threshold_fallback_field}"
            oninput="CapabilityModule.setModal('threshold_fallback_field',this.value)" placeholder="如 score_v2">
        </div>
      </div>
      <div class="cap-modal-grid3">
        <div class="form-group">
          <label class="form-label">下限阈值</label>
          <input class="form-control" type="number" value="${m.threshold_low}"
            oninput="CapabilityModule.setModal('threshold_low',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">上限阈值</label>
          <input class="form-control" type="number" value="${m.threshold_high}"
            oninput="CapabilityModule.setModal('threshold_high',+this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">正常标签</label>
          <input class="form-control" value="${m.threshold_label_normal}"
            oninput="CapabilityModule.setModal('threshold_label_normal',this.value)">
        </div>
      </div>`;

    // custom
    return `
      <div class="form-group">
        <label class="form-label">需求说明</label>
        <textarea class="form-control" rows="4"
          placeholder="请描述新巡检能力的业务需求、判断逻辑和输出格式..."
          oninput="CapabilityModule.setModal('ai_instruction',this.value)">${m.ai_instruction}</textarea>
      </div>
      <div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:6px;padding:12px;font-size:13px;color:#ad6800">
        平台将在3个工作日内评估接入可行性，并由研发同学跟进。
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  白盒详情弹窗（业务视角）
  // ══════════════════════════════════════════════════
  openRuleDetail(id) {
    const rule = this.state.rules.find(r => r.id === id);
    if (!rule) return;
    this.state.detailModal = { open: true, rule };
    app.render();
  },

  closeRuleDetail() {
    this.state.detailModal = { open: false, rule: null };
    app.render();
  },

  handleDetailMaskClick(e) {
    if (e.target === e.currentTarget) this.closeRuleDetail();
  },

  renderDetailModal() {
    const { rule } = this.state.detailModal;
    if (!rule) return '';
    const capType = this.CAPABILITY_TYPES.find(t => t.key === (rule.rule_type||'workflow'))
                  || this.CAPABILITY_TYPES[0];
    const cfg = (typeof rule.config === 'string')
      ? (() => { try { return JSON.parse(rule.config); } catch(e) { return {}; } })()
      : (rule.config || {});
    const metrics = this.getMockMetrics(rule.rule_type || 'workflow');
    const otherSub = (rule.rule_type === 'other' || !this.CAPABILITY_TYPES.find(t=>t.key===rule.rule_type))
      ? (cfg.other_sub_type || 'freq_control') : null;

    return `
      <div class="cap-modal-mask" onclick="CapabilityModule.handleDetailMaskClick(event)">
        <div class="cap-modal-box" id="cap-detail-inner" style="max-width:680px">
          <div class="cap-modal-title" style="display:flex;align-items:center;justify-content:space-between">
            <span>巡检能力白盒详情</span>
            <button class="btn btn-sm" onclick="CapabilityModule.closeRuleDetail()"
              style="font-size:18px;line-height:1;padding:0 6px;color:#888;background:none;border:none">×</button>
          </div>

          <!-- 基础信息 -->
          <div class="cap-modal-grid2">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label" style="color:#888;font-size:12px">巡检名称</label>
              <div style="font-size:15px;font-weight:700;padding:6px 0">${rule.name}</div>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label" style="color:#888;font-size:12px">场景</label>
              <div style="font-size:14px;padding:6px 0">${rule.scene || '-'}</div>
            </div>
          </div>
          <div class="cap-modal-grid2" style="margin-top:12px">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label" style="color:#888;font-size:12px">能力类型</label>
              <div style="padding:6px 0"><span style="background:${capType.bg};color:${capType.color};font-size:12px;padding:2px 12px;border-radius:10px">${capType.label}</span></div>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label" style="color:#888;font-size:12px">描述</label>
              <div style="font-size:13px;color:#666;padding:6px 0">${rule.description || '-'}</div>
            </div>
          </div>

          <!-- 核心指标 -->
          <div class="cap-modal-section-title">核心指标</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px">
            ${[['准确率 (Precision)',metrics.precision,'#1890ff'],['召回率 (Recall)',metrics.recall,'#52c41a'],['F1-Score',metrics.f1,'#722ed1']].map(([k,v,c])=>`
              <div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:16px;text-align:center">
                <div style="font-size:22px;font-weight:700;color:${c};margin-bottom:4px">${v}</div>
                <div style="font-size:12px;color:#888">${k}</div>
              </div>`).join('')}
          </div>

          <!-- 白盒详情 -->
          <div class="cap-modal-section-title">白盒展示</div>
          ${this.renderWhiteboxDetail(rule.rule_type || 'workflow', cfg, rule, otherSub)}

          <!-- 示例 -->
          <div class="cap-modal-section-title">运行示例</div>
          ${this.renderCapabilityExample(rule.rule_type || 'workflow', otherSub)}

          <div class="cap-modal-footer">
            <button class="btn btn-primary" onclick="CapabilityModule.closeRuleDetail()">关闭</button>
          </div>
        </div>
      </div>`;
  },

  renderWhiteboxDetail(type, cfg, rule, otherSub) {
    const field = (label, val, mono) => `
      <div class="form-group">
        <label class="form-label" style="color:#888;font-size:12px">${label}</label>
        <div style="background:#f8f9fa;border:1px solid #f0f0f0;border-radius:6px;padding:8px 12px;font-size:13px;${mono?'font-family:monospace;':''}color:#333">${val ?? '-'}</div>
      </div>`;

    if (type === 'workflow') return `
      ${field('工作流 ID', cfg.workflow_id || 'wf-demo-0001', true)}
      ${field('输入参数', cfg.workflow_input || '{"item_id":"{{item_id}}","scene":"{{scene}}"}', true)}
      <div class="wb-step-list">
        <div class="wb-step-title">执行步骤</div>
        ${['数据拉取 → 从 SQL 数据源获取商品字段','规则匹配 → 根据场景配置执行规则集','AI研判 → 调用 LLM 对疑似违规项打分','结果聚合 → 汇总各步骤输出，写入巡检结果表'].map((s,i)=>`
          <div class="wb-step-item">
            <div class="wb-step-no">${i+1}</div>
            <div class="wb-step-text">${s}</div>
          </div>`).join('')}
      </div>
      ${field('输出结果结构', '{"result":"badcase|normal","score":0.87,"reason":"商品重复曝光超出阈值"}', true)}`;

    if (type === 'prompt') return `
      <div class="cap-modal-grid2">
        ${field('模型', cfg.ai_model || 'Gemini 1.5 Pro')}
        ${field('Temperature', cfg.prompt_temperature ?? 0.7)}
      </div>
      <div class="cap-modal-grid3">
        ${field('Max Output Tokens', cfg.prompt_max_tokens ?? 2048)}
        ${field('Max Input Tokens', cfg.prompt_max_input ?? 4096)}
        ${field('推理超时（s）', cfg.prompt_timeout ?? 30)}
      </div>
      <div class="form-group">
        <label class="form-label" style="color:#888;font-size:12px">Prompt 模板</label>
        <div style="background:#1a1a2e;color:#a6e22e;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;line-height:1.7;max-height:180px;overflow-y:auto;white-space:pre-wrap">${cfg.ai_instruction || '你是一名商品巡检专家。\n给定商品信息：\n商品ID: {{item_id}}\n场景: {{scene}}\n请判断该商品是否符合平台规范，输出 JSON 格式。'}</div>
      </div>
      <div class="form-group">
        <label class="form-label" style="color:#888;font-size:12px">模型原始输出（示例）</label>
        <div style="background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;padding:10px;font-family:monospace;font-size:12px;color:#135200">{"result":"badcase","score":0.91,"reason":"商品图片涉及违禁内容","category":"illegal_content"}</div>
      </div>`;

    if (type === 'agent') return `
      <div class="cap-modal-grid2">
        ${field('模型', cfg.ai_model || 'GPT-4o')}
        ${field('向量检索 Top-K', cfg.agent_top_k ?? 5)}
      </div>
      <div class="wb-step-list">
        <div class="wb-step-title">多步推理路径（ReAct 框架）</div>
        ${[
          {t:'Thought',s:'思考过程',c:'#0050b3',bg:'#e6f7ff',v:'商品ID 9981234 在直播场景曝光，需检查其历史违规记录和图片合规性。'},
          {t:'Action',s:'执行动作',c:'#135200',bg:'#f6ffed',v:'调用工具 search_product_db(item_id=9981234, scene=live)'},
          {t:'Observation',s:'工具返回',c:'#7d4e00',bg:'#fff7e6',v:'{"violation_count":2, "last_violation":"2025-04-12", "categories":["quality_issue"]}'},
          {t:'Thought',s:'二次推理',c:'#0050b3',bg:'#e6f7ff',v:'发现历史违规2次，结合当前图片检测结果进行最终判断。'},
          {t:'Final',s:'最终结论',c:'#820014',bg:'#fff1f0',v:'判定为 badcase，违规类型：历史违规累积+质量问题，置信度 0.94。'},
        ].map(step=>`
          <div class="wb-agent-step" style="border-left:3px solid ${step.c};background:${step.bg};margin-bottom:8px;padding:8px 12px;border-radius:0 6px 6px 0">
            <div style="font-size:11px;font-weight:700;color:${step.c};margin-bottom:4px">${step.t} <span style="font-weight:400;color:#888">— ${step.s}</span></div>
            <div style="font-size:12px;color:#333;font-family:${step.t==='Action'||step.t==='Observation'?'monospace':'inherit'}">${step.v}</div>
          </div>`).join('')}
      </div>
      <div class="form-group">
        <label class="form-label" style="color:#888;font-size:12px">向量检索 Top-3 片段</label>
        <div style="border:1px solid #d9d9d9;border-radius:6px;overflow:hidden">
          ${[{s:'[0.96] 商品9981234 因质量问题于2025-04-12被下架处理...'},
             {s:'[0.89] 历史相关商品SPU同系列违规记录共2条...'},
             {s:'[0.81] 平台质量标准第3.2条：外观瑕疵超过5%视为违规...'}
          ].map((it,i)=>`<div style="padding:8px 12px;font-size:12px;font-family:monospace;${i>0?'border-top:1px solid #f0f0f0':''}"><span style="color:#722ed1;font-weight:600">${it.s.substring(0,6)}</span>${it.s.substring(6)}</div>`).join('')}
        </div>
      </div>`;

    if (type === 'skill') return `
      ${field('Skill ID', cfg.skill_id || 'sk-compliance-check-v2', true)}
      ${field('输入参数配置', cfg.skill_input || '{"item_id":"{{item_id}}","scene":"{{scene}}"}', true)}
      <div class="wb-step-list">
        <div class="wb-step-title">调用逻辑</div>
        ${['参数校验 → 检查必填输入参数完整性','Skill路由 → 根据 Skill ID 定位执行器','执行处理 → 运行 Skill 内部逻辑（规则+模型）','结果格式化 → 统一输出为平台标准格式'].map((s,i)=>`
          <div class="wb-step-item"><div class="wb-step-no">${i+1}</div><div class="wb-step-text">${s}</div></div>`).join('')}
      </div>
      ${field('执行结果（示例）', '{"result":"normal","score":0.12,"skill_version":"v2.3.1"}', true)}`;

    // other — 复用旧版只读渲染
    const actualSub = otherSub || cfg.other_sub_type || 'freq_control';
    return this.renderOtherDetailReadonly(actualSub, cfg);
  },

  renderOtherDetailReadonly(subType, cfg) {
    const field = (label, val) => `
      <div class="form-group">
        <label class="form-label" style="color:#888;font-size:12px">${label}</label>
        <div style="background:#f8f9fa;border:1px solid #f0f0f0;border-radius:6px;padding:8px 12px;font-size:13px;color:#333">${val ?? '-'}</div>
      </div>`;
    if (subType === 'freq_control') return `
      <div class="cap-modal-grid2">
        ${field('跨刷同 item 最小间隔（条）', cfg.freq_min_item_interval ?? 3)}
        ${field('跨刷同 SPU 最小间隔（条）', cfg.freq_min_spu_interval ?? 5)}
      </div>
      <div class="cap-modal-grid2">
        ${field('跨刷同类目最小间隔（条）', cfg.freq_min_category_interval ?? 2)}
        ${field('同作者冷却时间（秒）', cfg.freq_author_cooldown ?? 300)}
      </div>`;
    if (subType === 'similarity') return `
      <div class="cap-modal-grid3">
        ${field('相似度阈值', cfg.sim_threshold != null ? (Math.round(cfg.sim_threshold*100)+'%') : '85%')}
        ${field('最大坑位数', cfg.sim_max_positions ?? 10)}
        ${field('子规则类型', cfg.sim_sub_rule || 'ADJACENT')}
      </div>`;
    if (subType === 'rule_threshold') return `
      <div class="cap-modal-grid2">
        ${field('目标字段', cfg.threshold_target_field || '-')}
        ${field('备选字段', cfg.threshold_fallback_field || '-')}
      </div>
      <div class="cap-modal-grid3">
        ${field('下限阈值', cfg.threshold_low ?? 0)}
        ${field('上限阈值', cfg.threshold_high ?? 100)}
        ${field('正常标签', cfg.threshold_label_normal || '正常')}
      </div>`;
    return `<div style="padding:16px;text-align:center;color:#aaa;font-size:13px">新需求支持中，研发同学将在3个工作日内跟进</div>`;
  },

  renderCapabilityExample(type, otherSub) {
    const examples = {
      workflow: {
        input: '{"item_id":"9981234","scene":"live","snapshot_url":"https://oss.example.com/snap/xx.jpg"}',
        output: '{"result":"badcase","score":0.87,"reason":"商品在7条内重复曝光，超出频控阈值","step_count":4}',
      },
      prompt: {
        input: '{"item_id":"7776543","scene":"search","title":"正品耐克运动鞋"}',
        output: '{"result":"normal","score":0.08,"reason":"未发现违规内容","confidence":0.96}',
      },
      agent: {
        input: '{"item_id":"9981234","scene":"live"}',
        output: '{"result":"badcase","score":0.94,"reason":"历史违规2次+质量问题","steps":5,"tools_called":["search_product_db","check_compliance_rule"]}',
      },
      skill: {
        input: '{"item_id":"4443210","scene":"recommend","category":"clothing"}',
        output: '{"result":"normal","score":0.15,"skill_version":"v2.3.1"}',
      },
    };
    const ex = examples[type] || {
      input:  '{"item_id":"1234567","scene":"live"}',
      output: '{"result":"normal","score":0.05}',
    };
    return `
      <div style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden">
        <div style="background:#f5f5f5;padding:8px 12px;font-size:12px;font-weight:600;color:#666;border-bottom:1px solid #f0f0f0">输入</div>
        <div style="padding:10px 12px;font-family:monospace;font-size:12px;color:#333;background:#fafafa">${ex.input}</div>
        <div style="background:#f5f5f5;padding:8px 12px;font-size:12px;font-weight:600;color:#666;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0">输出</div>
        <div style="padding:10px 12px;font-family:monospace;font-size:12px;color:#135200;background:#f6ffed">${ex.output}</div>
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  参数映射（编辑态 & 只读态）
  // ══════════════════════════════════════════════════
  getMockMetrics(typeOrSub) {
    const MAP = {
      workflow:        { precision: '93.2%', recall: '89.7%', f1: '91.4%' },
      prompt:          { precision: '91.5%', recall: '88.3%', f1: '89.9%' },
      agent:           { precision: '95.1%', recall: '91.8%', f1: '93.4%' },
      skill:           { precision: '90.3%', recall: '86.6%', f1: '88.4%' },
      freq_control:    { precision: '97.8%', recall: '96.2%', f1: '97.0%' },
      similarity:      { precision: '89.4%', recall: '92.1%', f1: '90.7%' },
      rule_threshold:  { precision: '85.0%', recall: '80.3%', f1: '82.6%' },
      custom:          { precision: '88.0%', recall: '84.5%', f1: '86.2%' },
    };
    return MAP[typeOrSub] || MAP.workflow;
  },

  renderParamsMappingEditor() {
    const m = this.state.modal;
    const ip = m.input_params  || [{ name:'', type:'string', desc:'' }];
    const op = m.output_params || [{ name:'', type:'string', desc:'' }];
    const TYPES = ['string','integer','double','boolean','map','list','url','object','array'];
    const typeOpts = (sel) => TYPES.map(t => `<option value="${t}" ${sel===t?'selected':''}>${t}</option>`).join('');

    const renderRow = (arr, kind) => arr.map((p, i) => `
      <div class="param-row" style="display:grid;grid-template-columns:1fr 130px 1fr 32px;gap:6px;align-items:center;margin-bottom:6px">
        <input class="form-control" placeholder="参数名" value="${p.name || ''}"
          oninput="CapabilityModule.setParam('${kind}',${i},'name',this.value)">
        <select class="form-control" onchange="CapabilityModule.setParam('${kind}',${i},'type',this.value)">
          ${typeOpts(p.type || 'string')}
        </select>
        <input class="form-control" placeholder="值 / 说明" value="${p.desc || ''}"
          oninput="CapabilityModule.setParam('${kind}',${i},'desc',this.value)">
        <button class="btn btn-sm" title="删除"
          style="padding:0 8px;height:32px;line-height:32px;color:#ff4d4f;border-color:#ff4d4f;font-size:16px"
          onclick="CapabilityModule.removeParam('${kind}',${i})">×</button>
      </div>`).join('');

    return `
      <div class="cap-modal-section-title" style="margin-top:12px">
        <span style="background:#e6f7ff;color:#1890ff;padding:2px 10px;border-radius:10px;font-size:12px">参数映射</span>
      </div>
      <!-- 输入参数 -->
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;color:#595959;margin-bottom:8px">
          输入参数 <span style="font-size:11px;color:#aaa;font-weight:400">（Input Params）</span>
        </div>
        <!-- 表头 -->
        <div style="display:grid;grid-template-columns:1fr 130px 1fr 32px;gap:6px;margin-bottom:4px;padding:0 2px">
          <div style="font-size:11px;color:#aaa">参数名</div>
          <div style="font-size:11px;color:#aaa">类型</div>
          <div style="font-size:11px;color:#aaa">值 / 说明</div>
          <div></div>
        </div>
        <div id="input-params-rows">${renderRow(ip,'input')}</div>
        <button class="btn btn-sm" style="margin-top:4px;color:#1890ff;border-color:#1890ff"
          onclick="CapabilityModule.addParam('input')">+ 添加输入参数</button>
      </div>
      <!-- 输出参数 -->
      <div style="margin-bottom:4px">
        <div style="font-size:13px;font-weight:600;color:#595959;margin-bottom:8px">
          输出参数 <span style="font-size:11px;color:#aaa;font-weight:400">（Output Params）</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 130px 1fr 32px;gap:6px;margin-bottom:4px;padding:0 2px">
          <div style="font-size:11px;color:#aaa">参数名</div>
          <div style="font-size:11px;color:#aaa">类型</div>
          <div style="font-size:11px;color:#aaa">值 / 说明</div>
          <div></div>
        </div>
        <div id="output-params-rows">${renderRow(op,'output')}</div>
        <button class="btn btn-sm" style="margin-top:4px;color:#1890ff;border-color:#1890ff"
          onclick="CapabilityModule.addParam('output')">+ 添加输出参数</button>
      </div>`;
  },

  renderParamsMappingReadonly(cfg) {
    const ip = cfg.input_params  || [];
    const op = cfg.output_params || [];
    if (!ip.length && !op.length) return '';

    const renderTable = (arr, title) => {
      if (!arr.length) return '';
      return `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:#595959;margin-bottom:6px">${title}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#fafafa">
                <th style="padding:6px 10px;text-align:left;border:1px solid #f0f0f0;color:#888">参数名</th>
                <th style="padding:6px 10px;text-align:left;border:1px solid #f0f0f0;color:#888">类型</th>
                <th style="padding:6px 10px;text-align:left;border:1px solid #f0f0f0;color:#888">值 / 说明</th>
              </tr>
            </thead>
            <tbody>
              ${arr.map(p => `
                <tr>
                  <td style="padding:6px 10px;border:1px solid #f0f0f0;font-family:monospace">${p.name || '-'}</td>
                  <td style="padding:6px 10px;border:1px solid #f0f0f0"><span style="background:#e6f7ff;color:#1890ff;padding:1px 7px;border-radius:8px">${p.type || 'string'}</span></td>
                  <td style="padding:6px 10px;border:1px solid #f0f0f0;color:#666">${p.desc || '-'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };

    return `
      <div class="cap-modal-section-title" style="font-size:12px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:8px 0 6px;border-top:1px solid #f0f0f0">参数映射</div>
      ${renderTable(ip,'输入参数')}
      ${renderTable(op,'输出参数')}`;
  },

  // ══════════════════════════════════════════════════
  //  事件 & 数据加载
  // ══════════════════════════════════════════════════
  async init() {
    await this.loadRules();
    // 默认选中第一条能力
    if (this.state.rules.length > 0 && !this.state.detailRule) {
      this.state.detailRule = this.state.rules[0];
    }
    app.render();
  },

  async loadRules() {
    this.state.loading = true;
    app.render();
    const res = await API.getRules({ page: 1, page_size: 100, keyword: this.state.devSearch });
    if (res.code === 0) {
      this.state.rules    = res.data.list  || [];
      this.state.devTotal = res.data.total || 0;
      // 如果当前选中的能力在列表中，刷新 detailRule 引用
      if (this.state.detailRule) {
        const updated = this.state.rules.find(r => r.id === this.state.detailRule.id);
        if (updated) this.state.detailRule = updated;
      } else if (this.state.rules.length > 0) {
        this.state.detailRule = this.state.rules[0];
      }
    }
    this.state.loading = false;
    app.render();
  },

  async loadLearningSamples() {
    this.state.learningLoading = true;
    app.render();
    try {
      const res = await API.getLearningSamples({ page: 1, page_size: 20 });
      if (res.code === 0) {
        this.state.learningSamples = res.data.list  || [];
        this.state.learningTotal   = res.data.total || 0;
      }
    } catch(e) {
      // Demo 兜底 mock 数据
      this.state.learningSamples = [
        { case_id: 1023, original_label: 'normal', correct_label: 'badcase', reason: 'AI未识别出图片中的违禁logo', created_at: '2025-05-20 14:32', status: 'pending' },
        { case_id: 987,  original_label: 'badcase', correct_label: 'normal', reason: '误报，实为正常商品展示', created_at: '2025-05-19 09:15', status: 'accepted' },
        { case_id: 1056, original_label: 'normal', correct_label: 'badcase', reason: '商品描述存在夸大宣传', created_at: '2025-05-18 16:44', status: 'pending' },
      ];
      this.state.learningTotal = 3;
    }
    this.state.learningLoading = false;
    app.render();
  },

  switchView(isDev) {
    this.state.mainTab = isDev ? 'dev' : 'biz';
    app.render();
  },

  setDevSearch(v) { this.state.devSearch = v; },
  setBizScene(v)  { this.state.bizScene  = v; app.render(); },

  // Modal 操作
  openModal(mode, ruleId) {
    const m = this.state.modal;
    Object.assign(m, {
      open: true, mode, id: ruleId || null,
      name: '', scene: '', capability_type: 'workflow', other_sub_type: 'freq_control', description: '',
      workflow_id: '', workflow_input: '', workflow_note: '',
      ai_model: 'Gemini 1.5 Pro', ai_instruction: '',
      prompt_temperature: 0.7, prompt_max_tokens: 2048, prompt_max_input: 4096, prompt_timeout: 30,
      agent_tools: '', agent_top_k: 5,
      skill_id: '', skill_input: '',
      freq_min_item_interval: 3, freq_min_spu_interval: 5,
      freq_min_category_interval: 2, freq_author_cooldown: 300,
      sim_sub_rule: 'ADJACENT', sim_threshold: 0.85,
      sim_max_positions: 10, sim_step: 2, sim_min_pairs: 3, sim_rpc_timeout: 500,
      threshold_target_field: '', threshold_fallback_field: '',
      threshold_low: 0, threshold_high: 100,
      threshold_label_low: '偏低', threshold_label_high: '偏高', threshold_label_normal: '正常',
      input_params:  [{ name: '', type: 'string', desc: '' }],
      output_params: [{ name: '', type: 'string', desc: '' }],
    });
    if (mode === 'edit' && ruleId) {
      const r = this.state.rules.find(x => x.id === ruleId);
      if (r) {
        const cfg = (typeof r.config === 'string')
          ? (() => { try { return JSON.parse(r.config); } catch(e) { return {}; } })()
          : (r.config || {});
        // 旧数据迁移：rule_type 映射到 capability_type
        const oldTypeMap = { ai_analysis: 'prompt', freq_control: 'other', similarity: 'other', rule_threshold: 'other', workflow: 'workflow' };
        const capType = oldTypeMap[r.rule_type] || r.rule_type || 'workflow';
        const otherSub = ['freq_control','similarity','rule_threshold','custom'].includes(r.rule_type) ? r.rule_type : 'freq_control';
        Object.assign(m, {
          name: r.name, scene: r.scene || '', description: r.description || '',
          capability_type: capType,
          other_sub_type: capType === 'other' ? otherSub : 'freq_control',
          input_params:  cfg.input_params  || [{ name: '', type: 'string', desc: '' }],
          output_params: cfg.output_params || [{ name: '', type: 'string', desc: '' }],
          ...cfg,
        });
      }
    }
    app.render();
  },

  closeModal() {
    this.state.modal.open = false;
    app.render();
  },

  handleMaskClick(e) {
    if (e.target === e.currentTarget) this.closeModal();
  },

  setModal(key, val) {
    this.state.modal[key] = val;
    if (key === 'capability_type' || key === 'other_sub_type' || key === 'sim_sub_rule') app.render();
  },

  // 参数映射事件
  addParam(kind) {
    const key = kind === 'input' ? 'input_params' : 'output_params';
    this.state.modal[key] = [...(this.state.modal[key] || []), { name: '', type: 'string', desc: '' }];
    app.render();
  },
  removeParam(kind, idx) {
    const key = kind === 'input' ? 'input_params' : 'output_params';
    const arr = [...(this.state.modal[key] || [])];
    if (arr.length <= 1) { arr[0] = { name:'', type:'string', desc:'' }; }
    else { arr.splice(idx, 1); }
    this.state.modal[key] = arr;
    app.render();
  },
  setParam(kind, idx, field, val) {
    const key = kind === 'input' ? 'input_params' : 'output_params';
    const arr = [...(this.state.modal[key] || [])];
    arr[idx] = { ...arr[idx], [field]: val };
    this.state.modal[key] = arr;
    // 不 re-render，避免失焦
  },

  async saveRule(fromDetailPage = false) {
    const m = this.state.modal;
    if (!m.name.trim()) { Toast.error('请填写巡检名称'); return; }
    if (!m.scene.trim()) { Toast.error('请填写场景'); return; }

    let config = {};
    if (m.capability_type === 'workflow') {
      config = { workflow_id: m.workflow_id, workflow_input: m.workflow_input, workflow_note: m.workflow_note };
    } else if (m.capability_type === 'prompt') {
      config = { ai_model: m.ai_model, ai_instruction: m.ai_instruction,
                 prompt_temperature: m.prompt_temperature, prompt_max_tokens: m.prompt_max_tokens,
                 prompt_max_input: m.prompt_max_input, prompt_timeout: m.prompt_timeout };
    } else if (m.capability_type === 'agent') {
      config = { ai_model: m.ai_model, ai_instruction: m.ai_instruction,
                 agent_tools: m.agent_tools, agent_top_k: m.agent_top_k };
    } else if (m.capability_type === 'skill') {
      config = { skill_id: m.skill_id, skill_input: m.skill_input };
    } else {
      // other
      config = { other_sub_type: m.other_sub_type,
        freq_min_item_interval: m.freq_min_item_interval,
        freq_min_spu_interval:  m.freq_min_spu_interval,
        freq_min_category_interval: m.freq_min_category_interval,
        freq_author_cooldown:   m.freq_author_cooldown,
        sim_sub_rule: m.sim_sub_rule, sim_threshold: m.sim_threshold,
        sim_max_positions: m.sim_max_positions, sim_step: m.sim_step,
        sim_min_pairs: m.sim_min_pairs, sim_rpc_timeout: m.sim_rpc_timeout,
        threshold_target_field: m.threshold_target_field,
        threshold_fallback_field: m.threshold_fallback_field,
        threshold_low: m.threshold_low, threshold_high: m.threshold_high,
        threshold_label_low: m.threshold_label_low,
        threshold_label_high: m.threshold_label_high,
        threshold_label_normal: m.threshold_label_normal,
        ai_instruction: m.ai_instruction,
      };
    }

    const payload = {
      name:        m.name.trim(),
      scene:       m.scene.trim(),
      rule_type:   m.capability_type,
      description: m.description.trim(),
      threshold:   m.sim_threshold || 0.85,
      config:      JSON.stringify({
        ...config,
        input_params:  m.input_params  || [],
        output_params: m.output_params || [],
      }),
    };

    let res;
    if (m.mode === 'edit' && m.id) {
      res = await API.updateRule(m.id, payload);
    } else {
      res = await API.createRule(payload);
    }

    if (res.code === 0) {
      Toast.success(m.mode === 'edit' ? '更新成功' : '创建成功');
      if (fromDetailPage) {
        // 详情页模式：刷新规则列表，更新详情，退出编辑态
        await this.loadRules();
        const updated = this.state.rules.find(r => r.id === m.id);
        if (updated) this.state.detailRule = updated;
        this.state.detailEditing = false;
        app.render();
      } else {
        this.closeModal();
        await this.loadRules();
      }
    } else {
      Toast.error(res.message || '操作失败');
    }
  },

  async deleteRule(id, name) {
    if (!confirm(`确认删除巡检能力「${name}」？`)) return;
    const res = await API.deleteRule(id);
    if (res.code === 0) {
      Toast.success('已删除');
      await this.loadRules();
    } else {
      Toast.error(res.message || '删除失败');
    }
  },
};
