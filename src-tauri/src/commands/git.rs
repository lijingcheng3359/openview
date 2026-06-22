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
    pub parents: Vec<String>,
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
pub fn git_branch(path: String) -> Result<String, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    Ok(head.shorthand().unwrap_or("HEAD").to_string())
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    // List both local and remote-tracking branches so the picker exposes remote
    // branches too, not just whatever is checked out locally.
    let branches = repo
        .branches(None)
        .map_err(|e| e.to_string())?;
    // Current HEAD branch, pinned to the top of the list so the branch the user
    // is actually on opens first instead of being buried in the alphabetical run.
    let head_branch = repo
        .head()
        .ok()
        .filter(|h| h.is_branch())
        .and_then(|h| h.shorthand().map(|s| s.to_string()));
    // This is a local viewer, not the remote's server view: show local branches
    // first (what the user checks out and works on), then remote-tracking ones as
    // a read-only supplement. Strip the leading `<remote>/` prefix so a local
    // `master` and a remote `origin/master` read as one entry, and de-duplicate
    // against locals. `git_log` resolves a bare name back to refs/heads,
    // refs/remotes/<name>, or refs/remotes/origin/<name>, so the prefix isn't
    // needed for selection.
    let mut local: Vec<String> = Vec::new();
    let mut remote: Vec<String> = Vec::new();
    for (branch, kind) in branches.filter_map(|b| b.ok()) {
        let Some(name) = branch.name().ok().flatten() else {
            continue;
        };
        match kind {
            git2::BranchType::Local => local.push(name.to_string()),
            git2::BranchType::Remote => {
                // Skip the remote's symbolic HEAD alias. Depending on the ref it
                // surfaces either as "origin/HEAD" or, once shortened, as a bare
                // remote name like "origin" with no branch segment.
                if name.ends_with("/HEAD") || !name.contains('/') {
                    continue;
                }
                // Drop the `<remote>/` prefix (first path segment) for display.
                let stripped = name.splitn(2, '/').nth(1).unwrap_or(name);
                remote.push(stripped.to_string());
            }
        }
    }
    local.sort();
    remote.sort();
    remote.dedup();
    let mut out = local.clone();
    for name in remote {
        if !local.contains(&name) {
            out.push(name);
        }
    }
    // Float the current branch to the front so it's the default selection.
    if let Some(head) = head_branch {
        if let Some(pos) = out.iter().position(|n| n == &head) {
            let name = out.remove(pos);
            out.insert(0, name);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn git_log(
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
    branch: Option<String>,
) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;
    // Graph only the selected branch's reachable history, matching the web git
    // graph's default scope (current branch, not every remote ref). A given
    // branch name may be local (refs/heads/<name>) or remote-tracking
    // (refs/remotes/<name>); try local first, then remote, then fall back to
    // HEAD when no branch is selected.
    match branch.as_deref().filter(|b| !b.is_empty()) {
        Some(name) => {
            // The dropdown shows bare names (no `<remote>/` prefix), so try, in
            // order: a local branch, a fully-qualified remote-tracking ref, then
            // the same name under refs/remotes/origin/. Fall back to HEAD.
            let local = format!("refs/heads/{}", name);
            let remote = format!("refs/remotes/{}", name);
            let remote_origin = format!("refs/remotes/origin/{}", name);
            if repo.find_reference(&local).is_ok() {
                revwalk.push_ref(&local).map_err(|e| e.to_string())?;
            } else if repo.find_reference(&remote).is_ok() {
                revwalk.push_ref(&remote).map_err(|e| e.to_string())?;
            } else if repo.find_reference(&remote_origin).is_ok() {
                revwalk.push_ref(&remote_origin).map_err(|e| e.to_string())?;
            } else {
                revwalk.push_head().map_err(|e| e.to_string())?;
            }
        }
        None => {
            revwalk.push_head().map_err(|e| e.to_string())?;
        }
    }

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
            let short_hash = hash[..8].to_string();
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
                parents: commit.parent_ids().map(|id| id.to_string()).collect(),
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
