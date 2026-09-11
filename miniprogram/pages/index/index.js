Page({
  data: {
    windowHeight: 667,
    windowWidth: 375,
    currentTab: 'home',
    showUserModal: false,
    nicknameDraft: '',
    avatarTempPath: '',
    avatarFileID: '',
    avatarUploading: false,
    userInfoReady: false,
    pendingGoOrder: false
  },

  onLoad: function () {
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      windowHeight: systemInfo.windowHeight,
      windowWidth: systemInfo.windowWidth
    })
  },

  onShow: function () {
    // 不在进入首页时打扰用户授权；资料完善已下放到「立即开写」点击时触发
  },

  // 阻止iOS弹性滚动
  preventScroll: function () {
    return
  },

  goOrder: function () {
    // 已保存过资料，直接下单
    if (wx.getStorageSync('userProfileSaved')) {
      wx.navigateTo({ url: '/pages/order/order' })
      return
    }
    // 否则先检查是否需要完善资料；若无需弹窗则直接跳转
    const skipTs = wx.getStorageSync('userProfileSkipped')
    const now = Date.now()
    if (skipTs && now - skipTs < 24 * 60 * 60 * 1000) {
      wx.navigateTo({ url: '/pages/order/order' })
      return
    }
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { action: 'getUserInfo' },
      success: (res) => {
        const user = res.result && res.result.user
        if (user && user.nickname) {
          wx.setStorageSync('userProfileSaved', true)
          wx.navigateTo({ url: '/pages/order/order' })
          return
        }
        // 需要完善资料：弹窗，待用户保存或跳过后再去下单页
        this.setData({ showUserModal: true, pendingGoOrder: true })
      },
      fail: () => {
        // 检查失败不阻塞下单，直接进下单页
        wx.navigateTo({ url: '/pages/order/order' })
      }
    })
  },

  onTabMy: function () {
    wx.reLaunch({ url: '/pages/my/my' })
  },

  onTabHome: function () {
    // 已经在首页，无需操作
  },

  onGoContact: function () {
    wx.reLaunch({ url: '/pages/contact/contact' })
  },

  // ===== 首次进入：检查是否需要完善资料 =====
  checkUserProfile: function () {
    // 若已保存过，不再打扰
    if (wx.getStorageSync('userProfileSaved')) {
      return
    }
    const skipTs = wx.getStorageSync('userProfileSkipped')
    const now = Date.now()
    // 本次会话已跳过则不再弹
    if (skipTs && now - skipTs < 24 * 60 * 60 * 1000) {
      return
    }
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { action: 'getUserInfo' },
      success: (res) => {
        const user = res.result && res.result.user
        if (user && user.nickname) {
          wx.setStorageSync('userProfileSaved', true)
          return
        }
        this.setData({ showUserModal: true })
      },
      fail: () => {
        console.error('检查用户资料失败')
      }
    })
  },

  onChooseAvatar: function (e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    this.setData({ avatarTempPath: tempPath, avatarUploading: true })
    // 上传头像到云存储
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

  skipUserModal: function () {
    wx.setStorageSync('userProfileSkipped', Date.now())
    this.setData({ showUserModal: false })
    this._afterUserModal()
  },

  // 资料弹窗关闭后，若用户是从「立即开写」进入，则继续去下单页
  _afterUserModal: function () {
    if (this.data.pendingGoOrder) {
      this.setData({ pendingGoOrder: false })
      wx.navigateTo({ url: '/pages/order/order' })
    }
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
          wx.setStorageSync('userProfileSkipped', '')
          this.setData({ showUserModal: false })
          wx.showToast({ title: '资料已保存', icon: 'success' })
          this._afterUserModal()
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('保存用户资料失败', err)
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  }
})