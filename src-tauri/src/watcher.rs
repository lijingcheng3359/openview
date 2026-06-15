use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { watcher: None }
    }
}

#[tauri::command]
pub fn watch_path(path: String, app: AppHandle, state: tauri::State<'_, Arc<Mutex<WatcherState>>>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;

    // Drop existing watcher
    guard.watcher = None;

    let watch_path = Path::new(&path).to_path_buf();
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let app_handle = app.clone();
    let last_emit = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                use notify::EventKind::*;
                match event.kind {
                    Create(_) | Remove(_) | Modify(_) => {}
                    _ => return,
                }

                // Debounce: skip if last emit was < 500ms ago
                let mut last = last_emit.lock().unwrap();
                let now = Instant::now();
                if now.duration_since(*last) < Duration::from_millis(500) {
                    return;
                }
                *last = now;

                let changed_dir = event.paths.first()
                    .and_then(|p| {
                        if p.is_dir() { Some(p.to_string_lossy().to_string()) }
                        else { p.parent().map(|pp| pp.to_string_lossy().to_string()) }
                    })
                    .unwrap_or_default();

                let _ = app_handle.emit("fs-changed", changed_dir);
            }
        },
        notify::Config::default(),
    ).map_err(|e| e.to_string())?;

    watcher.watch(&watch_path, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    guard.watcher = Some(watcher);

    Ok(())
}
