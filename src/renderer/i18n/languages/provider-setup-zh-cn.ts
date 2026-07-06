import type { ProviderSetupLabels } from '../provider-setup-label-types'

export const providerSetupZhCn: ProviderSetupLabels = {
  wizard: {
    title: '配置 LLM 提供商',
    subtitle:
      '连接本地模型服务，或粘贴云端 API 密钥。可随时在 设置 → LLM 中修改。',
    chooseMode: '你想如何运行模型？',
    localTitle: '本地（Ollama / llama.cpp）',
    localDesc: '在本机运行模型，无需云端 API 密钥。',
    vendorTitle: '厂商 API',
    vendorDesc: '直接连接 OpenAI、Anthropic、DeepSeek、Moonshot、Qwen 等模型厂商。',
    wholesaleTitle: '批发 / 路由',
    wholesaleDesc: '使用 Fireworks、OpenRouter 或其他 OpenAI 兼容的多模型网关。',
    cloudTitle: '云端 API',
    cloudDesc: '使用 OpenAI、Anthropic、DeepSeek、Gemini 等托管 API。',
    pickProvider: '选择提供商',
    back: '返回',
    continue: '进入对话',
    skipForNow: '暂时跳过',
    openConsole: '管理你的 LLM API 密钥',
    openConsoleHint: '在浏览器中创建或复制 API 密钥，然后粘贴到下方。',
    openDocs: '文档',
    openInstall: '下载安装',
    openInstallHint: '安装本地运行环境后，返回此处连接。',
    testAndSave: '测试并保存',
    testing: '正在测试连接…',
    testSuccess: '已连接 — 设置已保存。',
    testFailed: '连接失败，请检查密钥后重试。',
    modelsFound: '可用模型 {count} 个',
    setupGuide: '设置步骤',
    getStarted: '开始配置',
    openSettings: '打开 LLM 设置',
    stepLlm: 'LLM 提供商',
    stepAgents: 'Agent 模型',
    agentsTitle: '为 Agent 指定可用的模型',
    agentsSubtitle:
      '每个 Agent 都需要可用的提供商和模型。之后可在设置中单独调整。',
    applyToAll: '应用到全部 Agent',
    allAgentsReady: '所有 Agent 已配置完成。',
    agentsIncomplete: '请先为每个 Agent 完成配置。',
    finishSetup: '完成设置',
    continueToAgents: '下一步：配置 Agent',
    rampUpTitle: '欢迎使用 Teralexi',
    rampUpSubtitle: '连接 LLM 并为 Agent 指定模型后即可开始使用。',
    configuredProvidersHint:
      '以下提供商已配置完成。选择一个用于 Agent，或继续添加新的提供商。',
    addAnotherProvider: '添加其他提供商',
    alreadyConfigured: '已配置',
    next: '下一步',
    editorAiTitle: '编辑器 AI 补全',
    editorAiSubtitle:
      '在工作区编辑文件时可选的 Tab 内联代码建议，使用与 Agent 相同的提供商凭据。',
    editorAiEnabled: '启用 Tab 补全',
    editorAiEnabledDesc: '在文件编辑器中输入时显示灰色内联建议。',
    editorAiModelDesc: 'Coder 类模型最适合 fill-in-the-middle 补全。',
  },
  landing: {
    title: '连接你的第一个模型',
    subtitle:
      '分步引导从 OpenAI、Anthropic、DeepSeek 等获取 API 密钥，并在 Teralexi 中测试保存。',
    cta: '开始设置向导',
  },
  providers: {
    ollama: {
      intro: 'Ollama 在本地运行开源模型。安装后拉取模型，再将 Teralexi 指向服务器地址。',
      steps: [
        '下载并安装 Ollama。',
        '在终端运行：ollama pull llama3.2（或其他模型）。',
        '确保服务已启动（默认 http://localhost:11434）。',
        '在下方填写服务器 URL，点击「测试并保存」。',
      ],
    },
    llamacpp: {
      intro: 'llama.cpp 服务器提供 OpenAI 兼容 API。启动服务后在此填写 base URL。',
      steps: [
        '构建或下载 llama.cpp 并启动 HTTP 服务器。',
        '记下 base URL（常见为 http://127.0.0.1:8080/v1）。',
        '可选：若服务器需要认证，填写 Bearer token。',
        '点击「测试并保存」加载可用模型。',
      ],
    },
    openai: {
      intro: 'OpenAI 提供 GPT 等模型，需要启用计费的账户和 API 密钥。',
      steps: [
        '登录 platform.openai.com，打开 API keys。',
        '创建密钥并复制（仅显示一次）。',
        '粘贴到下方。仅 Azure 或代理需自定义 base URL。',
        '点击「测试并保存」— 密钥保存在本机并拉取模型列表。',
      ],
    },
    anthropic: {
      intro: 'Anthropic 通过 Messages API 提供 Claude 模型。',
      steps: [
        '登录 platform.claude.com，打开 API 密钥（Settings → workspaces → keys）。',
        '创建密钥并复制（以 sk-ant- 开头）。',
        '粘贴到下方。代理场景才需自定义 base URL。',
        '点击「测试并保存」在本机存储密钥。',
      ],
    },
    gemini: {
      intro: 'Google Gemini 使用 Google AI Studio 的 API 密钥。',
      steps: [
        '打开 Google AI Studio → API keys 并登录 Google 账号。',
        '创建 API 密钥。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    deepseek: {
      intro: 'DeepSeek 提供 OpenAI 兼容的对话与推理模型。',
      steps: [
        '登录 platform.deepseek.com/api_keys 并创建密钥。',
        '创建并复制密钥。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    zhipu: {
      intro: '智谱 GLM 使用 BigModel 开放平台。',
      steps: [
        '登录 z.ai，打开 Manage API key → API key list。',
        '创建并复制密钥。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    moonshot: {
      intro: 'Moonshot（Kimi）使用 OpenAI 兼容 API。',
      steps: [
        '登录 platform.moonshot.cn 并创建 API 密钥。',
        '粘贴到下方，默认 base URL 已填好。',
        '点击「测试并保存」。',
      ],
    },
    qwen: {
      intro: '通义千问通过 DashScope 兼容模式访问。',
      steps: [
        '登录 DashScope 控制台并创建 API 密钥。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    bytedance: {
      intro: '火山方舟（豆包）使用 endpoint 模型 ID。',
      steps: [
        '打开火山方舟控制台并创建 API 密钥。',
        '粘贴到下方。Agent 模型名填 Ark endpoint 模型 ID。',
        '点击「测试并保存」。',
      ],
    },
    huggingface: {
      intro: 'Hugging Face Inference 路由提供 OpenAI 兼容模型。',
      steps: [
        '在 huggingface.co/settings/tokens 创建读权限 token。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    'nvidia-nim': {
      intro: 'NVIDIA NIM 通过 OpenAI 兼容 API 提供托管模型。',
      steps: [
        '从 NVIDIA Build 获取 API 密钥。',
        '粘贴到下方并点击「测试并保存」。',
      ],
    },
    fireworks: {
      intro: 'Fireworks AI 通过统一推理 API 托管多种开源与专有模型。',
      steps: [
        '在 Fireworks 控制台创建 API 密钥。',
        '粘贴到下方，并在智能体模型名中使用 Fireworks 的 model id。',
      ],
    },
    openrouter: {
      intro: 'OpenRouter 通过一个 API 密钥路由到多家厂商的模型。',
      steps: [
        '在 openrouter.ai/keys 创建 API 密钥。',
        '粘贴到下方，并使用 OpenRouter 目录中的 provider/model id。',
      ],
    },
    togetherai: {
      intro: 'Together AI 通过统一推理 API 托管多种开源与专有模型。',
      steps: [
        '在 Together AI 控制台创建 API 密钥。',
        '粘贴到下方，并使用 Together 模型目录中的 model id。',
      ],
    },
    groq: {
      intro: 'Groq 通过 LPU 提供热门开源模型的高速推理。',
      steps: [
        '在 Groq 控制台创建 API 密钥。',
        '粘贴到下方，并使用 Groq 模型列表中的 model id。',
      ],
    },
    deepinfra: {
      intro: 'DeepInfra 通过统一推理 API 托管多种开源模型。',
      steps: [
        '在 DeepInfra 控制台创建 API 密钥。',
        '粘贴到下方，并使用 DeepInfra 目录中的 model id。',
      ],
    },
    custom: {
      intro:
        '连接其他 OpenAI 兼容端点。请填写对应服务商的 Base URL 与 API 密钥。',
      steps: [
        '在 models.dev 浏览提供商与 model id（见下方「文档」链接）。',
        '在服务商控制台创建 API 密钥。',
        '粘贴密钥、设置 Base URL，并在智能体模型名中使用提供商的 model id。',
      ],
    },
  },
}
