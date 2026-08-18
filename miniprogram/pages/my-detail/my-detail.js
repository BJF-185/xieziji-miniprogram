const PAY_STATUS_TEXT = {
  'unpaid': '待付款',
  'paid': '排队中',
  'confirmed': '排队中'
}

const PAY_STATUS_ICON = {
  'unpaid': '付',
  'paid': '排',
  'confirmed': '排'
}

const PAY_STATUS_DESC = {
  'unpaid': '请完成支付以继续预约',
  'paid': '您已提交支付，正在等待确认收款',
  'confirmed': '支付已确认，订单正在排队处理中'
}

const STATUS_TEXT = {
  'unpaid': '待付款',
  'pending': '排队中',
  'doing': '处理中',
  'done': '已完成',
  'cancelled': '已取消'
}

const STATUS_ICON = {
  'unpaid': '付',
  'pending': '排',
  'doing': '写',
  'done': '完',
  'cancelled': '消'
}

const STATUS_DESC = {
  'unpaid': '请完成支付以继续预约',
  'pending': '您的预约正在排队等待处理',
  'doing': '您的预约正在书写中',
  'done': '预约已完成，感谢您的使用',
  'cancelled': '预约已取消'
}

const PAY_STATUS_MAP = {
  'unpaid': '待付款',
  'paid': '已支付待确认',
  'confirmed': '已确认'
}

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    statusText: '',
    statusIcon: '',
    statusDesc: '',
    payStatusText: '',
    createTimeStr: '',
    statusBarHeight: 44,
    navHeight: 132
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  onShow: function () {
    // 从编辑页返回时自动刷新数据
    if (this.data.orderId) {
      this.loadOrderDetail()
    }
  },

  onLoad: function (options) {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 44
    const navHeight = statusBarHeight + 44
    
    this.setData({
      statusBarHeight: statusBarHeight,
      navHeight: navHeight
    })
    
    if (options.id) {
      this.setData({ orderId: options.id })
      this.loadOrderDetail()
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  loadOrderDetail: function () {
    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'getMyDetail',
        orderId: this.data.orderId
      },
      success: (res) => {
        const result = res.result
        if (result.success) {
          const order = result.order
          let statusText = STATUS_TEXT[order.status] || '未知'
          let statusIcon = STATUS_ICON[order.status] || '问'
          let statusDesc = STATUS_DESC[order.status] || ''
          
          if (order.payStatus === 'paid') {
            statusText = PAY_STATUS_TEXT['paid']
            statusIcon = PAY_STATUS_ICON['paid']
            statusDesc = PAY_STATUS_DESC['paid']
          } else if (order.payStatus === 'confirmed' && order.status === 'unpaid') {
            statusText = PAY_STATUS_TEXT['confirmed']
            statusIcon = PAY_STATUS_ICON['confirmed']
            statusDesc = PAY_STATUS_DESC['confirmed']
          }
          
          this.setData({
            order: order,
            statusText: statusText,
            statusIcon: statusIcon,
            statusDesc: statusDesc,
            payStatusText: PAY_STATUS_MAP[order.payStatus] || '',
            createTimeStr: this.formatTime(order.createTime),
            loading: false
          })
        } else {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      },
      fail: (err) => {
        console.error('获取预约详情失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
        this.setData({ loading: false })
      }
    })
  },

  goPayment: function () {
    const order = this.data.order
    // 在真实用户点击事件中请求订阅消息授权（不影响支付跳转）
    // 微信限制：必须在用户点击事件中同步调用
    if (CUSTOMER_DONE_TEMPLATE_ID && CUSTOMER_DONE_TEMPLATE_ID !== 'PENDING_APPLY') {
      wx.requestSubscribeMessage({
        tmplIds: [CUSTOMER_DONE_TEMPLATE_ID],
        success: (res) => {
          if (res[CUSTOMER_DONE_TEMPLATE_ID] === 'accept') {
            wx.setStorageSync('customerDoneNotifyEnabled', true)
          }
        },
        complete: () => {
          // 无论授权结果都继续跳转
          this.navigateToPayment(order)
        }
      })
    } else {
      this.navigateToPayment(order)
    }
  },

  navigateToPayment: function (order) {
    wx.navigateTo({
      url: `/pages/payment/payment?orderId=${order._id}&orderNo=${order.orderNo}&name=${encodeURIComponent(order.name)}&phone=${order.phone}&fileName=${encodeURIComponent(order.fileName)}&wordCount=${order.wordCount}&price=${order.price}`
    })
  },

  goReorder: function () {
    const order = this.data.order
    // 未支付 → 编辑原订单；已取消 → 编辑并恢复为未支付
    wx.navigateTo({ url: `/pages/order/order?orderId=${order._id}` })
  },

  cancelOrder: function () {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个预约订单吗？取消后无法恢复。',
      confirmText: '确认取消',
      cancelText: '再想想',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.doCancelOrder()
        }
      }
    })
  },

  doCancelOrder: function () {
    wx.showLoading({ title: '取消中...' })
    wx.cloud.callFunction({
      name: 'createOrder',
      data: {
        action: 'cancelOrder',
        orderId: this.data.orderId
      },
      success: (res) => {
        wx.hideLoading()
        const result = res.result
        if (result.success) {
          wx.showToast({ title: '订单已取消', icon: 'success' })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          wx.showModal({
            title: '取消失败',
            content: result.message || '请重试',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('取消订单失败', err)
        wx.showModal({
          title: '取消失败',
          content: '网络错误，请重试',
          showCancel: false
        })
      }
    })
  },

  makeCall: function () {
    const phone = this.data.order.phone
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: () => {}
      })
    }
  },

  downloadFile: function () {
    const fileID = this.data.order.fileID
    const fileName = this.data.order.fileName
    if (!fileID) return

    wx.showLoading({ title: '下载中...' })
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        wx.hideLoading()
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => {
            wx.showToast({ title: '无法打开文件', icon: 'none' })
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      }
    })
  },

  formatTime: function (timestamp) {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  }
})