use crate::path_policy::is_generated_dir_name;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BATCH_DELAY: Duration = Duration::from_millis(200);
const BATCH_MAX_WAIT: Duration = Duration::from_secs(1);
const MAX_BATCH_PATHS: usize = 2048;
const EVENT_CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct FsChangedPayload {
    pub root: String,
    pub paths: Vec<String>,
    pub rescan: bool,
}

enum BatchMessage {
    Paths(Vec<String>),
}

#[derive(Clone)]
struct EventSink {
    sender: SyncSender<BatchMessage>,
    overflowed: Arc<AtomicBool>,
}

impl EventSink {
    fn send(&self, paths: Vec<String>) {
        if let Err(TrySendError::Full(_)) = self.sender.try_send(BatchMessage::Paths(paths)) {
            self.overflowed.store(true, Ordering::Release);
        }
    }
}

struct EventBatcher {
    sender: Option<SyncSender<BatchMessage>>,
    overflowed: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl EventBatcher {
    fn spawn<F>(root: String, emit: F) -> Result<Self, String>
    where
        F: Fn(FsChangedPayload) + Send + 'static,
    {
        let (sender, receiver) = mpsc::sync_channel(EVENT_CHANNEL_CAPACITY);
        let overflowed = Arc::new(AtomicBool::new(false));
        let worker_overflowed = Arc::clone(&overflowed);
        let worker = thread::Builder::new()
            .name("openview-fs-event-batcher".to_string())
            .spawn(move || run_batch_worker(root, receiver, worker_overflowed, emit))
            .map_err(|error| error.to_string())?;
        Ok(Self {
            sender: Some(sender),
            overflowed,
            worker: Some(worker),
        })
    }

    fn sink(&self) -> EventSink {
        EventSink {
            sender: self
                .sender
                .as_ref()
                .expect("batch sender is unavailable")
                .clone(),
            overflowed: Arc::clone(&self.overflowed),
        }
    }

    fn stop(&mut self) {
        self.sender = None;
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for EventBatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run_batch_worker<F>(
    root: String,
    receiver: Receiver<BatchMessage>,
    overflowed: Arc<AtomicBool>,
    emit: F,
) where
    F: Fn(FsChangedPayload),
{
    loop {
        let BatchMessage::Paths(mut paths) = match receiver.recv() {
            Ok(message) => message,
            Err(_) => return,
        };
        if paths.len() > MAX_BATCH_PATHS {
            paths.truncate(MAX_BATCH_PATHS);
            overflowed.store(true, Ordering::Release);
        }
        let started = Instant::now();
        let mut seen: HashSet<String> = paths.iter().cloned().collect();

        loop {
            let remaining = BATCH_MAX_WAIT.saturating_sub(started.elapsed());
            if remaining.is_zero() || paths.len() >= MAX_BATCH_PATHS {
                break;
            }
            match receiver.recv_timeout(BATCH_DELAY.min(remaining)) {
                Ok(BatchMessage::Paths(next_paths)) => {
                    for path in next_paths {
                        if seen.contains(&path) {
                            continue;
                        }
                        if paths.len() >= MAX_BATCH_PATHS {
                            overflowed.store(true, Ordering::Release);
                            break;
                        }
                        seen.insert(path.clone());
                        paths.push(path);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => break,
            }
        }

        emit(FsChangedPayload {
            root: root.clone(),
            paths,
            rescan: overflowed.swap(false, Ordering::AcqRel),
        });
    }
}

pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
    batcher: Option<EventBatcher>,
    generation: u64,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: None,
            batcher: None,
            generation: 0,
        }
    }

    fn take_current(&mut self) -> (Option<RecommendedWatcher>, Option<EventBatcher>) {
        (self.watcher.take(), self.batcher.take())
    }
}

fn is_supported_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
    )
}

fn is_boundary_event(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Remove(_))
}

