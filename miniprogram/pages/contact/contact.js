Page({
  data: {
    statusBarHeight: 44,
    navTotalHeight: 88,
    qrUrl: '/images/wechat_friend_qr.png',
    currentTab: 'chat'
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    const navHeight = 44
    // 从订单详情等页面 navigateTo 进入时可返回；从 tab 进入（reLaunch）时无上级页面
    const pages = getCurrentPages()
    const canGoBack = pages.length > 1
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + navHeight,
      canGoBack: canGoBack
    })

    this.loadQRCode()
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  loadQRCode: function () {
    wx.cloud.getTempFileURL({
      fileList: [
        'cloud://cloud1-d3gd4qlyef136776e.636c-cloud1-d3gd4qlyef136776e-1453067705/wechat_friend_qr.png'
      ],
      success: (res) => {
        const url = res.fileList[0].tempFileURL
        if (url) {
          this.setData({ qrUrl: url })
        }
      },
      fail: (err) => {
        console.error('获取加好友二维码失败，使用本地图片', err)
      }
    })
  },

  onQrError: function () {
    console.log('二维码图片加载失败，使用本地图片')
    this.setData({ qrUrl: '/images/wechat_friend_qr.png' })
  },

  onTabHome: function () {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onGoContact: function () {
    // 已经在联系页，无需操作
  },

  onTabMy: function () {
    wx.reLaunch({ url: '/pages/my/my' })
  }
})