# cf-owntracks

cf-owntracks 是一个基于 Cloudflare Workers 的位置追踪服务器实现，受 [OwnTracks](https://owntracks.org/) 项目启发。相比原始的 OwnTracks 需要自建服务器，本项目利用 Cloudflare Workers 的优势，提供了一个低成本、易部署，数据高可用且高性能的替代方案。

## 特性

- 🚀 基于 Cloudflare Workers，无需自建服务器
- 💾 使用 R2 存储位置数据，成本低廉
- 🔒 内置基本认证（Basic Auth）保护
- ⚡ 全球边缘网络分发，低延迟
- 📱 完全兼容 OwnTracks 客户端
- 🔍 支持历史位置查询
- 📍 支持实时位置更新

## 快速开始

### 前置要求

- Cloudflare 账号
- Node.js 16+
- npm 或 yarn
- wrangler CLI

### 安装

1. 克隆仓库： 

```bash
bash
git clone https://github.com/yourusername/cf-owntracks.git
cd cf-owntracks
```

2. 安装依赖：

```bash
npm install
```

3. 配置 wrangler.toml:

```toml
name = "owntracker-worker"
main = "src/index.ts"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "your-bucket-name"

[[kv_namespaces]]
binding = "LAST_LOCATIONS"
id = "your-kv-namespace-id"

[vars]
BASIC_AUTH_USER = "your-username"
BASIC_AUTH_PASS = "your-password"
```

4. 部署：

```bash
npm run deploy
```

## API 端点

### 位置上报
- `POST /`
  - 接收 OwnTracks 客户端的位置更新

### 查询接口
- `GET /api/0/locations` - 查询历史位置
- `GET /api/0/last` - 获取最新位置
- `GET /api/0/list` - 列出用户和设备
- `GET /api/0/version` - 获取版本信息

## 客户端配置

1. 下载并安装 [OwnTracks](https://owntracks.org/) 客户端
2. 配置连接信息：
   - Mode: HTTP
   - URL: 你的 Worker URL
   - Authentication: Basic
   - Username: 设置的用户名
   - Password: 设置的密码

## 成本优势

- Cloudflare Workers: 每天免费 100,000 请求
- R2 存储：每月前 10GB 免费
- KV 存储：免费额度足够一般使用

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

感谢 [OwnTracks](https://owntracks.org/) 项目。