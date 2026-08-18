const { CUSTOMER_DONE_TEMPLATE_ID } = require('../../config/notify')

Page({
  data: {
    orderId: '',
    wordCount: 0,
    paid: false,
    statusBarHeight: 44,
    navTotalHeight: 88,
    showNotifyBtn: true,
    notifyState: 'unknown'  // 'accept' | 'reject' | 'ban' | 'unknown' | 'pending'
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
    // 查询微信系统层真实订阅状态（只显示状态，不主动弹窗）
    this.checkNotifyState()
  },

  // 查询微信系统层真实订阅状态
  checkNotifyState: function () {
    if (!CUSTOMER_DONE_TEMPLATE_ID || CUSTOMER_DONE_TEMPLATE_ID === 'PENDING_APPLY') {
      return
    }
    // 1. 立即读 storage 显示（最近的支付授权时设置的，即时准确）
    const storageHasAuth = !!wx.getStorageSync('customerDoneNotifyEnabled')
    if (storageHasAuth) {
      this.setData({ notifyState: 'accept' })
    }
    // 2. 异步调 getSetting 校验系统层真实状态（可能修正 storage 不准的情况）
    wx.getSetting({
      withSubscriptions: true,
      success: (res) => {
        const sub = res.subscriptionsSetting || {}
        const state = sub[CUSTOMER_DONE_TEMPLATE_ID] || (storageHasAuth ? 'accept' : 'unknown')
        console.log('订阅状态:', state)
        this.setData({ notifyState: state })
        if (state === 'accept') {
          wx.setStorageSync('customerDoneNotifyEnabled', true)
        }
      },
      fail: (err) => {
        console.error('查询订阅状态失败', err)
      }
    })
  },

  // 用户点击「开启完成提醒」时调用
  requestNotify: function () {
    const state = this.data.notifyState
    // 已 accept：弹 toast 提示，无需重复请求
    if (state === 'accept') {
      wx.showToast({ title: '已开启完成提醒', icon: 'success' })
      return
    }
    // 已 reject（点了"总是保持以上选择"）：引导去微信设置重置
    if (state === 'reject') {
      wx.showModal({
        title: '需要重新授权',
        content: '您之前选择了"总是保持以上选择，不再询问"，请到微信设置中重新授权。\n\n操作路径：\n1. 点击右上角 ···\n2. 选择"设置"\n3. 找到"订阅消息"\n4. 重新开启',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (sres) => {
                if (sres.authSetting['scope.subscribeMessage'] !== false) {
                  this.checkNotifyState()
                }
              }
            })
          }
        }
      })
      return
    }
    // ban 或 unknown：弹授权窗
    if (CUSTOMER_DONE_TEMPLATE_ID && CUSTOMER_DONE_TEMPLATE_ID !== 'PENDING_APPLY') {
      wx.requestSubscribeMessage({
        tmplIds: [CUSTOMER_DONE_TEMPLATE_ID],
        success: (res) => {
          console.log('订阅消息授权返回:', res)
          if (res[CUSTOMER_DONE_TEMPLATE_ID] === 'accept') {
            wx.setStorageSync('customerDoneNotifyEnabled', true)
            this.setData({ notifyState: 'accept' })
            wx.showToast({ title: '已开启提醒', icon: 'success' })
          } else if (res[CUSTOMER_DONE_TEMPLATE_ID] === 'reject') {
            this.setData({ notifyState: 'reject' })
            wx.showModal({
              title: '授权被拒',
              content: '您拒绝了订阅消息，将无法收到完成通知。如需开启请到设置中授权。',
              showCancel: false,
              confirmText: '我知道了'
            })
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
