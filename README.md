# API Usage Monitor for Flexbar

[English](README.md) | [简体中文](README.zh-CN.md)

Keep your AI API balances and month-to-date costs visible on your Flexbar. Each key can display a different provider, so DeepSeek, Kimi, ChatGPT, Claude, and custom JSON APIs can sit side by side on the same page.

## Features

- Five provider types: DeepSeek, Kimi, ChatGPT, Claude, and Custom
- Per-key provider selection: each key chooses which API it displays
- Multiple keys and multiple providers on one page
- Brand default colors: DeepSeek #4D6BFA, Kimi #00B2FF, ChatGPT #10A37F, Claude #D97757, Custom #424242
- Native FlexDesigner styling for key width, color, and font size
- Balance mode for scalar values and cost mode for arrays
- Custom JSON provider with configurable endpoint, auth, query, value path, value field, and sum field
- Credentials stay in the local config.json
- Configurable polling interval

## Supported providers

| Provider | Default endpoint | What it shows | Notes |
| --- | --- | --- | --- |
| DeepSeek | https://api.deepseek.com/user/balance | Account balance | Defaults to CNY |
| Kimi | https://api.moonshot.cn/v1/users/me/balance | Account balance | CNY |
| ChatGPT | https://api.openai.com/v1/organization/costs | Month-to-date organization cost | Requires an organization Admin key |
| Claude | https://api.anthropic.com/v1/organizations/cost_report | Month-to-date organization cost | Requires an Admin key; sends anthropic-version |
| Custom | User-defined | Any JSON number | Configure endpoint and extraction rules |

## How it works

The plugin reads its global configuration, polls the selected provider endpoint at the configured interval, extracts a numeric value, and writes the result to the key title with the FlexDesigner draw API. Every key has its own provider selection, so keys update independently.

DeepSeek and Kimi expose balance endpoints. ChatGPT and Claude use organization cost APIs that require an admin key with organization access. The Custom provider can call any JSON endpoint and either read a single value or recursively sum a field such as amount.value.

API keys are stored only in the local config.json. Network requests go only to the endpoint configured for the selected provider.

## Installation

Install from FlexGate, or download the .flexplugin from the latest release and import it in FlexDesigner.

From source:

    npm install
    npm run build

Then import dist/api-usage-monitor.flexplugin, or link the plugin folder with FlexCLI.

## Configuration

### Global settings

| Setting | Default | Description |
| --- | --- | --- |
| Refresh interval | 30 s | How often provider APIs are polled |
| Provider enabled | on | Enable or disable a provider |
| Display name | Provider name | Label used in key titles |
| API Key | empty | Provider credential |
| Currency filter | CNY or empty | For balance arrays, select the entry with this currency |
| Unit | CNY or USD | Suffix shown after the value |

Built-in providers use fixed endpoint, authentication, and parsing defaults. Only the Custom provider exposes these fields:

| Setting | Description |
| --- | --- |
| Endpoint | JSON endpoint URL |
| Auth type | Bearer, x-api-key, or a custom header |
| Header name and prefix | Used when Auth type is custom |
| Query | Query string; supports {monthStart}, {monthStartISO}, {now}, and {nowISO} |
| JSON value path | Dot path to a number or object; supports array indexes like [0] |
| Value field | Field to read from the matched object |
| Sum field | Recursively sum this field across the response |

### Per key

| Setting | Default | Description |
| --- | --- | --- |
| API provider | DeepSeek | Which API this key displays |
| Display name | Provider name | Prefix shown before the value |

Key width, color, and font size are controlled by the native FlexDesigner key style editor. When the provider changes, the plugin applies the brand default color once; you can override it afterwards.

## Requirements and notes

- Node.js 20 or newer for development
- FlexDesigner 1.0 or newer
- ChatGPT needs an organization Admin key
- Claude needs an Admin key; the plugin adds anthropic-version: 2023-06-01
- API keys are local only and are never sent anywhere except the configured provider endpoint

## Development

    npm install
    npm run build
    npm run dev

npm run dev uses FlexCLI and requires FlexDesigner to be running. To build the installable archive:

    npm run pack

Plugin layout:

    com.nanqing.apiusage.plugin/
      manifest.json
      config.json
      backend/plugin.cjs
      ui/global_config.vue
      ui/monitor.vue

## License

MIT
