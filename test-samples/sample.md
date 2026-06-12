# OpenView Test Document

This is a comprehensive markdown file for testing **bold**, *italic*, ~~strikethrough~~, and `inline code` rendering.

## Headings

### Third Level
#### Fourth Level
##### Fifth Level
###### Sixth Level

## Links and Images

- [OpenView on GitHub](https://github.com/lijingcheng3359/openview)
- [Tauri Documentation](https://tauri.app/)
- Auto-linked URL: https://www.solidjs.com/

![Placeholder Image](https://via.placeholder.com/600x200/0a84ff/ffffff?text=OpenView+Preview)

## Text Formatting

This paragraph has **bold text**, *italic text*, ***bold and italic***, ~~strikethrough~~, and `inline code`. Here is a [link with title](https://tauri.app/ "Tauri Homepage").

> This is a blockquote.
>
> It can span multiple lines and contain **formatting**.
>
> > Nested blockquotes are also supported.

## Lists

### Unordered
- Item one
  - Nested item A
  - Nested item B
    - Deeply nested
- Item two
- Item three

### Ordered
1. First step
2. Second step
   1. Sub-step 2.1
   2. Sub-step 2.2
3. Third step

### Task Lists
- [x] Implement markdown viewer
- [x] Add CSV support
- [x] Add Mermaid diagrams
- [x] Git integration
- [x] Project switcher
- [ ] JSON viewer with syntax highlighting
- [ ] Custom app icon
- [ ] GitHub Actions CI/CD

## Code Blocks

Inline: use `JSON.parse()` to parse a string.

```rust
#[tauri::command]
pub fn parse_markdown(content: String) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_GFM);
    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::with_capacity(content.len() * 2);
    html::push_html(&mut html_output, parser);
    html_output
}
```

```typescript
function detectMode(filename: string): ViewMode {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md": return "markdown";
    case "csv": return "csv";
    case "json": return "json";
    default: return "plaintext";
  }
}
```

```json
{
  "name": "open-view",
  "version": "0.1.0",
  "dependencies": {
    "solid-js": "^1.9.13",
    "mermaid": "^11.15.0"
  }
}
```

## Tables

### Simple Table

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown Viewer | Done | High |
| CSV Viewer | Done | High |
| JSON Viewer | In Progress | Medium |
| YAML Viewer | Planned | Low |

### Wide Table (horizontal scroll test)

| ID | Name | Email | Role | Department | Location | Start Date | Salary | Status | Notes |
|----|------|-------|------|------------|----------|------------|--------|--------|-------|
| 1 | Alice Zhang | alice@example.com | Engineer | Platform | Shanghai | 2023-01-15 | 35000 | Active | Tech lead |
| 2 | Bob Li | bob@example.com | Designer | Product | Beijing | 2023-03-22 | 28000 | Active | UI/UX |
| 3 | Carol Wang | carol@example.com | PM | Product | Hangzhou | 2022-11-01 | 32000 | On Leave | Parental |
| 4 | Dave Chen | dave@example.com | Engineer | Platform | Shanghai | 2024-06-10 | 25000 | Active | New hire |

### Alignment

| Left | Center | Right |
|:-----|:------:|------:|
| L1 | C1 | 100 |
| L2 | C2 | 2,500 |
| L3 | C3 | 99,999 |

## Horizontal Rule

---

## Math-like Content

The formula E = mc² is well known. In code: `E = m * c ** 2`.

## Special Characters

- Ampersand: &
- Less than: <
- Greater than: >
- Quote: "hello"
- CJK: 你好世界 こんにちは 안녕하세요
- Emoji: 🚀 🎉 ✅ ❌ 💡

## Long Paragraph (scroll test)

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit.

## Footnote-style (GFM extension test)

This is text with a reference[^1].

[^1]: This is the footnote content.
