const STATUS_TEXT = {
  'unpaid': '待付款',
  'pending': '排队中',
  'doing': '处理中',
  'done': '已完成',
  'cancelled': '已取消'
}

const STATUS_DESC = {
  'unpaid': '请完成支付以继续预约',
  'pending': '订单正在排队等待处理',
  'doing': '订单正在书写中',
  'done': '订单已完成，感谢您的使用',
  'cancelled': '订单已取消'
}

const PAY_STATUS_TEXT = {
  'paid': '排队中',
  'confirmed': '排队中'
}

const PAY_STATUS_DESC = {
  'paid': '客户已提交支付，等待确认收款',
  'confirmed': '收款已确认，订单正在排队处理'
}

Page({
  data: {
    order: null,
    loading: true,
    orderId: '',
    statusBarHeight: 44,
    navHeight: 132,
    statusText: '',
    statusDesc: '',
    statusCardClass: '',
    createTimeStr: ''
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    this.setData({
      statusBarHeight: statusBarHeight,
      navHeight: statusBarHeight + 44,
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
          order.statusText = STATUS_TEXT[order.status] || '未知'
          order.priceStr = (order.price || 0).toFixed(2)

          // 计算 statusText / statusDesc / statusCardClass
          let statusText = STATUS_TEXT[order.status] || '未知'
          let statusDesc = STATUS_DESC[order.status] || ''
          let statusCardClass = order.status

          if (order.payStatus === 'paid' && order.status === 'unpaid') {
            statusText = PAY_STATUS_TEXT['paid']
            statusDesc = PAY_STATUS_DESC['paid']
            statusCardClass = 'pending'
          } else if (order.payStatus === 'confirmed' && order.status === 'unpaid') {
            statusText = PAY_STATUS_TEXT['confirmed']
            statusDesc = PAY_STATUS_DESC['confirmed']
            statusCardClass = 'pending'
          }

          this.setData({
            order: order,
            statusText: statusText,
            statusDesc: statusDesc,
            statusCardClass: statusCardClass,
            createTimeStr: this.formatFullTime(order.createTime),
            loading: false
          })
        } else if (result.message === '未登录或登录已过期') {
          wx.removeStorageSync('isAdmin')
          wx.redirectTo({ url: '/pages/admin-login/admin-login' })
        } else {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' })
          this.setData({ loading: false })
        }
      },
      fail: (err) => {
        console.error('获取详情失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
        this.setData({ loading: false })
      }
    })
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  makeCall: function () {
    const phone = this.data.order.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone, fail: () => {} })
    }
  },

  downloadFile: function () {
    if (this.data.downloading) return
    this.setData({ downloading: true })
    wx.showLoading({ title: '下载中...' })

    const fileID = this.data.order.fileID
    this.downloadDirectly(fileID)
  },

  downloadDirectly: function (fileID) {
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        wx.hideLoading()
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
          const fileName = this.data.order.fileName
          this.saveBase64File(result.fileBase64, fileName)
        } else {
          wx.showModal({
            title: '下载失败',
            content: result.message || '文件下载失败',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
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
      success: function () {},
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
    const statusText = STATUS_TEXT[newStatus]
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
          this.loadOrderDetail()
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

  confirmPayment: function () {
    const order = this.data.order
    wx.showModal({
      title: '确认收款',
      content: '确认已收到客户的转账支付？确认后订单将进入排队等待处理。',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '确认中...' })
          wx.cloud.callFunction({
            name: 'updateOrderStatus',
            data: {
              action: 'confirmPayment',
              orderId: order._id
            },
            success: (res) => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '收款确认成功', icon: 'success' })
                this.loadOrderDetail()
              } else {
                wx.showModal({
                  title: '确认失败',
                  content: res.result.message || '未知错误',
                  showCancel: false
                })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '网络错误', icon: 'none' })
            }
          })
        }
      }
    })
  },

  deleteOrder: function () {
    const order = this.data.order
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该订单吗？删除后无法恢复。',
      confirmColor: '#c41e3a',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          wx.cloud.callFunction({
            name: 'updateOrderStatus',
            data: {
              action: 'delete',
              orderId: order._id
            },
            success: (res) => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '删除成功', icon: 'success' })
                setTimeout(() => { wx.navigateBack({ delta: 1 }) }, 800)
              } else {
                wx.showModal({
                  title: '删除失败',
                  content: res.result.message || '未知错误',
                  showCancel: false
                })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '网络错误', icon: 'none' })
            }
          })
        }
      }
    })
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