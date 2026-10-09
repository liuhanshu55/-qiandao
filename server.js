/* 弈剑阁 · 每日签到服务器（零依赖，Node.js 内置模块实现）
 *
 * 数据持久化两种模式：
 *   1) 云端模式：设置了 JSONBIN_BIN_ID + JSONBIN_API_KEY 环境变量时，
 *      数据保存在 jsonbin.io（免费云端 JSON 存储），Render 重启也不丢数据；
 *      本地 data.json 仅作为缓存备份。
 *   2) 本地模式：未设置上述变量时，数据只保存在本地 data.json。
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);

const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '';
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';

const DEFAULT_DATA = {
  members: ['李亭', '张伟', '王芳', '刘洋', '陈静', '杨帆', '赵磊'],
  records: {},          // { 'YYYY-MM-DD': { 姓名: 'HH:MM:SS' } }
  specialPeriods: [],   // { id, start, end, requireSignin, note }
  password: 'yijiange'
};

let data = null;

/* ================= 云端持久化（jsonbin.io） ================= */
function jsonbinEnabled() {
  return !!(JSONBIN_BIN_ID && JSONBIN_API_KEY);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonbinRequest(method, binPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.jsonbin.io',
      path: binPath,
      method: method,
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error('HTTP ' + res.statusCode + (raw ? ' ' + raw.slice(0, 160) : '')));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('jsonbin 请求超时')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function readCloud() {
  const r = await jsonbinRequest('GET', '/v3/b/' + JSONBIN_BIN_ID + '/latest');
  return r && r.record ? r.record : null;
}

async function writeCloud() {
  await jsonbinRequest('PUT', '/v3/b/' + JSONBIN_BIN_ID, data);
}

/* ================= 数据加载 / 保存 ================= */
async function loadData() {
  if (jsonbinEnabled()) {
    try {
      const rec = await readCloud();
      if (rec) {
        console.log('[云端] 已从 jsonbin 加载数据');
        return Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_DATA)), rec);
      }
    } catch (e) {
      console.error('[云端] 读取 jsonbin 失败，回退到本地文件：', e.message);
    }
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      console.log('[本地] 已从 data.json 加载数据');
      return Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_DATA)), parsed);
    }
  } catch (e) {
    console.error('[警告] 读取 data.json 失败，使用默认数据：', e.message);
  }
  console.log('[本地] 使用默认初始数据');
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function saveData() {
  // 1) 本地文件作为缓存备份（云端模式下仅作临时缓存）
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('[警告] 写入本地缓存失败：', e.message);
  }

  // 2) 云端持久化（带重试）
  if (!jsonbinEnabled()) return;
  for (let i = 0; i < 3; i++) {
    try {
      await writeCloud();
      return;
    } catch (e) {
      console.error('[云端] 同步 jsonbin 失败（第 ' + (i + 1) + ' 次）：', e.message);
      if (i < 2) await sleep(1000 * (i + 1));
    }
  }
  console.error('[云端] 同步 jsonbin 最终失败，本次修改仅保存在内存与本地缓存中。');
}

/* ================= 日期工具 ================= */
function dateStr(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}
function todayStr() { return dateStr(new Date()); }

function isSigninRequired(ds) {
  for (let i = data.specialPeriods.length - 1; i >= 0; i--) {
    const p = data.specialPeriods[i];
    if (p.start <= ds && ds <= p.end) return p.requireSignin;
  }
  return true;
}

/* ================= 网络地址 ================= */
function getLanIPv4() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

/* ================= HTTP 辅助 ================= */
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function checkAdmin(pwd) {
  return typeof pwd === 'string' && pwd === data.password;
}

/* ================= API 处理 ================= */
function apiState(req, res) {
  // 用请求的 Host 头构造访问地址，本地/线上都能正确生成分享链接
  const host = req.headers.host || ('localhost:' + PORT);
  const proto = (req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
  json(res, 200, {
    ok: true,
    members: data.members,
    records: data.records,
    specialPeriods: data.specialPeriods,
    todayRequired: isSigninRequired(todayStr()),
    serverUrl: proto + '://' + host,
    serverIps: getLanIPv4(),
    port: PORT
  });
}

async function apiCheckin(req, res) {
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) return json(res, 400, { ok: false, error: '缺少姓名' });
  if (data.members.indexOf(name) === -1) {
    return json(res, 400, { ok: false, error: '该姓名不在成员名单中' });
  }
  const ds = todayStr();
  if (!isSigninRequired(ds)) {
    return json(res, 200, { ok: false, error: '今日为免签到时段，无需签到' });
  }
  if (!data.records[ds]) data.records[ds] = {};
  if (data.records[ds][name]) {
    return json(res, 200, { ok: true, already: true, name, time: data.records[ds][name] });
  }
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  data.records[ds][name] = time;
  await saveData();
  json(res, 200, { ok: true, already: false, name, time });
}

