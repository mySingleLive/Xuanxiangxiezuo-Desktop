# 第三方资源与来源

项目自有源码、文档和设计采用 [MIT](LICENSE)。第三方资源依各自许可证发布，不能用项目许可证替换。

| 资源 | 来源 | 许可证与位置 |
| --- | --- | --- |
| Noto Sans SC | 上游 `public/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz`，预览解压使用 | SIL Open Font License；`design/assets/NotoSansSC-LICENSE.txt` |
| Lucide 图标 | 本机随工作区工具提供的 `lucide` 包，UMD 版，仅为离线设计预览 | ISC；`design/assets/Lucide-LICENSE.txt` |
| 供应商 Logo | [LobeHub Icons](https://github.com/lobehub/lobe-icons)，npm @lobehub/icons-static-svg@1.95.1；静态 SVG，无包代码执行 | MIT；`design/assets/providers/LICENSE.txt`；逐图来源/指纹/着色处理见 `design/provider-logo-provenance.json`，Logo 商标仍属各供应商 |
| 温玉 SVG 与主题令牌 | `mySingleLive/xuanxiang.ink@55a62560dc4818143469abb12717a23c752ade8c` | 作者现有资产；指纹和复制方法见 `design/assets-provenance.json` |

v0.7 智谱更换为同包内 `zai.svg`，按原图形着色 #3859FF；仅与官网图形交叉核对，未复制官网资产，逐图指纹已更新。

实现阶段新增依赖时扩展声明，并保存对应许可证。上游仓库本身的许可证不因本项目的许可证而改变。
