import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from '../controllers/Notificationcontroller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get user's notifications
router.get('/', getMyNotifications);

// Mark single notification as read
router.put('/:id/read', markAsRead);

// Mark all notifications as read
router.put('/read-all', markAllAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

export default router;