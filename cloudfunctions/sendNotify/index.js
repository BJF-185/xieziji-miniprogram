const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

// ===== 配置 =====
const APP_ID = 'wx8e66787546be641d'
const APP_SECRET = process.env.WX_APP_SECRET  // 从云函数环境变量读取

// 模板 ID
// 顾客完成通知：H6Z79kT4hj4bXFRb__OasNw4z4aSeXd-mWlycA3cDkA
// 管理员新订单通知：SXc8H0R7GoG2q2xDJy8C2zCmUlJt_zew8VFYb9EVtA0
const CUSTOMER_DONE_TEMPLATE_ID = 'H6Z79kT4hj4bXFRb__OasNw4z4aSeXd-mWlycA3cDkA'
const ADMIN_NEW_ORDER_TEMPLATE_ID = 'SXc8H0R7GoG2q2xDJy8C2zCmUlJt_zew8VFYb9EVtA0'

// 北京时间偏移（云函数默认 UTC+0，手动 +8 小时）
const BEIJING_OFFSET_HOURS = 8

// ===== access_token 缓存（7200 秒，提前 5 分钟过期）=====
let cachedToken = null
let cachedTokenExpire = 0

/**
 * 格式化为北京时间（YYYY-MM-DD HH:mm:ss）
 * 云函数运行环境通常为 UTC，手动 +8 小时得到北京时间
 */
function formatBeijingTime(d) {
  const beijing = new Date(d.getTime() + BEIJING_OFFSET_HOURS * 60 * 60 * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth()+1)}-${pad(beijing.getUTCDate())} ${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`
}

/**
 * 从订单中获取创建时间，格式化为北京时间
 * 优先使用订单的 createdAt 字段（数据库写入时间），否则用当前时间
 */
function formatOrderTime(order) {
  let t
  if (order && order.createdAt) {
    // 兼容 Date 对象或时间戳
    if (typeof order.createdAt === 'object' && order.createdAt._seconds) {
      t = new Date(order.createdAt._seconds * 1000)
    } else if (typeof order.createdAt === 'number') {
      t = new Date(order.createdAt)
    } else {
      t = new Date(order.createdAt)
    }
  } else {
    t = new Date()
  }
  return formatBeijingTime(t)
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

/**
 * 发送一条订阅消息
 */
async function sendOneNotify(msgData) {
  const accessToken = await getAccessToken()
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`
  const result = await httpsPost(url, msgData)
  console.log('订阅消息发送返回:', JSON.stringify(result))
  return result
}

/**
 * 顾客订单完成通知（type=done）
 */
async function sendCustomerDoneNotify(order) {
  console.log('--- sendCustomerDoneNotify 开始 ---')
  console.log('订单 customerOpenid:', order.customerOpenid)
  console.log('订单 fileName:', order.fileName)
  console.log('订单 phone:', order.phone)

  if (!order || !order.customerOpenid) {
    return { success: false, message: '缺少用户 openid' }
  }

  // 使用订单创建时间（北京时间）作为"完成时间"
  const timeStr = formatOrderTime(order)
  const thing1Value = (order.fileName || '订单').substring(0, 20)
  // 备注和联系电话：固定值（管理员自己的取件信息）
  const thing5Value = '书写完成，请到陕西楼413拿取。'
  const phoneValue = '18965776608'

  const msgData = {
    touser: order.customerOpenid,
    template_id: CUSTOMER_DONE_TEMPLATE_ID,
    page: 'pages/my-detail/my-detail?id=' + order._id,
    data: {
      thing1: { value: thing1Value },
      time16: { value: timeStr },
      thing5: { value: thing5Value },
      phone_number28: { value: phoneValue }
    }
  }

  console.log('订阅消息参数:', JSON.stringify(msgData))

  try {
    const result = await sendOneNotify(msgData)
    if (result.errcode === 0) {
      return { success: true }
    } else {
      return { success: false, message: result.errmsg, errcode: result.errcode }
    }
  } catch (err) {
    console.log('订阅消息发送异常:', err.message)
    if (err.message && err.message.includes('access_token')) {
      cachedToken = null
      cachedTokenExpire = 0
    }
    return { success: false, message: err.message }
  }
}

/**
 * 管理员新订单通知（type=new）
 * 从 admin 集合中查询所有启用了通知的管理员 openid，给每个人发送一条
 */
async function sendAdminNewOrderNotify(order) {
  console.log('--- sendAdminNewOrderNotify 开始 ---')

  // 查询所有启用了通知的管理员
  // 约定：admin 集合中文档结构 { _id, openid, name, notifyEnabled: true }
  let admins
  try {
    const res = await db.collection('admin').where({
      notifyEnabled: true,
      openid: db.command.exists(true)
    }).get()
    admins = res.data || []
  } catch (err) {
    console.log('查询 admin 集合失败:', err.message)
    return { success: false, message: '查询管理员失败: ' + err.message }
  }

  // 兜底：如果 admin 集合没设 openid 字段或都未启用，尝试找一个 webadmin 角色
  if (admins.length === 0) {
    try {
      const res = await db.collection('admin').where({}).limit(10).get()
      admins = (res.data || []).filter(a => !!a.openid)
    } catch (err) {
      // 忽略
    }
  }

  if (admins.length === 0) {
    return { success: false, message: '暂无启用通知的管理员（admin 集合缺少 openid）' }
  }

  // 模板字段
  // thing1 → 联系人姓名, thing2 → 文件名称, amount3 → 订单金额(¥前缀), time4 → 下单时间
  const timeStr = formatOrderTime(order)
  const thing1Value = (order.contactName || order.name || '顾客').substring(0, 20)
  const thing2Value = (order.fileName || '订单').substring(0, 20)
  const amount3Value = '¥' + (order.amount != null ? Number(order.amount).toFixed(2) : '0.00')

  const results = []
  for (const admin of admins) {
    const msgData = {
      touser: admin.openid,
      template_id: ADMIN_NEW_ORDER_TEMPLATE_ID,
      // 点击通知跳到管理后台的 web 页面
      page: 'pages/admin/admin',
      miniprogram_state: 'developer',  // 开发版/体验版用，正式发布改为 'formal'
      data: {
        thing1: { value: thing1Value },
        thing2: { value: thing2Value },
        amount3: { value: amount3Value },
        time4: { value: timeStr }
      }
    }
    try {
      const result = await sendOneNotify(msgData)
      results.push({
        admin: admin.name || admin._id,
        openid: admin.openid.substring(0, 12) + '...',
        success: result.errcode === 0,
        errcode: result.errcode,
        errmsg: result.errmsg
      })
      if (result.errcode === 40001 || (result.errmsg && result.errmsg.includes('access_token'))) {
        cachedToken = null
        cachedTokenExpire = 0
      }
    } catch (err) {
      results.push({ admin: admin.name || admin._id, success: false, errmsg: err.message })
    }
  }

  const successCount = results.filter(r => r.success).length
  console.log(`新订单通知发送结果：${successCount}/${results.length} 成功`, JSON.stringify(results))
  return {
    success: successCount > 0,
    total: results.length,
    successCount,
    results
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

    if (type === 'done') {
      if (!order.customerOpenid) {
        return { success: false, message: '订单缺少 customerOpenid' }
      }
      return await sendCustomerDoneNotify(order)
    } else if (type === 'new') {
      return await sendAdminNewOrderNotify(order)
    } else {
      return { success: false, message: '不支持的 type: ' + type }
    }
  } catch (err) {
    console.error('sendNotify 失败:', err)
    return { success: false, message: err.message }
  }
}

