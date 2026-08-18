const cloud = require('wx-server-sdk')
const { CUSTOMER_DONE_TEMPLATE_ID } = require('./notify')

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
      try {
        const orderRes = await db.collection('orders').doc(orderId).get()
        if (orderRes.data) {
          await sendCustomerDoneNotify(orderRes.data)
        }
      } catch (notifyErr) {
        console.warn('发送完成通知异常（不影响主流程）:', notifyErr)
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

async function sendCustomerDoneNotify(order) {
  if (!order || !order.customerOpenid) {
    console.warn('订单缺少 customerOpenid，跳过通知')
    return { success: false, message: '缺少用户 openid' }
  }

  if (!CUSTOMER_DONE_TEMPLATE_ID || CUSTOMER_DONE_TEMPLATE_ID === 'PENDING_APPLY') {
    console.warn('CUSTOMER_DONE_TEMPLATE_ID 未配置，跳过通知')
    return { success: false, message: '模板 ID 未配置' }
  }

  const now = new Date()
  const timeStr = `${now.getFullYear()}-${(String(now.getMonth() + 1)).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const thing1Value = (order.fileName || '订单').substring(0, 20)
  const thing5Value = '已完成'

  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: order.customerOpenid,
      templateId: CUSTOMER_DONE_TEMPLATE_ID,
      page: `pages/my-detail/my-detail?id=${order._id}`,
      data: {
        thing1: { value: thing1Value },
        time16: { value: timeStr },
        thing5: { value: thing5Value },
        phone_number28: { value: '15359988275' }
      }
    })
    console.log('完成通知发送成功:', result)
    return { success: true }
  } catch (err) {
    console.warn('完成通知发送失败（不影响主流程）:', err.errCode, err.errMsg)
    return { success: false, message: err.errMsg }
  }
}