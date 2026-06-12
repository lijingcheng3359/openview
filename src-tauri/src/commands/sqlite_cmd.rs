use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct SqliteData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

#[tauri::command]
pub fn sqlite_list_tables(path: String) -> Result<Vec<String>, String> {
    let conn = Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map_err(|e| e.to_string())?;

    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tables)
}

#[tauri::command]
pub fn sqlite_query_table(
    path: String,
    table: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<SqliteData, String> {
    let conn = Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;

    let safe_table = validate_table_name(&table)?;

    let mut info_stmt = conn
        .prepare(&format!("PRAGMA table_info({})", safe_table))
        .map_err(|e| e.to_string())?;

    let headers: Vec<String> = info_stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total_rows: usize = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM {}", safe_table),
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(1000);
    let off = offset.unwrap_or(0);

    let mut data_stmt = conn
        .prepare(&format!(
            "SELECT * FROM {} LIMIT {} OFFSET {}",
            safe_table, lim, off
        ))
        .map_err(|e| e.to_string())?;

    let col_count = headers.len();
    let rows: Vec<Vec<String>> = data_stmt
        .query_map([], |row| {
            let mut cells = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: String = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => "NULL".to_string(),
                    Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                    Ok(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                    Ok(rusqlite::types::ValueRef::Text(s)) => {
                        String::from_utf8_lossy(s).to_string()
                    }
                    Ok(rusqlite::types::ValueRef::Blob(b)) => format!("[BLOB {} bytes]", b.len()),
                    Err(_) => String::new(),
                };
                cells.push(val);
            }
            Ok(cells)
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(SqliteData {
        headers,
        rows,
        total_rows,
    })
}

fn validate_table_name(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("Table name cannot be empty".to_string());
    }
    if name.contains('"') || name.contains(';') || name.contains('\'') {
        return Err("Invalid table name".to_string());
    }
    Ok(format!("\"{}\"", name))
}
