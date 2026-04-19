const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const OUTPUT_POSTS_DIR = path.join(ROOT, "posts");
const SITE_CONFIG_PATH = path.join(CONTENT_DIR, "site.json");

const NAV_ITEMS = [
  { key: "home", label: "??", href: "index.html" },
  { key: "about", label: "??", href: "about.html" },
  { key: "research", label: "??", href: "research.html" },
  { key: "projects", label: "??", href: "projects.html" },
  { key: "writing", label: "??", href: "writing.html" },
  { key: "contact", label: "??", href: "contact.html" },
];

const ROOT_PAGES = ["index.html", "about.html", "research.html", "projects.html", "writing.html", "contact.html", "404.html"];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(target, content) {
  fs.writeFileSync(target, content, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripQuotes(value) {
  const source = String(value ?? "").trim();
  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }
  return source;
}

function parseScalar(value) {
  const trimmed = stripQuotes(value);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^\[(.*)\]$/.test(trimmed)) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return trimmed;
}

function parseFrontMatter(raw) {
  const match = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: String(raw || "").trim() };

  const attributes = {};
  for (const sourceLine of match[1].split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    attributes[key] = parseScalar(value);
  }

  return { attributes, body: match[2].trim() };
}

function parseDate(dateInput) {
  const source = String(dateInput || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    return new Date(`${source}T00:00:00Z`);
  }
  return new Date(source);
}

function formatDate(dateInput) {
  const date = parseDate(dateInput);
  if (Number.isNaN(date.getTime())) return escapeHtml(dateInput);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function readingMinutes(text) {
  const count = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(count / 220) || 1);
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

function isBlockStart(line) {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^```/.test(trimmed)
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const out = [];

  for (let index = 0; index < lines.length; ) {
    const current = lines[index].trim();
    if (!current) {
      index += 1;
      continue;
    }

    if (/^```/.test(current)) {
      const language = current.slice(3).trim();
      const block = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        block.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      out.push(
        `<pre class="code-block"><code${
          language ? ` class="language-${escapeHtml(language)}"` : ""
        }>${escapeHtml(block.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = current.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(current)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(current)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      out.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(current)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      out.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [current];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      if (!nextLine.trim()) {
        index += 1;
        break;
      }
      if (isBlockStart(nextLine)) break;
      paragraph.push(nextLine.trim());
      index += 1;
    }
    out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return out.join("\n");
}

function toHref(href, depth = 0) {
  if (!href) return "#";
  if (/^(?:[a-z]+:|#|\/\/)/i.test(href)) return href;
  if (href.startsWith("/")) return href;
  return `${depth > 0 ? "../".repeat(depth) : "./"}${href.replace(/^\.\//, "")}`;
}

function renderTextParagraphs(paragraphs = []) {
  return paragraphs.map((paragraph) => `<p>${renderInline(paragraph)}</p>`).join("\n");
}

function readPosts() {
  ensureDir(POSTS_DIR);

  const posts = fs
    .readdirSync(POSTS_DIR)
    .filter((fileName) => fileName.endsWith(".md") && !fileName.startsWith("_"))
    .map((fileName) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, fileName), "utf8");
      const { attributes, body } = parseFrontMatter(raw);
      const slug = String(attributes.slug || path.basename(fileName, ".md")).trim();

      if (!attributes.title) throw new Error(`Missing title in ${fileName}`);
      if (!attributes.date) throw new Error(`Missing date in ${fileName}`);

      return {
        slug,
        title: String(attributes.title).trim(),
        date: String(attributes.date).trim(),
        category: String(attributes.category || "??").trim(),
        summary: String(attributes.summary || "").trim(),
        featured: Boolean(attributes.featured),
        tags: Array.isArray(attributes.tags) ? attributes.tags.map((item) => String(item).trim()).filter(Boolean) : [],
        bodyHtml: renderMarkdown(body),
        readingMinutes: readingMinutes(body),
      };
    })
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));

  return posts;
}

