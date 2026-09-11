const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

const ADMIN_PASSWORD = '123123'

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  switch (event.action) {
    case 'adminLogin':
      return await adminLogin(event, openid)
    case 'getList':
      return await getOrderList(openid)
    case 'getDetail':
      return await getOrderDetail(event, openid)
    case 'checkAdmin':
      return await checkAdmin(openid)
    case 'getMyOrders':
      return await getMyOrders(openid)
    case 'getMyDetail':
      return await getMyDetail(event, openid)
    case 'downloadFile':
      return await downloadFile(event, openid)
    case 'getUserInfo':
      return await getUserInfo(openid)
    case 'saveUserInfo':
      return await saveUserInfo(event, openid)
    default:
      return { success: false, message: '未知操作' }
  }
}

// ===== 获取当前用户资料（头像/昵称）=====
async function getUserInfo(openid) {
  try {
    const res = await db.collection('users').where({ openid: openid }).limit(1).get()
    if (res.data && res.data.length > 0) {
      return { success: true, user: res.data[0] }
    }
    return { success: true, user: null }
  } catch (err) {
    console.error('获取用户资料失败', err)
    return { success: false, message: '获取用户资料失败' }
  }
}

// ===== 保存当前用户资料（头像/昵称）=====
async function saveUserInfo(event, openid) {
  const { nickname, avatarFileID } = event
  if (!openid) {
    return { success: false, message: '未获取到用户身份' }
  }
  if (!nickname || !nickname.trim()) {
    return { success: false, message: '请输入昵称' }
  }
  try {
    // 查询是否已有记录
    const existRes = await db.collection('users').where({ openid: openid }).limit(1).get()
    const data = {
      nickname: nickname.trim().substring(0, 20),
      avatarFileID: avatarFileID || '',
      updateTime: db.serverDate()
    }
    if (existRes.data && existRes.data.length > 0) {
      await db.collection('users').doc(existRes.data[0]._id).update({ data: data })
    } else {
      data.openid = openid
      data.createTime = db.serverDate()
      await db.collection('users').add({ data })
    }
    return { success: true, message: '保存成功' }
  } catch (err) {
    console.error('保存用户资料失败', err)
    return { success: false, message: '保存失败' }
  }
}

async function adminLogin(event, openid) {
  const { password } = event

  if (password !== ADMIN_PASSWORD) {
    return { success: false, message: '密码错误' }
  }

  try {
    const existRes = await db.collection('admin').where({ openid: openid }).get()
    if (existRes.data.length === 0) {
      await db.collection('admin').add({
        data: {
          openid: openid,
          loginTime: db.serverDate()
        }
      })
    } else {
      await db.collection('admin').doc(existRes.data[0]._id).update({
        data: { loginTime: db.serverDate() }
      })
    }
  } catch (err) {
    console.warn('记录管理员openid失败', err)
  }

  return { success: true }
}

async function checkAdmin(openid) {
  try {
    const res = await db.collection('admin').where({ openid: openid }).count()
    return { success: res.total > 0 }
  } catch (err) {
    return { success: false }
  }
}

async function getOrderList(openid) {
  const isAdmin = await isAdminOpenid(openid)
  if (!isAdmin) {
    return { success: false, message: '未登录或登录已过期' }
  }

  try {
    const totalCount = await db.collection('orders').count()
    const unpaidCount = await db.collection('orders').where({ status: 'unpaid' }).count()
    const paidCount = await db.collection('orders').where({ payStatus: 'paid' }).count()
    const pendingCount = await db.collection('orders').where({ status: 'pending' }).count()
    const doingCount = await db.collection('orders').where({ status: 'doing' }).count()
    const doneCount = await db.collection('orders').where({ status: 'done' }).count()

    const listRes = await db.collection('orders')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    return {
      success: true,
      orders: listRes.data,
      totalCount: totalCount.total,
      unpaidCount: unpaidCount.total,
      paidCount: paidCount.total,
      pendingCount: pendingCount.total,
      doingCount: doingCount.total,
      doneCount: doneCount.total
    }
  } catch (err) {
    console.error('获取订单列表失败', err)
    return { success: false, message: '获取订单列表失败: ' + err.message }
  }
}

async function getOrderDetail(event, openid) {
  const isAdmin = await isAdminOpenid(openid)
  if (!isAdmin) {
    return { success: false, message: '未登录或登录已过期' }
  }

  const { orderId } = event
  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  try {
    const res = await db.collection('orders').doc(orderId).get()
    const order = res.data
    
    return { success: true, order: order }
  } catch (err) {
    return { success: false, message: '订单不存在' }
  }
}

async function getMyOrders(openid) {
  try {
    const queuingCount = await db.collection('orders').where({ customerOpenid: openid, status: 'pending' }).count()
    const processingCount = await db.collection('orders').where({ customerOpenid: openid, status: 'doing' }).count()
    const doneCount = await db.collection('orders').where({ customerOpenid: openid, status: 'done' }).count()

    const listRes = await db.collection('orders')
      .where({ customerOpenid: openid })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()

    return {
      success: true,
      orders: listRes.data,
      queuingCount: queuingCount.total,
      processingCount: processingCount.total,
      doneCount: doneCount.total
    }
  } catch (err) {
    console.error('获取我的预约失败', err)
    return { success: false, message: '获取预约列表失败' }
  }
}

async function getMyDetail(event, openid) {
  const { orderId } = event
  if (!orderId) {
    return { success: false, message: '缺少预约ID' }
  }

  try {
    const res = await db.collection('orders').doc(orderId).get()
    if (res.data.customerOpenid !== openid) {
      return { success: false, message: '无权查看该预约' }
    }
    return { success: true, order: res.data }
  } catch (err) {
    return { success: false, message: '预约不存在' }
  }
}

async function isAdminOpenid(openid) {
  try {
    const res = await db.collection('admin').where({ openid: openid }).count()
    return res.total > 0
  } catch (err) {
    return false
  }
}

async function downloadFile(event, openid) {
  const isAdmin = await isAdminOpenid(openid)
  if (!isAdmin) {
    return { success: false, message: '未登录或登录已过期' }
  }

  const { fileID } = event
  if (!fileID) {
    return { success: false, message: '缺少文件ID' }
  }

  try {
    const downloadRes = await cloud.downloadFile({ fileID: fileID })
    const fileContent = downloadRes.fileContent
    const base64Content = fileContent.toString('base64')
    
    return {
      success: true,
      fileBase64: base64Content
    }
  } catch (err) {
    console.error('云函数下载文件失败', err)
    return { success: false, message: '文件下载失败: ' + err.message }
  }
}