async function apiLogin(req, res) {
  const body = await readBody(req);
  const ok = checkAdmin(body.password);
  json(res, 200, { ok });
}

async function apiMember(req, res) {
  const body = await readBody(req);
  if (!checkAdmin(body.password)) return json(res, 403, { ok: false, error: '密码错误' });
  const action = body.action;
  const name = String(body.name || '').trim();
  if (action === 'add') {
    if (!name) return json(res, 400, { ok: false, error: '缺少姓名' });
    if (data.members.indexOf(name) >= 0) return json(res, 400, { ok: false, error: '该成员已存在' });
    data.members.push(name);
    await saveData();
    return json(res, 200, { ok: true });
  }
  if (action === 'remove') {
    const idx = data.members.indexOf(name);
    if (idx === -1) return json(res, 400, { ok: false, error: '该成员不存在' });
    data.members.splice(idx, 1);
    await saveData();
    return json(res, 200, { ok: true });
  }
  json(res, 400, { ok: false, error: '未知操作' });
}

async function apiPeriod(req, res) {
  const body = await readBody(req);
  if (!checkAdmin(body.password)) return json(res, 403, { ok: false, error: '密码错误' });
  const action = body.action;
  if (action === 'add') {
    const start = String(body.start || '');
    const end = String(body.end || '');
    const requireSignin = body.requireSignin !== false;
    const note = String(body.note || '').trim();
    if (!start || !end) return json(res, 400, { ok: false, error: '缺少日期' });
    if (start > end) return json(res, 400, { ok: false, error: '开始日期不能晚于结束日期' });
    data.specialPeriods.push({ id: Date.now(), start, end, requireSignin, note });
    await saveData();
    return json(res, 200, { ok: true });
  }
  if (action === 'remove') {
    const id = Number(body.id);
    data.specialPeriods = data.specialPeriods.filter((p) => p.id !== id);
    await saveData();
    return json(res, 200, { ok: true });
  }
  json(res, 400, { ok: false, error: '未知操作' });
}

async function apiPassword(req, res) {
  const body = await readBody(req);
  if (!checkAdmin(body.password)) return json(res, 403, { ok: false, error: '密码错误' });
  const np = String(body.newPassword || '').trim();
  if (!np) return json(res, 400, { ok: false, error: '新密码不能为空' });
  data.password = np;
  await saveData();
  json(res, 200, { ok: true });
}

async function apiReset(req, res) {
  const body = await readBody(req);
  if (!checkAdmin(body.password)) return json(res, 403, { ok: false, error: '密码错误' });
  data.records = {};
  await saveData();
  json(res, 200, { ok: true });
}

/* ================= 静态文件 ================= */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(res, pathname) {
  let filePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  filePath = decodeURIComponent(filePath);
  const full = path.normalize(path.join(ROOT, filePath));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(buf);
  });
}

/* ================= 路由 ================= */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/state' && req.method === 'GET') return apiState(req, res);
  if (pathname === '/api/checkin' && req.method === 'POST') return apiCheckin(req, res);
  if (pathname === '/api/login' && req.method === 'POST') return apiLogin(req, res);
  if (pathname === '/api/member' && req.method === 'POST') return apiMember(req, res);
  if (pathname === '/api/period' && req.method === 'POST') return apiPeriod(req, res);
  if (pathname === '/api/password' && req.method === 'POST') return apiPassword(req, res);
  if (pathname === '/api/reset' && req.method === 'POST') return apiReset(req, res);

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, pathname);

  json(res, 404, { ok: false, error: 'Not Found' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，请改用其它端口，例如：node server.js 8080');
  } else {
    console.error('服务器启动失败：', err.message);
  }
  process.exit(1);
});

/* ================= 启动 ================= */
async function main() {
  data = await loadData();

  server.listen(PORT, '0.0.0.0', () => {
    const ips = getLanIPv4();
    console.log('');
    console.log('==============================================');
    console.log('  弈剑阁 · 每日签到服务器已启动');
    console.log('==============================================');
    console.log('  本机访问：  http://localhost:' + PORT);
    ips.forEach((ip) => console.log('  局域网访问： http://' + ip + ':' + PORT));
    console.log('----------------------------------------------');
    if (jsonbinEnabled()) {
      console.log('  数据存储： jsonbin.io（云端持久化，重启不丢数据）');
    } else {
      console.log('  数据存储： 本地 data.json（重启/重新部署会丢失，');
      console.log('             云端部署请务必配置 JSONBIN_* 环境变量）');
    }
    console.log('  默认管理密码： yijiange（登录「管理」后修改）');
    console.log('  按 Ctrl + C 停止服务器。');
    console.log('==============================================');
    console.log('');
  });
}

main();
