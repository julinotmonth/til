import express from 'express';
import { getDashboardStats, getPublicStats } from '../controllers/statsController.js';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/public', getPublicStats);
router.get('/dashboard', authenticate, isAdmin, getDashboardStats);

export default router;
