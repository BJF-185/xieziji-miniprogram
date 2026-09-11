const cloud = require('wx-server-sdk')
const AdmZip = require('adm-zip')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

// 管理员密码（部署后请修改）
const ADMIN_PASSWORD = '123123'

// 订阅消息模板ID（新订单提醒 - 管理员收）
const ADMIN_NOTIFY_TEMPLATE_ID = 'SXc8H0R7GoG2q2xDJy8C2zCmUlJt_zew8VFYb9EVtA0'

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  switch (event.action) {
    case 'countWords':
      return await countWords(event, openid)
    case 'createOrder':
      return await createOrder(event, openid)
    case 'confirmPayment':
      return await confirmPayment(event)
    case 'sendAdminNotify':
      return await sendAdminNotify(event.orderData)
    case 'cancelOrder':
      return await cancelOrder(event, openid)
    case 'updateOrder':
      return await updateOrder(event, openid)
    case 'getOpenid':
      return { success: true, openid: openid || null, appid: wxContext.APPID }
    case 'setupAdminNotify':
      return await setupAdminNotify(openid)
    default:
      return { success: false, message: '未知操作' }
  }
}

// 把当前用户的真实 openid 存到 admin 集合，供 sendAdminNotify 发送"顾客下单提醒"使用
async function setupAdminNotify(openid) {
  if (!openid) {
    return { success: false, message: '当前用户没有 openid' }
  }
  const res = await db.collection('admin').limit(1).get()
  if (!res.data || res.data.length === 0) {
    return { success: false, message: 'admin 记录不存在，请先登录网页后台初始化' }
  }
  const adminId = res.data[0]._id
  await db.collection('admin').doc(adminId).update({
    data: { notifyOpenid: openid, notifySetupTime: db.serverDate() }
  })
  console.log('已设置管理员通知 openid:', openid)
  return { success: true, message: '设置成功', openid }
}

/**
 * 统计Word文件字数
 */
async function countWords(event, openid) {
  const { fileID } = event

  if (!fileID) {
    return { success: false, message: '缺少文件' }
  }

  try {
    // 1. 从云存储下载文件
    const downloadRes = await cloud.downloadFile({ fileID })
    const fileBuffer = downloadRes.fileContent

    // 2. 解析文件内容，统计字数
    const wordCount = await parseAndCount(fileBuffer, fileID)

    if (wordCount === 0) {
      return { success: false, message: '未能从文件中提取到文字内容，请确认文件内容不为空' }
    }

    return {
      success: true,
      wordCount: wordCount
    }
  } catch (err) {
    console.error('统计字数失败', err)
    return { success: false, message: '文件解析失败，请确认是有效的Word文档（.docx格式）' }
  }
}

/**
 * 解析Word文件并统计字数
 */
async function parseAndCount(fileBuffer, fileID) {
  const fileName = decodeURIComponent(fileID.split('/').pop() || '')

  if (fileName.toLowerCase().endsWith('.docx')) {
    return parseDocx(fileBuffer)
  } else if (fileName.toLowerCase().endsWith('.doc')) {
    return parseDoc(fileBuffer)
  } else {
    throw new Error('不支持的文件格式')
  }
}

/**
 * 解析 .docx 文件（基于ZIP+XML）
 */
function parseDocx(fileBuffer) {
  try {
    const zip = new AdmZip(fileBuffer)
    const documentXml = zip.getEntry('word/document.xml')

    if (!documentXml) {
      throw new Error('无法找到document.xml')
    }

    const xmlContent = documentXml.getData().toString('utf-8')

    // 提取 <w:t> 标签中的文本内容
    const texts = []
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g
    let match
    while ((match = regex.exec(xmlContent)) !== null) {
      if (match[1]) {
        texts.push(match[1])
      }
    }

    const fullText = texts.join('')
    return countWordsInText(fullText)
  } catch (err) {
    console.error('解析docx失败', err)
    throw err
  }
}

/**
 * 解析 .doc 文件（旧版二进制格式，简单提取文本）
 */
function parseDoc(fileBuffer) {
  try {
    // .doc 是二进制格式，这里用简单方式提取可见文本
    // 提取UTF-16LE编码的文本片段
    const text = fileBuffer.toString('utf16le', 0, Math.min(fileBuffer.length, 2 * 1024 * 1024))
    // 过滤掉不可见字符
    const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 提取中文和英文字符
    const matches = cleanText.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g)
    if (!matches) return 0
    const fullText = matches.join('')
    return countWordsInText(fullText)
  } catch (err) {
    console.error('解析doc失败', err)
    // 如果解析失败，提示用户转为docx
    throw new Error('建议将文件另存为 .docx 格式后重新上传')
  }
}

