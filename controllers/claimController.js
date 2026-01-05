import { getOne, getAll, getDb, saveDatabase } from '../config/database.js';
import path from 'path';
import fs from 'fs';
import { createNotification, notificationTypes, getNotificationMessage } from './Notificationcontroller.js';

const generateClaimId = () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `KLM-${year}-${randomNum}`;
};

export const createClaim = (req, res) => {
  try {
    const {
      fullName, nik, phone, address,
      incidentDate, incidentTime, incidentLocation, incidentDescription,
      vehicleType, vehicleNumber,
      bankName, bankBranch, accountNumber, accountHolderName,
      hospitalName, treatmentDescription, estimatedCost
    } = req.body;

    if (!fullName || !nik || !phone || !address || !incidentDate || !incidentLocation || !incidentDescription) {
      return res.status(400).json({
        success: false,
        message: 'Mohon lengkapi semua field yang wajib diisi'
      });
    }

    // Validate bank information
    if (!bankName || !accountNumber || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'Informasi rekening bank wajib diisi (nama bank, nomor rekening, nama pemilik rekening)'
      });
    }

    if (!req.files?.ktpFile || !req.files?.policeReportFile) {
      return res.status(400).json({
        success: false,
        message: 'KTP dan Surat Keterangan Polisi wajib diupload'
      });
    }

    if (!req.files?.bankBookFile) {
      return res.status(400).json({
        success: false,
        message: 'Foto/Scan Buku Tabungan wajib diupload'
      });
    }

    const claimId = generateClaimId();
    const userId = req.user?.id || null;
    const db = getDb();

    db.run(`
      INSERT INTO claims (
        id, user_id, full_name, nik, phone, address,
        incident_date, incident_time, incident_location, incident_description,
        vehicle_type, vehicle_number,
        bank_name, bank_branch, account_number, account_holder_name,
        hospital_name, treatment_description, estimated_cost,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      claimId, userId, fullName, nik, phone, address,
      incidentDate, incidentTime || null, incidentLocation, incidentDescription,
      vehicleType || null, vehicleNumber || null,
      bankName, bankBranch || null, accountNumber, accountHolderName,
      hospitalName || null, treatmentDescription || null, estimatedCost ? parseFloat(estimatedCost) : null
    ]);

    const documentTypes = {
      ktpFile: 'ktp',
      policeReportFile: 'police_report',
      stnkFile: 'stnk',
      medicalReportFile: 'medical_report',
      bankBookFile: 'bank_book'
    };

    for (const [fieldName, docType] of Object.entries(documentTypes)) {
      if (req.files[fieldName]) {
        const file = req.files[fieldName][0];
        // Convert absolute path to relative path
        const relativePath = file.path.split('uploads').pop();
        const filePath = 'uploads' + relativePath.replace(/\\/g, '/');
        
        db.run(`
          INSERT INTO claim_documents (claim_id, document_type, file_name, file_path, file_size, mime_type)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [claimId, docType, file.originalname, filePath, file.size, file.mimetype]);
      }
    }

    db.run(`
      INSERT INTO claim_timeline (claim_id, status, description)
      VALUES (?, 'Pengajuan Diterima', 'Klaim berhasil diajukan dan menunggu verifikasi dokumen')
    `, [claimId]);

    saveDatabase();

    // Create notification for user if logged in
    if (userId) {
      const notifData = getNotificationMessage(notificationTypes.CLAIM_SUBMITTED, { claimId });
      createNotification(userId, notificationTypes.CLAIM_SUBMITTED, notifData.title, notifData.message, claimId);
    }

    res.status(201).json({
      success: true,
      message: 'Klaim berhasil diajukan',
      data: { claimId, status: 'pending' }
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getClaimByIdOrNik = (req, res) => {
  try {
    const { query } = req.params;

    let claim = getOne('SELECT * FROM claims WHERE id = ?', [query]);
    if (!claim) {
      claim = getOne('SELECT * FROM claims WHERE nik = ? ORDER BY submitted_at DESC LIMIT 1', [query]);
    }

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Klaim tidak ditemukan'
      });
    }

    const documents = getAll('SELECT * FROM claim_documents WHERE claim_id = ?', [claim.id]);
    const timeline = getAll('SELECT * FROM claim_timeline WHERE claim_id = ? ORDER BY created_at ASC', [claim.id]);

    res.json({
      success: true,
      data: { ...claim, documents, timeline }
    });
  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getAllClaims = (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM claims WHERE 1=1';
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

    const claims = getAll(query, params);

    const claimsWithDocs = claims.map(claim => {
      const documents = getAll('SELECT * FROM claim_documents WHERE claim_id = ?', [claim.id]);
      return { ...claim, documents };
    });

    res.json({
      success: true,
      data: {
        claims: claimsWithDocs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getUserClaims = (req, res) => {
  try {
    const claims = getAll('SELECT * FROM claims WHERE user_id = ? ORDER BY submitted_at DESC', [req.user.id]);

    const claimsWithTimeline = claims.map(claim => {
      const timeline = getAll('SELECT * FROM claim_timeline WHERE claim_id = ? ORDER BY created_at ASC', [claim.id]);
      return { ...claim, timeline };
    });

    res.json({ success: true, data: claimsWithTimeline });
  } catch (error) {
    console.error('Get user claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const updateClaimStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['pending', 'verified', 'processing', 'approved', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status tidak valid'
      });
    }

    const claim = getOne('SELECT * FROM claims WHERE id = ?', [id]);
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Klaim tidak ditemukan'
      });
    }

    const db = getDb();

    db.run(`
      UPDATE claims SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [status, adminNotes || null, id]);

    const statusDescriptions = {
      pending: 'Menunggu verifikasi dokumen',
      verified: 'Dokumen telah diverifikasi',
      processing: 'Klaim sedang diproses oleh tim',
      approved: 'Klaim disetujui untuk pencairan',
      rejected: 'Klaim ditolak. ' + (adminNotes || ''),
      completed: 'Klaim telah selesai diproses'
    };

    db.run(`
      INSERT INTO claim_timeline (claim_id, status, description) VALUES (?, ?, ?)
    `, [id, status.charAt(0).toUpperCase() + status.slice(1), statusDescriptions[status]]);

    saveDatabase();

    // Create notification for user if claim has user_id
    if (claim.user_id) {
      const notifTypeMap = {
        verified: notificationTypes.CLAIM_VERIFIED,
        processing: notificationTypes.CLAIM_PROCESSING,
        approved: notificationTypes.CLAIM_APPROVED,
        rejected: notificationTypes.CLAIM_REJECTED,
        completed: notificationTypes.CLAIM_COMPLETED
      };

      const notifType = notifTypeMap[status];
      if (notifType) {
        const notifData = getNotificationMessage(notifType, { 
          claimId: id, 
          reason: adminNotes 
        });
        createNotification(claim.user_id, notifType, notifData.title, notifData.message, id);
      }
    }

    res.json({
      success: true,
      message: 'Status klaim berhasil diupdate'
    });
  } catch (error) {
    console.error('Update claim status error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const deleteClaim = (req, res) => {
  try {
    const { id } = req.params;

    const documents = getAll('SELECT file_path FROM claim_documents WHERE claim_id = ?', [id]);
    documents.forEach(doc => {
      if (fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }
    });

    const db = getDb();
    db.run('DELETE FROM claim_documents WHERE claim_id = ?', [id]);
    db.run('DELETE FROM claim_timeline WHERE claim_id = ?', [id]);
    db.run('DELETE FROM claims WHERE id = ?', [id]);
    saveDatabase();

    res.json({
      success: true,
      message: 'Klaim berhasil dihapus'
    });
  } catch (error) {
    console.error('Delete claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getClaimDocument = (req, res) => {
  try {
    const { claimId, documentId } = req.params;

    const document = getOne(
      'SELECT * FROM claim_documents WHERE id = ? AND claim_id = ?',
      [documentId, claimId]
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
    console.error('Get claim document error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

// Upload bukti transfer oleh admin
export const uploadTransferProof = (req, res) => {
  try {
    const { id } = req.params;
    const { transferAmount, transferDate, transferNotes } = req.body;

    const claim = getOne('SELECT * FROM claims WHERE id = ?', [id]);
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Klaim tidak ditemukan'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Bukti transfer wajib diupload'
      });
    }

    // Convert absolute path to relative path
    const relativePath = req.file.path.split('uploads').pop();
    const filePath = 'uploads' + relativePath.replace(/\\/g, '/');

    const db = getDb();

    // Update claim with transfer proof
    db.run(`
      UPDATE claims SET 
        transfer_proof_path = ?,
        transfer_amount = ?,
        transfer_date = ?,
        transfer_notes = ?,
        status = 'completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      filePath,
      transferAmount ? parseFloat(transferAmount) : null,
      transferDate || new Date().toISOString().split('T')[0],
      transferNotes || null,
      id
    ]);

    // Add to timeline
    db.run(`
      INSERT INTO claim_timeline (claim_id, status, description)
      VALUES (?, 'Selesai', 'Dana santunan telah ditransfer ke rekening penerima')
    `, [id]);

    saveDatabase();

    res.json({
      success: true,
      message: 'Bukti transfer berhasil diupload',
      data: {
        transferProofPath: filePath,
        transferAmount,
        transferDate
      }
    });
  } catch (error) {
    console.error('Upload transfer proof error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};