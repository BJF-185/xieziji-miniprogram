const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

const VALID_STATUSES = ['pending', 'doing', 'done', 'cancelled']
const ADMIN_PASSWORD = '123123'
const ADMIN_ID = 'webadmin'

exports.main = async (event, context) => {
  console.log('===== webAdmin 被调用 =====')
  console.log('event.body:', event.body)
  console.log('event:', JSON.stringify(event).substring(0, 500))

  // HTTP 触发器：event.body 是 JSON 字符串
  const params = event.body ? JSON.parse(event.body) : event
  console.log('解析后 params:', JSON.stringify(params).substring(0, 500))

  const { action, token, orderId, status, password, fileID } = params

  if (action === 'login') {
    console.log('【login】调用')
    return await adminLogin(password)
  }

  // 其他 action 需要 token 鉴权
  const valid = await isValidToken(token)
  console.log('【鉴权】token 校验结果:', valid, 'token:', token ? token.substring(0, 20) + '...' : 'null')
  if (!valid) {
    return { success: false, message: '未登录或登录已过期' }
  }

  if (!orderId && action !== 'getOrders' && action !== 'downloadFile') {
    return { success: false, message: '缺少订单ID' }
  }

  let result
  switch (action) {
    case 'getOrders':
      console.log('【getOrders】调用')
      result = await getOrderList()
      break
    case 'getDetail':
      console.log('【getDetail】orderId:', orderId)
      result = await getOrderDetail(orderId)
      break
    case 'updateStatus':
      console.log('【updateStatus】orderId:', orderId, 'status:', status)
      result = await updateStatus(orderId, status)
      break
    case 'confirmPayment':
      console.log('【confirmPayment】orderId:', orderId)
      result = await confirmPayment(orderId)
      break
    case 'deleteOrder':
      console.log('【deleteOrder】orderId:', orderId)
      result = await deleteOrder(orderId)
      break
    case 'downloadFile':
      console.log('【downloadFile】fileID:', fileID || orderId)
      result = await downloadFile(fileID || orderId)
      break
    default:
      console.log('【未知 action】:', action)
      result = { success: false, message: '未知操作' }
  }
  console.log('===== webAdmin 调用结束 =====\n')
  return result
}

// ===== 鉴权：从 token 解析 adminId =====
async function isValidToken(token) {
  if (!token) return false
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const adminId = decoded.split(':')[0]
    if (!adminId) return false
    const res = await db.collection('admin').where({ openid: adminId }).count()
    console.log('鉴权查询 admin 集合:', { adminId, count: res.total })
    return res.total > 0
  } catch (err) {
    console.error('鉴权失败:', err)
    return false
  }
}

// ===== 登录 =====
async function adminLogin(password) {
  if (password !== ADMIN_PASSWORD) {
    return { success: false, message: '密码错误' }
  }
  const token = Buffer.from(ADMIN_ID + ':' + Date.now()).toString('base64')

  try {
    const existRes = await db.collection('admin').where({ openid: ADMIN_ID }).get()
    if (existRes.data.length === 0) {
      await db.collection('admin').add({ data: { openid: ADMIN_ID, loginTime: db.serverDate() } })
      console.log('新建 admin 记录:', ADMIN_ID)
    } else {
      await db.collection('admin').doc(existRes.data[0]._id).update({ data: { loginTime: db.serverDate() } })
      console.log('更新 admin 记录:', ADMIN_ID)
    }
  } catch (err) {
    console.error('记录 admin 失败:', err)
  }

  return { success: true, token }
}

// ===== 订单列表 =====
async function getOrderList() {
  try {
    const totalCount = await db.collection('orders').count()
    const listRes = await db.collection('orders')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    return {
      success: true,
      orders: listRes.data,
      totalCount: totalCount.total
    }
  } catch (err) {
    return { success: false, message: '获取订单列表失败: ' + err.message }
  }
}

// ===== 订单详情 =====
async function getOrderDetail(orderId) {
  try {
    const res = await db.collection('orders').doc(orderId).get()
    return { success: true, order: res.data }
  } catch (err) {
    return { success: false, message: '订单不存在' }
  }
}

// ===== 更新状态（核心）=====
async function updateStatus(orderId, status) {
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, message: '无效的订单状态' }
  }

  try {
    const updateRes = await db.collection('orders').doc(orderId).update({
      data: { status: status, updateTime: db.serverDate() }
    })
    console.log('数据库更新结果:', JSON.stringify(updateRes))

    if (updateRes.updated === 0) {
      return { success: false, message: '订单不存在或未更新' }
    }

    if (status === 'done') {
      console.log('=== 订单变 done，准备发通知 ===')
      try {
        // 通过 cloud.callFunction 调用 sendNotify 云函数（它有 access_token）
        const notifyRes = await cloud.callFunction({
          name: 'sendNotify',
          data: { orderId: orderId, type: 'done' }
        })
        console.log('=== 通知返回 ===', JSON.stringify(notifyRes.result))
      } catch (notifyErr) {
        console.log('!!! 通知异常:', JSON.stringify(notifyErr))
      }
    }

    return { success: true, message: '状态更新成功' }
  } catch (err) {
    console.error('更新失败:', err)
    return { success: false, message: '更新失败: ' + err.message }
  }
}

// ===== 确认收款 =====
async function confirmPayment(orderId) {
  try {
    const updateRes = await db.collection('orders').doc(orderId).update({
      data: {
        payStatus: 'confirmed',
        status: 'pending',
        updateTime: db.serverDate()
      }
    })
    if (updateRes.updated === 0) {
      return { success: false, message: '订单不存在或未更新' }
    }
    return { success: true, message: '收款确认成功' }
  } catch (err) {
    return { success: false, message: '确认失败: ' + err.message }
  }
}

// ===== 删除订单 =====
async function deleteOrder(orderId) {
  try {
    const deleteRes = await db.collection('orders').doc(orderId).remove()
    if (deleteRes.deleted === 0) {
      return { success: false, message: '订单不存在或未删除' }
    }
    return { success: true, message: '删除成功' }
  } catch (err) {
    return { success: false, message: '删除失败: ' + err.message }
  }
}

// ===== 下载文件 =====
async function downloadFile(fileID) {
  if (!fileID) {
    return { success: false, message: '缺少文件ID' }
  }
  try {
    const downloadRes = await cloud.downloadFile({ fileID: fileID })
    const fileContent = downloadRes.fileContent
    const fileBase64 = fileContent.toString('base64')
    return {
      success: true,
      fileBase64: fileBase64,
      downloadUrl: 'data:application/octet-stream;base64,' + fileBase64
    }
  } catch (err) {
    return { success: false, message: '文件下载失败: ' + err.message }
  }
}