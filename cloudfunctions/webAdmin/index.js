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

  const { action, token, orderId, status, password, fileID, orderIds } = params

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

  const BATCH_ACTIONS = ['batchUpdateStatus', 'batchConfirmPayment', 'batchDelete']
  if (!orderId && action !== 'getOrders' && action !== 'downloadFile' && !BATCH_ACTIONS.includes(action)) {
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
    case 'batchUpdateStatus':
      console.log('【batchUpdateStatus】orderIds:', (orderIds || []).length, 'status:', status)
      result = await batchUpdateStatus(orderIds, status)
      break
    case 'batchConfirmPayment':
      console.log('【batchConfirmPayment】orderIds:', (orderIds || []).length)
      result = await batchConfirmPayment(orderIds)
      break
    case 'batchDelete':
      console.log('【batchDelete】orderIds:', (orderIds || []).length)
      result = await batchDelete(orderIds)
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
    const orders = await enrichUsers(listRes.data)
    return {
      success: true,
      orders: orders,
      totalCount: totalCount.total
    }
  } catch (err) {
    return { success: false, message: '获取订单列表失败: ' + err.message }
  }
}

// ===== 批量关联用户资料（头像/昵称/手机号）=====
async function enrichUsers(orders) {
  if (!orders || orders.length === 0) return orders
  // 收集所有客户 openid
  const openidSet = new Set()
  orders.forEach(o => { if (o.customerOpenid) openidSet.add(o.customerOpenid) })
  const openids = Array.from(openidSet)
  if (openids.length === 0) return orders

  // 查询 users 集合
  const userMap = {}
  try {
    const userRes = await db.collection('users').where({ openid: db.command.in(openids) }).get()
    userRes.data.forEach(u => { userMap[u.openid] = u })
  } catch (err) {
    console.error('查询用户资料失败', err)
  }

  // 为每个订单附加用户信息
  orders.forEach(o => {
    const u = userMap[o.customerOpenid]
    o.userNickname = u ? u.nickname : ''
    o.userAvatarFileID = u ? u.avatarFileID : ''
  })

  // 批量把头像 fileID 转成下载 URL
  const fileIDs = orders.map(o => o.userAvatarFileID).filter(Boolean)
  // 同时收集转账截图 fileID，转成临时 URL 供人工核对
  orders.forEach(o => { if (o.paymentProofFileID) fileIDs.push(o.paymentProofFileID) })
  const urlMap = {}
  if (fileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: fileIDs })
      urlRes.fileList.forEach(item => { urlMap[item.fileID] = item.tempFileURL })
    } catch (err) {
      console.error('获取头像URL失败', err)
    }
  }
  orders.forEach(o => { o.userAvatar = o.userAvatarFileID ? urlMap[o.userAvatarFileID] || '' : '' })
  orders.forEach(o => { o.paymentProofUrl = o.paymentProofFileID ? urlMap[o.paymentProofFileID] || '' : '' })

  return orders
}

// ===== 订单详情 =====
async function getOrderDetail(orderId) {
  try {
    const res = await db.collection('orders').doc(orderId).get()
    const order = res.data
    const enriched = await enrichUsers([order])
    return { success: true, order: enriched[0] }
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
    // 先取出订单（含文件ID），用于删除云存储文件
    let order = null
    try {
      const res = await db.collection('orders').doc(orderId).get()
      order = res.data
    } catch (e) {
      // 订单可能不存在，忽略
    }
    const deleteRes = await db.collection('orders').doc(orderId).remove()
    if (deleteRes.deleted === 0) {
      return { success: false, message: '订单不存在或未删除' }
    }
    await cleanupOrderFiles(order)
    return { success: true, message: '删除成功' }
  } catch (err) {
    return { success: false, message: '删除失败: ' + err.message }
  }
}

// ===== 删除订单关联的云存储文件（文档 + 转账截图）=====
async function cleanupOrderFiles(order) {
  if (!order) return
  const fileIDs = []
  if (order.fileID) fileIDs.push(order.fileID)
  if (order.paymentProofFileID) fileIDs.push(order.paymentProofFileID)
  if (fileIDs.length === 0) return
  try {
    await cloud.deleteFile({ fileList: fileIDs })
  } catch (err) {
    console.warn('删除订单云存储文件失败（不影响数据库删除）', err)
  }
}

// ===== 批量更新状态 =====
async function batchUpdateStatus(orderIds, status) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, message: '请选择要更新的订单' }
  }
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, message: '无效的订单状态' }
  }
  try {
    let successCount = 0
    const failed = []
    // 云函数端循环逐条更新（doc.update 不支持批量 where）
    for (const id of orderIds) {
      const updateRes = await db.collection('orders').doc(id).update({
        data: { status: status, updateTime: db.serverDate() }
      })
      if (updateRes.updated > 0) successCount++
      else failed.push(id)
    }
    // 若批量改为 done，为每个成功订单发通知
    if (status === 'done' && successCount > 0) {
      for (const id of orderIds.filter(oid => !failed.includes(oid))) {
        try {
          await cloud.callFunction({ name: 'sendNotify', data: { orderId: id, type: 'done' } })
        } catch (e) {
          console.log('批量通知失败 orderId:', id, JSON.stringify(e))
        }
      }
    }
    return { success: true, message: `成功${successCount}单，失败${failed.length}单` }
  } catch (err) {
    console.error('批量更新失败:', err)
    return { success: false, message: '批量更新失败: ' + err.message }
  }
}

// ===== 批量确认收款 =====
async function batchConfirmPayment(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, message: '请选择要确认的订单' }
  }
  try {
    let successCount = 0
    const failed = []
    for (const id of orderIds) {
      const updateRes = await db.collection('orders').doc(id).update({
        data: {
          payStatus: 'confirmed',
          status: 'pending',
          updateTime: db.serverDate()
        }
      })
      if (updateRes.updated > 0) successCount++
      else failed.push(id)
    }
    return { success: true, message: `确认成功${successCount}单，失败${failed.length}单` }
  } catch (err) {
    console.error('批量确认收款失败:', err)
    return { success: false, message: '批量确认失败: ' + err.message }
  }
}

// ===== 批量删除 =====
async function batchDelete(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, message: '请选择要删除的订单' }
  }
  try {
    let successCount = 0
    const failed = []
    for (const id of orderIds) {
      // 先取出订单（含文件ID）
      let order = null
      try {
        const res = await db.collection('orders').doc(id).get()
        order = res.data
      } catch (e) {
        // 订单可能不存在
      }
      const deleteRes = await db.collection('orders').doc(id).remove()
      if (deleteRes.deleted > 0) {
        successCount++
        await cleanupOrderFiles(order)
      } else {
        failed.push(id)
      }
    }
    return { success: true, message: `删除成功${successCount}单，失败${failed.length}单` }
  } catch (err) {
    console.error('批量删除失败:', err)
    return { success: false, message: '批量删除失败: ' + err.message }
  }
}

// ===== 下载文件 =====
async function downloadFile(fileID) {
  if (!fileID) {
    return { success: false, message: '缺少文件ID' }
  }
  try {
    // 优先用临时 URL 方式（保留原文件名/MIME，浏览器可直接打开/下载）
    const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
    if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
      return { success: true, downloadUrl: urlRes.fileList[0].tempFileURL }
    }
    // 兜底：走 base64
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