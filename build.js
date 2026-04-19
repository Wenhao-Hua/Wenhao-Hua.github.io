const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const OUTPUT_POSTS_DIR = path.join(ROOT, "posts");
const INDEX_OUTPUT_PATH = path.join(ROOT, "index.html");
const NOT_FOUND_OUTPUT_PATH = path.join(ROOT, "404.html");
const SITE_CONFIG_PATH = path.join(CONTENT_DIR, "site.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalarValue(value) {
  const trimmed = stripWrappingQuotes(String(value || "").trim());
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^\[(.*)\]$/.test(trimmed)) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => stripWrappingQuotes(item.trim()))
      .filter(Boolean);
  }
  return trimmed;
}

function parseFrontMatter(raw) {
  const matched = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!matched) {
    return { attributes: {}, body: String(raw || "").trim() };
  }

  const attributes = {};
  for (const rawLine of matched[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    attributes[key] = parseScalarValue(value);
  }

  return { attributes, body: matched[2].trim() };
}

function parseDateValue(dateInput) {
  const raw = String(dateInput || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00Z`);
  }
  return new Date(raw);
}

function formatDate(dateInput, format) {
  const date = parseDateValue(dateInput);
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: format === "long" ? "long" : "short",
    day: "numeric",
  }).format(date);
}

function estimateReadingMinutes(text) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220) || 1);
}

function renderInline(text) {
  const parts = String(text || "").split(/(`[^`]+`)/g);

  return parts
    .map((part) => {
      if (!part) return "";

      if (/^`[^`]+`$/.test(part)) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      let rendered = escapeHtml(part);
      rendered = rendered.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label, href) =>
          `<a href="${escapeHtml(href)}"${
            /^[a-z]+:/i.test(href) ? ' target="_blank" rel="noreferrer"' : ""
          }>${escapeHtml(label)}</a>`,
      );
      rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      return rendered;
    })
    .join("");
}

function isBlockStarter(line) {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^```/.test(trimmed)
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const html = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;

      html.push(
        `<pre class="code-block"><code${
          language ? ` class="language-${escapeHtml(language)}"` : ""
        }>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      html.push(
        `<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      html.push(
        `<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      if (!nextLine.trim()) {
        index += 1;
        break;
      }
      if (isBlockStarter(nextLine)) break;
      paragraphLines.push(nextLine.trim());
      index += 1;
    }

    html.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function readPosts() {
  ensureDir(POSTS_DIR);

  const posts = fs
    .readdirSync(POSTS_DIR)
    .filter((fileName) => fileName.endsWith(".md") && !fileName.startsWith("_"))
    .map((fileName) => {
      const sourcePath = path.join(POSTS_DIR, fileName);
      const raw = fs.readFileSync(sourcePath, "utf8");
      const { attributes, body } = parseFrontMatter(raw);
      const slug = String(attributes.slug || path.basename(fileName, ".md")).trim();

      if (!slug) throw new Error(`Missing slug in ${fileName}`);
      if (!attributes.title) throw new Error(`Missing title in ${fileName}`);
      if (!attributes.date) throw new Error(`Missing date in ${fileName}`);

      return {
        slug,
        title: String(attributes.title).trim(),
        date: String(attributes.date).trim(),
        category: String(attributes.category || "Note").trim(),
        summary: String(attributes.summary || "").trim(),
        featured: Boolean(attributes.featured),
        tags: Array.isArray(attributes.tags)
          ? attributes.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
        body,
        renderedBody: renderMarkdown(body),
        readingMinutes: estimateReadingMinutes(body),
      };
    })
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date));

  const slugs = new Set();
  for (const post of posts) {
    if (slugs.has(post.slug)) {
      throw new Error(`Duplicate slug "${post.slug}"`);
    }
    slugs.add(post.slug);
  }

  return posts;
}

function renderHeader(site) {
  return `
      <header class="site-header">
        <a class="brand" href="#top" aria-label="Back to top">
          <span class="brand-mark">WH</span>
          <span class="brand-copy">
            <strong>${escapeHtml(site.author)}</strong>
            <span>${escapeHtml(site.affiliation)}</span>
          </span>
        </a>

        <nav class="site-nav" aria-label="Primary navigation">
          <a href="#about">About</a>
          <a href="#research">Research</a>
          <a href="#building">Focus</a>
          <a href="#writing">Writing</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
  `;
}

function renderSectionHeading(label, title, copy = "") {
  return `
          <div class="section-heading">
            <p class="section-label">${escapeHtml(label)}</p>
            <h2>${escapeHtml(title)}</h2>
            ${copy ? `<p class="section-copy">${escapeHtml(copy)}</p>` : ""}
          </div>
  `;
}

function renderHighlightCards(items) {
  return `
        <section class="highlight-grid" aria-label="Snapshot">
          ${items
            .map(
              (item) => `
          <article class="highlight-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </article>
          `,
            )
            .join("")}
        </section>
  `;
}

function renderResearchCards(items) {
  return `
          <div class="card-grid card-grid-3">
            ${items
              .map(
                (item) => `
            <article class="card">
              <p class="card-index">${escapeHtml(item.kicker || "Theme")}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </article>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderBuildingCards(items) {
  return `
          <div class="card-grid card-grid-3">
            ${items
              .map(
                (item) => `
            <${item.href ? "a" : "article"} class="card feature-card"${
                  item.href
                    ? ` href="${escapeHtml(item.href)}"${
                        /^[a-z]+:/i.test(item.href)
                          ? ' target="_blank" rel="noreferrer"'
                          : ""
                      }`
                    : ""
                }>
              <p class="card-index">${escapeHtml(item.label)}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </${item.href ? "a" : "article"}>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderLinkCards(items) {
  return `
          <div class="link-grid">
            ${items
              .map(
                (item) => `
            <a class="link-card" href="${escapeHtml(item.href)}"${
                  /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.meta)}</span>
            </a>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderPostCards(posts) {
  if (!posts.length) {
    return `
          <div class="post-grid">
            <article class="post-card post-card-featured">
              <p class="post-meta">No posts yet</p>
              <h3>Start your writing archive</h3>
              <p>Add a Markdown file under <code>content/posts</code>, then run <code>node build.js</code>.</p>
            </article>
          </div>
    `;
  }

  return `
          <div class="post-grid">
            ${posts
              .map((post, index) => {
                const featuredClass = index === 0 || post.featured ? " post-card-featured" : "";
                const tagMarkup = post.tags.length
                  ? `<div class="tag-row">${post.tags
                      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                      .join("")}</div>`
                  : "";

                return `
            <article class="post-card${featuredClass}">
              <p class="post-meta">${escapeHtml(post.category)} / ${escapeHtml(
                formatDate(post.date, "short"),
              )}</p>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.summary || "A short summary will appear here once added to the front matter.")}</p>
              ${tagMarkup}
              <a class="text-link" href="./posts/${encodeURI(post.slug)}.html">Read post</a>
            </article>
                `;
              })
              .join("")}
          </div>
  `;
}

function renderLayout({ title, description, stylesheetPath, bodyClass = "", content }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${escapeHtml(stylesheetPath)}" />
  </head>
  <body class="${escapeHtml(bodyClass)}">
${content}
  </body>
</html>
`;
}

function renderIndexPage(config, posts) {
  const { site, hero, highlights, about, research, building, links, contact } = config;

  return renderLayout({
    title: site.title,
    description: site.description,
    stylesheetPath: "./styles.css?v=20260419",
    content: `
    <div class="page-shell">
${renderHeader(site)}
      <main>
        <section class="hero" id="top">
          <div class="hero-copy">
            <p class="section-label">${escapeHtml(hero.eyebrow)}</p>
            <h1>${escapeHtml(hero.headline)}</h1>
            <p class="hero-summary">${escapeHtml(hero.summary)}</p>

            <div class="hero-actions">
              <a class="button button-primary" href="${escapeHtml(hero.primaryHref)}">${escapeHtml(
                hero.primaryLabel,
              )}</a>
              <a class="button button-secondary" href="${escapeHtml(
                hero.secondaryHref,
              )}" target="_blank" rel="noreferrer">${escapeHtml(hero.secondaryLabel)}</a>
            </div>
          </div>

          <aside class="hero-panel">
            <p class="panel-label">${escapeHtml(hero.panelLabel)}</p>
            <h2>${escapeHtml(hero.panelTitle)}</h2>
            <ul class="signal-list">
              ${hero.panelItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </aside>
        </section>

${renderHighlightCards(highlights)}

        <section class="section" id="about">
${renderSectionHeading("About", about.title, about.copy)}
          <div class="about-grid">
            <article class="card card-large">
              <p class="card-index">Profile</p>
              <p class="lead">${escapeHtml(about.lead)}</p>
              <p>${escapeHtml(about.body)}</p>
            </article>

            <article class="card">
              <p class="card-index">Keywords</p>
              <div class="tag-row">
                ${about.keywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
              </div>
            </article>

            <article class="card">
              <p class="card-index">Contact</p>
              <dl class="meta-list">
                <div>
                  <dt>Email</dt>
                  <dd><a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a></dd>
                </div>
                <div>
                  <dt>GitHub</dt>
                  <dd><a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">${escapeHtml(
                    site.github.replace(/^https?:\/\//, ""),
                  )}</a></dd>
                </div>
                <div>
                  <dt>Homepage</dt>
                  <dd><a href="${escapeHtml(site.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(
                    site.homepage.replace(/^https?:\/\//, ""),
                  )}</a></dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <section class="section" id="research">
${renderSectionHeading("Research", research.title, research.copy)}
${renderResearchCards(research.items)}
        </section>

        <section class="section" id="building">
${renderSectionHeading("Focus", building.title, building.copy)}
${renderBuildingCards(building.items)}
        </section>

        <section class="section" id="writing">
${renderSectionHeading("Writing", "Recent Posts", "Posts are authored in Markdown and turned into static pages for GitHub Pages.")}
${renderPostCards(posts)}
        </section>

        <section class="section" id="contact">
${renderSectionHeading("Links", contact.title, contact.copy)}
${renderLinkCards(links)}
        </section>
      </main>
    </div>
    `,
  });
}

function renderPostPage(config, post) {
  const { site } = config;
  const tagMarkup = post.tags.length
    ? `<div class="tag-row">${post.tags
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("")}</div>`
    : "";

  return renderLayout({
    title: `${post.title} | ${site.author}`,
    description: post.summary || site.description,
    stylesheetPath: "../styles.css?v=20260419",
    bodyClass: "article-page",
    content: `
    <div class="article-shell">
      <a class="article-back" href="../index.html">&larr; Back to homepage</a>

      <article class="article">
        <header class="article-header">
          <p class="section-label">${escapeHtml(post.category)}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="article-summary">${escapeHtml(post.summary)}</p>
          ${tagMarkup}
          <p class="article-meta">${escapeHtml(site.author)} / ${escapeHtml(
            formatDate(post.date, "long"),
          )} / ${post.readingMinutes} min read</p>
        </header>

        <section class="article-body">
          ${post.renderedBody}
        </section>
      </article>
    </div>
    `,
  });
}

function renderNotFoundPage(config) {
  return renderLayout({
    title: `Page Not Found | ${config.site.author}`,
    description: config.site.description,
    stylesheetPath: "./styles.css?v=20260419",
    bodyClass: "article-page",
    content: `
    <div class="article-shell">
      <article class="article article-centered">
        <p class="section-label">404</p>
        <h1>Page not found</h1>
        <p class="article-summary">The page you tried to open does not exist or has moved.</p>
        <p><a class="button button-primary" href="./index.html">Return to homepage</a></p>
      </article>
    </div>
    `,
  });
}

function writeGeneratedFiles(config, posts) {
  ensureDir(OUTPUT_POSTS_DIR);

  for (const fileName of fs.readdirSync(OUTPUT_POSTS_DIR)) {
    if (fileName.endsWith(".html")) {
      fs.unlinkSync(path.join(OUTPUT_POSTS_DIR, fileName));
    }
  }

  fs.writeFileSync(INDEX_OUTPUT_PATH, renderIndexPage(config, posts), "utf8");
  fs.writeFileSync(NOT_FOUND_OUTPUT_PATH, renderNotFoundPage(config), "utf8");

  for (const post of posts) {
    const outputPath = path.join(OUTPUT_POSTS_DIR, `${post.slug}.html`);
    fs.writeFileSync(outputPath, renderPostPage(config, post), "utf8");
  }
}

function build() {
  const config = readJson(SITE_CONFIG_PATH);
  const posts = readPosts();
  writeGeneratedFiles(config, posts);
  console.log(`Built ${posts.length} post(s) into ${ROOT}.`);
}

build();
