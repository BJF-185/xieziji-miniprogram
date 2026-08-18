const API_BASE = 'https://cloud1-d3gd4qlyef136776e-1453067705.ap-shanghai.app.tcloudbase.com/webAdmin'

// ===== Global State =====
let allOrders = []
let filteredOrders = []
let currentFilter = 'all'
let currentPage = 1
let pageSize = 10
let searchKeyword = ''
let notifications = []
let currentDetailOrderId = null

// ===== Status Maps =====
const STATUS_MAP = {
  'unpaid': '待付款',
  'pending': '待处理',
  'doing': '进行中',
  'done': '已完成',
  'cancelled': '已取消'
}

const STATUS_CLASS = {
  'unpaid': 'status-unpaid',
  'paid': 'status-paid',
  'pending': 'status-pending',
  'doing': 'status-doing',
  'done': 'status-done',
  'cancelled': 'status-cancelled'
}

const STATUS_DISPLAY = (order) => {
  if (order.payStatus === 'paid' && order.status !== 'done' && order.status !== 'cancelled') {
    return { label: '待确认', cls: 'status-paid' }
  }
  return { label: STATUS_MAP[order.status] || order.status, cls: STATUS_CLASS[order.status] || '' }
}

const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待付款' },
  { key: 'paid', label: '待确认' },
  { key: 'pending', label: '待处理' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

// ===== Auth =====
function getToken() { return localStorage.getItem('admin_token') }
function setToken(token) { localStorage.setItem('admin_token', token) }
function removeToken() { localStorage.removeItem('admin_token') }
function isLoggedIn() { return !!getToken() }

// ===== API =====
async function apiRequest(action, data = {}) {
  const token = getToken()
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...data })
  })
  const responseText = await response.text()
  let result
  try { result = JSON.parse(responseText) }
  catch (e) { throw new Error('服务器响应格式错误') }
  if (!result.success && result.message === '未登录或登录已过期') {
    removeToken()
    window.location.href = 'login.html'
    throw new Error('未授权')
  }
  return result
}

// ===== Toast =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer')
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = msg
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

// ===== Number Animation =====
function animateValue(el, start, end, duration) {
  const st = performance.now()
  function update(now) {
    const p = Math.min((now - st) / duration, 1)
    const e = 1 - Math.pow(1 - p, 3)
    el.textContent = Math.floor(start + (end - start) * e)
    if (p < 1) requestAnimationFrame(update)
  }
  requestAnimationFrame(update)
}

function animateNumber(id, value) {
  const el = document.getElementById(id)
  if (el) animateValue(el, parseInt(el.textContent) || 0, value, 600)
}

