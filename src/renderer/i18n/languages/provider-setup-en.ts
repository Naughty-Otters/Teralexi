import type { ProviderSetupLabels } from '../provider-setup-label-types'

export const providerSetupEn: ProviderSetupLabels = {
  wizard: {
    title: 'Set up your LLM provider',
    subtitle:
      'Connect a local model server or paste an API key from a cloud provider. You can change this anytime in Settings → LLM.',
    chooseMode: 'How do you want to run models?',
    localTitle: 'Local (Ollama / llama.cpp)',
    localDesc: 'Run models on this machine — no cloud API key required.',
    cloudTitle: 'Cloud API',
    cloudDesc: 'Use OpenAI, Anthropic, DeepSeek, Gemini, and other hosted APIs.',
    pickProvider: 'Choose a provider',
    back: 'Back',
    continue: 'Continue to chat',
    skipForNow: 'Skip for now',
    openConsole: 'Manage your own LLM API key',
    openConsoleHint: 'Create or copy your API key in the browser, then paste it below.',
    openDocs: 'Documentation',
    openInstall: 'Download & install',
    openInstallHint: 'Install the local runtime, then return here to connect.',
    testAndSave: 'Test & save',
    testing: 'Testing connection…',
    testSuccess: 'Connected — settings saved.',
    testFailed: 'Connection failed. Check the key and try again.',
    modelsFound: '{count} model(s) available',
    setupGuide: 'Setup steps',
    getStarted: 'Get started',
    openSettings: 'Open LLM settings',
    stepLlm: 'LLM provider',
    stepAgents: 'Agent models',
    agentsTitle: 'Point your agents at a working model',
    agentsSubtitle:
      'Each agent needs a provider and model that match your setup. You can fine-tune per agent in Settings later.',
    applyToAll: 'Apply to all agents',
    allAgentsReady: 'All agents are configured.',
    agentsIncomplete: 'Configure every agent before continuing.',
    finishSetup: 'Finish setup',
    continueToAgents: 'Next: configure agents',
    rampUpTitle: 'Welcome to Teralexi',
    rampUpSubtitle: 'Connect an LLM and assign models to your agents to get started.',
    configuredProvidersHint:
      'These providers are already set up. Pick one to use for your agents, or add another below.',
    addAnotherProvider: 'Add another provider',
    alreadyConfigured: 'Configured',
    next: 'Next',
    editorAiTitle: 'Editor AI tab completion',
    editorAiSubtitle:
      'Optional inline code suggestions while editing files in the workspace. Uses the same provider credentials as agents.',
    editorAiEnabled: 'Enable tab completion',
    editorAiEnabledDesc: 'Show ghost-text suggestions in the file editor while typing.',
    editorAiModelDesc: 'Coder models work best for fill-in-the-middle completion.',
  },
  landing: {
    title: 'Connect your first model',
    subtitle:
      'Step-by-step help to get API keys from OpenAI, Anthropic, DeepSeek, and more — then test and save in Teralexi.',
    cta: 'Start setup wizard',
  },
  providers: {
    ollama: {
      intro: 'Ollama runs open models locally. Install it, pull a model, then point Teralexi at the server URL.',
      steps: [
        'Download Ollama for your OS and install it.',
        'Open a terminal and run: ollama pull llama3.2 (or another model).',
        'Ensure the server is running (default http://localhost:11434).',
        'Enter the server URL below and click Test & save.',
      ],
    },
    llamacpp: {
      intro:
        'llama.cpp server exposes an OpenAI-compatible API. Start the server, then enter its base URL here.',
      steps: [
        'Build or download llama.cpp and start the HTTP server (see project README).',
        'Note the server base URL (often http://127.0.0.1:8080/v1).',
        'Optional: set a bearer token if your server requires one.',
        'Click Test & save to load available models.',
      ],
    },
    openai: {
      intro:
        'OpenAI hosts GPT and reasoning models. You need an account with billing enabled and an API key.',
      steps: [
        'Sign in at platform.openai.com and open API keys.',
        'Create a new secret key and copy it (shown once).',
        'Paste the key below. Use a custom base URL only for Azure OpenAI or proxies.',
        'Click Test & save — we store the key locally and fetch available models.',
      ],
    },
    anthropic: {
      intro: 'Anthropic provides Claude models via the Messages API.',
      steps: [
        'Sign in at platform.claude.com and open API keys (Settings → workspaces → keys).',
        'Create a key and copy it (starts with sk-ant-).',
        'Paste the key below. Custom base URL is only needed for proxies.',
        'Click Test & save to store the key on this device.',
      ],
    },
    gemini: {
      intro: 'Google Gemini models are accessed with an API key from Google AI Studio.',
      steps: [
        'Open Google AI Studio → API keys and sign in with your Google account.',
        'Create an API key for your project.',
        'Paste the key below and click Test & save.',
      ],
    },
    deepseek: {
      intro: 'DeepSeek offers chat and reasoning models via an OpenAI-compatible API.',
      steps: [
        'Sign in at platform.deepseek.com/api_keys and create a key.',
        'Create a key and copy it.',
        'Paste the key below and click Test & save.',
      ],
    },
    zhipu: {
      intro: 'Zhipu GLM models use the BigModel Open Platform.',
      steps: [
        'Sign in at z.ai and open Manage API key → API key list.',
        'Create an API key and copy it.',
        'Paste the key below and click Test & save.',
      ],
    },
    moonshot: {
      intro: 'Moonshot (Kimi) uses an OpenAI-compatible API.',
      steps: [
        'Sign in at platform.moonshot.cn and create an API key.',
        'Paste the key below. Default base URL is pre-filled.',
        'Click Test & save to verify and load models.',
      ],
    },
    qwen: {
      intro: 'Alibaba Qwen models are available via DashScope compatible mode.',
      steps: [
        'Sign in to DashScope console and create an API key.',
        'Paste the key below and click Test & save.',
      ],
    },
    bytedance: {
      intro: 'ByteDance Volcengine Ark (Doubao) uses endpoint model IDs.',
      steps: [
        'Open Volcengine Ark console and create an API key.',
        'Paste the key below. Use your Ark endpoint model id as the agent model name.',
        'Click Test & save.',
      ],
    },
    huggingface: {
      intro: 'Hugging Face Inference router exposes OpenAI-compatible models.',
      steps: [
        'Create a read token at huggingface.co/settings/tokens.',
        'Paste the token below and click Test & save.',
      ],
    },
    'nvidia-nim': {
      intro: 'NVIDIA NIM provides hosted models via an OpenAI-compatible API.',
      steps: [
        'Get an API key from NVIDIA Build.',
        'Paste the key below and click Test & save.',
      ],
    },
    custom: {
      intro:
        'Connect any OpenAI-compatible provider. Default base URL is OpenRouter; change it to match your vendor.',
      steps: [
        'Browse providers and model ids on models.dev (Documentation link below).',
        'Create an API key in your provider console (Manage your own LLM API key opens Fireworks as an example).',
        'Paste the key below, adjust the base URL if needed, and use the provider model id as the agent model name.',
      ],
    },
  },
}
