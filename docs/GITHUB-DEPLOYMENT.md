# Shopoll GitHub one-click deployment

完成一次首次绑定后，同事不需要在自己的电脑安装 Node.js、Shopify CLI、Railway CLI 或复制 `.env`。日常发布只需要在 GitHub 网页打开 **Actions > Deploy Shopoll > Run workflow**。

## 一次性准备

### 1. GitHub 仓库和权限

本项目源码可以公开，但 Harbor 的生产环境必须只由受控的 GitHub
Environment 管理。邀请负责部署的同事，并保护默认分支；不要提交 `.env`、
Shopify secret、Railway token 或 Klaviyo key。没有仓库写权限或 production
Environment 审批权限的外部贡献者无法读取或使用 production secrets。

本工作流是 Harbor 维护者的发布工具，不是普通电商商家的安装工具。未来托管
版商家会从 Shopify App Store 安装；开源自托管用户则应在自己的 fork 中配置
自己的 Railway、Shopify App 和 secrets。

### 2. Shopify 绑定

1. 在 Shopify Dev Dashboard 创建 single-store custom-distribution App。
2. 在本地运行 `npm run config:link`，选择该 App。
3. 提交 CLI 生成或更新的 production TOML。`client_id` 可以提交，它不是 secret。
4. 在 App 的 **Settings > App Automation Token** 创建 token。
5. Checkout Extension 若需要访问 Shopoll API，在 Dev Dashboard 申请 network access。

App Automation Token 最长有效六个月。到期前应轮换 GitHub secret，确认新 token 生效后再撤销旧 token。

### 3. Railway 基础设施

在一个 Railway project 中创建：

- `Postgres`
- `shopoll-web`，Config as Code 路径设为 `/railway.toml`
- `shopoll-worker`，Config as Code 路径设为 `/railway.worker.toml`

Web 和 Worker 都引用 `${{Postgres.DATABASE_URL}}`，并共享 `.env.example` 中的生产变量。运行时 secrets 只保存在 Railway，不需要复制到 GitHub。

为 production environment 创建 Railway Project Token。该 token 只用于从 GitHub Actions 上传 Web/Worker 代码。

### 4. GitHub production Environment

在 **Settings > Environments > production** 配置以下内容。

Secrets：

| 名称 | 内容 |
| --- | --- |
| `RAILWAY_TOKEN` | Railway production Project Token |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | Shopify Dev Dashboard 生成的 App Automation Token |

Variables：

| 名称 | 内容 |
| --- | --- |
| `RAILWAY_PROJECT_ID` | Railway project ID |
| `RAILWAY_ENVIRONMENT` | 通常为 `production`，也可填写 environment ID |
| `RAILWAY_WEB_SERVICE_ID` | `shopoll-web` service ID |
| `RAILWAY_WORKER_SERVICE_ID` | `shopoll-worker` service ID |
| `SHOPOLL_PUBLIC_URL` | `https://poll.harborinno.com` |
| `SHOPIFY_CONFIG` | production TOML 的配置名；使用默认 `shopify.app.toml` 时留空 |

建议给 `production` Environment 添加 required reviewer。这样同事点运行后，仍需一名授权人员批准才能接触 production secrets。

## 日常一键发布

打开 **Actions > Deploy Shopoll > Run workflow**：

- `deploy_railway=true`：上传并部署 Web 和 Worker，然后检查 `/healthz` 与 `/readyz`。
- `deploy_shopify=true`：部署 App 配置和三个 Shopify extensions。
- `release_shopify=false`：默认只创建未发布版本，先在 Dev Dashboard 检查。
- `release_shopify=true`：立即 release Shopify App 版本。

未发布版本使用 `--no-release`；立即 release 时才使用 `--allow-updates`。两者
不能同时传给 Shopify CLI。工作流不会使用 `--allow-deletes`，也不会启用任何
问卷 placement、Theme block、Checkout block、Klaviyo Flow 或 Web Pixel。

## 第一次部署后的人工检查

1. 从 Shopify Dev Dashboard 将 App 安装到正确店铺。
2. 打开 App Home，使 Shopoll 创建 Harbor 模板和产品映射。
3. 确认七个模板为草稿，所有 placement 都为关闭。
4. 暂不启用 Theme App Embed，不添加 Checkout blocks，不创建 WebPixel record。
5. 确认 `https://poll.harborinno.com/healthz` 和 `/readyz` 正常。

首次基础设施和 Shopify 安装无法安全地完全自动化，因为它们需要选择正确店铺、授权 scopes、配置 DNS 和保存只显示一次的 token。完成这些一次性步骤后，后续版本部署由 GitHub Actions 完成。

## 数据库迁移和回滚

Web 服务在 Railway pre-deploy 阶段运行 Prisma migration，Worker 不会并发执行
migration。应用代码可以在 Railway 中回滚，但数据库不会自动回滚；每个 schema
变更都必须保持与上一版应用兼容，直到旧版不再可能运行。

## 同事电脑需要什么

日常部署只需要浏览器和 GitHub 权限。只有修改代码时才需要 clone：

```powershell
git clone https://github.com/Bean-Harbor/shopoll.git
cd shopoll
npm ci
npm run dev:web
```

本地开发使用 `.env.example` 创建自己的 `.env`，绝不能共享 production secrets。
