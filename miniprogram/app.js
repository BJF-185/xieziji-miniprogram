App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d3gd4qlyef136776e',
        traceUser: true,
      })
    }
    this.globalData = {
      userInfo: null,
      openid: null,
      pendingPayment: null
    }
  },

  onShow: function () {
    this.checkPendingPayment()
  },

  checkPendingPayment: function () {
    try {
      const state = wx.getStorageSync('pendingPayment')
      if (!state) return

      const now = Date.now()
      const expireTime = 24 * 60 * 60 * 1000 // 24小时
      if (now - state.timestamp > expireTime) {
        wx.removeStorageSync('pendingPayment')
        return
      }

      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      if (currentPage && currentPage.route === 'pages/payment/payment') {
        return
      }

      const params = [
        `orderId=${state.orderId}`,
        `orderNo=${state.orderNo}`,
        `name=${encodeURIComponent(state.name)}`,
        `phone=${state.phone}`,
        `fileName=${encodeURIComponent(state.fileName)}`,
        `wordCount=${state.wordCount}`,
        `price=${state.price}`,
        `resume=1`
      ].join('&')

      this.globalData.pendingPayment = state

      wx.showModal({
        title: '继续支付',
        content: '检测到您有未完成的支付订单，是否继续？',
        confirmText: '继续支付',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/payment/payment?${params}`
            })
          } else {
            wx.removeStorageSync('pendingPayment')
          }
        }
      })
    } catch (e) {
      console.error('检查待支付状态失败', e)
    }
  }
})
