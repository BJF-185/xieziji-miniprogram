const PRICE_PER_WORD = 0.01  // 每字0.01元

Page({
  data: {
    name: '',
    phone: '',
    notebookSize: '',
    notebookIndex: -1,
    notebookList: ['仰恩纸（免费提供）', '自己的本子或其他（需联系）'],
    remark: '',
    fileInfo: {},
    hasFile: false,
    cloudFileID: '',
    wordCount: 0,
    counting: false,
    submitting: false,
    canSubmit: false,
    nameValid: false,
    phoneValid: false,
    subtotal: '0.00',
    subtotalNum: 0,
    totalPrice: '0.00',
    statusBarHeight: 44,
    navTotalHeight: 88
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + 44
    })
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  onNameInput: function (e) {
    const name = e.detail.value
    const nameValid = name.trim().length >= 2 && name.trim().length <= 20
    this.setData({ name: name, nameValid: nameValid }, this.checkCanSubmit)
  },

  onPhoneInput: function (e) {
    const phone = e.detail.value
    const phoneValid = /^1[3-9]\d{9}$/.test(phone)
    this.setData({ phone: phone, phoneValid: phoneValid }, this.checkCanSubmit)
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  onNotebookChange: function (e) {
    const index = e.detail.value
    this.setData({ notebookIndex: index, notebookSize: this.data.notebookList[index] })
  },

  // 选择文件
  chooseFile: function () {
    // PC端微信支持直接选本地文件
    if (typeof wx.chooseFile === 'function') {
      wx.chooseFile({
        count: 1,
        type: 'file',
        extension: ['doc', 'docx'],
        success: (res) => {
          this.handleFileSelected(res.tempFiles)
        },
        fail: (err) => {
          console.log('选择文件取消或失败', err)
        }
      })
    } else {
      // 手机端只能从聊天记录选文件
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['doc', 'docx'],
        success: (res) => {
          this.handleFileSelected(res.tempFiles)
        },
        fail: (err) => {
          console.log('选择文件取消或失败', err)
        }
      })
    }
  },

  // 统一处理选中的文件
  handleFileSelected: function (tempFiles) {
    const file = tempFiles[0]
    const name = file.name.toLowerCase()
    if (!name.endsWith('.doc') && !name.endsWith('.docx')) {
      wx.showToast({ title: '请上传Word文档(.doc/.docx)', icon: 'none' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      wx.showToast({ title: '文件不能超过10MB', icon: 'none' })
      return
    }
    this.setData({
      fileInfo: {
        name: file.name,
        path: file.path,
        size: file.size,
        sizeStr: this.formatSize(file.size)
      },
      hasFile: true,
      cloudFileID: '',
      wordCount: 0,
      subtotal: '0.00',
      subtotalNum: 0,
      totalPrice: '0.00'
    }, this.checkCanSubmit)
    // 选完文件后自动开始统计字数
    setTimeout(() => this.countWords(), 300)
  },

  // 格式化文件大小
  formatSize: function (bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  },

  // 移除文件
  removeFile: function () {
    this.setData({
      fileInfo: {},
      hasFile: false,
      cloudFileID: '',
      wordCount: 0,
      subtotal: '0.00',
      subtotalNum: 0,
      totalPrice: '0.00'
    }, this.checkCanSubmit)
  },

  // 统计字数（上传文件到云存储，再调用云函数解析）
  countWords: function () {
    if (!this.data.fileInfo.path) {
      wx.showToast({ title: '请先上传文件', icon: 'none' })
      return
    }

    this.setData({ counting: true })
    wx.showLoading({ title: '统计中...' })

    // 1. 上传文件到云存储
    const timestamp = Date.now()
    const cloudPath = `orders/${timestamp}_${this.data.fileInfo.name}`

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: this.data.fileInfo.path,
      config: {
        isPublic: true
      },
      success: (uploadRes) => {
        const fileID = uploadRes.fileID
        this.setData({ cloudFileID: fileID })

        // 2. 调用云函数统计字数
        wx.cloud.callFunction({
          name: 'createOrder',
          data: {
            action: 'countWords',
            fileID: fileID
          },
          success: (cfRes) => {
            wx.hideLoading()
            const result = cfRes.result
            if (result.success) {
              const wordCount = result.wordCount
              const subtotalNum = wordCount * PRICE_PER_WORD
              const totalNum = subtotalNum
              this.setData({
                wordCount: wordCount,
                subtotal: subtotalNum.toFixed(2),
                subtotalNum: subtotalNum,
                totalPrice: totalNum.toFixed(2),
                counting: false
              }, this.checkCanSubmit)
            } else {
              this.setData({ counting: false })
              wx.showModal({
                title: '统计失败',
                content: result.message || '无法解析该文件，请确认是有效的Word文档',
                showCancel: false
              })
            }
          },
          fail: (err) => {
            wx.hideLoading()
            this.setData({ counting: false })
            console.error('云函数调用失败', err)
            wx.showModal({
              title: '统计失败',
              content: '服务暂时不可用，请稍后重试',
              showCancel: false
            })
          }
        })
      },
      fail: (err) => {
        wx.hideLoading()
        this.setData({ counting: false })
        console.error('文件上传失败', err)
        wx.showModal({
          title: '上传失败',
          content: '文件上传失败，请重试',
          showCancel: false
        })
      }
    })
  },

  // 检查是否可以提交
  checkCanSubmit: function () {
    const canSubmit = this.data.nameValid &&
                      this.data.phoneValid &&
                      this.data.hasFile &&
                      this.data.wordCount > 0
    this.setData({ canSubmit: canSubmit })
  },

  // 提交订单
  submitOrder: function () {
    if (!this.data.canSubmit || this.data.submitting) return

    // 验证手机号
    const phone = this.data.phone.trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    // 调用云函数创建订单
    wx.cloud.callFunction({
      name: 'createOrder',
      data: {
        action: 'createOrder',
        fileID: this.data.cloudFileID,
        fileName: this.data.fileInfo.name,
        wordCount: this.data.wordCount,
        price: parseFloat(this.data.totalPrice),
        name: this.data.name.trim(),
        phone: phone,
        notebookSize: this.data.notebookSize.trim(),
        remark: this.data.remark.trim()
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          wx.navigateTo({
            url: `/pages/payment/payment?orderId=${result.orderId}&orderNo=${result.orderNo}&name=${encodeURIComponent(this.data.name.trim())}&phone=${this.data.phone}&fileName=${encodeURIComponent(this.data.fileInfo.name)}&wordCount=${this.data.wordCount}&price=${this.data.totalPrice}`
          })
        } else {
          this.setData({ submitting: false })
          wx.showModal({
            title: '提交失败',
            content: result.message || '预约提交失败，请重试',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        this.setData({ submitting: false })
        console.error('创建订单失败', err)
        wx.showModal({
          title: '提交失败',
          content: '网络错误，请重试',
          showCancel: false
        })
      }
    })
  }
})
