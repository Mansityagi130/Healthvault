import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { notificationService, notificationEventEmitter } from '../services/notification.service.js';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await notificationService.getNotifications(userId, page, pageSize);
    res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const updated = await notificationService.markAsRead(userId, id as string);
    res.json(updated);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
  } catch (error: any) {
    if (error.message === 'Unauthorized to access this notification') {
      res.status(403).json({ error: error.message });
    } else if (error.message === 'Notification not found') {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await notificationService.markAllAsRead(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCatchupNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sinceParam = req.query.since as string | undefined;
    const lastNotifId = (req.query.lastNotificationId || req.query.lastEventId) as string | undefined;

    let sinceDate: Date | undefined;
    if (sinceParam) {
      const parsedDate = new Date(sinceParam);
      if (!isNaN(parsedDate.getTime())) {
        sinceDate = parsedDate;
      }
    }

    const [notifications, unreadCount] = await Promise.all([
      notificationService.getMissedNotifications(userId, { since: sinceDate, lastNotificationId: lastNotifId }),
      notificationService.getUnreadCount(userId),
    ]);

    res.json({
      success: true,
      notifications,
      unreadCount,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching catchup notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const streamNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Retrieve unread count snapshot for initial connection payload
  const unreadCount = await notificationService.getUnreadCount(userId).catch(() => 0);

  // Send initial connection acknowledgement event with unreadCount snapshot
  res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", unreadCount, timestamp: new Date().toISOString() })}\n\n`);

  // Catch-up missed notifications if Last-Event-ID header or query param provided
  const lastEventId = (req.headers["last-event-id"] as string) || (req.query.lastEventId as string);
  const sinceParam = req.query.since as string;
  let sinceDate: Date | undefined;
  if (sinceParam) {
    const d = new Date(sinceParam);
    if (!isNaN(d.getTime())) sinceDate = d;
  }

  if (lastEventId || sinceDate) {
    const missed = await notificationService.getMissedNotifications(userId, {
      lastNotificationId: lastEventId,
      since: sinceDate
    }).catch(() => []);

    for (const notif of missed) {
      const payload = JSON.stringify({
        id: notif.id,
        type: notif.type,
        timestamp: notif.createdAt.toISOString()
      });
      res.write(`id: ${notif.id}\nevent: notification\ndata: ${payload}\n\n`);
    }
  }

  // Event listener for real-time notification dispatch
  const onNotification = (data: { userId: string; notificationId: string; type: string; createdAt?: string }) => {
    if (data.userId === userId) {
      const payload = JSON.stringify({
        id: data.notificationId,
        type: data.type,
        timestamp: data.createdAt || new Date().toISOString()
      });
      res.write(`id: ${data.notificationId}\nevent: notification\ndata: ${payload}\n\n`);
    }
  };

  notificationEventEmitter.on("notification", onNotification);

  // Periodic heartbeat every 15 seconds to prevent connection timeouts
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  // Connection cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    notificationEventEmitter.removeListener("notification", onNotification);
  });
};
