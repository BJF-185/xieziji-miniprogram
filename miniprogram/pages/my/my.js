const STATUS_MAP = {
  'unpaid': '待付款',
  'pending': '排队中',
  'doing': '处理中',
  'done': '已完成',
  'cancelled': '已取消'
}

const PAY_STATUS_MAP = {
  'unpaid': '待付款',
  'paid': '待确认',
  'confirmed': '已确认'
}

Page({
  data: {
    orders: [],
    filteredOrders: [],
    currentFilter: 'all',
    loading: false,
    totalCount: 0,
    unpaidCount: 0,
    queuingCount: 0,
    processingCount: 0,
    doneCount: 0,
    statusBarHeight: 44,
    navTotalHeight: 88,
    currentTab: 'my'
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    const navHeight = 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + navHeight
    })
    this.loadOrders()
  },

  onShow: function () {
    if (this.data.orders.length > 0 || this.data.totalCount > 0) {
      this.setData({ orders: [] })
      this.loadOrders()
    }
  },

  onPullDownRefresh: function () {
    this.setData({ orders: [], filteredOrders: [] })
    this.loadOrders()
    wx.stopPullDownRefresh()
  },

  onFilterTap: function (e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ currentFilter: filter }, () => {
      this.applyFilter()
    })
  },

  applyFilter: function () {
    let filtered = this.data.orders
    if (this.data.currentFilter !== 'all') {
      const filter = this.data.currentFilter
      filtered = filtered.filter(o => {
        if (filter === 'unpaid') {
          return o.payStatus === 'unpaid' && o.status === 'unpaid'
        }
        if (filter === 'pending') {
          return o.payStatus === 'paid' || o.status === 'pending'
        }
        return o.status === filter
      })
    }
    this.setData({ filteredOrders: filtered })
  },

  loadOrders: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'getMyOrders'
      },
      success: (res) => {
        const result = res.result
        if (result.success) {
          const mappedOrders = result.orders.map(order => {
            let displayStatus = order.status
            let statusText = STATUS_MAP[order.status] || '未知'
            if (order.payStatus === 'paid') {
              displayStatus = 'pending'
              statusText = '排队中'
            } else if (order.payStatus === 'confirmed') {
              statusText = STATUS_MAP[order.status] || '已确认'
            }
            return {
              ...order,
              displayStatus: displayStatus,
              statusText: statusText,
              payStatusText: PAY_STATUS_MAP[order.payStatus] || '',
              createTimeStr: this.formatTime(order.createTime)
            }
          })
          const total = mappedOrders.length
          this.setData({
            orders: mappedOrders,
            totalCount: total,
            unpaidCount: mappedOrders.filter(o => o.payStatus === 'unpaid' && o.status === 'unpaid').length,
            queuingCount: mappedOrders.filter(o => o.payStatus === 'paid' || o.status === 'pending').length,
            processingCount: mappedOrders.filter(o => o.status === 'doing').length,
            doneCount: mappedOrders.filter(o => o.status === 'done').length
          }, () => {
            this.applyFilter()
          })
        } else {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('获取我的预约失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  goDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/my-detail/my-detail?id=${id}`
    })
  },

  goPayment: function (e) {
    const order = this.data.orders.find(o => o._id === e.currentTarget.dataset.id)
    if (!order) return
    
    wx.navigateTo({
      url: `/pages/payment/payment?orderId=${order._id}&orderNo=${order.orderNo}&name=${encodeURIComponent(order.name)}&phone=${order.phone}&fileName=${encodeURIComponent(order.fileName)}&wordCount=${order.wordCount}&price=${order.price}`
    })
  },

  onTabHome: function () {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  onTabMy: function () {
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  goOrder: function () {
    wx.navigateTo({
      url: '/pages/order/order'
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
