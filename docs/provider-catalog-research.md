# 供应商目录与图标补充调研

日期：2026-10-07；用于产品 v0.5 / UI v0.6 修订，不是技术方案或真实接口验收。

用户要求：预设供应商配置只显示 API Key 与模型列表，列表覆盖供应商全部可用模型；自定义供应商保留接口字段。新增腾讯、字节跳动，并为每家供应商提供对应彩色 Logo。

## 目录范围与事实边界

安装版须获取所选供应商、默认端点与 Key 权限范围内的完整目录，区分文本输出和图像生成能力，处理全部分页。不得用若干精选型号、第一分页、名称猜测或静态示例充当完整目录。公开目录与 Key 可用范围不同；供应商不提供授权目录接口时，可以展示已核对的官方完整目录，但权限未知的条目必须标注「权限待验证」，不能宣称可调用。用户主动测试单个模型不能证明整份目录均可用。

火山方舟的 [模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=zh) 是公开目录；[API Key 文档](https://docs.volcengine.com/docs/ark/api-key?lang=zh) 描述项目/模型权限；[在线推理](https://docs.volcengine.com/docs/ark/online-inference-standard?lang=zh) 区分公共 Model ID 与用户部署端点。由此推断，公开列表不能直接作为某 Key 的授权全集，也不能假设各供应商都有通用 GET /models。技术阶段需要逐供应商核验元数据发现能力；该核验尚未执行，不能宣告完整目录已实现。

选择供应商并输入 Key 是安装版按该供应商发现模型元数据的触发条件。只访问用户选择的供应商，无平台代理、账号服务或额外云 AccessKey/SecretKey。目录发现不发生成请求；失败区分认证、网络、权限、接口不支持，保留草稿，允许重试/取消。刷新不删除作者已保存模型；目录中已停用/不可用型号明确提示。

## 新增预设端点

| 供应商 | 默认端点及依据 | 范围 |
| --- | --- | --- |
| 腾讯 | https://api.hunyuan.cloud.tencent.com/v1；[OpenAI 兼容文档](https://cloud.tencent.com/document/product/1729/111007) | 使用混元 API Key；不要求用户配置腾讯云旧式签名鉴权。另有 [Anthropic 兼容](https://cloud.tencent.com/document/product/1729/127293)，主预设采用 OpenAI |
| 字节跳动 | https://ark.cn-beijing.volces.com/api/v3；[官方快速开始](https://docs.volcengine.com/docs/ark/quick-start?lang=zh) | 北京区域方舟 API Key；目录与模型/端点权限需分别核验 |
| 阿里巴巴 | https://dashscope.aliyuncs.com/compatible-mode/v1；[官方区域端点](https://help.aliyun.com/en/model-studio/base-url) | 北京默认预设；[Key 按区域/工作空间区分](https://help.aliyun.cn/zh/model-studio/get-api-key)，其他区域/工作空间使用自定义供应商，不静默混用 Key |

其他官方依据见 [模型预设](provider-ui-presets.md)。模型/思考/图像能力按实际模型信息与原 Web 能力解析器判断，图像输入不等于图像输出。

## Logo 来源

采用 [LobeHub Icons](https://github.com/lobehub/lobe-icons) 的 npm 官方注册表包 @lobehub/icons-static-svg@1.95.1 中静态 SVG。仅解包资产，没有安装或运行包代码。包版本、完整性值、原始/处理后 SHA-256 与逐 Logo 映射见 `design/provider-logo-provenance.json`；MIT 原文随本地资产保存。已有彩色 SVG 保留原色；单色图形按原形着色，色值是桌面预览处理，不声明为官方品牌标准色。

月之暗面对应 Moonshot 图形、阿里巴巴对应 Alibaba、腾讯对应 Tencent、字节跳动对应 ByteDance，不以模型家族图标替代供应商主体。用户指定的「质谱」文案按原文保留，对应 Zhipu/ZAI 图形。Logo 在本地提供，不从 CDN 请求。

## 原型证据限制

`design/provider-catalog-preview.js` 是有意使用 demo ID 和「示例」名称的布局夹具；既不是供应商真实型号表，也不是能力兼容表。默认思考档位仅用于演示按能力出现/消失。实际安装版必须替换为经核验的完整目录和原 Web 思考能力契约；此阶段没有使用真实 Key、发现目录或产生费用。
