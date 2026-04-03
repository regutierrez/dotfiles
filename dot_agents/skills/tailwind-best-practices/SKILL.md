---
name: tailwind-best-practices
description: "Enforces Tailwind CSS v4 best practices in Vue and other frameworks. Use when writing, reviewing, or refactoring Tailwind utility classes."
disable-model-invocation: true
---

# Tailwind CSS v4 Best Practices

Apply these rules when writing or reviewing Tailwind CSS code.

## Class Management

- **Never concatenate dynamic class names** — Tailwind's compiler cannot detect them and purges them in production.
  ```vue
  <!-- ❌ Purged in production -->
  <div :class="`bg-${color}-500`" />

  <!-- ✅ Full literals visible to compiler -->
  <div :class="{ 'bg-red-500': isError, 'bg-green-500': isSuccess }" />
  ```
- Use a `cn()` helper (`clsx` + `tailwind-merge`) for conditional classes instead of template string math.
- Use **CVA** or **Tailwind Variants** for components with multiple visual variants — keeps literals visible and purge-safe.
- If dynamic classes are unavoidable, safelist them explicitly:
  ```css
  @source inline("{bg-,text-,border-}{brand,info,warn,error}-{50,100,500,700}");
  ```

## Component Patterns

- **Extract repeated styles into components**, not `@apply` classes. The Vue/React component *is* the abstraction.
- Use `@apply` sparingly — only for complex selectors (`:hover`, `[hidden]`, media queries) or when class strings obscure the template.
- Expose **props** for style customization on reusable components instead of allowing arbitrary class merging (prevents specificity conflicts).

## Design Tokens & Theming

- Centralize brand colors, spacing, and fonts in `@theme` (v4) so the team uses `text-brand` instead of arbitrary hex values.
- Handle dark mode with the `dark:` variant + CSS custom properties:
  ```css
  @theme { --color-surface: var(--color-white); }
  @layer theme { .dark { --color-surface: var(--color-slate-900); } }
  ```

## State & Interaction Styling

- Use `group` / `group-*` variants to style children based on parent state — avoids repeating hover/focus prefixes on every child.
  ```html
  <button class="group flex items-center gap-2">
    <span class="group-hover:underline">Link</span>
  </button>
  ```
- For gigantic hover/focus class lists, use CVA variant maps instead of stacking prefixes inline.

## Responsive Design

- Follow mobile-first: write base styles without prefix, override with `sm:`, `md:`, `lg:`.
- Stack modifiers when needed: `md:hover:text-lg`.

## Tooling (enforce on every project)

1. **Prettier plugin** — auto-sorts class names:
   ```bash
   npm install -D prettier prettier-plugin-tailwindcss
   ```
   Configure `tailwindFunctions: ['cva', 'cn']` in Prettier config.
2. **Tailwind IntelliSense** — VS Code extension `bradlc.vscode-tailwindcss`. Enable `"editor.quickSuggestions": { "strings": "on" }`.
3. Use `@utility` for verbose one-off CSS (e.g., `clip-path`) that would need an arbitrary value every time.

## Common Pitfalls

- **Arbitrary values explosion**: every unique `shadow-[...]` generates a rule. Centralise rare values with `@utility`.
- **Conflicting utilities**: never put two classes targeting the same property on one element (`grid flex`). Use conditional logic to pick one.
- **`!important` abuse**: only use `!` prefix when overriding uncontrollable third-party inline styles. Document the reason and add a TODO to remove.
- **Overusing `@apply`**: duplicates CSS output when the same set is applied across many scoped selectors. Prefer components.

## Vue-Specific

- Pair Tailwind with **Headless UI (Vue)** for accessible unstyled primitives (dropdowns, modals, listboxes).
- Use Tailwind for ~80% of styling; lean on `<style scoped>` for complex animations, advanced selectors, or state grouping that would become unreadable inline.
- Prefer `:class` bindings with object/array syntax over ternary strings in templates.

## References

- https://tailwindcss.com/docs/styling-with-utility-classes
- https://infinum.com/handbook/frontend/react/tailwind/best-practices
- https://www.alibabacloud.com/blog/setting-up-tailwind-css-4-0-in-vue-js-a-step-by-step-guide_602136
