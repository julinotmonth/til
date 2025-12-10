import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database.sqlite');

let db = null;
let SQL = null;

// Initialize SQL.js and database
export const initDatabase = async () => {
  if (db) return db;

  SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (error) {
    console.error('Error loading database:', error);
    db = new SQL.Database();
  }

  // Run migrations for existing database
  await runMigrations();

  return db;
};

// Run migrations to add new columns
const runMigrations = async () => {
  if (!db) return;

  const columnsToAdd = [
    { table: 'claims', name: 'bank_name', type: 'TEXT' },
    { table: 'claims', name: 'bank_branch', type: 'TEXT' },
    { table: 'claims', name: 'account_number', type: 'TEXT' },
    { table: 'claims', name: 'account_holder_name', type: 'TEXT' },
    { table: 'claims', name: 'hospital_name', type: 'TEXT' },
    { table: 'claims', name: 'treatment_description', type: 'TEXT' },
    { table: 'claims', name: 'estimated_cost', type: 'REAL' },
    { table: 'claims', name: 'transfer_proof_path', type: 'TEXT' },
    { table: 'claims', name: 'transfer_amount', type: 'REAL' },
    { table: 'claims', name: 'transfer_date', type: 'TEXT' },
    { table: 'claims', name: 'transfer_notes', type: 'TEXT' }
  ];

  for (const column of columnsToAdd) {
    try {
      // Check if column exists
      const tableInfo = db.exec(`PRAGMA table_info(${column.table})`);
      const existingColumns = tableInfo[0]?.values.map(row => row[1]) || [];
      
      if (!existingColumns.includes(column.name)) {
        db.run(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Migration: Added column '${column.name}' to '${column.table}' table`);
      }
    } catch (error) {
      // Table might not exist yet, which is fine
    }
  }

  saveDatabase();
};

// Save database to file
export const saveDatabase = () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
};

// Get database instance
export const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

// Helper function to get single row
export const getOne = (sql, params = []) => {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  
  if (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    stmt.free();
    
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  }
  
  stmt.free();
  return null;
};

// Helper function to get all rows
export const getAll = (sql, params = []) => {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  
  const results = [];
  const columns = stmt.getColumnNames();
  
  while (stmt.step()) {
    const values = stmt.get();
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    results.push(row);
  }
  
  stmt.free();
  return results;
};

export default { initDatabase, getDb, saveDatabase, getOne, getAll };