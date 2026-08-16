Page({
  data: {
    orderId: '',
    wordCount: 0,
    paid: false,
    statusBarHeight: 44,
    navTotalHeight: 88
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
      paid: options.paid === 'true'
    })
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
