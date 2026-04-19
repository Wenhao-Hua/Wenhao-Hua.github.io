# Wenhao Hua Homepage

这是一个适合部署到 `Wenhao-Hua.github.io` 的多页面静态个人主页博客。

站点特点：

- 站点是多页面结构，不是单页滚动
- 包含首页、About、Research、Projects、Writing、Contact 等独立页面
- 博客文章写在 `content/posts/*.md`
- 运行 `node build.js` 后会生成多个根目录页面和 `posts/*.html`
- 不依赖任何第三方 npm 包，适合直接放到 GitHub Pages

## 目录说明

- `build.js`：静态页面生成脚本
- `content/site.json`：站点配置
- `content/posts/*.md`：文章源文件
- `content/posts/_template.md`：文章模板
- `styles.css`：全站样式
- `about.html` / `research.html` / `projects.html` / `writing.html` / `contact.html`：生成后的独立页面
- `posts/*.html`：生成后的文章页

## 新增文章

1. 复制 `content/posts/_template.md`
2. 改成新的文件名，例如 `content/posts/my-first-note.md`
3. 修改 front matter 中的字段：
   - `title`
   - `slug`
   - `date`
   - `category`
   - `summary`
   - `featured`
   - `tags`
4. 写正文
5. 运行构建命令

## 构建命令

```bash
node build.js
```

如果你更习惯 npm，也可以使用：

```bash
npm.cmd run build
```

## 部署到 GitHub Pages

这个仓库目标是：

- `https://github.com/Wenhao-Hua/Wenhao-Hua.github.io`

对于 `username.github.io` 这种仓库，只要把生成后的静态文件推到 `main` 分支根目录即可直接作为主页。

## 注意

- `slug` 必须唯一
- 以 `_` 开头的 Markdown 文件不会被生成
- 删除文章后重新运行 `node build.js`，旧的 `posts/*.html` 会自动清理
