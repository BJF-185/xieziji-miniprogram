const STATUS_MAP = {
  'pending': '待处理',
  'doing': '进行中',
  'done': '已完成',
  'cancelled': '已取消'
}

Page({
  data: {
    order: null,
    loading: true,
    downloading: false,
    orderId: '',
    statusBarHeight: 44
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 44,
      orderId: options.id || ''
    })
    if (!wx.getStorageSync('isAdmin')) {
      wx.redirectTo({ url: '/pages/admin-login/admin-login' })
      return
    }
    this.loadOrderDetail()
  },

  loadOrderDetail: function () {
    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'getDetail',
        orderId: this.data.orderId
      },
      success: (res) => {
        const result = res.result
        if (result.success) {
          const order = result.order
          order.statusText = STATUS_MAP[order.status] || '未知'
          order.priceStr = (order.price || 0).toFixed(2)
          order.createTimeStr = this.formatTime(order.createTime)
          order.createTimeFull = this.formatFullTime(order.createTime)
          this.setData({ order: order })
        } else if (result.message === '未登录或登录已过期') {
          wx.removeStorageSync('isAdmin')
          wx.redirectTo({ url: '/pages/admin-login/admin-login' })
        } else {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('获取详情失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  callPhone: function () {
    wx.makePhoneCall({
      phoneNumber: this.data.order.phone
    })
  },

  downloadFile: function () {
    if (this.data.downloading) return
    this.setData({ downloading: true })
    wx.showLoading({ title: '下载中...' })

    const fileID = this.data.order.fileID
    console.log('开始下载文件:', fileID)

    this.downloadDirectly(fileID)
  },

  downloadDirectly: function (fileID) {
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        wx.hideLoading()
        console.log('直接下载成功，临时路径:', res.tempFilePath)
        this.openFile(res.tempFilePath)
      },
      fail: (err) => {
        console.warn('直接下载失败，尝试云函数下载:', err)
        this.downloadViaCloudFunction(fileID)
      }
    })
  },

  downloadViaCloudFunction: function (fileID) {
    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'downloadFile',
        fileID: fileID
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success && result.fileBase64) {
          console.log('云函数下载成功')
          const fileName = this.data.order.fileName
          this.saveBase64File(result.fileBase64, fileName)
        } else {
          console.error('云函数下载失败:', result.message)
          wx.showModal({
            title: '下载失败',
            content: result.message || '文件下载失败',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('云函数调用失败:', err)
        wx.showModal({
          title: '下载失败',
          content: '网络错误，请检查网络',
          showCancel: false
        })
      },
      complete: () => {
        this.setData({ downloading: false })
      }
    })
  },

  saveBase64File: function (base64Content, fileName) {
    const filePath = wx.env.USER_DATA_PATH + '/' + fileName
    const fs = wx.getFileSystemManager()
    
    fs.writeFile({
      filePath: filePath,
      data: base64Content,
      encoding: 'base64',
      success: () => {
        console.log('文件保存成功:', filePath)
        this.openFile(filePath)
      },
      fail: (err) => {
        console.error('文件保存失败:', err)
        wx.showModal({
          title: '保存失败',
          content: '无法保存文件，请重试',
          showCancel: false
        })
      }
    })
  },

  openFile: function (filePath) {
    wx.openDocument({
      filePath: filePath,
      showMenu: true,
      success: function () {
        console.log('打开文档成功')
      },
      fail: function (err) {
        console.error('打开文档失败', err)
        wx.showModal({
          title: '无法打开',
          content: '请确认已安装WPS等办公软件',
          showCancel: false
        })
      }
    })
  },

  changeStatus: function (e) {
    const newStatus = e.currentTarget.dataset.status
    const statusText = STATUS_MAP[newStatus]
    const order = this.data.order

    wx.showModal({
      title: '确认操作',
      content: `确定要将订单改为「${statusText}」吗？`,
      success: (res) => {
        if (res.confirm) {
          this.updateStatus(order._id, newStatus)
        }
      }
    })
  },

  updateStatus: function (orderId, status) {
    wx.showLoading({ title: '更新中...' })

    wx.cloud.callFunction({
      name: 'updateOrderStatus',
      data: {
        orderId: orderId,
        status: status
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          wx.showToast({ title: '已更新', icon: 'success' })
          const order = this.data.order
          order.status = status
          order.statusText = STATUS_MAP[status]
          this.setData({ order: order })
        } else if (result.message === '未登录或登录已过期') {
          wx.removeStorageSync('isAdmin')
          wx.redirectTo({ url: '/pages/admin-login/admin-login' })
        } else {
          wx.showToast({ title: result.message || '更新失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('更新失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  formatTime: function (timestamp) {
    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${month}-${day} ${hour}:${minute}`
  },

  formatFullTime: function (timestamp) {
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${y}-${month}-${day} ${hour}:${minute}`
  }
})
