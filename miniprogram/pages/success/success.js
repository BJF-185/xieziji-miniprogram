const { CUSTOMER_DONE_TEMPLATE_ID } = require('../../config/notify')

Page({
  data: {
    orderId: '',
    wordCount: 0,
    paid: false,
    statusBarHeight: 44,
    navTotalHeight: 88,
    showNotifyBtn: true
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    const navHeight = 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + navHeight,
      orderId: options.orderId || '',
      wordCount: parseInt(options.wordCount) || 0,
      paid: options.paid === 'true',
      // 是否已开启完成提醒（仅控制文字，卡片常驻显示）
      notifyEnabled: !!(wx.getStorageSync('customerDoneNotifyEnabled') || false)
    })
  },

  // 用户点击「开启完成提醒」时调用（在用户点击事件中同步触发，符合微信限制）
  requestNotify: function () {
    // 已开启过则提示用户，无需重复请求
    if (this.data.notifyEnabled) {
      wx.showToast({ title: '已开启完成提醒', icon: 'success' })
      return
    }
    if (CUSTOMER_DONE_TEMPLATE_ID && CUSTOMER_DONE_TEMPLATE_ID !== 'PENDING_APPLY') {
      wx.requestSubscribeMessage({
        tmplIds: [CUSTOMER_DONE_TEMPLATE_ID],
        success: (res) => {
          if (res[CUSTOMER_DONE_TEMPLATE_ID] === 'accept') {
            wx.setStorageSync('customerDoneNotifyEnabled', true)
            this.setData({ notifyEnabled: true })
            wx.showToast({ title: '已开启提醒', icon: 'success' })
          } else {
            wx.showToast({ title: '已取消授权', icon: 'none' })
          }
        },
        fail: (err) => {
          console.error('订阅消息授权失败', err)
          wx.showToast({ title: '授权失败', icon: 'none' })
        }
      })
    }
  },

  goBack: function () {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  goMyOrders: function () {
    wx.reLaunch({
      url: '/pages/my/my'
    })
  }
})
