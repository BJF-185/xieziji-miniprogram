const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

// ===== 配置 =====
const APP_ID = 'wx8e66787546be641d'
const APP_SECRET = process.env.WX_APP_SECRET  // 从云函数环境变量读取
const CUSTOMER_DONE_TEMPLATE_ID = 'H6Z79kT4hj4bXFRb__OasNw4z4aSeXd-mWlycA3cDkA'

// ===== access_token 缓存（7200 秒，提前 5 分钟过期）=====
let cachedToken = null
let cachedTokenExpire = 0

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('响应非 JSON: ' + data)) }
      })
    }).on('error', reject)
  })
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let result = ''
      res.on('data', (chunk) => { result += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(result)) }
        catch (e) { reject(new Error('响应非 JSON: ' + result)) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function getAccessToken() {
  // 缓存有效期内直接返回
  if (cachedToken && Date.now() < cachedTokenExpire) {
    return cachedToken
  }

  if (!APP_SECRET) {
    throw new Error('环境变量 WX_APP_SECRET 未配置')
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`
  console.log('=== 正在获取 access_token ===')
  const result = await httpsGet(url)

  if (result.errcode) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(result)}`)
  }

  cachedToken = result.access_token
  cachedTokenExpire = Date.now() + (result.expires_in - 300) * 1000
  console.log(`=== access_token 获取成功，${result.expires_in} 秒后过期 ===`)
  return cachedToken
}

async function sendCustomerDoneNotify(order) {
  console.log('--- sendCustomerDoneNotify 开始 ---')
  console.log('订单 customerOpenid:', order.customerOpenid)
  console.log('订单 fileName:', order.fileName)
  console.log('订单 phone:', order.phone)

  if (!order || !order.customerOpenid) {
    return { success: false, message: '缺少用户 openid' }
  }

  const timeStr = formatDate(new Date())
  const thing1Value = (order.fileName || '订单').substring(0, 20)
  const phoneValue = order.phone || ''

  const msgData = {
    touser: order.customerOpenid,
    template_id: CUSTOMER_DONE_TEMPLATE_ID,
    page: 'pages/my-detail/my-detail?id=' + order._id,
    data: {
      thing1: { value: thing1Value },
      time16: { value: timeStr },
      thing5: { value: '已完成' },
      phone_number28: { value: phoneValue }
    }
  }

  console.log('订阅消息参数:', JSON.stringify(msgData))

  try {
    const accessToken = await getAccessToken()
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`
    const result = await httpsPost(url, msgData)
    console.log('订阅消息发送返回:', JSON.stringify(result))

    if (result.errcode === 0) {
      return { success: true }
    } else {
      return { success: false, message: result.errmsg, errcode: result.errcode }
    }
  } catch (err) {
    console.log('订阅消息发送异常:', err.message)
    // access_token 失效的话清缓存，下次重取
    if (err.message && err.message.includes('access_token')) {
      cachedToken = null
      cachedTokenExpire = 0
    }
    return { success: false, message: err.message }
  }
}

// ===== 入口 =====
exports.main = async (event, context) => {
  console.log('===== sendNotify 被调用 =====')
  console.log('event:', JSON.stringify(event))

  const { orderId, type } = event
  if (!orderId) {
    return { success: false, message: '缺少 orderId' }
  }

  if (!APP_SECRET) {
    return { success: false, message: '云函数环境变量 WX_APP_SECRET 未配置' }
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
