import { getOne, getAll } from '../config/database.js';

export const getDashboardStats = (req, res) => {
  try {
    const claimStats = {
      total: getOne('SELECT COUNT(*) as count FROM claims')?.count || 0,
      pending: getOne("SELECT COUNT(*) as count FROM claims WHERE status = 'pending'")?.count || 0,
      processing: getOne("SELECT COUNT(*) as count FROM claims WHERE status = 'processing'")?.count || 0,
      approved: getOne("SELECT COUNT(*) as count FROM claims WHERE status = 'approved'")?.count || 0,
      rejected: getOne("SELECT COUNT(*) as count FROM claims WHERE status = 'rejected'")?.count || 0,
      completed: getOne("SELECT COUNT(*) as count FROM claims WHERE status = 'completed'")?.count || 0
    };

    const verificationStats = {
      total: getOne('SELECT COUNT(*) as count FROM verifications')?.count || 0,
      pending: getOne("SELECT COUNT(*) as count FROM verifications WHERE status = 'pending'")?.count || 0,
      approved: getOne("SELECT COUNT(*) as count FROM verifications WHERE status = 'approved'")?.count || 0,
      rejected: getOne("SELECT COUNT(*) as count FROM verifications WHERE status = 'rejected'")?.count || 0
    };

    const userStats = {
      total: getOne('SELECT COUNT(*) as count FROM users')?.count || 0,
      admins: getOne("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")?.count || 0,
      users: getOne("SELECT COUNT(*) as count FROM users WHERE role = 'user'")?.count || 0
    };

    const monthlyData = getAll(`
      SELECT 
        strftime('%Y-%m', submitted_at) as month,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('approved', 'completed') THEN 1 ELSE 0 END) as approved
      FROM claims
      WHERE submitted_at >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', submitted_at)
      ORDER BY month ASC
    `);

    const recentClaims = getAll(`
      SELECT id, full_name, status, submitted_at FROM claims ORDER BY submitted_at DESC LIMIT 5
    `);

    const recentVerifications = getAll(`
      SELECT id, full_name, status, submitted_at FROM verifications ORDER BY submitted_at DESC LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        claims: claimStats,
        verifications: verificationStats,
        users: userStats,
        monthlyData,
        recentClaims,
        recentVerifications
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

export const getPublicStats = (req, res) => {
  try {
    const totalClaims = getOne('SELECT COUNT(*) as count FROM claims')?.count || 0;
    const totalUsers = getOne("SELECT COUNT(*) as count FROM users WHERE role = 'user'")?.count || 0;
    const processedClaims = getOne("SELECT COUNT(*) as count FROM claims WHERE status IN ('approved', 'completed')")?.count || 0;

    res.json({
      success: true,
      data: { totalClaims, totalUsers, processedClaims }
    });
  } catch (error) {
    console.error('Get public stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};
