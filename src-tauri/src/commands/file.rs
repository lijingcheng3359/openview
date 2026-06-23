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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn read_dir_errors_on_non_directory() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.txt");
        fs::write(&file, "x").unwrap();
        let res = read_dir(file.to_string_lossy().to_string());
        assert!(res.is_err());
    }

    #[test]
    fn read_dir_lists_directories_before_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("zebra.txt"), "").unwrap();
        fs::create_dir(dir.path().join("alpha")).unwrap();
        fs::write(dir.path().join("beta.txt"), "").unwrap();

        let entries = read_dir(dir.path().to_string_lossy().to_string()).unwrap();
        // Directory comes first regardless of alphabetical position.
        assert_eq!(entries[0].name, "alpha");
        assert!(entries[0].is_dir);
        // Files follow, sorted case-insensitively.
        assert_eq!(entries[1].name, "beta.txt");
        assert_eq!(entries[2].name, "zebra.txt");
    }

    #[test]
    fn read_dir_sorts_case_insensitively() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("Banana"), "").unwrap();
        fs::write(dir.path().join("apple"), "").unwrap();
        let entries = read_dir(dir.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(entries[0].name, "apple");
        assert_eq!(entries[1].name, "Banana");
    }

    #[test]
    fn read_dir_captures_extension() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("data.csv"), "").unwrap();
        let entries = read_dir(dir.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(entries[0].extension.as_deref(), Some("csv"));
    }

    #[test]
    fn read_file_returns_contents() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.txt");
        fs::write(&file, "hello world").unwrap();
        let out = read_file(file.to_string_lossy().to_string()).unwrap();
        assert_eq!(out, "hello world");
    }

    #[test]
    fn read_file_errors_on_missing_path() {
        let res = read_file("/no/such/file/anywhere.txt".to_string());
        assert!(res.is_err());
    }

    #[test]
    fn search_files_matches_case_insensitively() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("ReadMe.md"), "").unwrap();
        fs::write(dir.path().join("other.txt"), "").unwrap();
        let results =
            search_files(dir.path().to_string_lossy().to_string(), "readme".to_string()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "ReadMe.md");
    }

    #[test]
    fn search_files_recurses_into_subdirectories() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("nested").join("deep");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("target.rs"), "").unwrap();
        let results =
            search_files(dir.path().to_string_lossy().to_string(), "target".to_string()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "target.rs");
    }

    #[test]
    fn search_files_caps_results_at_limit() {
        let dir = tempdir().unwrap();
        for i in 0..60 {
            fs::write(dir.path().join(format!("match{}.txt", i)), "").unwrap();
        }
        let results =
            search_files(dir.path().to_string_lossy().to_string(), "match".to_string()).unwrap();
        // search_recursive hard-caps at 50.
        assert_eq!(results.len(), 50);
    }

    #[test]
    fn search_files_returns_empty_for_no_match() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "").unwrap();
        let results =
            search_files(dir.path().to_string_lossy().to_string(), "zzz".to_string()).unwrap();
        assert!(results.is_empty());
    }
}
