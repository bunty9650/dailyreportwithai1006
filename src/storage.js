import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const dbPath = path.join(dataDir, "reports.json");

async function ensureDatabase() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dbPath);
  } catch {
    const emptyDb = { reports: [], analyses: [] };
    await fs.writeFile(dbPath, JSON.stringify(emptyDb, null, 2), "utf8");
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw || '{"reports":[],"analyses":[]}');
}

async function writeDatabase(db) {
  await ensureDatabase();
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export async function addAnalysisEntry(entry) {
  const db = await readDatabase();
  db.analyses.unshift(entry);
  await writeDatabase(db);
  return entry;
}

export async function addReportEntry(report) {
  const db = await readDatabase();
  const entry = {
    id: report.id || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...report
  };

  db.reports.unshift(entry);
  await writeDatabase(db);
  return entry;
}

export async function listReports() {
  const db = await readDatabase();
  return db.reports;
}

export async function listAnalyses() {
  const db = await readDatabase();
  return db.analyses;
}

export async function getEmployeeHistory(employeeId, limit = 7) {
  const db = await readDatabase();
  return db.reports
    .filter((item) => item.employeeId === employeeId)
    .slice(0, limit)
    .reverse();
}

export async function getLatestReports(limit = 20) {
  const db = await readDatabase();
  return db.reports.slice(0, limit);
}
