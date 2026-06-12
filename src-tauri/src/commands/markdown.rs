use pulldown_cmark::{html, Options, Parser};

#[tauri::command]
pub fn parse_markdown(content: String) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_GFM);
    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::with_capacity(content.len() * 2);
    html::push_html(&mut html_output, parser);
    html_output
}
