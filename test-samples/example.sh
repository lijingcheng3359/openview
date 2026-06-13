#!/bin/bash
# Sample shell script for testing syntax highlighting

set -euo pipefail

readonly LOG_DIR="/var/log/myapp"
readonly CONFIG_FILE="${HOME}/.config/myapp.conf"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" >&2
}

check_deps() {
    local deps=("curl" "jq" "grep")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            log "ERROR" "Missing dependency: $dep"
            return 1
        fi
    done
    log "INFO" "All dependencies found"
}

main() {
    check_deps || exit 1

    local count=0
    while IFS= read -r line; do
        ((count++))
        if [[ "$line" =~ ^#.* ]]; then
            continue
        fi
        echo "Line $count: $line"
    done < "${1:-/dev/stdin}"

    log "INFO" "Processed $count lines"
}

main "$@"
