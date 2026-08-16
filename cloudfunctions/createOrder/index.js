const cloud = require('wx-server-sdk')
const AdmZip = require('adm-zip')

cloud.init({ env: 'cloud1-d3gd4qlyef136776e' })
const db = cloud.database()

// 管理员密码（部署后请修改）
const ADMIN_PASSWORD = '123123'

// 订阅消息模板ID（顾客下单提醒）
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
    default:
      return { success: false, message: '未知操作' }
  }
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
 * 中文字符每个算1字，英文单词每个算1字，数字串每个算1字
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

  // 统计数字串
  const numbers = text.match(/[0-9]+/g)
  if (numbers) {
    count += numbers.length
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
  const { orderId, paymentMethod, paymentNote } = event
  
  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }
  
  try {
    const updateRes = await db.collection('orders').doc(orderId).update({
      data: {
        payStatus: 'paid',
        paymentMethod: paymentMethod || '',
        paymentNote: paymentNote || '',
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

    const cancellableStatuses = ['unpaid', 'pending', 'paid']
    if (!cancellableStatuses.includes(order.status) && !cancellableStatuses.includes(order.payStatus)) {
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
 * 发送管理员通知（订阅消息）
 * 顾客下单提醒模板字段映射：
 * thing1 - 联系人姓名
 * thing2 - 商品名称/文件名称
 * amount3 - 订单金额
 * time4 - 下单时间
 */
async function sendAdminNotify(orderData) {
  const adminRes = await db.collection('admin').limit(1).get()
  if (!adminRes.data || adminRes.data.length === 0) {
    console.warn('未找到管理员记录，跳过通知')
    return { success: false, message: '未找到管理员记录' }
  }

  const adminOpenid = adminRes.data[0].openid
  console.log('找到管理员openid:', adminOpenid)

  const now = new Date()
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  try {
    console.log('准备发送订阅消息，模板ID:', ADMIN_NOTIFY_TEMPLATE_ID)
    console.log('消息数据:', {
      thing1: orderData.name,
      thing2: orderData.fileName.substring(0, 20),
      amount3: orderData.price.toFixed(2),
      time4: timeStr
    })
    
    const result = await cloud.openapi.subscribeMessage.send({
      touser: adminOpenid,
      templateId: ADMIN_NOTIFY_TEMPLATE_ID,
      page: 'pages/admin/admin',
      data: {
        thing1: { value: orderData.name },
        thing2: { value: orderData.fileName.substring(0, 20) },
        amount3: { value: orderData.price.toFixed(2) },
        time4: { value: timeStr }
      }
    })
    console.log('订阅消息发送成功:', result)
    return { success: true, message: '通知发送成功' }
  } catch (err) {
    console.error('发送订阅消息失败:', err)
    return { success: false, message: '发送失败: ' + err.message, error: err }
  }
}
