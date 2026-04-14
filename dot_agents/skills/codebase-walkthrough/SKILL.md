---
name: codebase-walkthrough
description: "Generate a standalone interactive HTML walkthrough diagram for a codebase. Use when asked to visualize architecture, walk through code flows, or create an interactive diagram file."
disable-model-invocation: true
---

# Walkthrough Skill

Generate a single self-contained HTML file that renders an interactive codebase walkthrough diagram. Users click nodes to reveal deep-dive details, code snippets, and file links.

## Workflow

### 1. Explore

Use `read` and `bash` to understand the topic. Use `bash` with `rg` and `find` to follow imports, references, and call sites. Identify 5–10 key components and their relationships.

### 2. Plan the Diagram

For each component, prepare:

- **id**: Short mermaid node ID (e.g., `AUTH`, `DB`)
- **label**: Display name for the node
- **title**: Full title for the detail panel
- **description**: Markdown explaining the component (what it does, how it connects, key details)
- **links**: Related file paths (relative to repo root)
- **codeSnippet** (optional): Key code excerpt

Map the edges (connections) between nodes.

### 3. Generate the HTML File

Create a single `.html` file using the template below. Replace the placeholder data in the `DIAGRAM_CODE` and `NODES` variables with real content from step 2.

Save as `walkthrough.html` in the repo root (or wherever the user specifies).

---

## HTML Template

