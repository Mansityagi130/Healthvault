import { databaseClient } from '../../config/database.js';
import { NotificationStatus, NotificationType } from '../../generated/prisma/enums.js';
import type { NotificationJob } from '../types.js';

const prisma = databaseClient.getClient();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const processNotification = async (data: NotificationJob & { userId?: string; type?: any; title?: string; message?: string }) => {
  let notificationId = data?.notificationId;

  if (!notificationId && data?.userId && data?.type) {
    let resolvedType: NotificationType = NotificationType.SYSTEM;
    if (data.type === 'SECURITY_UPDATE' || data.type === 'SECURITY' || data.type === NotificationType.SECURITY) {
      resolvedType = NotificationType.SECURITY;
    } else if (Object.values(NotificationType).includes(data.type)) {
      resolvedType = data.type as NotificationType;
    }

    const created = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: resolvedType,
        status: NotificationStatus.PENDING,
        payload: {
          title: data.title,
          message: data.message,
        },
      },
    });
    notificationId = created.id;
  }

  if (!notificationId) {
    throw new Error('Notification payload missing notificationId and cannot be processed');
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notification) {
    throw new Error('Notification ' + notificationId + ' not found');
  }

  console.log('[Job] Delivered notification ' + notification.id + ' to user ' + notification.userId);
};