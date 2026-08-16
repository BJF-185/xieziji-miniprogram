const { TEMPLATE_ID } = require('../../config/notify')

Page({
  data: {
    password: '',
    logging: false,
    showPassword: false,
    focused: false
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value })
  },

  onInputFocus: function () {
    this.setData({ focused: true })
  },

  onInputBlur: function () {
    this.setData({ focused: false })
  },

  togglePassword: function () {
    this.setData({ showPassword: !this.data.showPassword })
  },

  goBack: function () {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/index/index' })
      }
    })
  },

  login: function () {
    if (!this.data.password || this.data.logging) return

    this.setData({ logging: true })
    wx.showLoading({ title: '验证中...' })

    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'adminLogin',
        password: this.data.password
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          wx.setStorageSync('isAdmin', true)
          this.requestSubscribeMessage()
        } else {
          this.setData({ logging: false })
          wx.showToast({
            title: result.message || '密码错误',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        this.setData({ logging: false })
        console.error('登录失败', err)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  requestSubscribeMessage: function () {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: (res) => {
        const tmplId = Object.keys(res)[0]
        if (res[tmplId] === 'accept') {
          wx.setStorageSync('notifyEnabled', true)
          wx.showToast({ title: '已开启新订单通知', icon: 'success' })
        } else {
          wx.showToast({ title: '通知授权被拒绝', icon: 'none' })
        }
        wx.redirectTo({ url: '/pages/admin/admin' })
      },
      fail: (err) => {
        console.error('订阅消息授权失败', err)
        wx.redirectTo({ url: '/pages/admin/admin' })
      }
    })
  }
})
