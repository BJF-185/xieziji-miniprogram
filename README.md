# 写字机小程序

一个基于微信云开发的预约书写小程序，提供用户下单、支付、订单管理、订阅消息通知等功能，配有 Web 管理后台。

## 技术栈

- **前端**：微信小程序原生（WXML + WXSS + JS）
- **后端**：微信云开发（云函数 + 云数据库 + 云存储）
- **管理后台**：原生 HTML + JS，部署到云开发静态托管
- **CI**：GitHub

## 仓库结构

```
.
├── miniprogram/        # 小程序前端代码
│   ├── pages/          # 页面（index/order/payment/my/admin 等）
│   ├── images/         # 图片资源
│   ├── config/         # 配置（订阅消息模板 ID 等）
│   └── app.js/.json/.wxss
├── cloudfunctions/     # 云函数
│   ├── createOrder/        # 创建/更新订单
│   ├── getOrders/          # 查询订单
│   ├── updateOrderStatus/  # 管理员改状态 + 通知
│   ├── sendNotify/         # 发送订阅消息（独立云函数拿到 access_token）
│   └── webAdmin/           # 供网页后台 HTTP 调用的管理接口
├── web/                # 网页管理后台
│   ├── index.html
│   ├── login.html
│   └── app.js
├── cloudbaserc.json    # 云开发环境配置
├── project.config.json # 微信开发者工具项目配置
└── 部署说明.md         # 完整部署步骤
```

## 团队工作流

我们是一个 2-3 人小团队，使用**最简分支策略 + 共享一个云环境**。

### 分支

| 分支 | 用途 | 谁可以 push |
|---|---|---|
| `main` | 稳定代码，线上运行 | ❌ 只能通过 PR 合并 |
| `dev` | 日常集成，2-3 人的功能汇合地 | ❌ 只能通过 PR 合并 |
| `feature/*` | 个人功能分支 | ✅ 自己的 |
| `fix/*` | 个人修复分支 | ✅ 自己的 |

### 日常工作流

```bash
# 1. 每天开工前
git checkout dev
git pull origin dev
git checkout -b feature/你的功能名

# 2. 在自己分支上开发
#    微信开发者工具打开本仓库，本地预览

# 3. 完成功能，提交
git add .
git commit -m "feat: 简述本次改动"
git push origin feature/你的功能名

# 4. GitHub 上提 PR：feature/你的功能名 → dev
#    至少 1 人 review → approve → 你点 Merge

# 5. 功能累积到 dev 后，主负责人在 GitHub 上提 PR：dev → main
#    另一个人 review → 合并

# 6. 合并到 main 后，**PR 作者**统一部署云函数（避免多人同时上传覆盖）
```

### 共享云环境的协调

我们共用一个云环境 `cloud1-d3gd4qlyef136776e`，多人同时上传云函数会互相覆盖。规则：

1. **改云函数前先在群里说一声**，避免两人同时改
2. **谁发起的 PR，谁负责部署云函数**（不要让 review 人替你上传）
3. **数据库结构变更**（新增字段、集合）要走 PR，先合并代码再有人统一改数据库
4. **多人同时改一个云函数 → 各自建自己的子目录云函数**（比如 `sendNotify-v2`），合并后再合并

### PR 合并前检查清单

- [ ] 至少 1 人 review 并 approve
- [ ] 本地微信开发者工具预览测试过
- [ ] 改动的云函数在云开发控制台测试通过
- [ ] 没有把 `node_modules`、`.cloudbase` 等加进来（已在 `.gitignore`）
- [ ] PR 描述里写清楚：改了哪些云函数 / 哪些页面 / 是否需要部署

## 本地开发

### 准备

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 微信开发者工具里登录有这个小程序 AppID 权限的微信扫码
3. 微信开发者工具 → 导入项目 → 选本仓库的 `miniprogram/` 目录
4. 项目根目录右键 → 关联云开发环境 `cloud1-d3gd4qlyef136776e`

### 改云函数

1. 在 `cloudfunctions/xxx` 目录里改代码
2. 右键 `cloudfunctions/xxx` 文件夹 → **"上传并部署：云端安装依赖"**
3. 注意：会覆盖线上版本，谨慎

## 部署

参考 [`部署说明.md`](./部署说明.md)

## 订阅消息模板

| 模板 | ID | 用途 |
|---|---|---|
| 顾客下单提醒 | `SXc8H0R7GoG2q2xDJy8C2zCmUlJt_zew8VFYb9EVtA0` | 用户下单成功后推送给管理员 |
| 订单状态提醒 | `H6Z79kT4hj4bXFRb__OasNw4z4aSeXd-mWlycA3cDkA` | 订单完成时推送给用户 |

## 管理后台

- **小程序内**：长按首页底部 Tab「我的」图标进入登录页，密码见 `cloudfunctions/webAdmin/index.js` 里的 `ADMIN_PASSWORD`
- **网页版**：https://cloud1-d3gd4qlyef136776e-1453067705.tcloudbaseapp.com/index.html

## 注意事项

- **管理员密码**目前在 `webAdmin/index.js` 里硬编码（短期可接受，长期建议改云函数配置）
- **AppID、AppSecret**、云环境 ID、订阅消息模板 ID 不算敏感，可以放仓库
- **不要提交** `.cloudbase/` 目录（本地云开发调试配置）
- **遇到云函数报错**，先看云开发控制台 → 云函数 → 日志，不要盲改
