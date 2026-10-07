# 玄香印 · 桌面版

独立开源项目 **Xuanxiangxiezuo-Desktop**，目标仓库：<https://github.com/mySingleLive/Xuanxiangxiezuo-Desktop>。

基于玄香印 Web 版，使用 Electron、Next.js、React、TypeScript 与原有 UI 技术栈构建纯本地桌面创作应用。作品保存在作者选定的本地目录；AI 只使用作者配置的模型接口与密钥。

## 当前进度

目前处于设计阶段，尚未实现、打包或完成桌面验收。不能将设计原型视为可用 App。

交付严格按以下顺序进行：

1. [调研文档](docs/01-research.md)及[供应商目录补充](docs/provider-catalog-research.md)
2. [产品设计](docs/02-product-design.md) → [子代理审核通过](docs/reviews/19-product-desktop-interactions-review.md)
3. [UI 设计](docs/03-ui-design.md) → [子代理复审通过](docs/reviews/20-ui-desktop-interactions-review.md) → 等待用户审核
4. 技术方案 → 子代理审核
5. 测试用例（含真实桌面用户场景）→ 子代理审核
6. TDD 实现 → 子代理 code review
7. 执行全部测试用例与真实桌面验收
8. 测试通过后总结

阶段状态、审核记录与继续工作的条件见 [交付进度](docs/00-delivery-status.md)。

## 查看 UI 设计稿

[交互稿源码](design/desktop-preview.html)包含两平台、两套色板与三种主题模式、十三个页面及异常状态；[截图与检查记录](design/preview-verification.md)用于复核。所有数据均为内存演示，请勿输入真实 Key。UI v0.12 将主题移入界面首项；快捷键直接捕获键盘，冲突支持取消、转移绑定与定位命令；设置有外部阴影并支持外点关闭。首次启动按实际任务需要引导模型配置，迁移/父目录先选择目录，两平台菜单关于使用独立面板。本版61项浏览器检查和7项按键规则检查通过，14张截图。原生目录选择、关于窗口、系统快捷键、磁盘持久化与真实模型调用仍待Electron实现与验收。

在仓库根目录启动仅用于设计审核的静态预览：

```sh
python3 -m http.server 4187 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:4187/design/desktop-preview.html>；默认在顶部显示调试工具栏（平台、色板、页面、异常状态、AI门控示例），按 Alt+Shift+P 切换显隐；`?review=0` 隐藏工具栏。此临时预览服务不是最终 App 的运行方案，最终桌面版无需部署服务端。

原型按键规则检查：`node --test design/check-shortcut-keys.cjs`。

## 来源

Web 基线：`mySingleLive/xuanxiang.ink`，提交 `55a62560dc4818143469abb12717a23c752ade8c`。桌面版保持独立 Git 历史、构建和发布，不依赖原仓库所在目录。

开源许可证为 [MIT](LICENSE)，第三方资源见 [来源与许可声明](THIRD_PARTY_NOTICES.md)。此阶段未替原 Web 仓库添加许可证。
