const STATUS_MAP = {
  'unpaid': '待付款',
  'pending': '待处理',
  'doing': '进行中',
  'done': '已完成',
  'cancelled': '已取消'
}

const PAY_STATUS_MAP = {
  'unpaid': '待付款',
  'paid': '已支付待确认',
  'confirmed': '已确认'
}

const { TEMPLATE_ID } = require('../../config/notify')

Page({
  data: {
    orders: [],
    currentFilter: 'all',
    loading: false,
    totalCount: 0,
    unpaidCount: 0,
    paidCount: 0,
    pendingCount: 0,
    doingCount: 0,
    doneCount: 0,
    cancelledCount: 0,
    statusBarHeight: 44,
    navTotalHeight: 88,
    notifyEnabled: false
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + 44,
      notifyEnabled: wx.getStorageSync('notifyEnabled') || false
    })
    
    if (!wx.getStorageSync('isAdmin')) {
      wx.redirectTo({ url: '/pages/admin-login/admin-login' })
      return
    }
    this.loadOrders()
  },

  onShow: function () {
    if (wx.getStorageSync('isAdmin') && this.data.orders.length > 0) {
      this.setData({ orders: [] })
      this.loadOrders()
    }
  },

  onPullDownRefresh: function () {
    this.setData({ orders: [] })
    this.loadOrders()
    wx.stopPullDownRefresh()
  },

  onFilterTap: function (e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ currentFilter: filter, orders: [] })
    this.loadOrders()
  },

  loadOrders: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'getList'
      },
      success: (res) => {
        const result = res.result
        if (result.success) {
          // 1. 先把全部 orders 映射成 mappedOrders（含 displayStatus）
          const mappedOrders = result.orders.map(order => {
            const displayStatus = (order.payStatus === 'paid' && order.status === 'unpaid') ? 'paid' : order.status
            return {
              ...order,
              statusText: STATUS_MAP[order.status] || '未知',
              payStatusText: PAY_STATUS_MAP[order.payStatus] || '',
              displayStatus,
              priceStr: (order.price || 0).toFixed(2),
              createTimeStr: this.formatTime(order.createTime)
            }
          })
          // 2. 用 mappedOrders 全量统计（按 my 页面口径）
          const stats = {
            unpaidCount: mappedOrders.filter(o => o.payStatus === 'unpaid' && o.status === 'unpaid').length,
            paidCount: mappedOrders.filter(o => o.payStatus === 'paid' && o.status === 'unpaid').length,
            pendingCount: mappedOrders.filter(o => o.status === 'pending').length,
            doingCount: mappedOrders.filter(o => o.status === 'doing').length,
            doneCount: mappedOrders.filter(o => o.status === 'done').length,
            cancelledCount: mappedOrders.filter(o => o.status === 'cancelled').length
          }
          // 3. 根据 currentFilter 筛选展示的 orders
          const filter = this.data.currentFilter
          let displayOrders = mappedOrders
          if (filter === 'unpaid') displayOrders = mappedOrders.filter(o => o.payStatus === 'unpaid' && o.status === 'unpaid')
          else if (filter === 'paid') displayOrders = mappedOrders.filter(o => o.payStatus === 'paid' && o.status === 'unpaid')
          else if (filter !== 'all') displayOrders = mappedOrders.filter(o => o.status === filter)
          // 4. setData
          this.setData({
            orders: displayOrders,
            totalCount: result.totalCount,
            unpaidCount: stats.unpaidCount,
            paidCount: stats.paidCount,
            pendingCount: stats.pendingCount,
            doingCount: stats.doingCount,
            doneCount: stats.doneCount,
            cancelledCount: stats.cancelledCount
          })
        } else if (result.message === '未登录或登录已过期') {
          wx.removeStorageSync('isAdmin')
          wx.redirectTo({ url: '/pages/admin-login/admin-login' })
        } else {
          wx.showModal({
            title: '加载订单失败',
            content: result.message || '未知错误',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        console.error('获取订单失败', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  goDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  deleteOrder: function (e) {
    const orderId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该订单吗？删除后无法恢复。',
      confirmColor: '#c41e3a',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })

          wx.cloud.callFunction({
            name: 'updateOrderStatus',
            data: {
              action: 'delete',
              orderId: orderId
            },
            success: (res) => {
              if (res.result.success) {
                wx.showToast({ title: '删除成功', icon: 'success' })
                this.setData({ orders: [] })
                this.loadOrders()
              } else {
                wx.showModal({
                  title: '删除失败',
                  content: res.result.message || '未知错误',
                  showCancel: false
                })
              }
            },
            fail: (err) => {
              console.error('删除订单失败', err)
              wx.showToast({ title: '删除失败', icon: 'none' })
            },
            complete: () => {
              wx.hideLoading()
            }
          })
        }
      }
    })
  },

  confirmPayment: function (e) {
    const orderId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认收款',
      content: '确认已收到客户的转账支付？确认后订单将进入排队等待处理。',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '确认中...' })

          wx.cloud.callFunction({
            name: 'updateOrderStatus',
            data: {
              action: 'confirmPayment',
              orderId: orderId
            },
            success: (res) => {
              if (res.result.success) {
                wx.showToast({ title: '收款确认成功', icon: 'success' })
                this.setData({ orders: [] })
                this.loadOrders()
              } else {
                wx.showModal({
                  title: '确认失败',
                  content: res.result.message || '未知错误',
                  showCancel: false
                })
              }
            },
            fail: (err) => {
              console.error('确认收款失败', err)
              wx.showToast({ title: '确认失败', icon: 'none' })
            },
            complete: () => {
              wx.hideLoading()
            }
          })
        }
      }
    })
  },



  callPhone: function (e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone) return
    wx.makePhoneCall({ phoneNumber: phone })
  },  requestSubscribeMessage: function () {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: (res) => {
        const tmplId = Object.keys(res)[0]
        if (res[tmplId] === 'accept') {
          wx.setStorageSync('notifyEnabled', true)
          this.setData({ notifyEnabled: true })
          wx.showToast({ title: '已开启新订单通知', icon: 'success' })
        } else {
          wx.showToast({ title: '已取消授权', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('订阅消息授权失败', err)
        wx.showToast({ title: '授权失败', icon: 'none' })
      }
    })
  },

  goBack: function () {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/index/index' })
      }
    })
  },

  formatTime: function (timestamp) {
    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${month}-${day} ${hour}:${minute}`
  }
})
