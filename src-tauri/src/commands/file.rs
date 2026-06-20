use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<FileEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            Some(FileEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                extension: entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_string()),
            })
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn search_files(root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(Path::new(&root), &query_lower, &mut results, 50);
    Ok(results)
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<FileEntry>, limit: usize) {
    if results.len() >= limit {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut dirs = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            dirs.push(entry.path());
        } else if name.to_lowercase().contains(query) {
            results.push(FileEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir: false,
                extension: entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_string()),
            });
            if results.len() >= limit {
                return;
            }
        }
    }
    for d in dirs {
        search_recursive(&d, query, results, limit);
        if results.len() >= limit {
            return;
        }
    }
}
