# Flexbar API 用量监控

[English](README.md) | [简体中文](README.zh-CN.md)

在 Flexbar 上实时查看 AI API 余额和当月费用。每个按键可以独立选择要显示的提供商，DeepSeek、Kimi、ChatGPT、Claude 和自定义 JSON API 可以并排显示在同一页。

## 功能

- 五种提供商：DeepSeek、Kimi、ChatGPT、Claude、Custom
- 每个按键独立选择要显示的 API
- 同一页面可放置多个按键，分别显示不同提供商
- 内置品牌默认色：DeepSeek #4D6BFA、Kimi #00B2FF、ChatGPT #10A37F、Claude #D97757、Custom #424242
- 按键宽度、颜色、字号使用 FlexDesigner 原生按键样式
- 支持余额数值和费用数组两种模式
- Custom 支持自定义接口、认证方式、查询参数、JSON 取值路径、取值字段和汇总字段
- API Key 只保存在本地 config.json
- 可配置刷新间隔

## 支持的提供商

| 提供商 | 默认接口 | 显示内容 | 说明 |
| --- | --- | --- | --- |
| DeepSeek | https://api.deepseek.com/user/balance | 账户余额 | 默认筛选 CNY |
| Kimi | https://api.moonshot.cn/v1/users/me/balance | 账户余额 | CNY |
| ChatGPT | https://api.openai.com/v1/organization/costs | 当月组织费用 | 需要组织 Admin Key |
| Claude | https://api.anthropic.com/v1/organizations/cost_report | 当月组织费用 | 需要 Admin Key，自动附加 anthropic-version |
| Custom | 自定义 | 任意 JSON 数值 | 自行配置接口和取值规则 |

## 工作原理

插件读取全局配置，按刷新间隔轮询所选提供商的接口，提取数值，并通过 FlexDesigner 的绘制 API 写入按键标题。每个按键都有自己的提供商选择，因此各按键独立更新。

DeepSeek 和 Kimi 使用余额接口。ChatGPT 和 Claude 使用组织费用接口，需要具有组织权限的 Admin Key。Custom 可以调用任意 JSON 接口，支持读取单个数值，或递归汇总某个字段（如 amount.value）。

API Key 只保存在本地 config.json。网络请求只会发送到所选提供商配置的接口。

## 安装

从 FlexGate 安装，或从最新 Release 下载 .flexplugin 后在 FlexDesigner 中导入。

从源码构建：

    npm install
    npm run build

然后导入 dist/api-usage-monitor.flexplugin，或使用 FlexCLI 链接插件目录。

## 配置

### 全局设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| 刷新间隔 | 30 秒 | 轮询提供商接口的频率 |
| 提供商启用 | 开 | 全局启用或禁用某个提供商 |
| 显示名称 | 提供商名称 | 按键标题中的前缀 |
| API Key | 空 | 提供商密钥 |
| 货币筛选 | CNY 或空 | 余额数组中选择指定货币的条目 |
| 单位 | CNY 或 USD | 数值后的单位 |

内置提供商使用固定的接口地址、认证方式和解析规则。只有 Custom 会显示以下字段：

| 设置 | 说明 |
| --- | --- |
| 接口地址 | JSON 接口 URL |
| 认证方式 | Bearer、x-api-key 或自定义 Header |
| Header 名称和前缀 | 认证方式为自定义时使用 |
| 查询参数 | 支持 {monthStart}、{monthStartISO}、{now}、{nowISO} |
| JSON 取值路径 | 指向数值或对象的点路径，支持 [0] 这类数组下标 |
| 取值字段 | 从匹配到的对象中读取的字段 |
| 汇总字段 | 在响应中递归汇总该字段 |

### 按键自定义

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| API 提供商 | DeepSeek | 该按键显示哪个 API |
| 显示名称 | 提供商名称 | 数值前显示的前缀 |

按键宽度、颜色和字号由 FlexDesigner 原生的按键样式编辑器控制。切换提供商时，插件会自动应用一次品牌默认色，之后可以手动覆盖。

## 要求与说明

- 开发需要 Node.js 20 或更高版本
- FlexDesigner 1.0 或更高版本
- ChatGPT 需要组织 Admin Key
- Claude 需要 Admin Key，插件会附加 anthropic-version: 2023-06-01
- API Key 仅保存在本地，除了配置的提供商接口外不会发送到其他地方

## 开发

    npm install
    npm run build
    npm run dev

npm run dev 使用 FlexCLI，需要 FlexDesigner 正在运行。构建可安装的插件包：

    npm run pack

插件目录结构：

    com.nanqing.apiusage.plugin/
      manifest.json
      config.json
      backend/plugin.cjs
      ui/global_config.vue
      ui/monitor.vue

## 许可证

MIT
