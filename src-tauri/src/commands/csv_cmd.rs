use serde::Serialize;
use std::fs;

#[derive(Serialize)]
pub struct CsvData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
    pub delimiter: char,
}

fn detect_delimiter(sample: &str) -> u8 {
    let delimiters = [b',', b'\t', b';', b'|'];
    let first_line = sample.lines().next().unwrap_or("");

    delimiters
        .into_iter()
        .max_by_key(|&d| first_line.as_bytes().iter().filter(|&&b| b == d).count())
        .unwrap_or(b',')
}

#[tauri::command]
pub fn parse_csv(path: String, offset: Option<usize>, limit: Option<usize>) -> Result<CsvData, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let delimiter = detect_delimiter(&content);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let all_records: Vec<Vec<String>> = reader
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|f| f.to_string()).collect())
        .collect();

    let total_rows = all_records.len();
    let start = offset.unwrap_or(0).min(total_rows);
    let count = limit.unwrap_or(total_rows);
    let rows: Vec<Vec<String>> = all_records.into_iter().skip(start).take(count).collect();

    Ok(CsvData {
        headers,
        rows,
        total_rows,
        delimiter: delimiter as char,
    })
}
