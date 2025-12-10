import { getOne, getAll, getDb, saveDatabase } from '../config/database.js';
import path from 'path';
import fs from 'fs';

const generateVerificationId = () => {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `VER-${year}${month}-${randomNum}`;
};

export const createVerification = (req, res) => {
  try {
    const { fullName, nik, phone, email, preCheckResults } = req.body;

    if (!fullName || !nik || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nama lengkap, NIK, dan nomor HP wajib diisi'
      });
    }

    if (nik.length !== 16) {
      return res.status(400).json({
        success: false,
        message: 'NIK harus 16 digit'
      });
    }

    if (!req.files?.ktpFile || !req.files?.policeReportFile) {
      return res.status(400).json({
        success: false,
        message: 'KTP dan Surat Keterangan Polisi wajib diupload'
      });
    }

    const verificationId = generateVerificationId();
    const db = getDb();

    db.run(`
      INSERT INTO verifications (id, full_name, nik, phone, email, pre_check_results, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, [
      verificationId, fullName, nik, phone,
      email || null,
      preCheckResults ? JSON.stringify(preCheckResults) : null
    ]);

    const documentTypes = {
      ktpFile: 'ktp',
      policeReportFile: 'police_report',
      stnkFile: 'stnk',
      medicalFile: 'medical_report'
    };

    for (const [fieldName, docType] of Object.entries(documentTypes)) {
      if (req.files[fieldName]) {
        const file = req.files[fieldName][0];
        // Convert absolute path to relative path
        const relativePath = file.path.split('uploads').pop();
        const filePath = 'uploads' + relativePath.replace(/\\/g, '/');
        
        db.run(`
          INSERT INTO verification_documents (verification_id, document_type, file_name, file_path, file_size, mime_type)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [verificationId, docType, file.originalname, filePath, file.size, file.mimetype]);
      }
    }

    saveDatabase();

    res.status(201).json({
      success: true,
      message: 'Dokumen berhasil dikirim untuk verifikasi',
      data: { verificationId, status: 'pending' }
    });
  } catch (error) {
    console.error('Create verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getVerificationByIdOrNik = (req, res) => {
  try {
    const { query } = req.params;

    let verification = getOne('SELECT * FROM verifications WHERE id = ?', [query]);
    if (!verification) {
      verification = getOne('SELECT * FROM verifications WHERE nik = ? ORDER BY submitted_at DESC LIMIT 1', [query]);
    }

    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Data verifikasi tidak ditemukan'
      });
    }

    if (verification.pre_check_results) {
      try {
        verification.pre_check_results = JSON.parse(verification.pre_check_results);
      } catch (e) {}
    }

    const documents = getAll('SELECT * FROM verification_documents WHERE verification_id = ?', [verification.id]);

    res.json({
      success: true,
      data: { ...verification, documents }
    });
  } catch (error) {
    console.error('Get verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getAllVerifications = (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM verifications WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (id LIKE ? OR full_name LIKE ? OR nik LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = getOne(countQuery, params);
    const total = countResult?.total || 0;

    query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const verifications = getAll(query, params);

    const verificationsWithDocs = verifications.map(verification => {
      const documents = getAll('SELECT * FROM verification_documents WHERE verification_id = ?', [verification.id]);
      
      if (verification.pre_check_results) {
        try {
          verification.pre_check_results = JSON.parse(verification.pre_check_results);
        } catch (e) {}
      }
      
      return { ...verification, documents };
    });

    res.json({
      success: true,
      data: {
        verifications: verificationsWithDocs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const updateVerificationStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status tidak valid'
      });
    }

    const verification = getOne('SELECT * FROM verifications WHERE id = ?', [id]);
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verifikasi tidak ditemukan'
      });
    }

    const db = getDb();

    db.run(`
      UPDATE verifications 
      SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, adminNotes || null, req.user.name, id]);

    saveDatabase();

    res.json({
      success: true,
      message: 'Status verifikasi berhasil diupdate'
    });
  } catch (error) {
    console.error('Update verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const deleteVerification = (req, res) => {
  try {
    const { id } = req.params;

    const documents = getAll('SELECT file_path FROM verification_documents WHERE verification_id = ?', [id]);
    documents.forEach(doc => {
      if (fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }
    });

    const db = getDb();
    db.run('DELETE FROM verification_documents WHERE verification_id = ?', [id]);
    db.run('DELETE FROM verifications WHERE id = ?', [id]);
    saveDatabase();

    res.json({
      success: true,
      message: 'Verifikasi berhasil dihapus'
    });
  } catch (error) {
    console.error('Delete verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getVerificationDocument = (req, res) => {
  try {
    const { verificationId, documentId } = req.params;

    const document = getOne(
      'SELECT * FROM verification_documents WHERE id = ? AND verification_id = ?',
      [documentId, verificationId]
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Dokumen tidak ditemukan'
      });
    }

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'File tidak ditemukan'
      });
    }

    res.sendFile(path.resolve(document.file_path));
  } catch (error) {
    console.error('Get verification document error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};