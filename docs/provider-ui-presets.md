# 模型 UI 预设依据

日期：2026-10-07。范围：配置字段建议，不构成真实模型接口验收。模型 ID、能力及限制以用户选择的供应商模型为准，预设不联网、不拉模型列表。主协议只有 OpenAI / Anthropic。

| 供应商 | UI 默认协议/端点 | 官方依据与注意事项 |
| --- | --- | --- |
| OpenAI | OpenAI / https://api.openai.com/v1 | [官方 API](https://platform.openai.com/docs/api-reference/introduction)；Organization/Project 可选，请求形式独立于协议 |
| Anthropic | Anthropic / https://api.anthropic.com | [Messages](https://platform.claude.com/docs/en/api/http/messages)；输出上限必填；思考支持情况依模型，adaptive 不使用预算，enabled 预算模式依接口校验 |
| Google | OpenAI / https://generativelanguage.googleapis.com/v1beta/openai/ | [官方兼容接口](https://ai.google.dev/gemini-api/docs/openai)；使用 Gemini Key，思考档位受具体模型约束 |
| xAI | OpenAI / https://api.x.ai/v1 | [REST 推理](https://docs.x.ai/developers/rest-api-reference/inference) |
| DeepSeek | OpenAI / https://api.deepseek.com | [官方集成](https://api-docs.deepseek.com/guides/agent_integrations/opencode)；亦提供 Anthropic 兼容，UI 初始选择 OpenAI，额外参数按具体模型支持 |
| Kimi | OpenAI / https://api.moonshot.cn/v1 | [官方供应商配置](https://moonshotai.github.io/kimi-cli/zh/configuration/providers.html)；中国/国际站 Key 和端点区分，不混用 Coding 订阅端点 |
| ZAI | OpenAI / https://api.z.ai/api/paas/v4/ | [Quick start](https://docs.z.ai/guides/overview/quick-start)；通用 API 与 Coding Plan 区分 |
| Xiaomi | OpenAI / https://api.xiaomimimo.com/v1 | [官方思考内容说明](https://platform.xiaomimimo.com/docs/en-US/usage-guide/passing-back-reasoning_content)；OpenAI/Anthropic 均兼容，UI 默认 OpenAI，思考类型 enabled/disabled |
| Qwen | OpenAI / 用户复制 | [官方兼容说明](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)；端点依区域/工作空间，避免内置过时单一地址 |
| MiniMax | OpenAI / https://api.minimax.io/v1 | [官方 OpenAI 格式](https://platform.minimax.io/docs/api-reference/text-openai-api)；模型 ID/计划与接口能力单独确认 |
| 自定义 | 协议空值，用户选择 OpenAI / Anthropic | 用户填写名称、端点、模型 ID；HTTPS 或本机回环 HTTP，禁止 URL 内凭据，改地址/协议撤销旧 Key |

模型配置、资料、主题与快捷键均自动更新；合法原子回执与失败重试在后续技术与测试方案展开。预设不能代表所有同协议端点支持 Responses、图像或思考；未支持字段不发送。展示名/模型 ID/参数普通变更采用配置版本，供应商/协议/地址改变则撤销旧授权。
