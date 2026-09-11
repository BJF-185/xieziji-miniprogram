const { CUSTOMER_DONE_TEMPLATE_ID } = require('../../config/notify')

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
    wechatQRUrl: '/images/wechat_friend_qr.png',
    hasCopiedAmount: false,
    paymentSubmitted: false,
    proofFileID: '',
    proofTempPath: '',
    proofUploading: false,
    canSubmit: false,
    transferExampleUrl: '/images/transfer_example.png'
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
        'cloud://cloud1-d3gd4qlyef136776e.636c-cloud1-d3gd4qlyef136776e-1453067705/wechat_friend_qr.png'
      ],
      success: (res) => {
        const url = res.fileList[0].tempFileURL
        if (url) {
          this.setData({ wechatQRUrl: url })
        }
      },
      fail: (err) => {
        console.error('获取加好友二维码失败，使用本地图片', err)
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
          title: '已复制',
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
    console.log('二维码图片加载失败')
  },

  // 示例图片加载失败时的 fallback
  onExampleError: function () {
    console.log('示例图片加载失败')
  },

  // 长按二维码提示（实际识别由 image 的 show-menu-by-longpress 处理）
  onQrLongPress: function () {
    // 保留空方法以避免某些版本下 wrapper 拦截长按事件
  },

  // 选择转账截图
  chooseProof: function () {
    if (this.data.proofUploading) return

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0]
        if (file.size > 5 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过5MB', icon: 'none' })
          return
        }
        this.uploadProof(file.tempFilePath)
      },
      fail: () => {
        // 用户取消选择
      }
    })
  },

  // 上传截图到云存储
  uploadProof: function (tempFilePath) {
    this.setData({ proofUploading: true, proofTempPath: tempFilePath })
    wx.showLoading({ title: '上传中...' })

    const ts = Date.now()
    const cloudPath = `payment-proof/${this.data.orderNo}_${ts}.jpg`

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      config: {
        isPublic: true
      },
      success: (res) => {
        this.setData({
          proofFileID: res.fileID,
          proofUploading: false,
          canSubmit: true
        })
        wx.hideLoading()
        wx.showToast({ title: '上传成功', icon: 'success' })
      },
      fail: (err) => {
        this.setData({ proofUploading: false })
        wx.hideLoading()
        console.error('上传截图失败', err)
        wx.showModal({
          title: '上传失败',
          content: '请重试',
          showCancel: false
        })
      }
    })
  },

  // 删除已上传截图
  removeProof: function () {
    const fileID = this.data.proofFileID
    if (fileID) {
      wx.cloud.deleteFile({ fileList: [fileID] })
        .catch(err => console.warn('删除云端截图失败', err))
    }
    this.setData({
      proofFileID: '',
      proofTempPath: '',
      canSubmit: false
    })
  },

  // 底部"完成"按钮
  confirmPayment: function () {
    if (this.data.confirming) return
    if (!this.data.proofFileID) {
      wx.showToast({ title: '请先上传转账截图', icon: 'none' })
      return
    }
    // 直接进入订阅消息授权 + 提交（无需再弹"已支付"确认弹窗）
    this.requestNotifyAndSubmit()
  },

  // 在用户点击「完成」按钮后同步触发订阅消息授权，然后继续提交
  requestNotifyAndSubmit: function () {
    if (!CUSTOMER_DONE_TEMPLATE_ID || CUSTOMER_DONE_TEMPLATE_ID === 'PENDING_APPLY') {
      // 没配模板，直接提交
      this.submitPayment()
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [CUSTOMER_DONE_TEMPLATE_ID],
      success: (r) => {
        console.log('订阅消息授权返回:', r)
        if (r[CUSTOMER_DONE_TEMPLATE_ID] === 'accept') {
          wx.setStorageSync('customerDoneNotifyEnabled', true)
        }
      },
      fail: (err) => {
        console.log('订阅消息授权失败（不影响支付）:', err)
      },
      complete: () => {
        // 无论同意/拒绝都继续提交支付
        this.submitPayment()
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
        paymentNote: '',
        paymentProofFileID: this.data.proofFileID
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
