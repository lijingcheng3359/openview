use std::ffi::OsStr;

pub const GENERATED_DIR_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    ".cache",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".gradle",
    "DerivedData",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "venv",
];

pub fn is_generated_dir_name(name: &OsStr) -> bool {
    GENERATED_DIR_NAMES
        .iter()
        .any(|candidate| name == OsStr::new(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_directory_names_match_exactly() {
        for name in GENERATED_DIR_NAMES {
            assert!(is_generated_dir_name(OsStr::new(name)), "{name}");
        }
    }

    #[test]
    fn similar_names_are_not_treated_as_generated() {
        for name in [
            ".github",
            ".gitignore",
            "node_modules_backup",
            "targeted",
            "distribution",
            "builder",
            "DerivedData-old",
            "venv2",
        ] {
            assert!(!is_generated_dir_name(OsStr::new(name)), "{name}");
        }
    }
}
