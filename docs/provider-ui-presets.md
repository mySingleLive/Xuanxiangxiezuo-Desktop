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

模型配置、主题与快捷键自动更新；用户资料使用独立草稿，点击保存后更新；合法原子回执与失败重试在后续技术与测试方案展开。预设不能代表所有同协议端点支持 Responses、图像或思考；未支持字段不发送。展示名/模型 ID/参数普通变更采用配置版本，供应商/协议/地址改变则撤销旧授权。

## v0.5 分类与测试确认

文本与文生图独立分组、默认用途与选择隔离。连接测试确认面板按分类显示短文本或文生图提示词/1张图片；当前仅设计模拟，不作真实兼容性证明。图像输入不等于图像输出：[Claude 模型概览](https://platform.claude.com/docs/en/models/overview)明确区分输入图像与文本输出；文生图的请求及支持参数按供应商实际图像接口验证，例如 [OpenAI Images 官方参考](https://developers.openai.com/api/reference/resources/images)。正式技术阶段需逐模型核验图像接口与参数支持，不能把文本兼容端点/协议标签视为文生图兼容性证据。此稿保留既有属性清单，接口相关参数随实际模型支持呈现。
