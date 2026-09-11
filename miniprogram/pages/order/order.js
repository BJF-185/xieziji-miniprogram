const PRICE_PER_WORD = 0.005  // 每字0.01元

Page({
  data: {
    name: '',
    phone: '',
    notebookSize: '',
    notebookIndex: -1,
    notebookList: ['仰恩纸', '自己的本子或其他（请联系后下单）'],
    fontList: [
      { id: 0, name: '楷书',     image: '/images/fonts/1.png' },
      { id: 1, name: '硬笔',     image: '/images/fonts/2.png' },
      { id: 2, name: '硬笔行书', image: '/images/fonts/3.png' },
      { id: 3, name: '行书',     image: '/images/fonts/4.png' },
      { id: 4, name: '行楷',     image: '/images/fonts/5.png' },
      { id: 5, name: '行草',     image: '/images/fonts/6.png' },
      { id: 6, name: '草书',     image: '/images/fonts/7.png' }
    ],
    fontIndex: 1,
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
    navTotalHeight: 88,
    isEdit: false,
    orderId: '',
    orderNo: '',
    originalFileID: ''
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navTotalHeight: statusBarHeight + 44
    })

    if (options && options.orderId) {
      this.setData({ orderId: options.orderId, isEdit: true })
      this.loadOrderForEdit(options.orderId)
    }
  },

  onShow: function () {
    // 已经在编辑模式：不再处理（用户从 my-detail 主动进入）
    if (this.data.isEdit) return

    // 触发条件：从提交流程返回时 submitting 为 true
    // （首次进入或 tab 切换回来时 submitting 为 false）
    if (this.data.submitting !== true) return

    // 1) 修复「提交中」卡死
    this.setData({ submitting: false })

    // 2) 自动加载刚提交的订单为更新模式
    const app = getApp()
    const last = (app && app.globalData && app.globalData.lastSubmittedOrder)
      || wx.getStorageSync('lastSubmittedOrder')

    if (last && last.orderId) {
      const ageMs = Date.now() - (last.timestamp || 0)
      if (ageMs < 24 * 60 * 60 * 1000) {
        this.setData({ orderId: last.orderId, isEdit: true })
        this.loadOrderForEdit(last.orderId)
        // 加载一次后清 globalData，避免重复触发
        if (app && app.globalData) {
          app.globalData.lastSubmittedOrder = null
        }
      }
    }
  },

  // 编辑模式：加载已有订单数据
  loadOrderForEdit: function (orderId) {
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { action: 'getMyDetail', orderId: orderId },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (!result.success) {
          wx.showModal({ title: '加载失败', content: result.message || '订单不存在', showCancel: false,
            success: () => wx.navigateBack() })
          return
        }
        const order = result.order
        if (order.status !== 'unpaid' && order.status !== 'cancelled') {
          wx.showModal({ title: '无法修改', content: '当前订单状态不支持修改', showCancel: false,
            success: () => wx.navigateBack() })
          return
        }

        // 反查 notebookIndex
        const notebookIndex = this.data.notebookList.indexOf(order.notebookSize)
        // 反查 fontIndex（找不到时默认选「硬笔」，兼容未保存 fontName 的旧订单）
        let fontIndex = this.data.fontList.findIndex(f => f.name === order.fontName)
        if (fontIndex < 0) fontIndex = 1

        this.setData({
          name: order.name || '',
          phone: order.phone || '',
          nameValid: !!(order.name && order.name.trim().length >= 2),
          phoneValid: /^1[3-9]\d{9}$/.test(order.phone || ''),
          notebookIndex: notebookIndex,
          notebookSize: order.notebookSize || '',
          fontIndex: fontIndex,
          remark: order.remark || '',
          fileInfo: {
            name: order.fileName,
            path: '',
            size: 0,
            sizeStr: '已上传'
          },
          hasFile: true,
          cloudFileID: order.fileID || '',
          originalFileID: order.fileID || '',
          wordCount: order.wordCount || 0,
          subtotal: (order.price || 0).toFixed(2),
          subtotalNum: order.price || 0,
          totalPrice: (order.price || 0).toFixed(2),
          orderNo: order.orderNo || ''
        }, this.checkCanSubmit)
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('加载订单失败', err)
        wx.showModal({ title: '加载失败', content: '网络错误，请重试', showCancel: false,
          success: () => wx.navigateBack() })
      }
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

  selectNotebook: function (e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({
      notebookIndex: index,
      notebookSize: this.data.notebookList[index]
    }, this.checkCanSubmit)
  },

  selectFont: function (e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({ fontIndex: index }, this.checkCanSubmit)
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
                      this.data.notebookIndex >= 0 &&
                      this.data.fontIndex >= 0 &&
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

    // 验证纸张和字体
    if (this.data.notebookIndex < 0) {
      wx.showToast({ title: '请选择书写纸张', icon: 'none' })
      return
    }
    if (this.data.fontIndex < 0) {
      wx.showToast({ title: '请选择书写字体', icon: 'none' })
      return
    }

    const fontName = this.data.fontList[this.data.fontIndex].name
    const isEdit = this.data.isEdit

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    const callData = {
      action: isEdit ? 'updateOrder' : 'createOrder',
      fileID: this.data.cloudFileID,
      fileName: this.data.fileInfo.name,
      wordCount: this.data.wordCount,
      price: parseFloat(this.data.totalPrice),
      name: this.data.name.trim(),
      phone: phone,
      notebookSize: this.data.notebookSize,
      fontName: fontName,
      remark: this.data.remark.trim()
    }
    if (isEdit) callData.orderId = this.data.orderId

    // 调用云函数创建/更新订单
    wx.cloud.callFunction({
      name: 'createOrder',
      data: callData,
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          // 保存订单ID，供 onShow 自动加载
          const newOrder = { orderId: result.orderId || this.data.orderId, timestamp: Date.now() }
          wx.setStorageSync('lastSubmittedOrder', newOrder)
          const editApp = getApp()
          if (editApp && editApp.globalData) {
            editApp.globalData.lastSubmittedOrder = newOrder
          }
          wx.navigateTo({
            url: `/pages/payment/payment?orderId=${result.orderId || this.data.orderId}&orderNo=${result.orderNo || this.data.orderNo || ''}&name=${encodeURIComponent(this.data.name.trim())}&phone=${this.data.phone}&fileName=${encodeURIComponent(this.data.fileInfo.name)}&wordCount=${this.data.wordCount}&price=${this.data.totalPrice}`
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
        console.error((isEdit ? '更新' : '创建') + '订单失败', err)
        wx.showModal({
          title: '提交失败',
          content: '网络错误，请重试',
          showCancel: false
        })
      }
    })
  }
})