fn is_relevant_git_path(remaining: &[&OsStr]) -> bool {
    let Some((first, rest)) = remaining.split_first() else {
        return true;
    };

    if *first == OsStr::new("refs") {
        return true;
    }

    rest.is_empty()
        && ["HEAD", "index", "packed-refs"]
            .iter()
            .any(|name| *first == OsStr::new(name))
}

fn is_relevant_watch_path(root: &Path, path: &Path, kind: &EventKind) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };

    let mut components = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(name) => components.push(name),
            Component::CurDir => {}
            _ => return false,
        }
    }

    for (index, component) in components.iter().enumerate() {
        if !is_generated_dir_name(component) {
            continue;
        }

        let remaining = &components[index + 1..];
        if remaining.is_empty() {
            return !path.is_dir() || is_boundary_event(kind);
        }
        if *component == OsStr::new(".git") {
            return is_relevant_git_path(remaining);
        }
        return false;
    }

    true
}

fn filter_event_paths(root: &Path, event: &Event) -> Vec<String> {
    if !is_supported_event(&event.kind) {
        return Vec::new();
    }

    let mut seen = HashSet::new();
    event
        .paths
        .iter()
        .filter(|path| is_relevant_watch_path(root, path, &event.kind))
        .map(|path| path.to_string_lossy().to_string())
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

#[tauri::command]
pub fn watch_path(
    path: String,
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let (generation, old_watcher, old_batcher) = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.generation = guard.generation.wrapping_add(1);
        let generation = guard.generation;
        let (watcher, batcher) = guard.take_current();
        (generation, watcher, batcher)
    };
    drop(old_watcher);
    drop(old_batcher);

    let watch_path = Path::new(&path).to_path_buf();
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let app_handle = app.clone();
    let batcher = EventBatcher::spawn(path.clone(), move |payload| {
        let _ = app_handle.emit("fs-changed", payload);
    })?;
    let sink = batcher.sink();
    let callback_root = watch_path.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let Ok(event) = res else {
                return;
            };
            let paths = filter_event_paths(&callback_root, &event);
            if !paths.is_empty() {
                sink.send(paths);
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let replaced = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if guard.generation != generation {
            drop(guard);
            drop(watcher);
            drop(batcher);
            return Ok(());
        }
        let replaced = guard.take_current();
        guard.watcher = Some(watcher);
        guard.batcher = Some(batcher);
        replaced
    };
    drop(replaced.0);
    drop(replaced.1);
    Ok(())
}

pub struct FollowState {
    watcher: Option<RecommendedWatcher>,
}

impl FollowState {
    pub fn new() -> Self {
        Self { watcher: None }
    }
}

