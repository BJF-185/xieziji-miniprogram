Page({
  data: {
    windowHeight: 667,
    windowWidth: 375,
    currentTab: 'home'
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      windowHeight: systemInfo.windowHeight,
      windowWidth: systemInfo.windowWidth
    })
  },

  goOrder: function () {
    wx.navigateTo({ url: '/pages/order/order' })
  },

  onTabMy: function () {
    wx.reLaunch({ url: '/pages/my/my' })
  },

  onTabHome: function () {
    // 已经在首页，无需操作
  }
})