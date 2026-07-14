// ===== 圈选巡检对象模块 v4.0（含数据预处理）=====
const DatasetModule = {
  state: {
    list: [], total: 0, page: 1, loading: false,
    filter: { source_type: '', keyword: '' },
    showUploadModal: false,
    showSqlModal: false,
    showPreviewModal: false,
    previewData: null,
    uploadFile: null,
    // 数据预处理弹窗
    preprocess: {
      open: false,
      pendingName: '',
      pendingSource: '',   // 'excel' | 'sql'
      pendingPayload: null, // 上传后的 dataset id 或 sql payload
      dataTab: 'live',     // 'live' | 'video'
      // 抽帧配置 - 直播
      live_id_col: '',
      exposure_ts_col: '',
      max_frames: 1,
      // 商品字段映射
      position_col: '',
      item_id_col: 'item_id',
      cluster_id_col: '',
      // 其他场景（3个自定义标签 + 3个字段）
      other_label_0: '',
      other_label_1: '',
      other_label_2: '',
      other_field_0: '',
      other_field_1: '',
      other_field_2: '',
    },
  },

  render() {
    const { list, total, page, loading, filter, preprocess } = this.state;
    return `
      <div class="page-container">
        <div class="page-header">
          <div>
            <h3>圈选巡检对象</h3>
            <p>管理巡检对象，圈选需要巡检的数据范围</p>
          </div>
          <div class="flex gap-8">
            <button class="btn" onclick="DatasetModule.showSqlModal()">SQL取数</button>
            <button class="btn btn-primary" onclick="DatasetModule.showUploadModal()">上传Excel</button>
          </div>
        </div>

        <div class="card">
          <div class="card-body" style="padding-bottom:0">
            <div class="search-bar">
              <input class="search-input" placeholder="搜索数据集名称..." value="${filter.keyword}"
                oninput="DatasetModule.setFilter('keyword', this.value)">
              <select class="form-control" style="width:160px"
                onchange="DatasetModule.setFilter('source_type', this.value)">
                <option value="">全部来源</option>
                <option value="excel" ${filter.source_type==='excel'?'selected':''}>Excel上传</option>
                <option value="sql" ${filter.source_type==='sql'?'selected':''}>SQL取数</option>
              </select>
              <button class="btn btn-primary" onclick="DatasetModule.load()">搜索</button>
            </div>
          </div>

          ${loading ? '<div class="loading"><div class="spinner"></div> 加载中...</div>' : `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>圈选巡检对象</th><th>来源</th><th>字段数</th><th>记录数</th><th>状态</th><th>创建时间</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${list.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div></div><p>暂无数据集</p><small>点击右上角上传Excel或SQL取数</small></div></td></tr>` : ''}
                ${list.map(ds => `
                  <tr>
                    <td><b>${ds.name}</b></td>
                    <td>${ds.source_type === 'excel' ? '<span class="badge badge-info">Excel</span>' : '<span class="badge badge-warning">SQL</span>'}</td>
                    <td>${ds.field_schema ? (Array.isArray(ds.field_schema) ? ds.field_schema.length : '-') : '-'} 个</td>
                    <td>${(ds.record_count || 0).toLocaleString()} 条</td>
                    <td>${ds.status === 'ready' ? '<span class="badge badge-success">就绪</span>' : ds.status === 'processing' ? '<span class="badge badge-warning">处理中</span>' : '<span class="badge badge-danger">失败</span>'}</td>
                    <td class="text-muted">${ds.created_at ? ds.created_at.substring(0,16) : '-'}</td>
                    <td>
                      <button class="btn btn-sm btn-link" onclick="DatasetModule.preview(${ds.id})">预览</button>
                      <button class="btn btn-sm" style="color:#ff4d4f;border-color:#ff4d4f" onclick="DatasetModule.del(${ds.id},'${ds.name}')">删除</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <span>共 ${total} 条</span>
            <button class="page-btn" ${page<=1?'disabled':''} onclick="DatasetModule.setPage(${page-1})">上一页</button>
            <button class="page-btn active">${page}</button>
            <button class="page-btn" ${page*20>=total?'disabled':''} onclick="DatasetModule.setPage(${page+1})">下一页</button>
          </div>`}
        </div>
      </div>

      ${preprocess.open ? this.renderPreprocessModal() : ''}`;
  },

  // ══════════════════════════════════════════════════
  //  数据预处理弹窗（参考图一、图二）
  // ══════════════════════════════════════════════════
  renderPreprocessModal() {
    const p = this.state.preprocess;
    const fieldOptions = ['', 'live_id', 'item_id', 'position', 'show_index', 'exposure_ts', 'same_cluster_id', 'category', 'date'];
    const makeOpts = (selected) => fieldOptions.map(f =>
      `<option value="${f}" ${selected===f?'selected':''}>${f || '请选择字段'}</option>`
    ).join('');

    return `
      <div class="preprocess-mask" onclick="DatasetModule.handlePreprocessMask(event)">
        <div class="preprocess-box" id="preprocess-inner">
          <div class="preprocess-header">
            <span>数据预处理</span>
            <button class="btn btn-sm" onclick="DatasetModule.closePreprocess()" style="font-size:18px;line-height:1;padding:0 6px;color:#888;background:none;border:none">×</button>
          </div>

          <div class="preprocess-body">
            <!-- 区块一：抽帧配置（参考图一）-->
            <div class="preprocess-section">
              <div class="preprocess-section-title">
                <span class="preprocess-title-bar"></span>
                抽帧配置
                <span class="preprocess-section-desc">配置直播 ID 和曝光时间，系统将自动拉取直播流并抽帧</span>
              </div>
              <!-- 直播/视频 Tab -->
              <div class="preprocess-data-tabs">
                <button class="preprocess-data-tab ${p.dataTab==='live'?'active':''}"
                  onclick="DatasetModule.setPreprocess('dataTab','live')">直播数据</button>
                <button class="preprocess-data-tab ${p.dataTab==='video'?'active':''}"
                  onclick="DatasetModule.setPreprocess('dataTab','video')">视频数据</button>
              </div>

              ${p.dataTab === 'live' ? `
              <div class="preprocess-grid3">
                <div class="form-group">
                  <label class="form-label preprocess-required">直播 ID 列</label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('live_id_col',this.value)">
                    ${makeOpts(p.live_id_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 live_id</div>
                </div>
                <div class="form-group">
                  <label class="form-label preprocess-required">曝光时间列
                    <span class="preprocess-help-icon" title="该列应包含用户曝光时间戳">?</span>
                  </label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('exposure_ts_col',this.value)">
                    ${makeOpts(p.exposure_ts_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 exposure_ts</div>
                </div>
                <div class="form-group">
                  <label class="form-label">最多抽帧数
                    <span class="preprocess-help-icon" title="每条记录最多抽取的帧数">?</span>
                  </label>
                  <input class="form-control" type="number" min="1" max="100" value="${p.max_frames}"
                    oninput="DatasetModule.setPreprocess('max_frames',+this.value)">
                </div>
              </div>` : `
              <div class="preprocess-grid3">
                <div class="form-group">
                  <label class="form-label preprocess-required">视频 ID 列</label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('live_id_col',this.value)">
                    ${makeOpts(p.live_id_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 video_id</div>
                </div>
                <div class="form-group">
                  <label class="form-label preprocess-required">时长列
                    <span class="preprocess-help-icon" title="视频时长（秒）">?</span>
                  </label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('exposure_ts_col',this.value)">
                    ${makeOpts(p.exposure_ts_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 duration_s</div>
                </div>
                <div class="form-group">
                  <label class="form-label">最多抽帧数
                    <span class="preprocess-help-icon" title="每条视频最多抽取的帧数">?</span>
                  </label>
                  <input class="form-control" type="number" min="1" max="100" value="${p.max_frames}"
                    oninput="DatasetModule.setPreprocess('max_frames',+this.value)">
                </div>
              </div>`}
            </div>

            <!-- 区块二：商品字段映射（参考图二）-->
            <div class="preprocess-section">
              <div class="preprocess-section-title">
                <span class="preprocess-title-bar"></span>
                商品字段映射
                <span class="preprocess-section-desc">指定 Excel 里表示坑位（1..N）和商品 ID 的列，所有 product 策略共用</span>
              </div>
              <div class="preprocess-grid3">
                <div class="form-group">
                  <label class="form-label preprocess-required">坑位字段
                    <span class="preprocess-help-icon" title="表示商品在页面中的位置">?</span>
                  </label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('position_col',this.value)">
                    ${makeOpts(p.position_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 position / show_index</div>
                </div>
                <div class="form-group">
                  <label class="form-label preprocess-required">商品 ID 字段
                    <span class="preprocess-help-icon" title="唯一标识商品的字段">?</span>
                  </label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('item_id_col',this.value)">
                    ${makeOpts(p.item_id_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 item_id</div>
                </div>
                <div class="form-group">
                  <label class="form-label">同品 ID 字段（可选）
                    <span class="preprocess-help-icon" title="用于相似品去重的聚类 ID">?</span>
                  </label>
                  <select class="form-control preprocess-select" onchange="DatasetModule.setPreprocess('cluster_id_col',this.value)">
                    ${makeOpts(p.cluster_id_col)}
                  </select>
                  <div class="preprocess-placeholder-hint">如 same_cluster_id</div>
                </div>
              </div>
            </div>

            <!-- 区块三：其他场景预处理（泛化扩展）-->
            <div class="preprocess-section">
              <div class="preprocess-section-title">
                <span class="preprocess-title-bar" style="background:#fa8c16"></span>
                其他场景预处理
                <span class="preprocess-section-desc">泛化配置，适用于其他业务场景的字段映射</span>
              </div>
              <!-- 上方3个：自定义中文名称 -->
              <div style="font-size:12px;color:#aaa;margin-bottom:8px;font-weight:500">字段标签名称（可填写中文）</div>
              <div class="preprocess-grid3" style="margin-bottom:12px">
                <div class="form-group" style="margin-bottom:0">
                  <input class="form-control preprocess-select" placeholder="如：曝光 ID"
                    value="${p.other_label_0}"
                    oninput="DatasetModule.setPreprocess('other_label_0',this.value)">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <input class="form-control preprocess-select" placeholder="如：用户标签"
                    value="${p.other_label_1}"
                    oninput="DatasetModule.setPreprocess('other_label_1',this.value)">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <input class="form-control preprocess-select" placeholder="如：来源渠道"
                    value="${p.other_label_2}"
                    oninput="DatasetModule.setPreprocess('other_label_2',this.value)">
                </div>
              </div>
              <!-- 下方3个：字段选择或自定义输入 -->
              <div style="font-size:12px;color:#aaa;margin-bottom:8px;font-weight:500">对应字段（下拉选择或自定义输入）</div>
              <div class="preprocess-grid3">
                <div class="form-group">
                  <input class="form-control preprocess-select" list="other-field-list"
                    placeholder="${p.other_label_0 || '字段1'}"
                    value="${p.other_field_0}"
                    oninput="DatasetModule.setPreprocess('other_field_0',this.value)">
                  <datalist id="other-field-list">
                    ${['live_id','item_id','position','show_index','exposure_ts','user_id','category','date','scene','source','label'].map(f=>`<option value="${f}">`).join('')}
                  </datalist>
                  <div class="preprocess-placeholder-hint">选择或输入字段名</div>
                </div>
                <div class="form-group">
                  <input class="form-control preprocess-select" list="other-field-list"
                    placeholder="${p.other_label_1 || '字段2'}"
                    value="${p.other_field_1}"
                    oninput="DatasetModule.setPreprocess('other_field_1',this.value)">
                  <div class="preprocess-placeholder-hint">选择或输入字段名</div>
                </div>
                <div class="form-group">
                  <input class="form-control preprocess-select" list="other-field-list"
                    placeholder="${p.other_label_2 || '字段3'}"
                    value="${p.other_field_2}"
                    oninput="DatasetModule.setPreprocess('other_field_2',this.value)">
                  <div class="preprocess-placeholder-hint">选择或输入字段名</div>
                </div>
              </div>
            </div>
          </div>

          <div class="preprocess-footer">
            <button class="btn" onclick="DatasetModule.closePreprocess()">取消</button>
            <button class="btn btn-primary" onclick="DatasetModule.confirmPreprocess()">确认</button>
          </div>
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════
  //  数据加载 & 基础事件
  // ══════════════════════════════════════════════════
  async load() {
    this.state.loading = true;
    app.render();
    const res = await API.getDatasets({ page: this.state.page, page_size: 20, ...this.state.filter });
    if (res.code === 0) {
      this.state.list = res.data.list;
      this.state.total = res.data.total;
    }
    this.state.loading = false;
    app.render();
  },

  setFilter(key, val) {
    this.state.filter[key] = val;
    this.state.page = 1;
  },

  setPage(p) {
    this.state.page = p;
    this.load();
  },

  // ══════════════════════════════════════════════════
  //  上传 Excel 弹窗
  // ══════════════════════════════════════════════════
  showUploadModal() {
    Modal.show({
      title: '上传Excel数据集',
      content: `
        <div class="form-group">
          <label class="form-label">数据集名称 <span class="required">*</span></label>
          <input class="form-control" id="ds-name" placeholder="请输入数据集名称">
        </div>
        <div class="form-group">
          <label class="form-label">选择文件</label>
          <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()"
               ondragover="event.preventDefault();this.classList.add('drag-over')"
               ondragleave="this.classList.remove('drag-over')"
               ondrop="DatasetModule.handleDrop(event)">
            <div class="upload-icon"></div>
            <p>拖拽文件到此处，或<b style="color:#1890ff">点击选择文件</b></p>
            <small>支持 .xlsx .xls .csv，文件大小 ≤ 100MB</small>
            <div id="file-name" style="margin-top:8px;color:#1890ff"></div>
          </div>
          <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none"
            onchange="DatasetModule.handleFileSelect(this)">
        </div>`,
      okText: '数据预处理',
      onOk: () => DatasetModule.openPreprocessFromUpload(),
    });
  },

  handleFileSelect(input) {
    if (input.files[0]) {
      this.state.uploadFile = input.files[0];
      document.getElementById('file-name').textContent = '已选择：' + input.files[0].name;
      if (!document.getElementById('ds-name').value) {
        document.getElementById('ds-name').value = input.files[0].name.replace(/\.[^.]+$/, '');
      }
    }
  },

  handleDrop(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      this.state.uploadFile = file;
      document.getElementById('file-name').textContent = '已选择：' + file.name;
    }
  },

  openPreprocessFromUpload() {
    const name = document.getElementById('ds-name')?.value?.trim();
    if (!name) { Toast.error('请输入数据集名称'); return false; }
    if (!this.state.uploadFile) { Toast.error('请选择文件'); return false; }
    // 关闭 Modal，打开预处理
    Modal.hide();
    this.state.preprocess = {
      ...this.state.preprocess,
      open: true, pendingName: name, pendingSource: 'excel',
      pendingPayload: { name, file: this.state.uploadFile },
    };
    app.render();
    return true;
  },

  // ══════════════════════════════════════════════════
  //  SQL 弹窗
  // ══════════════════════════════════════════════════
  showSqlModal() {
    Modal.show({
      title: 'SQL自动取数',
      content: `
        <div class="form-group">
          <label class="form-label">数据集名称 <span class="required">*</span></label>
          <input class="form-control" id="sql-ds-name" placeholder="请输入数据集名称">
        </div>
        <div class="form-group">
          <label class="form-label">SQL 语句 <span class="required">*</span>
            <button class="btn btn-sm btn-link" onclick="DatasetModule.validateSql()">验证</button>
            <button class="btn btn-sm btn-link" onclick="DatasetModule.estimateSql()">预估</button>
          </label>
          <textarea class="sql-editor" id="sql-content" placeholder="SELECT item_id, item_title, category FROM dw.table WHERE dt='\${date}' LIMIT 10000"></textarea>
          <div id="sql-result" style="margin-top:8px;font-size:13px"></div>
        </div>`,
      okText: '数据预处理',
      onOk: () => DatasetModule.openPreprocessFromSql(),
    });
  },

  async validateSql() {
    const sql = document.getElementById('sql-content').value;
    const res = await API.validateSql(sql);
    const el = document.getElementById('sql-result');
    if (res.data.valid) {
      el.innerHTML = '<span class="text-success">SQL语法正确</span>';
    } else {
      el.innerHTML = '<span class="text-danger">' + res.data.errors.join('; ') + '</span>';
    }
  },

  async estimateSql() {
    const sql = document.getElementById('sql-content').value;
    const res = await API.estimateSql(sql);
    const d = res.data;
    const el = document.getElementById('sql-result');
    el.innerHTML = `<span class="text-info">预估数据量：${d.estimated_rows.toLocaleString()}条 | 预估耗时：${Math.round(d.estimated_seconds/60)}分钟 | 约${d.estimated_size_mb}MB${d.warning ? ' ' +d.warning : ''}</span>`;
  },

  openPreprocessFromSql() {
    const name = document.getElementById('sql-ds-name')?.value?.trim();
    const sql = document.getElementById('sql-content')?.value?.trim();
    if (!name) { Toast.error('请输入数据集名称'); return false; }
    if (!sql)  { Toast.error('请输入SQL语句'); return false; }
    Modal.hide();
    this.state.preprocess = {
      ...this.state.preprocess,
      open: true, pendingName: name, pendingSource: 'sql',
      pendingPayload: { name, sql_content: sql },
    };
    app.render();
    return true;
  },

  // ══════════════════════════════════════════════════
  //  预处理弹窗事件
  // ══════════════════════════════════════════════════
  setPreprocess(key, val) {
    this.state.preprocess[key] = val;
    app.render();
  },

  handlePreprocessMask(e) {
    if (e.target === e.currentTarget) this.closePreprocess();
  },

  closePreprocess() {
    this.state.preprocess.open = false;
    app.render();
  },

  async confirmPreprocess() {
    const p = this.state.preprocess;
    // 校验必填字段
    if (p.dataTab === 'live' && !p.live_id_col) { Toast.error('请选择直播 ID 列'); return; }
    if (!p.position_col) { Toast.error('请选择坑位字段'); return; }
    if (!p.item_id_col)  { Toast.error('请选择商品 ID 字段'); return; }

    try {
      let res;
      if (p.pendingSource === 'excel') {
        const fd = new FormData();
        fd.append('file', p.pendingPayload.file);
        fd.append('name', p.pendingPayload.name);
        res = await API.uploadExcel(fd);
      } else {
        res = await API.createSqlDataset(p.pendingPayload);
      }

      if (res.code === 0) {
        Toast.success('数据预处理完成，数据集创建成功！');
        this.state.preprocess.open = false;
        this.state.uploadFile = null;
        this.load();
      } else {
        Toast.error(res.message);
      }
    } catch (e) {
      Toast.error('操作失败，请重试');
    }
  },

  // ══════════════════════════════════════════════════
  //  预览 & 删除
  // ══════════════════════════════════════════════════
  async preview(id) {
    const res = await API.previewDataset(id);
    if (res.code !== 0) { Toast.error(res.message); return; }
    const d = res.data;
    const cols = d.fields.map(f => `<th>${f.name}<br><small class="text-muted">${f.type}</small></th>`).join('');
    const rows = d.rows.map(r =>
      '<tr>' + d.fields.map(f => `<td>${r[f.name] || '-'}</td>`).join('') + '</tr>'
    ).join('');
    Modal.show({
      title: `数据预览（前${d.rows.length}条 / 共${d.total}条）`,
      size: 'lg',
      content: `<div class="table-wrap"><table><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table></div>`,
      okText: '关闭',
      cancelText: null,
    });
  },

  async del(id, name) {
    if (!confirm(`确认删除数据集「${name}」？此操作不可恢复。`)) return;
    const res = await API.deleteDataset(id);
    if (res.code === 0) { Toast.success('删除成功'); this.load(); }
    else Toast.error(res.message);
  },

  init() { this.load(); },
};