function renderDocument({ title, description, stylesheetPath, bodyClass, content }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${escapeHtml(stylesheetPath)}" />
  </head>
  <body class="${escapeHtml(bodyClass || "")}">
    ${content}
  </body>
</html>
`;
}

function renderScene() {
  return `
    <div class="page-scene" aria-hidden="true">
      <div class="scene-gradient scene-gradient-a"></div>
      <div class="scene-gradient scene-gradient-b"></div>
      <div class="scene-gradient scene-gradient-c"></div>
      <div class="scene-grid"></div>
      <div class="scene-vignette"></div>
    </div>
  `;
}

function renderFooter(site, depth = 0) {
  const segments = [
    `<a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">GitHub</a>`,
    `<a href="${escapeHtml(`mailto:${site.email}`)}">${escapeHtml(site.email)}</a>`,
    `<a href="${escapeHtml(toHref("writing.html", depth))}">??</a>`,
  ];

  return `
    <footer class="site-footer">
      <p>${segments.join('<span class="footer-dot">/</span>')}</p>
      <span>${escapeHtml(site.footerNote || "?? GitHub Pages ??")}</span>
    </footer>
  `;
}

function renderTopbar(site, currentKey, depth = 0) {
  return `
    <header class="topbar">
      <a class="topbar-brand" href="${escapeHtml(toHref("index.html", depth))}">
        <span class="topbar-mark">WH</span>
        <span class="topbar-copy">
          <strong>${escapeHtml(site.author)}</strong>
          <span>${escapeHtml(site.affiliation)}</span>
        </span>
      </a>
      <nav class="topbar-nav" aria-label="???">
        ${NAV_ITEMS.map((item) => {
          const state = item.key === currentKey ? " is-current" : "";
          return `<a class="topbar-link${state}" href="${escapeHtml(toHref(item.href, depth))}">${escapeHtml(item.label)}</a>`;
        }).join("")}
      </nav>
    </header>
  `;
}