/**
 * 统计文本中的字数
 * 中文字符每个算1字，英文单词每个算1字，标点符号每个算1字，数字每个算1字
 */
function countWordsInText(text) {
  if (!text) return 0

  let count = 0

  // 统计中文字符
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g)
  if (chineseChars) {
    count += chineseChars.length
  }

  // 统计英文单词
  const englishWords = text.match(/[a-zA-Z]+/g)
  if (englishWords) {
    count += englishWords.length
  }

  // 统计数字（每个数字 1 个字）
  const numbers = text.match(/[0-9]/g)
  if (numbers) {
    count += numbers.length
  }

  // 统计标点符号（每个标点 1 个字）
  // 覆盖：中文标点（\u3000-\u303f）、全角符号（\uff00-\uffef）、通用标点（\u2000-\u206f）、英文标点
  const punctuations = text.match(/[\u3000-\u303f\uff00-\uffef\u2000-\u206f!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g)
  if (punctuations) {
    count += punctuations.length
  }

  return count
}

/**
 * 创建订单
 */
async function createOrder(event, openid) {
  const {
    fileID,
    fileName,
    wordCount,
    price,
    name,
    phone,
    fontName,
    dormNo,
    notebookSize,
    pageCount,
    remark
  } = event

  // 参数校验
  if (!fileID || !fileName || !wordCount || !name || !phone) {
    return { success: false, message: '缺少必要参数' }
  }

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { success: false, message: '手机号格式不正确' }
  }

  try {
    // 生成订单号
    const orderNo = generateOrderNo()

    // 存入数据库
    const orderData = {
      orderNo: orderNo,
      fileID: fileID,
      fileName: fileName,
      wordCount: wordCount,
      price: price,
      name: name,
      phone: phone,
      fontName: fontName || '',
      dormNo: dormNo || '',
      notebookSize: notebookSize || '',
      pageCount: pageCount || '',
      remark: remark || '',
      status: 'unpaid',
      payStatus: 'unpaid',
      customerOpenid: openid,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    const addResult = await db.collection('orders').add({ data: orderData })

    sendAdminNotify(orderData).catch(err => {
      console.warn('发送通知失败（不影响订单）', err)
    })

    return {
      success: true,
      orderId: addResult._id,
      orderNo: orderNo
    }
  } catch (err) {
    console.error('创建订单失败', err)
    return { success: false, message: '创建订单失败，请重试' }
  }
}

/**
 * 生成订单号
 */
function generateOrderNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  const h = now.getHours().toString().padStart(2, '0')
  const min = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${y}${m}${d}${h}${min}${s}${random}`
}

/**
 * 确认支付
 */
async function confirmPayment(event) {
  const { orderId, paymentMethod, paymentNote, paymentProofFileID } = event
  
  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }
  
  try {
    const updateRes = await db.collection('orders').doc(orderId).update({
      data: {
        payStatus: 'paid',
        paymentMethod: paymentMethod || '',
        paymentNote: paymentNote || '',
        paymentProofFileID: paymentProofFileID || '',
        paidTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    
    if (updateRes.stats && updateRes.stats.updated > 0) {
      return { success: true }
    } else {
      return { success: false, message: '订单未找到或未更新' }
    }
  } catch (err) {
    console.error('确认支付失败', err)
    return { success: false, message: '确认支付失败: ' + err.message }
  }
}

/**
 * 用户取消订单
 */
async function cancelOrder(event, openid) {
  const { orderId } = event

  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return { success: false, message: '订单不存在' }
    }

    if (order.customerOpenid !== openid) {
      return { success: false, message: '无权操作此订单' }
    }

    // 仅未付款订单可取消。付款后（payStatus !== 'unpaid'）订单已进入排队，不可取消
    if (order.status !== 'unpaid' || order.payStatus !== 'unpaid') {
      return { success: false, message: '当前订单状态不支持取消' }
    }

    const updateRes = await db.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        updateTime: db.serverDate()
      }
    })

    if (updateRes.stats.updated > 0) {
      return { success: true, message: '订单已取消' }
    } else {
      return { success: false, message: '取消失败，请重试' }
    }
  } catch (err) {
    console.error('取消订单失败', err)
    return { success: false, message: '取消失败: ' + err.message }
  }
}

/**
 * 用户修改订单（仅未支付订单可改）
 */
async function updateOrder(event, openid) {
  const {
    orderId,
    name,
    phone,
    notebookSize,
    fontName,
    fileID,
    fileName,
    wordCount,
    price,
    remark
  } = event

  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }
  if (!fileID || !fileName || !wordCount || !name || !phone) {
    return { success: false, message: '缺少必要参数' }
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { success: false, message: '手机号格式不正确' }
  }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return { success: false, message: '订单不存在' }
    }
    if (order.customerOpenid !== openid) {
      return { success: false, message: '无权操作此订单' }
    }
    // 允许未支付 或 已取消（重新下单场景）
    if (order.status !== 'unpaid' && order.status !== 'cancelled') {
      return { success: false, message: '当前订单状态不支持修改' }
    }

    // 清理旧文件（仅当 fileID 变化时）
    if (order.fileID && order.fileID !== fileID) {
      try {
        await cloud.deleteFile({ fileList: [order.fileID] })
      } catch (delErr) {
        console.warn('删除旧文件失败（不影响订单更新）', delErr)
      }
    }

    // 已取消订单：恢复为未支付 + 支付状态重置（若已支付则保留 paid，让用户重新走支付流程）
    const updateData = {
      name: name,
      phone: phone,
      notebookSize: notebookSize || '',
      fontName: fontName || '',
      fileID: fileID,
      fileName: fileName,
      wordCount: wordCount,
      price: price,
      remark: remark || '',
      updateTime: db.serverDate()
    }
    if (order.status === 'cancelled') {
      updateData.status = 'unpaid'
    }

    const updateRes = await db.collection('orders').doc(orderId).update({
      data: updateData
    })

    const updated = (updateRes.stats && updateRes.stats.updated) || updateRes.updated || 0
    if (updated > 0) {
      return { success: true, message: '订单已更新', orderId: orderId, orderNo: order.orderNo }
    } else {
      return { success: false, message: '订单未更新，请重试' }
    }
  } catch (err) {
    console.error('更新订单失败', err)
    return { success: false, message: '更新订单失败: ' + err.message }
  }
}

/**
 * 发送管理员通知（微信原生订阅消息）
 * 关键：管理员需在 admin 页面勾选"总是保持以上选择"+允许，才能长期接收
 * 模板字段映射（按微信公众平台模板详情）：
 * name7     - 联系人姓名
 * thing10   - 商品名称/文件名称
 * amount3   - 订单金额
 * time36    - 下单时间（time 类型，格式 yyyy-MM-dd HH:mm:ss）
 */
async function sendAdminNotify(orderData) {
  const adminRes = await db.collection('admin').limit(1).get()
  if (!adminRes.data || adminRes.data.length === 0) {
    console.warn('未找到管理员记录，跳过通知')
    return { success: false, message: '未找到管理员记录' }
  }

  const admin = adminRes.data[0]
  // 优先用管理员设置的真实 openid（notifyOpenid），fallback 到旧字段
  const adminOpenid = admin.notifyOpenid || admin.openid
  console.log('找到管理员openid:', adminOpenid, '是否真实openid:', !!admin.notifyOpenid)
  if (!admin.notifyOpenid) {
    console.warn('管理员 notifyOpenid 未设置，请在 admin 页面完成 setupAdminNotify 一次')
  }

  if (!adminOpenid || adminOpenid === 'webadmin') {
    return { success: false, message: '管理员 openid 未设置，请先进入 admin 页面初始化' }
  }

  const now = new Date()
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

  try {
    console.log('准备发送订阅消息，模板ID:', ADMIN_NOTIFY_TEMPLATE_ID)
    console.log('消息数据:', {
      name7: orderData.name,
      thing10: orderData.fileName.substring(0, 20),
      amount3: '\u00a5' + Number(orderData.price || 0).toFixed(2),
      time36: timeStr
    })

    const result = await cloud.openapi.subscribeMessage.send({
      touser: adminOpenid,
      templateId: ADMIN_NOTIFY_TEMPLATE_ID,
      page: 'pages/admin/admin',
      data: {
        name7: { value: orderData.name },
        thing10: { value: orderData.fileName.substring(0, 20) },
        amount3: { value: '\u00a5' + Number(orderData.price || 0).toFixed(2) },
        time36: { value: timeStr }
      }
    })
    console.log('订阅消息发送成功:', result)
    return { success: true, message: '通知发送成功' }
  } catch (err) {
    console.error('发送订阅消息失败:', err)
    // 43101 = 用户拒收（可能没勾选保持以上选择，或被微信限制）
    return {
      success: false,
      message: '发送失败: ' + (err.errMsg || err.message),
      errcode: err.errCode || (err.errMsg && err.errMsg.includes('43101') ? 43101 : null)
    }
  }
}
