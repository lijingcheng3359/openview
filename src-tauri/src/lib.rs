mod commands;
mod watcher;

use commands::{csv_cmd, file, git, markdown, sqlite_cmd};
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(watcher::WatcherState::new())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file::read_dir,
            file::read_file,
            file::search_files,
            markdown::parse_markdown,
            csv_cmd::parse_csv,
            git::git_detect,
            git::git_branch,
            git::git_log,
            git::git_diff,
            sqlite_cmd::sqlite_list_tables,
            sqlite_cmd::sqlite_query_table,
            watcher::watch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
