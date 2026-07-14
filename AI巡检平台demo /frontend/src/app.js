// ===== 全局 Modal =====
const Modal = {
  _config: null,
  show(config) {
    this._config = config;
    this._render();
  },
  hide() {
    const el = document.getElementById('modal-root');
    if (el) el.innerHTML = '';
    this._config = null;
  },
  _render() {
    const c = this._config;
    if (!c) return;
    const sizeClass = c.size === 'lg' ? 'modal-lg' : '';
    const el = document.getElementById('modal-root');
    el.innerHTML = `
      <div class="modal-overlay" onclick="Modal._overlayClick(event)">
        <div class="modal ${sizeClass}" onclick="event.stopPropagation()">
          <div class="modal-header">
            <span>${c.title || ''}</span>
            <span class="modal-close" onclick="Modal.hide()">×</span>
          </div>
          <div class="modal-body">${c.content || ''}</div>
          <div class="modal-footer">
            ${c.cancelText !== null ? `<button class="btn" onclick="Modal._cancel()">${c.cancelText || '取消'}</button>` : ''}
            <button class="btn btn-primary" onclick="Modal._ok()">${c.okText || '确定'}</button>
          </div>
        </div>
      </div>`;
  },
  _overlayClick(e) {
    if (e.target === e.currentTarget) this.hide();
  },
  async _ok() {
    if (this._config?.onOk) {
      const result = await this._config.onOk();
      if (result !== false) this.hide();
    } else {
      this.hide();
    }
  },
  async _cancel() {
    if (this._config?.onCancel) {
      const result = await this._config.onCancel();
      if (result !== false) this.hide();
    } else {
      this.hide();
    }
  },
};

// ===== 全局 Toast =====
const Toast = {
  _container: null,
  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },
  show(message, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    el.innerHTML = `<span>${icons[type]||''}</span><span>${message}</span>`;
    this._getContainer().appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error: (msg) => Toast.show(msg, 'error'),
  info: (msg) => Toast.show(msg, 'info'),
};

// ===== 主应用 =====
const app = {
  currentPage: 'task',
  currentParams: {},

  pages: {
    task:       { module: () => TaskModule,       title: '巡检任务', group: '平台功能' },
    result:     { module: () => ResultModule,     title: '巡检结果',     group: '平台功能' },
    capability: { module: () => CapabilityModule, title: '巡检能力', group: '平台功能' },
    learning:   { module: () => LearningModule,   title: 'AI自学习',     group: '平台功能' },
  },

  switchPage(page, params = {}) {
    this.currentPage = page;
    this.currentParams = params;
    const mod = this.pages[page]?.module();
    if (mod?.init) mod.init(params);
    else this.render();
    window.scrollTo(0, 0);
  },

  render() {
    const page = this.pages[this.currentPage];
    const mod = page?.module();

    // 顶部标题（顶部栏已移除，防御性判断避免报错）
    const titleEl = document.getElementById('top-bar-title');
    if (titleEl) titleEl.textContent = page ? page.title : 'AI巡检平台';

    // 侧边栏高亮
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === this.currentPage);
    });

    // 渲染内容
    const content = document.getElementById('page-content');
    if (mod?.render) {
      content.innerHTML = mod.render();
    }
  },

  init() {
    // 侧边栏点击绑定
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', () => this.switchPage(el.dataset.page));
    });
    this.switchPage('task');
  },
};

// DOM 就绪后初始化
document.addEventListener('DOMContentLoaded', () => app.init());
