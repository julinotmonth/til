import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

import { initDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import claimRoutes from './routes/claims.js';
import verificationRoutes from './routes/verifications.js';
import statsRoutes from './routes/stats.js';
import notificationRoutes from './routes/Notificationroutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationRoutes);

// API Welcome endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Selamat datang di Jasa Raharja SAMSAT API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        profile: 'GET /api/auth/profile'
      },
      claims: {
        create: 'POST /api/claims',
        search: 'GET /api/claims/search/:query',
        list: 'GET /api/claims (admin)',
        updateStatus: 'PUT /api/claims/:id/status (admin)'
      },
      verifications: {
        create: 'POST /api/verifications',
        search: 'GET /api/verifications/search/:query',
        list: 'GET /api/verifications (admin)'
      },
      stats: {
        public: 'GET /api/stats/public',
        dashboard: 'GET /api/stats/dashboard (admin)'
      }
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Jasa Raharja SAMSAT API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint tidak ditemukan'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan server',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const startServer = async () => {
  try {
    await initDatabase();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Jasa Raharja SAMSAT Backend Server               ║
║                                                        ║
║   Server running on: http://localhost:${PORT}            ║
║   Environment: ${process.env.NODE_ENV || 'development'}                          ║
║                                                        ║
║   API Endpoints:                                       ║
║   - Auth:         /api/auth                           ║
║   - Claims:       /api/claims                         ║
║   - Verifications: /api/verifications                 ║
║   - Stats:        /api/stats                          ║
║   - Health:       /api/health                         ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;