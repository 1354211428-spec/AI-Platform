// API 请求封装
const BASE_URL = 'http://localhost:5001/api/v1';

async function request(method, path, data = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data && !(data instanceof FormData)) {
    opts.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    delete opts.headers['Content-Type'];
    opts.body = data;
  }
  const res = await fetch(BASE_URL + path, opts);
  return res.json();
}

const API = {
  // 数据集
  getDatasets: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/datasets${q ? '?' + q : ''}`);
  },
  getDataset: id => request('GET', `/datasets/${id}`),
  uploadExcel: formData => request('POST', '/datasets/upload', formData),
  createSqlDataset: data => request('POST', '/datasets/sql', data),
  deleteDataset: id => request('DELETE', `/datasets/${id}`),
  previewDataset: id => request('GET', `/datasets/${id}/preview`),
  validateSql: sql => request('POST', '/sql/validate', { sql }),
  estimateSql: sql => request('POST', '/sql/estimate', { sql }),

  // 规则
  getRules: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/rules${q ? '?' + q : ''}`);
  },
  createRule: data => request('POST', '/rules', data),
  updateRule: (id, data) => request('PUT', `/rules/${id}`, data),
  deleteRule: id => request('DELETE', `/rules/${id}`),

  // 任务
  getTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/tasks${q ? '?' + q : ''}`);
  },
  getTask: id => request('GET', `/tasks/${id}`),
  createTask: data => request('POST', '/tasks', data),
  executeTask: id => request('POST', `/tasks/${id}/execute`),
  getProgress: id => request('GET', `/tasks/${id}/progress`),
  getVersions: taskId => request('GET', `/tasks/${taskId}/versions`),
  getLogs: (taskId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/tasks/${taskId}/logs${q ? '?' + q : ''}`);
  },

  // 结果
  getOverview: versionId => request('GET', `/versions/${versionId}/overview`),
  getCases: (versionId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/versions/${versionId}/cases${q ? '?' + q : ''}`);
  },
  getCase: id => request('GET', `/cases/${id}`),
  submitFeedback: (id, data) => request('POST', `/cases/${id}/feedback`, data),
  exportResults: versionId => `${BASE_URL}/versions/${versionId}/export`,

  // ===== 综合结果看板 =====
  getResultDashboard: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/result/dashboard${q ? '?' + q : ''}`);
  },
  getTaskSummary: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/result/task-summary${q ? '?' + q : ''}`);
  },
  getDailyStats: () => request('GET', '/result/daily-stats'),
  getOverviewStats: () => request('GET', '/result/overview-stats'),
  getGroupRecords: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/result/group-records${q ? '?' + q : ''}`);
  },

  // ===== AI 巡检能力 =====
  aiGetMetrics: (scene = 'product', days = 30) =>
    request('GET', `/ai/metrics?scene=${scene}&days=${days}`),

  aiGetRules: (scene = 'product') =>
    request('GET', `/ai/rules?scene=${scene}`),

  aiGetLearning: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/ai/learning-records${q ? '?' + q : ''}`);
  },
  aiCreateLearning: data => request('POST', '/ai/learning-records', data),

  aiGetPromptVersions: (ruleId) =>
    request('GET', `/ai/prompt-versions?rule_id=${ruleId}`),
  aiCreatePromptVersion: data => request('POST', '/ai/prompt-versions', data),

  aiGetOptimizations: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/ai/optimization-records${q ? '?' + q : ''}`);
  },
  aiCreateOptimization: data => request('POST', '/ai/optimization-records', data),

  aiGetSuggestions: (scene = 'product') =>
    request('GET', `/ai/suggestions?scene=${scene}`),

  aiGetComponents: () => request('GET', '/ai/components'),

  aiGetKnowledgeHub: () => request('GET', '/ai/knowledge-hub'),

  aiGetGlobalLearning: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/ai/global-learning-records${q ? '?' + q : ''}`);
  },

  // ===== 自学习样本池 =====
  getLearningSamples: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/learning/samples${q ? '?' + q : ''}`);
  },
  submitCorrection: data => request('POST', '/learning/samples', data),

  // ===== 巡检结果统计（v4.0 新指标）=====
  getSummaryStats: () => request('GET', '/result/summary-stats'),
};
