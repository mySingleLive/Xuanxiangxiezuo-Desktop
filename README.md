# 玄香印 · 桌面版

独立开源项目 **Xuanxiangxiezuo-Desktop**，目标仓库：<https://github.com/mySingleLive/Xuanxiangxiezuo-Desktop>。

基于玄香印 Web 版，使用 Electron、Next.js、React、TypeScript 与原有 UI 技术栈构建纯本地桌面创作应用。作品保存在作者选定的本地目录；AI 只使用作者配置的模型接口与密钥。

## 当前进度

目前处于设计阶段，尚未实现、打包或完成桌面验收。不能将设计原型视为可用 App。

交付严格按以下顺序进行：

1. [调研文档](docs/01-research.md)
2. [产品设计](docs/02-product-design.md) → 子代理审核
3. UI 设计 → 子代理审核 → 用户审核
4. 技术方案 → 子代理审核
5. 测试用例（含真实桌面用户场景）→ 子代理审核
6. TDD 实现 → 子代理 code review
7. 执行全部测试用例与真实桌面验收
8. 测试通过后总结

阶段状态、审核记录与继续工作的条件见 [交付进度](docs/00-delivery-status.md)。

## 来源

Web 基线：`mySingleLive/xuanxiang.ink`，提交 `55a62560dc4818143469abb12717a23c752ade8c`。桌面版保持独立 Git 历史、构建和发布，不依赖原仓库所在目录。

开源许可证拟采用 MIT；正式源码发布时保留第三方许可证、字体声明与来源记录。此阶段未替原 Web 仓库添加许可证。

