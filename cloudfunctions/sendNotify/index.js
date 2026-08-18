const cloud = require('wx-server-sdk')
const { CUSTOMER_DONE_TEMPLATE_ID } = require('./notify')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  console.log('===== sendNotify 被调用 =====', { openid, event })

  const { orderId, type } = event
  if (!orderId) {
    return { success: false, message: '缺少 orderId' }
  }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data
    if (!order) {
      return { success: false, message: '订单不存在' }
    }
    console.log('订单信息:', JSON.stringify({
      customerOpenid: order.customerOpenid,
      fileName: order.fileName,
      type
    }))

    if (!order.customerOpenid) {
      return { success: false, message: '订单缺少 customerOpenid' }
    }

    if (type === 'done' || !type) {
      return await sendCustomerDoneNotify(order)
    } else {
      return { success: false, message: '不支持的 type: ' + type }
    }
  } catch (err) {
    console.error('sendNotify 失败:', err)
    return { success: false, message: err.message }
  }
}

async function sendCustomerDoneNotify(order) {
  if (!CUSTOMER_DONE_TEMPLATE_ID || CUSTOMER_DONE_TEMPLATE_ID === 'PENDING_APPLY') {
    return { success: false, message: '模板 ID 未配置' }
  }

  const now = new Date()
  const timeStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0')

  const thing1Value = (order.fileName || '订单').substring(0, 20)
  const thing5Value = '已完成'
  const phoneValue = order.phone || ''

  console.log('订阅消息参数:', JSON.stringify({
    touser: order.customerOpenid,
    templateId: CUSTOMER_DONE_TEMPLATE_ID,
    thing1: thing1Value,
    time16: timeStr,
    thing5: thing5Value,
    phone_number28: phoneValue
  }))

  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: order.customerOpenid,
      templateId: CUSTOMER_DONE_TEMPLATE_ID,
      page: 'pages/my-detail/my-detail?id=' + order._id,
      data: {
        thing1: { value: thing1Value },
        time16: { value: timeStr },
        thing5: { value: thing5Value },
        phone_number28: { value: phoneValue }
      }
    })
    console.log('订阅消息发送成功:', JSON.stringify(result))
    return { success: true }
  } catch (err) {
    console.log('订阅消息发送失败:', JSON.stringify({ errCode: err.errCode, errMsg: err.errMsg }))
    return { success: false, message: err.errMsg, errCode: err.errCode }
  }
}