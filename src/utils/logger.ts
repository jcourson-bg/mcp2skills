/**
 * Logger utility for consistent console output
 */

import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";
let quiet = false;

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setQuiet(value: boolean): void {
  quiet = value;
}

function shouldLog(level: LogLevel): boolean {
  if (quiet && level !== "error") return false;
  return levels[level] >= levels[currentLevel];
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(message, ...args);
    }
  },

  success(message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(chalk.green(`✓ ${message}`), ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(chalk.yellow(`⚠ ${message}`), ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(chalk.red(`✖ ${message}`), ...args);
    }
  },

  // Styled output helpers
  dim(message: string): string {
    return chalk.dim(message);
  },

  bold(message: string): string {
    return chalk.bold(message);
  },

  cyan(message: string): string {
    return chalk.cyan(message);
  },

  green(message: string): string {
    return chalk.green(message);
  },

  yellow(message: string): string {
    return chalk.yellow(message);
  },

  // Output structured data
  json(data: unknown): void {
    if (!quiet) {
      console.log(JSON.stringify(data, null, 2));
    }
  },

  // Output table-like data
  table(headers: string[], rows: string[][]): void {
    if (quiet) return;

    // Calculate column widths
    const widths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || "").length));
      return Math.max(h.length, maxRowWidth);
    });

    // Print header
    const headerLine = headers
      .map((h, i) => chalk.bold(h.padEnd(widths[i])))
      .join("  ");
    console.log(headerLine);
    console.log(chalk.dim("─".repeat(headerLine.length)));

    // Print rows
    for (const row of rows) {
      const line = row
        .map((cell, i) => (cell || "").padEnd(widths[i]))
        .join("  ");
      console.log(line);
    }
  },
};
