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
    // 把当前管理员的真实 openid 存到 admin 集合，让'顾客下单提醒'能发到这个号
    wx.cloud.callFunction({
      name: 'createOrder',
      data: { action: 'setupAdminNotify' },
      success: (res) => {
        console.log('管理员通知 openid 设置:', res.result)
      },
      fail: (err) => {
        console.error('设置管理员通知 openid 失败', err)
      }
    })
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
  },  // 点击铃铛：先检查微信订阅状态，未长期授权则必定弹出授权框让用户勾选"总是保持以上选择"
  requestSubscribeMessage: function () {
    wx.getSetting({
      success: (res) => {
        const subs = res.subscriptionsSetting || {}
        // 用户在小程序设置里关闭了订阅消息总开关
        if (subs.mainSwitch === false) {
          wx.showModal({
            title: '订阅消息被关闭',
            content: '请点击右上角「...」→ 设置 → 打开「订阅消息」，然后再点铃铛开启通知。',
            showCancel: false
          })
          return
        }
        const itemStatus = (subs.itemSettings || {})[TEMPLATE_ID]
        // 之前勾选了"总是保持以上选择"但点了拒绝：微信不再弹框，需去设置重新允许
        if (itemStatus === 'reject' || itemStatus === 'ban') {
          wx.showModal({
            title: '需要重新开启',
            content: '您之前在授权框点了「拒绝」。\n\n请点击右上角「...」→ 设置 → 订阅消息 → 重新允许「顾客下单提醒」，再回来点铃铛。',
            showCancel: false
          })
          return
        }
        // 已勾选"总是保持以上选择"并允许：长期有效，无需再授权
        if (itemStatus === 'accept') {
          wx.setStorageSync('notifyEnabled', true)
          this.setData({ notifyEnabled: true })
          wx.showToast({ title: '通知已长期开启', icon: 'success' })
          return
        }
        // 其他情况（未勾选保持/订阅次数已用完）：弹出授权框
        this.doRequestSubscribe()
      },
      fail: () => {
        this.doRequestSubscribe()
      }
    })
  },

  doRequestSubscribe: function () {
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

  // 开启新订单通知（带教程提示）
  openOrderNotify: function () {
    // 如果已经开启过，直接弹窗
    if (this.data.notifyEnabled) {
      this.requestSubscribeMessage()
      return
    }
    // 第一次：先弹教程，告知"勾选总是保持以上选择"可长期接收
    wx.showModal({
      title: '开启新订单通知',
      content: '点击"开启"后，微信会弹出授权框。\n\n⚠️ 关键步骤：\n请在弹窗中勾选「总是保持以上选择，不再询问」，再点"允许"。\n\n这样以后所有新顾客下单都会自动推送到你微信，无需再次授权。',
      confirmText: '开启',
      cancelText: '取消',
      confirmColor: '#1a1a1a',
      success: (res) => {
        if (res.confirm) {
          this.requestSubscribeMessage()
        }
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

