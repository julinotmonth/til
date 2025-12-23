import { initDatabase, getDb, saveDatabase, getOne } from './database.js';
import bcrypt from 'bcryptjs';

const init = async () => {
  console.log('🔧 Initializing database...');

  await initDatabase();
  const db = getDb();

  // Create Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Claims table
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      full_name TEXT NOT NULL,
      nik TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      incident_date DATE NOT NULL,
      incident_time TEXT,
      incident_location TEXT NOT NULL,
      incident_description TEXT NOT NULL,
      vehicle_type TEXT,
      vehicle_number TEXT,
      bank_name TEXT,
      bank_branch TEXT,
      account_number TEXT,
      account_holder_name TEXT,
      hospital_name TEXT,
      treatment_description TEXT,
      estimated_cost REAL,
      transfer_proof_path TEXT,
      transfer_amount REAL,
      transfer_date TEXT,
      transfer_notes TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'verified', 'processing', 'approved', 'rejected', 'completed')),
      admin_notes TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: Add new columns to existing claims table if they don't exist
  const columnsToAdd = [
    { name: 'bank_name', type: 'TEXT' },
    { name: 'bank_branch', type: 'TEXT' },
    { name: 'account_number', type: 'TEXT' },
    { name: 'account_holder_name', type: 'TEXT' },
    { name: 'hospital_name', type: 'TEXT' },
    { name: 'treatment_description', type: 'TEXT' },
    { name: 'estimated_cost', type: 'REAL' }
  ];

  // Check existing columns in claims table
  try {
    const tableInfo = db.exec("PRAGMA table_info(claims)");
    const existingColumns = tableInfo[0]?.values.map(row => row[1]) || [];
    
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        try {
          db.run(`ALTER TABLE claims ADD COLUMN ${column.name} ${column.type}`);
          console.log(`✅ Added column '${column.name}' to claims table`);
        } catch (alterError) {
          // Column might already exist, ignore error
          console.log(`ℹ️  Column '${column.name}' already exists or cannot be added`);
        }
      }
    }
  } catch (error) {
    console.log('ℹ️  Migration check completed');
  }

  // Create Claim Documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS claim_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      document_type TEXT NOT NULL CHECK(document_type IN ('ktp', 'police_report', 'stnk', 'medical_report', 'bank_book')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    )
  `);

  // Migration: Recreate claim_documents table to add 'bank_book' to CHECK constraint
  try {
    const tableCheck = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='claim_documents'");
    if (tableCheck[0]?.values[0]?.[0] && !tableCheck[0].values[0][0].includes('bank_book')) {
      console.log('🔄 Migrating claim_documents table to support bank_book...');
      
      // Rename old table
      db.run(`ALTER TABLE claim_documents RENAME TO claim_documents_old`);
      
      // Create new table with updated constraint
      db.run(`
        CREATE TABLE claim_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          claim_id TEXT NOT NULL,
          document_type TEXT NOT NULL CHECK(document_type IN ('ktp', 'police_report', 'stnk', 'medical_report', 'bank_book')),
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          mime_type TEXT,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
        )
      `);
      
      // Copy data from old table
      db.run(`
        INSERT INTO claim_documents (id, claim_id, document_type, file_name, file_path, file_size, mime_type, uploaded_at)
        SELECT id, claim_id, document_type, file_name, file_path, file_size, mime_type, uploaded_at
        FROM claim_documents_old
      `);
      
      // Drop old table
      db.run(`DROP TABLE claim_documents_old`);
      
      console.log('✅ claim_documents table migrated successfully');
    }
  } catch (migrationError) {
    console.log('ℹ️  claim_documents migration check completed');
  }

  // Create Claim Timeline table
  db.run(`
    CREATE TABLE IF NOT EXISTS claim_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    )
  `);

  // Create Verifications table
  db.run(`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      nik TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      pre_check_results TEXT,
      admin_notes TEXT,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Verification Documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS verification_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      verification_id TEXT NOT NULL,
      document_type TEXT NOT NULL CHECK(document_type IN ('ktp', 'police_report', 'stnk', 'medical_report')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (verification_id) REFERENCES verifications(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_claims_nik ON claims(nik)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_verifications_nik ON verifications(nik)`);

  // Insert default admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  const existingAdmin = getOne('SELECT id FROM users WHERE email = ?', ['admin@jasaraharja.co.id']);
  
  if (!existingAdmin) {
    db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@jasaraharja.co.id', adminPassword, 'admin']
    );
    console.log('✅ Admin user created (email: admin@jasaraharja.co.id, password: admin123)');
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  // Insert sample user
  const userPassword = bcrypt.hashSync('user123', 10);
  const existingUser = getOne('SELECT id FROM users WHERE email = ?', ['user@example.com']);
  
  if (!existingUser) {
    db.run(
      'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      ['John Doe', 'user@example.com', userPassword, '081234567890', 'user']
    );
    console.log('✅ Sample user created (email: user@example.com, password: user123)');
  } else {
    console.log('ℹ️  Sample user already exists');
  }

  saveDatabase();

  console.log('✅ Database initialized successfully!');
  console.log('📁 Database location: backend/database.sqlite');
};

init().catch(console.error);