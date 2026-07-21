# Teralexi

本地 AI Agent 桌面应用 — 调研、编码、手机端对话、Skills & MCP 扩展、自选 LLM、本地记忆，都在你的机器上完成。

[English](./README.md) · [产品官网](https://www.teralexi.com/)

## 下载安装包

不想从源码构建？请直接从 **[teralexi.com](https://www.teralexi.com/)** 下载 macOS / Windows 安装包。

本仓库用于从源码运行与贡献。

## 演示

Website Agent 流程 — 选择 Agent、规划任务、生成文件并预览结果。更多产品介绍见 [teralexi.com](https://www.teralexi.com/)。

[![观看演示视频](./media/web_4.png)](./media/howto_website_2.mp4)

https://github.com/Naughty-Otters/Teralexi/raw/main/media/howto_website_2.mp4

![选择 Agent 并输入提示](./media/web_1.png)

![Agent 规划并执行任务](./media/web_2.png)

![生成的工作区文件](./media/web_3.png)

![工作区旁的实时预览](./media/web_4.png)

![发布站点预览](./media/web_5.png)

## 功能亮点

- Agent 调研：浏览、收集资料，关键步骤可审批
- 工作区与内置 IDE，变更前可审阅 git diff
- 渠道对话（WhatsApp、Slack、Google、Discord 等）
- Skills & MCP，自定义技能目录：`~/.teralexi/skills/`
- 本地与云端 LLM（Ollama、OpenAI、Anthropic、Gemini 等）
- 本地优先记忆与定时 Agent 任务

## 从源码运行

**环境要求：** Node.js 22+，使用 `npm`。

```bash
npm install
npm run dev
```

`npm run dev` 使用 Electron 热更新。默认加载 `env/.dev.env`，将 `BASE_API` 指向 **公开的 Teralexi 平台**（`https://api.teralexi.com/`），以启用可选云端能力（登录、权益、已登录时的用量指标、支持上传、站点发布、更新检查）。

未登录也可以在 **设置 → LLM** 中使用本地模型（Ollama / llama.cpp）。

### 使用自有后端或纯本地模式

```bash
cp env/.dev.local.env.example env/.env
# 编辑 env/.env 中的 BASE_API（例如 http://localhost:8000），然后：
npm run dev
```

或一次性：

```bash
BASE_API=http://localhost:8000 npm run dev
```

若要在无平台 API 的情况下探索界面，可在覆盖用的 env 中设置 `BASE_API=`。此时云端登录、指标、支持上传、站点发布与应用内更新将不可用。

本地加载顺序：`env/.dev.env` → `env/.env`（覆盖）→ `env/.dev.local.env`（若存在则最高优先）。

平台 API **不在**本仓库中。客户端契约见 [docs/SUBSCRIPTION-INTEGRATION.md](./docs/SUBSCRIPTION-INTEGRATION.md)。

## 隐私与遥测

- Agent 数据主要保存在本机 `~/.teralexi/`（本地优先）。
- 登录平台 API 后，若计划包含 `metrics.write`，可能上报 **模型用量指标**。
- **支持上传** 与 **站点发布** 仅在你主动触发且权益允许时执行。
- 安装包会检查 `{BASE_API}/desktop/releases/stable/` 更新（无需登录）。Fork 请修改 `BASE_API` / `build.json` 的发布地址，以免从 Teralexi 官方源自动更新。

详见 [隐私政策](https://www.teralexi.com/privacy.html)。

## 常用命令

```bash
npm run dev          # 桌面应用（默认公开平台 API）
npm run build        # 生产桌面构建
npm run build:web    # 渲染/主进程构建（CI 校验）
npm run test:unit    # 单元测试
```

## 文档

| 文档 | 说明 |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 如何贡献 |
| [SECURITY.md](./SECURITY.md) | 安全漏洞反馈 |
| [BUILD-AND-RELEASE.md](./BUILD-AND-RELEASE.md) | 环境、本地构建、CI 与发布 |
| [CODING.md](./CODING.md) | 贡献者 UI / IPC 说明 |
| [skills/SKILL-DEVELOPMENT.md](./skills/SKILL-DEVELOPMENT.md) | 编写 Agent Skills |
| [docs/](./docs/) | 发布、签名、支持上传、App Store 说明 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史 |
| [NOTICE](./NOTICE) | 商标与第三方说明 |
| [teralexi.com](https://www.teralexi.com/) | 下载与产品介绍 |

## 许可证

Teralexi 使用 [Apache License 2.0](./LICENSE)。商标与第三方说明见 [NOTICE](./NOTICE)。
