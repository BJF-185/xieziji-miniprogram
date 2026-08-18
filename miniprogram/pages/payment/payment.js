Page({
  data: {
    orderId: '',
    orderNo: '',
    name: '',
    phone: '',
    fileName: '',
    wordCount: 0,
    price: 0,
    totalPrice: '0.00',
    confirming: false,
    statusBarHeight: 44,
    navTotalHeight: 88,
    wechatQRUrl: '/images/wechat_pay.png',
    hasCopiedAmount: false,
    paymentSubmitted: false
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    const navHeight = 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + navHeight,
      orderId: options.orderId || '',
      orderNo: options.orderNo || '',
      name: decodeURIComponent(options.name || ''),
      phone: options.phone || '',
      fileName: decodeURIComponent(options.fileName || ''),
      wordCount: parseInt(options.wordCount) || 0,
      price: parseFloat(options.price) || 0,
      totalPrice: (parseFloat(options.price) || 0).toFixed(2)
    })

    this.loadQRCode()
    this.savePaymentState()
  },

  loadQRCode: function () {
    wx.cloud.getTempFileURL({
      fileList: [
        'cloud://cloud1-d3gd4qlyef136776e.636c-cloud1-d3gd4qlyef136776e-1453067705/wechat_pay_pay.png'
      ],
      success: (res) => {
        const url = res.fileList[0].tempFileURL
        if (url) {
          this.setData({ wechatQRUrl: url })
        }
      },
      fail: (err) => {
        console.error('获取临时链接失败，使用本地图片', err)
      }
    })
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  copyAmount: function (e) {
    const amount = e.currentTarget.dataset.amount
    wx.setClipboardData({
      data: amount.toString(),
      success: () => {
        this.setData({ hasCopiedAmount: true })
        wx.showToast({
          title: '估价已复制',
          icon: 'success'
        })
      },
      fail: () => {
        wx.showToast({
          title: '复制失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  onQrError: function () {
    console.log('图片加载失败')
  },

  previewQrCode: function () {
    const qrPath = this.data.wechatQRUrl || '/images/wechat_pay.png'

    wx.previewImage({
      current: qrPath,
      urls: [qrPath],
      fail: function (err) {
        console.error('预览图片失败', err)
        wx.showToast({
          title: '预览失败',
          icon: 'none'
        })
      }
    })
  },

  confirmPayment: function () {
    if (this.data.confirming) return

    wx.showModal({
      title: '完成支付',
      content: '请确认已支付正确金额，收到正确金额后开始书写',
      confirmText: '已支付',
      cancelText: '再等等',
      confirmColor: '#1a1a1a',
      success: (res) => {
        if (res.confirm) {
          this.submitPayment()
        }
      }
    })
  },

  submitPayment: function () {
    this.setData({ confirming: true, paymentSubmitted: true })
    wx.showLoading({ title: '提交中...' })

    wx.cloud.callFunction({
      name: 'createOrder',
      data: {
        action: 'confirmPayment',
        orderId: this.data.orderId,
        paymentMethod: 'wechat',
        paymentNote: ''
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          this.clearPaymentState()
          this.goToSuccess()
        } else {
          this.setData({ confirming: false, paymentSubmitted: false })
          wx.showModal({
            title: '提交失败',
            content: result.message || '提交失败，请重试',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        this.setData({ confirming: false, paymentSubmitted: false })
        console.error('提交失败', err)
        wx.showModal({
          title: '提交失败',
          content: '网络错误，请重试',
          showCancel: false
        })
      }
    })
  },

  savePaymentState: function () {
    const state = {
      orderId: this.data.orderId,
      orderNo: this.data.orderNo,
      name: this.data.name,
      phone: this.data.phone,
      fileName: this.data.fileName,
      wordCount: this.data.wordCount,
      price: this.data.price,
      timestamp: Date.now()
    }
    wx.setStorageSync('pendingPayment', state)
  },

  clearPaymentState: function () {
    wx.removeStorageSync('pendingPayment')
  },

  goToSuccess: function () {
    wx.redirectTo({
      url: `/pages/success/success?orderId=${this.data.orderId}&wordCount=${this.data.wordCount}&paid=true`
    })
  }
})
