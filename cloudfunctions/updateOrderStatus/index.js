const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

const VALID_STATUSES = ['pending', 'doing', 'done', 'cancelled']

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const isAdmin = await isAdminOpenid(openid)
  if (!isAdmin) {
    return { success: false, message: '未登录或登录已过期' }
  }

  const { action, orderId, status } = event

  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  if (action === 'delete') {
    return await deleteOrder(orderId)
  }

  if (action === 'confirmPayment') {
    return await confirmPayment(orderId)
  }

  if (!VALID_STATUSES.includes(status)) {
    return { success: false, message: '无效的订单状态' }
  }

  try {
    const updateRes = await db.collection('orders').doc(orderId).update({
      data: {
        status: status,
        updateTime: db.serverDate()
      }
    })

    if (updateRes.updated === 0) {
      return { success: false, message: '订单不存在或未更新' }
    }

    if (status === 'done') {
      // 改用 sendNotify 云函数走 https 直调微信接口（避免 cloud.openapi.subscribeMessage.send 在 HTTP 触发器下 -501001）
      try {
        await cloud.callFunction({
          name: 'sendNotify',
          data: { orderId, type: 'done' }
        })
        console.log('完成通知已派发到 sendNotify')
      } catch (notifyErr) {
        console.warn('派发完成通知失败（不影响主流程）:', notifyErr.message)
      }
    }

    return { success: true, message: '状态更新成功' }
  } catch (err) {
    console.error('更新订单状态失败', err)
    return { success: false, message: '更新失败: ' + err.message }
  }
}

async function deleteOrder(orderId) {
  try {
    const deleteRes = await db.collection('orders').doc(orderId).remove()
    if (deleteRes.deleted === 0) {
      return { success: false, message: '订单不存在或未删除' }
    }
    return { success: true, message: '删除成功' }
  } catch (err) {
    console.error('删除订单失败', err)
    return { success: false, message: '删除失败: ' + err.message }
  }
}

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
    console.error('确认收款失败', err)
    return { success: false, message: '确认失败: ' + err.message }
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