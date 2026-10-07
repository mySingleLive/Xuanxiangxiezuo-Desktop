# 本地核心第一批 TDD 证据

范围：真实 PGlite/Prisma 事务适配与迁移、受信数据库上下文、原正文提交服务、原子版本设置、最终模型请求授权、主进程模型仓库。`core-latest.json` 记录源文件散列、基线、Node/系统和时间；`core-latest.tap` 当前51项通过。四批独立审核见27–30。

RED保留真实行为失败。初期设置测试误写DESK-S05，现已纠正为DESK-S08（自动持久化）；原RED日志保留原始标签，不能据此认为S05滚动验收已执行。原正文首次RED仅新增用量快照字段失败，已有两项正文行为当时已通过。

SecretProtection与模型网络使用隔离替身，数据库与文件系统用真实本机引擎/临时目录。没有真实Key或用户作品。全部日志中的临时路径与工作区路径已脱敏。

这51项是实现层证据，不是531条正式用例的通过回执。Electron系统加密、双平台安装包、原生菜单/目录、真实工作台操作与真实模型调用仍待后续验收。

复现：Node24，`npm ci --ignore-scripts`，`npm run generate`，`npm run generate:test`，`npm run test:core:evidence`，`npm run typecheck:foundation`。完整应用typecheck仍有平台认证导入待替换，App构建入口尚在接入。
