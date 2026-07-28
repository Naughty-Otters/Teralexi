# Ecosystem skill & install compatibility

Teralexi loads community skill packs from Codex, Claude Code, Cursor, OpenClaw/ClawHub, and related Agent Skills tools.

## Skill folder markers

A directory under `~/.teralexi/skills/` or `<workspace>/.teralexi/skills/` is loadable when it contains any of:

| Marker | Ecosystem |
| --- | --- |
| `skill.md` | Teralexi (preferred when present) |
| `SKILL.md` | [Agent Skills](https://agentskills.io) — Codex, Claude Code, Cursor, OpenClaw |
| `skills.md` | OpenClaw / ClawHub legacy |
| `AGENT.md` / `AGENTS.md` | Occasional skill-folder aliases |

On load, YAML frontmatter is merged into Teralexi properties:

- `name`, `description` (required by Agent Skills)
- `allowed-tools` → `allowed_tools` (spaces or commas)
- Missing `model` / `provider` filled from Teralexi defaults

## Workspace always-on files (rules)

These are **not** skill packs. They inject as project rules when present at the workspace root:

`AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CODEX.md` (any common casing)

Plus existing `~/.teralexi/rules/*.md` and `<workspace>/.teralexi/rules/*.md`.

## CLI install

```bash
npx teralexi-ai skill install owner/repo
npx teralexi-ai skill install https://github.com/owner/repo/tree/main/skills/foo
npx teralexi-ai skill install ./my-skill --id my-skill -p   # → ./.teralexi/skills
npx teralexi-ai extension install ./extensions/my-guard
npx teralexi-ai skill list
npx teralexi-ai extension remove my-guard
```

## Open `npx skills` agent entry (upstream)

To register Teralexi in [vercel-labs/skills](https://github.com/vercel-labs/skills):

```ts
teralexi: {
  name: 'teralexi',
  displayName: 'Teralexi',
  skillsDir: '.teralexi/skills',
  globalSkillsDir: join(home, '.teralexi/skills'),
  detectInstalled: async () => existsSync(join(home, '.teralexi')),
},
```

Then: `npx skills add owner/repo -a teralexi -g`

Extensions are **not** part of that CLI — use `npx teralexi-ai extension install`.