fn read_active_project() -> Option<String> {
    let home = std::env::var_os("HOME")?;
    let file = Path::new(&home).join(".open-term").join("active-project");
    let content = std::fs::read_to_string(file).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[tauri::command]
pub fn get_terminal_project() -> Option<String> {
    read_active_project()
}

#[tauri::command]
pub fn watch_terminal_project(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<FollowState>>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.watcher.is_some() {
        return Ok(());
    }

    let home = std::env::var_os("HOME").ok_or("HOME not set")?;
    let dir = Path::new(&home).join(".open-term");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                use notify::EventKind::*;
                match event.kind {
                    Create(_) | Modify(_) => {}
                    _ => return,
                }
                let touched = event.paths.iter().any(|p| {
                    p.file_name()
                        .map(|n| n == "active-project")
                        .unwrap_or(false)
                });
                if !touched {
                    return;
                }
                if let Some(path) = read_active_project() {
                    let _ = app_handle.emit("terminal-project-changed", path);
                }
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    guard.watcher = Some(watcher);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn event(kind: EventKind, paths: &[&str]) -> Event {
        let mut event = Event::new(kind);
        event.paths = paths.iter().map(PathBuf::from).collect();
        event
    }

    #[test]
    fn generated_paths_keep_only_directory_boundary_create_and_remove() {
        let dir = tempdir().unwrap();
        let node_modules = dir.path().join("node_modules");
        let nested_file = node_modules.join("package/index.js");
        fs::create_dir_all(nested_file.parent().unwrap()).unwrap();
        fs::write(&nested_file, "").unwrap();

        assert!(is_relevant_watch_path(
            dir.path(),
            &node_modules,
            &EventKind::Create(CreateKind::Folder),
        ));
        assert!(!is_relevant_watch_path(
            dir.path(),
            &nested_file,
            &EventKind::Modify(ModifyKind::Any),
        ));
        assert!(!is_relevant_watch_path(
            dir.path(),
            &node_modules,
            &EventKind::Modify(ModifyKind::Any),
        ));
        assert!(is_relevant_watch_path(
            dir.path(),
            &dir.path().join("target"),
            &EventKind::Remove(RemoveKind::Folder),
        ));
    }

    #[test]
    fn leaf_files_named_like_generated_directories_remain_relevant() {
        let dir = tempdir().unwrap();
        for name in ["target", "build", "out"] {
            let path = dir.path().join(name);
            fs::write(&path, "content").unwrap();
            assert!(is_relevant_watch_path(
                dir.path(),
                &path,
                &EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
            ));
        }
    }

    #[test]
    fn similarly_named_paths_remain_relevant() {
        let root = Path::new("/project");
        for path in [
            "/project/.github/workflows/check.yml",
            "/project/node_modules_backup/file.js",
            "/project/targeted/result.txt",
        ] {
            assert!(is_relevant_watch_path(
                root,
                Path::new(path),
                &EventKind::Modify(ModifyKind::Any),
            ));
        }
    }

    #[test]
    fn git_metadata_filter_keeps_only_refresh_relevant_paths() {
        let root = Path::new("/project");
        for path in [
            "/project/.git/HEAD",
            "/project/.git/index",
            "/project/.git/packed-refs",
            "/project/.git/refs",
            "/project/.git/refs/heads/main",
        ] {
            assert!(is_relevant_watch_path(
                root,
                Path::new(path),
                &EventKind::Modify(ModifyKind::Any),
            ));
        }
        for path in [
            "/project/.git/config",
            "/project/.git/objects/ab/cdef",
            "/project/.git/logs/HEAD",
            "/project/.git/HEAD.lock",
        ] {
            assert!(!is_relevant_watch_path(
                root,
                Path::new(path),
                &EventKind::Modify(ModifyKind::Any),
            ));
        }
    }

    #[test]
    fn filtering_mixed_paths_preserves_relevant_paths_and_deduplicates() {
        let event = event(
            EventKind::Modify(ModifyKind::Any),
            &[
                "/project/src/old.rs",
                "/project/node_modules/pkg/index.js",
                "/project/src/new.rs",
                "/project/src/new.rs",
                "/elsewhere/file.rs",
            ],
        );

        assert_eq!(
            filter_event_paths(Path::new("/project"), &event),
            vec![
                "/project/src/old.rs".to_string(),
                "/project/src/new.rs".to_string(),
            ]
        );
    }

    #[test]
    fn irrelevant_event_kinds_are_rejected() {
        let event = event(
            EventKind::Access(AccessKind::Any),
            &["/project/src/main.rs"],
        );
        assert!(filter_event_paths(Path::new("/project"), &event).is_empty());
    }

    #[test]
    fn batch_worker_coalesces_and_deduplicates_paths() {
        let (payload_sender, payload_receiver) = mpsc::channel();
        let mut batcher = EventBatcher::spawn("/project".to_string(), move |payload| {
            payload_sender.send(payload).unwrap();
        })
        .unwrap();
        let sink = batcher.sink();
        sink.send(vec!["/project/a".to_string(), "/project/b".to_string()]);
        sink.send(vec!["/project/b".to_string(), "/project/c".to_string()]);

        let payload = payload_receiver
            .recv_timeout(Duration::from_secs(2))
            .unwrap();
        assert_eq!(payload.root, "/project");
        assert_eq!(
            payload.paths,
            vec![
                "/project/a".to_string(),
                "/project/b".to_string(),
                "/project/c".to_string(),
            ]
        );
        assert!(!payload.rescan);
        drop(sink);
        batcher.stop();
    }
}
