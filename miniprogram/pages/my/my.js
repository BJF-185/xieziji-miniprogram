const PROGRESS_STEPS = ['已提交', '已付款', '书写中', '已完成']

Page({
  data: {
    order: null,
    historyOrders: [],
    historyCount: 0,
    loading: false,
    statusBarHeight: 44,
    navContentHeight: 44,
    navTotalHeight: 88,
    currentTab: 'my',
    nickname: '',
    avatarUrl: '',
    avatarFileID: '',
    showEditModal: false,
    nicknameDraft: '',
    avatarTempPath: '',
    avatarUploading: false,
    userInfoReady: false
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    const statusBarHeight = systemInfo.statusBarHeight || 20
    // 用胶囊按钮位置精确计算导航栏总高度，避免部分 iOS 机型被 fixed 导航栏遮挡内容
    let navContentHeight = 44
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.height) {
        // 导航内容高度 = 胶囊顶部距状态栏下沿的两倍 + 胶囊自身高度（垂直居中）
        navContentHeight = (menu.top - statusBarHeight) * 2 + menu.height
      }
    } catch (e) { /* 部分基础库或环境不支持，回退默认 44 */ }
    this.setData({
      statusBarHeight: statusBarHeight,
      navContentHeight: navContentHeight,
      navTotalHeight: statusBarHeight + navContentHeight
    })
    this.loadLatestOrder()
    this.loadUserProfile()
  },

  onShow: function () {
    this.loadLatestOrder()
    this.loadUserProfile()
  },

  onPullDownRefresh: function () {
    // 下拉刷新：重新拉取订单与用户资料
    this.setData({ loading: false })
    this.loadLatestOrder()
    this.loadUserProfile()
    // 数据请求完成后收起下拉动画（给足请求完成时间）
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 700)
  },

  // ===== 加载当前用户资料 =====
  loadUserProfile: function () {
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { action: 'getUserInfo' },
      success: (res) => {
        const user = res.result && res.result.user
        if (!user) return
        this.setData({
          nickname: user.nickname || '',
          avatarFileID: user.avatarFileID || ''
        })
        if (user.avatarFileID) {
          wx.cloud.getTempFileURL({
            fileList: [user.avatarFileID],
            success: (r) => {
              const url = r.fileList[0].tempFileURL
              if (url) this.setData({ avatarUrl: url })
            }
          })
        }
      }
    })
  },

  openEditProfile: function () {
    this.setData({
      showEditModal: true,
      nicknameDraft: this.data.nickname,
      avatarTempPath: this.data.avatarUrl || '',
      userInfoReady: !!this.data.avatarFileID
    })
  },

  closeEditModal: function () {
    this.setData({ showEditModal: false })
  },

  onChooseAvatar: function (e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    this.setData({ avatarTempPath: tempPath, avatarUploading: true })
    wx.cloud.uploadFile({
      cloudPath: `avatars/${Date.now()}.jpg`,
      filePath: tempPath,
      config: { isPublic: true },
      success: (res) => {
        this.setData({
          avatarFileID: res.fileID,
          avatarUploading: false,
          userInfoReady: !!(this.data.nicknameDraft || '').trim()
        })
      },
      fail: () => {
        this.setData({ avatarUploading: false })
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
      }
    })
  },

  onNicknameInput: function (e) {
    const value = e.detail.value
    this.setData({
      nicknameDraft: value,
      userInfoReady: !!value.trim() && !!this.data.avatarFileID
    })
  },

  saveUserInfo: function () {
    if (this.data.avatarUploading) {
      wx.showToast({ title: '头像上传中，请稍候', icon: 'none' })
      return
    }
    const nickname = (this.data.nicknameDraft || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!this.data.avatarFileID) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'saveUserInfo',
        nickname: nickname,
        avatarFileID: this.data.avatarFileID
      },
      success: (res) => {
        if (res.result && res.result.success) {
          wx.setStorageSync('userProfileSaved', true)
          this.setData({
            showEditModal: false,
            nickname: nickname,
            avatarUrl: this.data.avatarTempPath || this.data.avatarUrl
          })
          wx.showToast({ title: '资料已保存', icon: 'success' })
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  },

  loadLatestOrder: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        action: 'getMyOrders'
      },
      success: (res) => {
        const result = res.result
        if (result.success) {
          let orders = result.orders || []

          if (orders.length === 0) {
            this.setData({ unfinishedOrders: [], finishedOrders: [], finishedCount: 0, loading: false })
            return
          }

          // 映射所有订单
          const mapped = orders.map(o => {
            let displayStatus = o.status
            let statusText = this.getStatusText(o.status)
            if (o.status === 'cancelled') {
              displayStatus = 'cancelled'
              statusText = '已取消'
            } else if (o.payStatus === 'paid') {
              displayStatus = 'pending'
              statusText = '排队中'
            } else if (o.payStatus === 'confirmed') {
              statusText = this.getStatusText(o.status)
            }
            return {
              ...o,
              displayStatus: displayStatus,
              statusText: statusText,
              statusDesc: '',
              createTimeStr: this.formatTime(o.createTime),
              progressStep: this.getProgressStep(o, displayStatus)
            }
          })

          // 排序：未完成在上，已完成在下；各自按时间降序
          const statusRank = { 'unpaid': 0, 'pending': 1, 'doing': 2, 'done': 3, 'cancelled': 4 }
          mapped.sort((a, b) => {
            const rankA = statusRank[a.displayStatus] ?? 99
            const rankB = statusRank[b.displayStatus] ?? 99
            if (rankA !== rankB) return rankA - rankB
            return b.createTime - a.createTime
          })

          // 整理每单的进度条数组
          const withSteps = mapped.map(o => ({
            ...o,
            progressSteps: this.getProgressSteps(o.progressStep, o.displayStatus === 'cancelled'),
            statusDesc: this.getStatusDesc(o)
          }))

          // 分组：未完成（待付款/排队中/处理中）在上，已完成/已取消在下
          const unfinished = withSteps.filter(o => o.displayStatus === 'unpaid' || o.displayStatus === 'pending' || o.displayStatus === 'doing')
          const finished = withSteps.filter(o => o.displayStatus === 'done' || o.displayStatus === 'cancelled')

          this.setData({
            unfinishedOrders: unfinished,
            finishedOrders: finished,
            finishedCount: finished.length
          })
        } else {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('获取预约失败', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  // 计算进度步骤（0-3）
  getProgressStep: function (order, displayStatus) {
    if (order.status === 'cancelled') return 0
    if (displayStatus === 'unpaid' || order.payStatus === 'unpaid') return 0
    if (displayStatus === 'pending' || order.payStatus === 'paid') return 1
    if (displayStatus === 'doing') return 2
    if (displayStatus === 'done') return 3
    return 0
  },

  // 生成进度条数组
  getProgressSteps: function (currentStep, isCancelled) {
    return PROGRESS_STEPS.map((label, i) => ({
      label: label,
      done: isCancelled ? false : i < currentStep,
      active: isCancelled ? false : i === currentStep
    }))
  },

  getStatusText: function (status) {
    const map = {
      'unpaid': '待付款',
      'pending': '排队中',
      'doing': '处理中',
      'done': '已完成',
      'cancelled': '已取消'
    }
    return map[status] || '未知'
  },

  getStatusDesc: function (order) {
    if (order.displayStatus === 'cancelled') return '已取消'
    if (order.payStatus === 'unpaid' && order.status === 'unpaid') return '请完成支付以继续预约'
    if (order.payStatus === 'paid') return '您已提交转账截图，等待确认'
    if (order.status === 'pending') return '订单正在排队等待处理'
    if (order.status === 'doing') return '正在为您书写中'
    if (order.status === 'done') return '已完成，请查看取件信息'
    return ''
  },

  goDetail: function (e) {
    const id = e.currentTarget ? e.currentTarget.dataset.id : this.data.unfinishedOrders[0] && this.data.unfinishedOrders[0]._id
    if (!id) return
    wx.navigateTo({ url: `/pages/my-detail/my-detail?id=${id}` })
  },

  goHistory: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/my-detail/my-detail?id=${id}` })
  },

  onTabHome: function () {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onTabMy: function () {
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onGoContact: function () {
    wx.reLaunch({ url: '/pages/contact/contact' })
  },

  onAdminEntry: function () {
    wx.navigateTo({ url: '/pages/admin-login/admin-login' })
  },

  goOrder: function () {
    wx.navigateTo({ url: '/pages/order/order' })
  },

  formatTime: function (timestamp) {
    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${month}-${day} ${hour}:${minute}`
  }
})