use git2::{DiffOptions, Patch, Repository, Sort};
use serde::Serialize;

#[derive(Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: i64,
    pub message: String,
    pub refs: Vec<String>,
}

#[derive(Serialize)]
pub struct GitDiffFile {
    pub path: String,
    pub status: String,
    pub patch: Option<String>,
}

#[derive(Serialize)]
pub struct GitDiffResult {
    pub files: Vec<GitDiffFile>,
}

#[tauri::command]
pub fn git_detect(path: String) -> bool {
    Repository::discover(&path).is_ok()
}

#[tauri::command]
pub fn git_log(path: String, offset: Option<usize>, limit: Option<usize>) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;

    let references = collect_refs(&repo);
    let start = offset.unwrap_or(0);
    let count = limit.unwrap_or(50);

    let commits: Vec<GitCommit> = revwalk
        .filter_map(|oid| oid.ok())
        .skip(start)
        .take(count)
        .filter_map(|oid| {
            let commit = repo.find_commit(oid).ok()?;
            let hash = oid.to_string();
            let short_hash = hash[..7].to_string();
            let author = commit.author();
            let refs = references
                .iter()
                .filter(|(h, _)| *h == hash)
                .map(|(_, name)| name.clone())
                .collect();

            Some(GitCommit {
                hash,
                short_hash,
                author: author.name().unwrap_or("Unknown").to_string(),
                email: author.email().unwrap_or("").to_string(),
                date: commit.time().seconds(),
                message: commit.message().unwrap_or("").to_string(),
                refs,
            })
        })
        .collect();

    Ok(commits)
}

fn collect_refs(repo: &Repository) -> Vec<(String, String)> {
    let mut refs = Vec::new();
    if let Ok(references) = repo.references() {
        for reference in references.flatten() {
            if let (Some(name), Some(target)) = (reference.shorthand(), reference.target()) {
                refs.push((target.to_string(), name.to_string()));
            }
        }
    }
    refs
}

#[tauri::command]
pub fn git_diff(path: String, commit_hash: Option<String>) -> Result<GitDiffResult, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;

    let diff = if let Some(hash) = commit_hash {
        let oid = git2::Oid::from_str(&hash).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
            .map_err(|e| e.to_string())?
    } else {
        let head = repo.head().map_err(|e| e.to_string())?;
        let tree = head.peel_to_tree().map_err(|e| e.to_string())?;
        let mut opts = DiffOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);
        repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut opts))
            .map_err(|e| e.to_string())?
    };

    let num_deltas = diff.deltas().len();
    let mut files = Vec::new();

    for idx in 0..num_deltas {
        let delta = diff.get_delta(idx).unwrap();
        let path_str = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Untracked => "untracked",
            _ => "other",
        };

        let patch_text = if let Ok(Some(mut patch)) = Patch::from_diff(&diff, idx) {
            patch.to_buf().ok().map(|buf| {
                String::from_utf8_lossy(buf.as_ref()).to_string()
            })
        } else {
            None
        };

        files.push(GitDiffFile {
            path: path_str,
            status: status.to_string(),
            patch: patch_text,
        });
    }

    Ok(GitDiffResult { files })
}
