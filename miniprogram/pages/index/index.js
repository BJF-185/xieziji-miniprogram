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

  // 阻止iOS弹性滚动
  preventScroll: function () {
    return
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
