# 弈剑阁 · 每日签到系统

面向武术协会的多人签到系统。支持**局域网使用**（管理员电脑运行）和**在线使用**（部署到 Render，同学直接打开网址）。

## 文件说明

| 文件 | 作用 |
|------|------|
| `server.js` | Node.js 服务器（零依赖，内置 HTTP + API + 数据持久化） |
| `index.html` | 网页前端（签到 / 统计 / 管理） |
| `package.json` | Node 项目描述（Render 据此识别） |
| `data.json` | 数据文件（本地缓存；云端模式下来自 jsonbin） |
| `启动服务器.bat` | Windows 双击一键启动（会自动打开浏览器） |
| `签到页面.html` | 旧的单机版（仅本机数据），可忽略 |
| `*.jpg` | 社团宣传图（3D 旋转背景） |

## 功能清单

1. 每日签到（每天自动刷新），点击弹出「你已签到成功」
2. 单日缺席统计（可按日期查询未签到姓名）
3. 当日未签到提醒（附「你当日还未签到哦」，可一键复制发群）
4. 每周大统计（公开所有人本周签到次数）
5. 管理端：调整特殊时段是否需要签到、加入/移除成员、改密码
6. 社团图片 3D 旋转背景
7. 每周全勤自动鼓励（「你很棒！」等）

## 默认管理密码

```
yijiange
```

登录「管理」页后请务必修改。

---

## 方式一：局域网使用（管理员电脑运行）

1. 双击 `启动服务器.bat`（会自动打开浏览器到签到页），保持黑色窗口不关闭。
2. 管理员在「管理」页登录，把默认成员改成真实名单。
3. 把黑窗口里显示的「局域网访问」地址发给同学。
4. 同学手机连**同一 WiFi**，打开该地址 → 选姓名 → 签到。

> 手机打不开通常是 Windows 防火墙拦截，需放行 Node.js 或 3000 端口。

## 方式二：在线使用（GitHub + Render 免费部署）

Render 免费版磁盘是临时的（重启/重新部署会清空 `data.json`），所以线上部署需要配合免费的 **jsonbin.io** 做云端数据存储。

### 第 1 步：把代码传到 GitHub

1. 电脑安装 [GitHub Desktop](https://desktop.github.com/) 并登录（或安装 Git）。
2. `File → Add local repository` 选中本文件夹 → 点 `Publish repository` 推送到 GitHub（建议设 **Private**）。

### 第 2 步：注册 jsonbin 并创建数据仓库

1. 打开 [jsonbin.io](https://jsonbin.io/) 注册（可用 GitHub 登录）。
2. 新建一个 Bin，随便填初始 JSON，例如：
   ```json
   { "members": [], "records": {}, "specialPeriods": [], "password": "yijiange" }
   ```
3. 记下两样东西：
   - **Bin ID**（新建后网址或详情里的那串 ID）
   - **API Key**（右上角 `API Keys → X-Master-Key`）

### 第 3 步：部署到 Render

1. 打开 [render.com](https://render.com/) 用 GitHub 账号注册登录。
2. 点 `New + → Web Service`，选择你刚推送的仓库。
3. 填写配置：
   - **Name**：随意，如 `yijiange-signin`
   - **Runtime**：Node
   - **Build Command**：`npm install`
   - **Start Command**：`node server.js`
   - **Instance Type**：选 Free
4. 在 **Environment Variables** 添加两个变量：
   - `JSONBIN_BIN_ID` = 第 2 步记下的 Bin ID
   - `JSONBIN_API_KEY` = 第 2 步记下的 API Key
5. 点 `Create Web Service`，等待部署完成（约 1 分钟）。
6. 部署完成后，Render 会给你一个网址（形如 `https://yijiange-signin.onrender.com`）。

### 第 4 步：使用

- 把 Render 给的网址发给同学，**直接打开就是签到页面**，数据多人实时共享。
- 管理员打开「管理」页，用密码 `yijiange` 登录，改成真实名单并修改密码。

> 免费版 Render 在 15 分钟无人访问后会休眠，下次打开约需等 30~60 秒；建议每次训练前，管理员先自己打开一次"预热"。

---

## 注意事项

- 数据自动保存在 jsonbin（云端模式）或 `data.json`（本地模式），请勿随意删除。
- 本地模式重启后数据仍在；云端模式即使 Render 重启/重新部署也不丢数据。
