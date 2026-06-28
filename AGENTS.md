# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Product Decisions

- This is a local-first macOS desktop application, not a hosted SaaS dashboard.
- Keep public source code and user business data separate. Never commit real workspaces, raw files, reports, or semantic content.
- Use `design/final-direction.png` as visual truth.
- Preserve the seven-stage workflow and global semantic center from the legacy application.
- Use dense rows, separators, and work surfaces. Avoid dashboard card walls, marketing copy, large heroes, gradients, and decorative illustrations.
- Human confirmation owns authoritative semantics and long-term knowledge. AI may draft and evaluate but must not silently publish rules.
- The desktop app does not call a model directly in v1. It generates dispatch prompts and reads structured execution receipts from the local workspace.
