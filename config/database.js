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

  return db;
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