// ===== Date Helpers =====
function formatDate(ts) {
  if (!ts) return ''
  let d
  if (typeof ts === 'object' && ts._seconds) d = new Date(ts._seconds * 1000)
  else d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTodayDate() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const days = ['周日','周一','周二','周三','周四','周五','周六']
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${days[d.getDay()]}`
}

function isToday(ts) {
  if (!ts) return false
  let d
  if (typeof ts === 'object' && ts._seconds) d = new Date(ts._seconds * 1000)
  else d = new Date(ts)
  const today = new Date()
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate()
}

// ===== Count Getters =====
function getCounts() {
  const total = allOrders.length
  const unpaid = allOrders.filter(o => o.payStatus === 'unpaid' && o.status !== 'cancelled').length
  const paid = allOrders.filter(o => o.payStatus === 'paid' && o.status !== 'pending' && o.status !== 'doing' && o.status !== 'done' && o.status !== 'cancelled').length
  const pending = allOrders.filter(o => o.status === 'pending').length
  const doing = allOrders.filter(o => o.status === 'doing').length
  const done = allOrders.filter(o => o.status === 'done').length
  const cancelled = allOrders.filter(o => o.status === 'cancelled').length
  const todayCount = allOrders.filter(o => isToday(o.createTime)).length
  return { total, unpaid, paid, pending, doing, done, cancelled, todayCount }
}

// ===== Render Stats =====
function renderStats() {
  const c = getCounts()
  document.getElementById('currentDate').textContent = formatTodayDate()
  animateNumber('todayCount', parseInt(document.getElementById('todayCount')?.textContent || '0'), c.todayCount)

  const statsConfig = [
    { key: 'total', label: '总订单', num: c.total, color: '#8b5a2b', bg: '#f5f0e8',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#8b5a2b'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>` },
    { key: 'unpaid', label: '待付款', num: c.unpaid, color: '#c41e3a', bg: '#fee2e2',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#c41e3a'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` },
    { key: 'paid', label: '待确认', num: c.paid, color: '#92400e', bg: '#fef3c7',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#92400e'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
    { key: 'pending', label: '待处理', num: c.pending, color: '#6d28d9', bg: '#ede9fe',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#6d28d9'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>` },
    { key: 'doing', label: '进行中', num: c.doing, color: '#1e40af', bg: '#dbeafe',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#1e40af'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>` },
    { key: 'done', label: '已完成', num: c.done, color: '#166534', bg: '#dcfce7',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${'#166534'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` }
  ]

  const row = document.getElementById('statsRow')
  row.innerHTML = statsConfig.map(s => `
    <div class="stat-card">
      <div class="stat-icon" style="background:${s.bg}">${s.icon}</div>
      <div class="stat-info">
        <div class="stat-number ${s.key === 'total' ? 'total-num' : ''}" id="stat-${s.key}">${s.num}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>
  `).join('')
}

// ===== Render Filter Tabs =====
function renderFilterTabs() {
  const c = getCounts()
  const counts = { all: c.total, unpaid: c.unpaid, paid: c.paid, pending: c.pending, doing: c.doing, done: c.done, cancelled: c.cancelled }
  const container = document.getElementById('filterTabs')
  container.innerHTML = FILTER_TABS.map(t => `
    <button class="filter-tab ${currentFilter === t.key ? 'active' : ''}" onclick="setFilter('${t.key}')">
      ${t.label}<span class="tab-count">${counts[t.key] || 0}</span>
    </button>
  `).join('')
}

// ===== Filter Orders =====
function filterOrders() {
  let list = [...allOrders]
  // filter by status
  if (currentFilter === 'unpaid') {
    list = list.filter(o => o.payStatus === 'unpaid' && o.status !== 'cancelled')
  } else if (currentFilter === 'paid') {
    list = list.filter(o => o.payStatus === 'paid' && o.status !== 'pending' && o.status !== 'doing' && o.status !== 'done' && o.status !== 'cancelled')
  } else if (currentFilter !== 'all') {
    list = list.filter(o => o.status === currentFilter)
  }
  // search
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase()
    list = list.filter(o =>
      (o.name && o.name.toLowerCase().includes(kw)) ||
      (o.fileName && o.fileName.toLowerCase().includes(kw)) ||
      (o.orderNo && String(o.orderNo).includes(kw)) ||
      (o.phone && o.phone.includes(kw))
    )
  }
  filteredOrders = list
}

// ===== Set Filter =====
function setFilter(key) {
  currentFilter = key
  currentPage = 1
  filterOrders()
  renderFilterTabs()
  renderTable()
  renderPagination()
}

// ===== Search Handler =====
let searchTimer = null
function handleSearch(val) {
  searchKeyword = val.trim()
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage = 1
    filterOrders()
    renderTable()
    renderPagination()
  }, 300)
}

// ===== Get Action Buttons =====
function getActionButtons(order) {
  const st = order.status
  const ps = order.payStatus
  let btns = ''
  if (ps === 'paid' && st !== 'pending' && st !== 'doing' && st !== 'done' && st !== 'cancelled') {
    btns += `<button class="btn-sm btn-primary-sm" onclick="event.stopPropagation();confirmPayment('${order._id}')">确认收款</button>`
  }
  if (st === 'pending') {
    btns += `<button class="btn-sm" onclick="event.stopPropagation();changeStatus('${order._id}','doing')">开始处理</button>`
  }
  if (st === 'doing') {
    btns += `<button class="btn-sm" onclick="event.stopPropagation();changeStatus('${order._id}','done')">完成</button>`
  }
  btns += `<button class="btn-delete" onclick="event.stopPropagation();deleteOrder('${order._id}')">删除</button>`
  return `<div class="action-btns">${btns}</div>`
}

// ===== Render Table =====
function renderTable() {
  const tbody = document.getElementById('ordersTbody')
  const empty = document.getElementById('tableEmpty')

  if (filteredOrders.length === 0) {
    tbody.innerHTML = ''
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  const start = (currentPage - 1) * pageSize
  const pageData = filteredOrders.slice(start, start + pageSize)

  tbody.innerHTML = pageData.map(o => {
    const st = STATUS_DISPLAY(o)
    return `
      <tr class="order-row" onclick="showOrderDetail('${o._id}')">
        <td><span class="order-time">${formatDate(o.createTime)}</span></td>
        <td><span class="order-customer">${o.name || '-'}${o.phone ? ' · ' + o.phone : ''}</span></td>
        <td><span class="order-file" title="${o.fileName || ''}">${o.fileName || '-'}</span></td>
        <td><span class="order-amount">¥${(o.price || 0).toFixed(2)}</span></td>
        <td><span class="status-tag ${st.cls}">${st.label}</span></td>
        <td>${getActionButtons(o)}</td>
      </tr>
    `
  }).join('')
}

// ===== Render Pagination =====
function renderPagination() {
  const bar = document.getElementById('paginationBar')
  const total = filteredOrders.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (currentPage > totalPages) currentPage = totalPages

  let pagesHTML = ''
  // show up to 5 page numbers
  let startP = Math.max(1, currentPage - 2)
  let endP = Math.min(totalPages, startP + 4)
  if (endP - startP < 4) startP = Math.max(1, endP - 4)

  for (let i = startP; i <= endP; i++) {
    pagesHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`
  }

  bar.innerHTML = `
    <div class="pagination-info">共 ${total} 条</div>
    <div class="pagination-pages">
      <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${pagesHTML}
      <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <select class="page-size-select" onchange="changePageSize(this.value)">
      <option value="10" ${pageSize===10?'selected':''}>10条/页</option>
      <option value="20" ${pageSize===20?'selected':''}>20条/页</option>
      <option value="50" ${pageSize===50?'selected':''}>50条/页</option>
    </select>
  `
}

function goToPage(p) {
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  if (p < 1 || p > totalPages) return
  currentPage = p
  renderTable()
  renderPagination()
}

function changePageSize(val) {
  pageSize = parseInt(val)
  currentPage = 1
  renderTable()
  renderPagination()
}

// ===== Export CSV =====
function exportCSV() {
  if (filteredOrders.length === 0) {
    showToast('没有可导出的数据', 'error')
    return
  }
  const headers = ['时间','客户','电话','文件','金额','状态']
  const rows = filteredOrders.map(o => {
    const st = STATUS_DISPLAY(o)
    return [
      formatDate(o.createTime),
      o.name || '',
      o.phone || '',
      o.fileName || '',
      (o.price || 0).toFixed(2),
      st.label
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
  })
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `订单导出_${formatTodayDate().replace(/\s/g,'_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  showToast('导出成功', 'success')
}

// ===== Load Orders =====
async function loadOrders() {
  const overlay = document.getElementById('loadingOverlay')
  overlay.classList.add('show')
  try {
    const res = await apiRequest('getOrders')
    if (res.success) {
      allOrders = res.orders || []
      filterOrders()
      renderStats()
      renderFilterTabs()
      renderTable()
      renderPagination()
    } else {
      showToast(res.message || '加载失败', 'error')
    }
  } catch (e) {
    console.error(e)
    showToast('加载订单失败: ' + e.message, 'error')
  } finally {
    overlay.classList.remove('show')
  }
}

// ===== New Order Toast =====
function showNewOrderToast(data) {
  const toast = document.getElementById('newOrderToast')
  const text = toast.querySelector('.toast-text')
  if (data.count === 1 && data.orders[0]) {
    text.textContent = `新订单 · ${data.orders[0].name}`
  } else {
    text.textContent = `共 ${data.count} 个新订单`
  }
  toast.style.display = 'block'
  toast.querySelector('.toast-content').onclick = () => {
    hideNewOrderToast()
    loadOrders()
    if (data.orders[0]) showOrderDetail(data.orders[0]._id)
  }
  setTimeout(hideNewOrderToast, 8000)
}

function hideNewOrderToast() {
  document.getElementById('newOrderToast').style.display = 'none'
}
window.hideNewOrderToast = hideNewOrderToast

// ===== Notifications =====
function addNotifications(data) {
  (data.orders || []).forEach(o => {
    notifications.unshift({
      id: o._id, orderNo: o.orderNo, name: o.name,
      fileName: o.fileName, time: new Date().toLocaleString('zh-CN')
    })
  })
  if (notifications.length > 20) notifications = notifications.slice(0, 20)
}

function updateNotificationBadge() {
  const badge = document.getElementById('notifyBadge')
  if (notifications.length > 0) {
    badge.textContent = notifications.length
    badge.style.display = 'flex'
  } else {
    badge.style.display = 'none'
  }
}

function showNotifications() {
  const modal = document.getElementById('notificationModal')
  const body = document.getElementById('notificationBody')
  if (notifications.length === 0) {
    body.innerHTML = '<div class="notification-empty">暂无新通知</div>'
  } else {
    body.innerHTML = notifications.map(n => `
      <div class="notification-item unread" onclick="showNotificationOrder('${n.id}')">
        <div class="notification-dot"></div>
        <div class="notification-content">
          <div class="notification-title">新订单 · ${n.name}</div>
          <div class="notification-time">${n.fileName || '无文件'} · #${n.orderNo} · ${n.time}</div>
        </div>
      </div>
    `).join('')
  }
  modal.classList.add('show')
  notifications = []
  updateNotificationBadge()
}

function closeNotifications() {
  document.getElementById('notificationModal').classList.remove('show')
}

function showNotificationOrder(orderId) {
  closeNotifications()
  showOrderDetail(orderId)
}

function markAllRead() {
  notifications = []
  updateNotificationBadge()
  closeNotifications()
}

// ===== Order Detail Modal =====
async function showOrderDetail(orderId) {
  currentDetailOrderId = orderId
  const modal = document.getElementById('detailModal')
  const orderNoEl = document.getElementById('detailOrderNo')
  const bodyEl = document.getElementById('detailBody')
  const footerEl = document.getElementById('detailFooter')

  orderNoEl.textContent = '加载中...'
  bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载中...</div>'
  footerEl.innerHTML = ''
  modal.classList.add('show')

  try {
    const res = await apiRequest('getDetail', { orderId })
    if (res.success) {
      renderOrderDetail(res.order)
    } else {
      bodyEl.innerHTML = `<p style="color:#c41e3a;text-align:center;padding:40px;">${res.message || '加载失败'}</p>`
    }
  } catch (e) {
    bodyEl.innerHTML = '<p style="color:#c41e3a;text-align:center;padding:40px;">网络错误</p>'
  }
}

function renderOrderDetail(order) {
  const price = (order.price || 0).toFixed(2)
  const createTime = formatDate(order.createTime)
  const updateTime = formatDate(order.updateTime)
  const ps = order.payStatus || 'unpaid'
  const st = STATUS_DISPLAY(order)

  document.getElementById('detailOrderNo').textContent = `订单 #${order.orderNo || '-'}`

  let fileHTML = ''
  if (order.fileID) {
    fileHTML = `
      <div class="detail-section">
        <div class="detail-section-title">附件文件</div>
        <a class="detail-file-link" onclick="downloadFile('${order._id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${order.fileName || '下载文件'}
        </a>
      </div>
    `
  }

  let confirmPayHTML = ''
  if (ps === 'paid' && order.status !== 'pending' && order.status !== 'doing' && order.status !== 'done') {
    confirmPayHTML = `
      <div class="detail-section">
        <div class="detail-section-title">确认收款</div>
        <p style="color:#92400e;background:#fef3c7;padding:12px;border-radius:10px;font-size:13px;margin-bottom:12px;">客户已提交支付，请确认是否收到款项</p>
        <button class="btn btn-primary" onclick="confirmPayment('${order._id}')">确认已收款</button>
      </div>
    `
  }

  const bodyEl = document.getElementById('detailBody')
  bodyEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">基本信息</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">订单状态</span><span class="detail-value"><span class="status-tag ${st.cls}">${st.label}</span></span></div>
        <div class="detail-item"><span class="detail-label">支付状态</span><span class="detail-value">${ps === 'paid' ? '已支付待确认' : ps === 'confirmed' ? '已确认' : '待付款'}</span></div>
        <div class="detail-item"><span class="detail-label">客户姓名</span><span class="detail-value">${order.name || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">联系电话</span><span class="detail-value">${order.phone || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">订单金额</span><span class="detail-value highlight">¥${price}</span></div>
        <div class="detail-item"><span class="detail-label">本子规格</span><span class="detail-value">${order.notebookSize || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">字数</span><span class="detail-value">${order.wordCount || 0} 字</span></div>
        <div class="detail-item"><span class="detail-label">创建时间</span><span class="detail-value">${createTime}</span></div>
        <div class="detail-item"><span class="detail-label">更新时间</span><span class="detail-value">${updateTime}</span></div>
      </div>
    </div>
    ${order.remark ? `
    <div class="detail-section">
      <div class="detail-section-title">备注信息</div>
      <div class="detail-value" style="background:#f9f8f6;padding:12px;border-radius:10px;">${order.remark}</div>
    </div>` : ''}
    ${fileHTML}
    ${confirmPayHTML}
    <div class="detail-section">
      <div class="detail-section-title">更改状态</div>
      <div class="status-actions">
        <button class="status-action-btn" onclick="changeStatus('${order._id}','pending')">待处理</button>
        <button class="status-action-btn" onclick="changeStatus('${order._id}','doing')">进行中</button>
        <button class="status-action-btn" onclick="changeStatus('${order._id}','done')">已完成</button>
        <button class="status-action-btn" onclick="changeStatus('${order._id}','cancelled')">已取消</button>
      </div>
    </div>
  `

  document.getElementById('detailFooter').innerHTML = `
    <button class="btn btn-default" onclick="closeDetailModal()">关闭</button>
    <button class="btn btn-danger" onclick="deleteOrder('${order._id}')">删除订单</button>
  `
}

function closeDetailModal(e) {
  if (e && e.target !== e.currentTarget) return
  document.getElementById('detailModal').classList.remove('show')
  currentDetailOrderId = null
}

// ===== Actions =====
window.showOrderDetail = showOrderDetail
window.closeDetailModal = closeDetailModal
window.setFilter = setFilter
window.handleSearch = handleSearch
window.goToPage = goToPage
window.changePageSize = changePageSize
window.exportCSV = exportCSV
window.showNotifications = showNotifications
window.closeNotifications = closeNotifications
window.showNotificationOrder = showNotificationOrder
window.markAllRead = markAllRead
window.hideNewOrderToast = hideNewOrderToast
window.goToNewOrder = () => { hideNewOrderToast(); loadOrders() }

window.downloadFile = async function(orderId) {
  try {
    const res = await apiRequest('downloadFile', { orderId })
    if (res.success && res.downloadUrl) {
      window.open(res.downloadUrl, '_blank')
    } else {
      showToast(res.message || '下载失败', 'error')
    }
  } catch (e) {
    showToast('下载失败', 'error')
  }
}

window.changeStatus = async function(orderId, status) {
  if (!confirm(`确定要将订单状态改为"${STATUS_MAP[status]}"吗？`)) return
  try {
    const res = await apiRequest('updateStatus', { orderId, status })
    if (res.success) {
      showToast('状态已更新', 'success')
      await loadOrders()
      if (currentDetailOrderId === orderId) showOrderDetail(orderId)
    } else {
      showToast(res.message || '更新失败', 'error')
    }
  } catch (e) {
    showToast('网络错误', 'error')
  }
}

window.confirmPayment = async function(orderId) {
  if (!confirm('确认已收到客户的转账支付？确认后订单将进入排队等待处理。')) return
  try {
    const res = await apiRequest('confirmPayment', { orderId })
    if (res.success) {
      showToast('收款确认成功', 'success')
      await loadOrders()
      if (currentDetailOrderId === orderId) showOrderDetail(orderId)
    } else {
      showToast(res.message || '确认失败', 'error')
    }
  } catch (e) {
    showToast('网络错误', 'error')
  }
}

window.deleteOrder = async function(orderId) {
  if (!confirm('确定要删除这个订单吗？此操作不可恢复。')) return
  try {
    const res = await apiRequest('deleteOrder', { orderId })
    if (res.success) {
      showToast('订单已删除', 'success')
      closeDetailModal()
      await loadOrders()
    } else {
      showToast(res.message || '删除失败', 'error')
    }
  } catch (e) {
    showToast('网络错误', 'error')
  }
}

// ===== Sidebar Toggle =====
function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed')
  document.body.classList.toggle('sidebar-open')
}
window.toggleSidebar = toggleSidebar

// ===== Sidebar Menu Switch =====
function switchMenu(menu) {
  // update active state
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'))
  document.querySelector(`[data-menu="${menu}"]`)?.classList.add('active')

  if (menu === 'home' || menu === 'orders') {
    // main order view - already showing
    return
  }
  // other menus - show toast
  const names = { users: '用户管理', payment: '支付管理', finance: '资金流水', files: '文件管理', audit: '审核管理', settings: '系统设置' }
  showToast(`${names[menu] || '该功能'}正在开发中`, 'info')
  // switch back to home
  setTimeout(() => {
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'))
    document.querySelector('[data-menu="home"]')?.classList.add('active')
  }, 500)
}
window.switchMenu = switchMenu

// ===== Logout =====
function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    removeToken()
    window.location.href = 'login.html'
  }
}
window.handleLogout = handleLogout

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname
  if (path.includes('login.html')) {
    initLoginPage()
  } else {
    if (!isLoggedIn()) {
      window.location.href = 'login.html'
      return
    }
    initMainPage()
  }
})

// ===== Login Page =====
function initLoginPage() {
  const loginBtn = document.getElementById('loginBtn')
  const pwd = document.getElementById('password')
  const err = document.getElementById('errorMsg')
  if (!loginBtn) return

  async function handleLogin() {
    const password = pwd.value.trim()
    if (!password) {
      err.textContent = '请输入密码'
      return
    }
    loginBtn.disabled = true
    loginBtn.textContent = '登录中...'
    err.textContent = ''
    try {
      const res = await apiRequest('login', { password })
      if (res.success) {
        setToken(res.token)
        window.location.href = 'index.html'
      } else {
        err.textContent = res.message || '登录失败'
      }
    } catch (e) {
      err.textContent = '网络错误，请重试'
    } finally {
      loginBtn.disabled = false
      loginBtn.textContent = '登 录'
    }
  }

  loginBtn.addEventListener('click', handleLogin)
  pwd?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin() })
}

// ===== Main Page Init =====
function initMainPage() {
  // Close modal on overlay click
  const detailModal = document.getElementById('detailModal')
  const notifModal = document.getElementById('notificationModal')

  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal()
  })
  notifModal.addEventListener('click', (e) => {
    if (e.target === notifModal) closeNotifications()
  })

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal()
      closeNotifications()
    }
  })

  // Close sidebar on mobile when clicking main content
  document.querySelector('.main-content-wrapper')?.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove('sidebar-open')
    }
  })

  // Load orders
  loadOrders()
}
