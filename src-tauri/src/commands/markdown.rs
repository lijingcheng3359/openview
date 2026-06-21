use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag};
use std::path::Path;

#[tauri::command]
pub fn parse_markdown(content: String, base_path: String) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_GFM);

    let parser = Parser::new_ext(&content, options);
    let base = Path::new(&base_path);

    let events: Vec<Event> = parser
        .map(|event| match event {
            Event::Start(Tag::Image { link_type, dest_url, title, id }) => {
                let new_url = resolve_image_url(&dest_url, base);
                Event::Start(Tag::Image {
                    link_type,
                    dest_url: CowStr::from(new_url),
                    title,
                    id,
                })
            }
            other => other,
        })
        .collect();

    let mut html_output = String::with_capacity(content.len() * 2);
    html::push_html(&mut html_output, events.into_iter());
    html_output
}

fn resolve_image_url(url: &str, base: &Path) -> String {
    if url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("asset://")
        || url.starts_with("data:")
    {
        return url.to_string();
    }

    let abs = base.join(url);
    format!("asset://localhost/{}", abs.display())
}