function renderQuickLinks(quickLinks = [], depth = 0) {
  return `
    <ul class="hero-links" aria-label="????">
      ${quickLinks
        .map((item) => {
          const external = /^(?:[a-z]+:|\/\/)/i.test(item.href);
          return `
            <li>
              <a class="hero-link" href="${escapeHtml(toHref(item.href, depth))}"${
                external ? ' target="_blank" rel="noreferrer"' : ""
              }>
                <span class="hero-link-badge">${escapeHtml(item.short || item.label)}</span>
                <span class="hero-link-label">${escapeHtml(item.label)}</span>
                <span class="hero-link-note">${escapeHtml(item.note || "")}</span>
              </a>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderLatestPosts(posts = [], depth = 0) {
  if (!posts.length) return "";
  return `
    <div class="home-updates">
      <p class="home-updates-label">????</p>
      <div class="home-updates-list">
        ${posts
          .slice(0, 3)
          .map(
            (post) => `
              <a class="home-update-chip" href="${escapeHtml(toHref(`posts/${post.slug}.html`, depth))}">
                <span>${escapeHtml(post.title)}</span>
                <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>
              </a>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderHomePage(siteData, posts) {
  const { site, home, quickLinks } = siteData;
  const content = `
    ${renderScene()}
    <main class="home-shell">
      <section class="hero-panel">
        <p class="hero-eyebrow">${escapeHtml(home.eyebrow)}</p>
        <h1 class="hero-title">${escapeHtml(home.title)}</h1>
        <p class="hero-subtitle">${escapeHtml(home.subtitle)}</p>
        <p class="hero-summary">${escapeHtml(home.summary)}</p>
        <p class="hero-quote">${escapeHtml(home.quote)}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="${escapeHtml(toHref(home.primaryHref, 0))}">${escapeHtml(home.primaryLabel)}</a>
          <a class="button button-secondary" href="${escapeHtml(toHref(home.secondaryHref, 0))}" target="_blank" rel="noreferrer">${escapeHtml(home.secondaryLabel)}</a>
        </div>
        ${renderQuickLinks(quickLinks, 0)}
        ${renderLatestPosts(posts, 0)}
      </section>
      ${renderFooter(site, 0)}
    </main>
  `;

  return renderDocument({
    title: `${site.title} | ${home.title}`,
    description: site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "home-page",
    content,
  });
}

function renderPageIntro(page) {
  return `
    <section class="page-intro panel">
      <p class="page-eyebrow">${escapeHtml(page.eyebrow || "")}</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="page-summary">${escapeHtml(page.intro || "")}</p>
    </section>
  `;
}

function renderAboutPage(siteData) {
  const { site, about } = siteData;
  const content = `
    ${renderScene()}
    <div class="inner-shell">
      ${renderTopbar(site, "about", 0)}
      <main class="page-stack">
        ${renderPageIntro(about)}
        <section class="panel two-column">
          <div class="rich-text">
            ${renderTextParagraphs(about.paragraphs)}
          </div>
          <aside class="side-panel">
            <p class="side-label">???</p>
            <ul class="tag-list">
              ${about.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}
            </ul>
          </aside>
        </section>
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${about.title}`,
    description: about.intro || site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function renderCardGrid(items = [], mode = "stack", depth = 0) {
  return `
    <section class="card-grid ${escapeHtml(mode)}">
      ${items
        .map((item) => {
          const link = item.href
            ? `<a class="text-link" href="${escapeHtml(toHref(item.href, depth))}"${
                /^(?:[a-z]+:|\/\/)/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
              }>${escapeHtml(item.linkLabel || "????")}</a>`
            : "";

          return `
            <article class="panel info-card">
              ${item.kicker ? `<p class="card-kicker">${escapeHtml(item.kicker)}</p>` : ""}
              <h2>${escapeHtml(item.title)}</h2>
              ${item.meta ? `<p class="card-meta">${escapeHtml(item.meta)}</p>` : ""}
              <p>${escapeHtml(item.body)}</p>
              ${link}
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderResearchPage(siteData) {
  const { site, research } = siteData;
  const content = `
    ${renderScene()}
    <div class="inner-shell">
      ${renderTopbar(site, "research", 0)}
      <main class="page-stack">
        ${renderPageIntro(research)}
        ${renderCardGrid(research.items, "triple", 0)}
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${research.title}`,
    description: research.intro || site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function renderProjectsPage(siteData) {
  const { site, projects } = siteData;
  const content = `
    ${renderScene()}
    <div class="inner-shell">
      ${renderTopbar(site, "projects", 0)}
      <main class="page-stack">
        ${renderPageIntro(projects)}
        ${renderCardGrid(projects.items, "double", 0)}
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${projects.title}`,
    description: projects.intro || site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function renderWritingPage(siteData, posts) {
  const { site, writing } = siteData;
  const postCards = posts.length
    ? posts
        .map(
          (post) => `
            <article class="panel post-card">
              <p class="card-kicker">${escapeHtml(post.category)}</p>
              <h2><a href="${escapeHtml(toHref(`posts/${post.slug}.html`, 0))}">${escapeHtml(post.title)}</a></h2>
              <p class="card-meta">${escapeHtml(formatDate(post.date))} / ${post.readingMinutes} ????</p>
              <p>${escapeHtml(post.summary)}</p>
              ${
                post.tags.length
                  ? `<ul class="tag-list compact">${post.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`
                  : ""
              }
            </article>
          `,
        )
        .join("")
    : `<div class="panel empty-state"><p>????????</p></div>`;

  const content = `
    ${renderScene()}
    <div class="inner-shell">
      ${renderTopbar(site, "writing", 0)}
      <main class="page-stack">
        ${renderPageIntro(writing)}
        <section class="post-grid">
          ${postCards}
        </section>
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${writing.title}`,
    description: writing.intro || site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function renderContactPage(siteData) {
  const { site, contact } = siteData;
  const methods = contact.methods
    .map(
      (item) => `
        <article class="panel info-card">
          <p class="card-kicker">${escapeHtml(item.label)}</p>
          <h2>${escapeHtml(item.value)}</h2>
          <p>${escapeHtml(item.note)}</p>
          ${
            item.href
              ? `<a class="text-link" href="${escapeHtml(toHref(item.href, 0))}"${
                  /^(?:[a-z]+:|\/\/)/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>${escapeHtml(item.linkLabel || "??")}</a>`
              : ""
          }
        </article>
      `,
    )
    .join("");

  const content = `
    ${renderScene()}
    <div class="inner-shell">
      ${renderTopbar(site, "contact", 0)}
      <main class="page-stack">
        ${renderPageIntro(contact)}
        <section class="card-grid double">
          ${methods}
        </section>
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${contact.title}`,
    description: contact.intro || site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function renderPostPage(siteData, post) {
  const { site } = siteData;
  const content = `
    ${renderScene()}
    <div class="inner-shell inner-shell-post">
      ${renderTopbar(site, "writing", 1)}
      <main class="page-stack">
        <article class="panel article-shell">
          <a class="back-link" href="${escapeHtml(toHref("writing.html", 1))}">??????</a>
          <p class="card-kicker">${escapeHtml(post.category)}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="card-meta">${escapeHtml(formatDate(post.date))} / ${post.readingMinutes} ????</p>
          ${
            post.tags.length
              ? `<ul class="tag-list compact">${post.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`
              : ""
          }
          <div class="article-body">
            ${post.bodyHtml}
          </div>
        </article>
      </main>
      ${renderFooter(site, 1)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ${post.title}`,
    description: post.summary || site.description,
    stylesheetPath: "../styles.css",
    bodyClass: "inner-page post-page",
    content,
  });
}

function render404(siteData) {
  const { site } = siteData;
  const content = `
    ${renderScene()}
    <div class="inner-shell inner-shell-post">
      ${renderTopbar(site, "", 0)}
      <main class="page-stack">
        <section class="panel page-intro">
          <p class="page-eyebrow">404</p>
          <h1>?????</h1>
          <p class="page-summary">????????????????????????</p>
          <div class="hero-actions left">
            <a class="button button-primary" href="./index.html">????</a>
          </div>
        </section>
      </main>
      ${renderFooter(site, 0)}
    </div>
  `;

  return renderDocument({
    title: `${site.title} | ?????`,
    description: site.description,
    stylesheetPath: "./styles.css",
    bodyClass: "inner-page",
    content,
  });
}

function cleanOutput() {
  ensureDir(OUTPUT_POSTS_DIR);

  for (const fileName of ROOT_PAGES) {
    const target = path.join(ROOT, fileName);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }

  for (const fileName of fs.readdirSync(OUTPUT_POSTS_DIR)) {
    const target = path.join(OUTPUT_POSTS_DIR, fileName);
    if (fs.statSync(target).isFile() && fileName.endsWith(".html")) {
      fs.unlinkSync(target);
    }
  }
}

function build() {
  const siteData = readJson(SITE_CONFIG_PATH);
  const posts = readPosts();

  cleanOutput();

  writeFile(path.join(ROOT, "index.html"), renderHomePage(siteData, posts));
  writeFile(path.join(ROOT, "about.html"), renderAboutPage(siteData));
  writeFile(path.join(ROOT, "research.html"), renderResearchPage(siteData));
  writeFile(path.join(ROOT, "projects.html"), renderProjectsPage(siteData));
  writeFile(path.join(ROOT, "writing.html"), renderWritingPage(siteData, posts));
  writeFile(path.join(ROOT, "contact.html"), renderContactPage(siteData));
  writeFile(path.join(ROOT, "404.html"), render404(siteData));

  for (const post of posts) {
    writeFile(path.join(OUTPUT_POSTS_DIR, `${post.slug}.html`), renderPostPage(siteData, post));
  }

  console.log(`Built ${ROOT_PAGES.length} pages and ${posts.length} post(s) into ${ROOT}.`);
}

build();