````html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Walkthrough: TITLE_HERE</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      :root {
        --bg: #282828;
        --surface: #32302f;
        --border: #504945;
        --text: #ebdbb2;
        --text-muted: #a89984;
        --accent: #d79921;
        --accent-hover: #fabd2f;
        --node-bg: #3c3836;
        --node-border: #665c54;
        --code-bg: #1d2021;
      }

      html {
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
          sans-serif;
      }
      body {
        background: var(--bg);
        color: var(--text);
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

      header {
        padding: 16px 24px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }
      header h1 {
        font-size: 18px;
        font-weight: 600;
      }
      header p {
        font-size: 13px;
        color: var(--text-muted);
        margin-top: 4px;
      }

      .container {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .diagram-pane {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        overflow: auto;
      }

      .detail-pane {
        width: 420px;
        border-left: 1px solid var(--border);
        background: var(--surface);
        overflow-y: auto;
        padding: 24px;
        transition: width 0.2s;
      }
      .detail-pane.empty {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .detail-pane.empty .detail-content {
        display: none;
      }
      .detail-pane .placeholder {
        color: var(--text-muted);
        font-size: 14px;
      }
      .detail-pane.has-content .placeholder {
        display: none;
      }

      .detail-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--accent);
      }

      .detail-content h2 {
        font-size: 15px;
        font-weight: 600;
        margin: 20px 0 8px;
        color: var(--text);
      }
      .detail-content p,
      .detail-content li {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-muted);
      }
      .detail-content ul {
        padding-left: 20px;
        margin: 8px 0;
      }
      .detail-content strong {
        color: var(--text);
      }
      .detail-content code {
        background: var(--code-bg);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 13px;
        font-family: "SF Mono", "Fira Code", monospace;
      }
      .detail-content pre {
        background: var(--code-bg);
        padding: 16px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 12px 0;
        border: 1px solid var(--border);
      }
      .detail-content pre code {
        background: none;
        padding: 0;
        font-size: 13px;
        color: var(--text);
      }

      .detail-links {
        margin-top: 20px;
      }
      .detail-links h3 {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .detail-links a {
        display: block;
        font-size: 13px;
        color: var(--accent);
        text-decoration: none;
        padding: 4px 0;
        font-family: "SF Mono", "Fira Code", monospace;
      }
      .detail-links a:hover {
        color: var(--accent-hover);
        text-decoration: underline;
      }

      .detail-snippet {
        margin-top: 20px;
      }
      .detail-snippet h3 {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Mermaid node click targets */
      .node {
        cursor: pointer;
      }
      .node:hover rect,
      .node:hover polygon {
        filter: brightness(1.2);
      }

      @media (max-width: 768px) {
        .container {
          flex-direction: column;
        }
        .detail-pane {
          width: 100%;
          max-height: 50vh;
          border-left: none;
          border-top: 1px solid var(--border);
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>TITLE_HERE</h1>
      <p>SUMMARY_HERE</p>
    </header>

    <div class="container">
      <div class="diagram-pane">
        <pre class="mermaid">
MERMAID_CODE_HERE
    </pre
        >
      </div>

      <div class="detail-pane empty" id="detailPane">
        <p class="placeholder">Click a node to see details</p>
        <div class="detail-content" id="detailContent"></div>
      </div>
    </div>

    <script>
      // ── Node data ──────────────────────────────────────────
      // Replace this object with real data from the exploration step.
      const NODES = {
        // "NODE_ID": {
        //   title: "Display Title",
        //   description: "Markdown-ish description (HTML accepted).",
        //   links: [{ label: "path/to/file.ts", url: "file:///abs/path" }],
        //   codeSnippet: "optional code string"
        // }
      };

      // ── Mermaid init ───────────────────────────────────────
      mermaid.initialize({
        startOnLoad: true,
        theme: "base",
        themeVariables: {
          primaryColor: "#3c3836",
          primaryTextColor: "#ebdbb2",
          primaryBorderColor: "#665c54",
          lineColor: "#d79921",
          secondaryColor: "#32302f",
          tertiaryColor: "#282828",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif",
          fontSize: "14px",
        },
        flowchart: { htmlLabels: true, curve: "basis" },
        securityLevel: "loose",
      });

      // ── Interaction ────────────────────────────────────────
      function escapeHtml(str) {
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      function renderMarkdown(md) {
        // Minimal markdown → HTML (good enough for detail panels)
        let html = md
          .replace(/^### (.+)$/gm, "<h3>$1</h3>")
          .replace(/^## (.+)$/gm, "<h2>$1</h2>")
          .replace(/^# (.+)$/gm, "<h1>$1</h1>")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/^- (.+)$/gm, "<li>$1</li>")
          .replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`)
          .replace(/\n{2,}/g, "</p><p>")
          .replace(/\n/g, "<br>");

        // Code blocks
        html = html.replace(
          /```[\w]*\n([\s\S]*?)```/g,
          (_, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`,
        );

        return `<p>${html}</p>`;
      }

      function showDetail(nodeId) {
        const node = NODES[nodeId];
        if (!node) return;

        const pane = document.getElementById("detailPane");
        const content = document.getElementById("detailContent");

        let html = `<div class="detail-title">${escapeHtml(node.title)}</div>`;
        html += renderMarkdown(node.description);

        if (node.links && node.links.length) {
          html += `<div class="detail-links"><h3>Files</h3>`;
          node.links.forEach((l) => {
            html += `<a href="${l.url}" target="_blank">${escapeHtml(l.label)}</a>`;
          });
          html += `</div>`;
        }

        if (node.codeSnippet) {
          html += `<div class="detail-snippet"><h3>Code</h3><pre><code>${escapeHtml(node.codeSnippet)}</code></pre></div>`;
        }

        content.innerHTML = html;
        content.style.display = "block";
        pane.classList.remove("empty");
        pane.classList.add("has-content");
      }

      window.callback = function (nodeId) {
        showDetail(nodeId);
      };
    </script>
  </body>
</html>
````

## Rules

- **One file, zero dependencies** except the Mermaid CDN script tag.
- Use a **Gruvbox dark** palette for the page and Mermaid theme variables unless the user asks for a different theme.
- Do not add colors or classDefs to the Mermaid code — let the theme handle it.
- Replace `TITLE_HERE`, `SUMMARY_HERE`, `MERMAID_CODE_HERE`, and the `NODES` object with real data.
- Use relative paths for file links (e.g., `./src/auth.ts`).
- Keep descriptions concise but informative — aim for 3–8 lines of markdown per node.
- Wire node interaction with Mermaid `click NODE_ID callback "NODE_ID"` directives plus `window.callback = function (nodeId) { ... }`. Do **not** rely on Mermaid-generated DOM ids or post-render `.node` queries.
- When embedding code snippets inside JavaScript template literals, escape any literal `${` sequences as `\${` so shell examples like `${HOME}` do not break the page.
- Before finishing, validate the generated file for both classes of bugs:
  - search for unescaped `${` inside snippet/template content
  - confirm every clickable Mermaid node has a matching `NODES` entry and `click ... callback` line
- After creating the file, tell the user to open it in a browser.
