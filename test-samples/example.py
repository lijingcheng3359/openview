#!/usr/bin/env python3
"""A sample Python script for testing syntax highlighting."""

import os
import sys
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    host: str = "localhost"
    port: int = 8080
    debug: bool = False
    name: Optional[str] = None


def fibonacci(n: int) -> list[int]:
    if n <= 0:
        return []
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]


class Server:
    def __init__(self, config: Config):
        self.config = config
        self._running = False

    async def start(self):
        self._running = True
        print(f"Server running on {self.config.host}:{self.config.port}")

    def stop(self):
        self._running = False


if __name__ == "__main__":
    cfg = Config(debug=True, name="test-server")
    numbers = fibonacci(10)
    print(f"Fibonacci: {numbers}")
    print(f"Config: {cfg}")
