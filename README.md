# 玄香印 · 桌面版

独立开源项目 **Xuanxiangxiezuo-Desktop**，目标仓库：<https://github.com/mySingleLive/Xuanxiangxiezuo-Desktop>。

基于玄香印 Web 版，使用 Electron、Next.js、React、TypeScript 与原有 UI 技术栈构建纯本地桌面创作应用。作品保存在作者选定的本地目录；AI 只使用作者配置的模型接口与密钥。

## 当前进度

技术方案与531条正式测试用例已通过独立审核，进入TDD实现阶段。尚未打包或完成桌面验收，不能将设计原型视为可用App。

交付严格按以下顺序进行：

1. [调研文档](docs/01-research.md)及[供应商目录补充](docs/provider-catalog-research.md)
2. [产品设计](docs/02-product-design.md) → [子代理审核通过](docs/reviews/21-product-settings-shell-review.md)
3. [UI 设计](docs/03-ui-design.md) → [子代理复审通过](docs/reviews/22-ui-settings-shell-review.md) → 用户已批准（2026-10-07），[实施边界](docs/implementation-boundaries.md)
4. [技术方案](docs/04-technical-design.md) → [独立审核通过](docs/reviews/23-technical-design-review.md)
5. [测试用例](docs/05-test-cases.md)（107桌面 + 424业务）→ [独立审核通过](docs/reviews/25-test-cases-review.md)
6. TDD 实现 → 子代理 code review
7. 执行全部测试用例与真实桌面验收
8. 测试通过后总结

阶段状态、审核记录与继续工作的条件见 [交付进度](docs/00-delivery-status.md)。

## 查看 UI 设计稿

[交互稿源码](design/desktop-preview.html)包含两平台、两套色板与三种主题模式、十三个页面及异常状态；[截图与检查记录](design/preview-verification.md)用于复核。所有数据均为内存演示，请勿输入真实 Key。UI v0.13 设置为纯左右结构：标题放在左导航顶部，关闭按钮在右内容右上；去掉重复分类大标题及跟随系统示意图的棕色圆形装饰。内容滚动区域避开固定关闭/状态区域；保留即时反馈、失败重试和原有子编辑行为。本版23项定向界面检查通过，6张截图。其他原生窗口、系统目录选择和真实模型等状态见交付进度。

在仓库根目录启动仅用于设计审核的静态预览：

```sh
python3 -m http.server 4187 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:4187/design/desktop-preview.html>；默认在顶部显示调试工具栏（平台、色板、页面、异常状态、AI门控示例），按 Alt+Shift+P 切换显隐；`?review=0` 隐藏工具栏。此临时预览服务不是最终 App 的运行方案，最终桌面版无需部署服务端。

原型按键规则检查：`node --test design/check-shortcut-keys.cjs`。

## 来源

Web 基线：`mySingleLive/xuanxiang.ink`，提交 `55a62560dc4818143469abb12717a23c752ade8c`。桌面版保持独立 Git 历史、构建和发布，不依赖原仓库所在目录。

开源许可证为 [MIT](LICENSE)，第三方资源见 [来源与许可声明](THIRD_PARTY_NOTICES.md)。此阶段未替原 Web 仓库添加许可证。
