import { EventEmitter } from "events";
import { databaseClient } from "../config/database.js";
import { NotificationType, NotificationStatus } from "../generated/prisma/enums.js";

const prisma = databaseClient.getClient();

export const notificationEventEmitter = new EventEmitter();
notificationEventEmitter.setMaxListeners(100);

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  organizationContext?: string;
  relatedResource?: {
    type: string;
    id: string;
  };
}

export class NotificationService {
  async createNotification(dto: CreateNotificationDto) {
    // Keep message concise and avoid exposing medical details
    const payload = {
      title: dto.title,
      message: dto.message,
      actionUrl: dto.actionUrl,
      organizationContext: dto.organizationContext,
      relatedResource: dto.relatedResource,
    };

    const notification = await prisma.$transaction(async (txn) => {
      const created = await txn.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          status: NotificationStatus.PENDING,
          payload,
        },
      });

      await txn.outboxEvent.create({
        data: {
          topic: 'NOTIFICATION',
          payload: { notificationId: created.id }
        }
      });

      return created;
    });

    notificationEventEmitter.emit("notification", {
      userId: notification.userId,
      notificationId: notification.id,
      type: notification.type,
      createdAt: notification.createdAt.toISOString()
    });

    return notification;
  }

  async getNotifications(userId: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    const formattedItems = items
      .map((item) => {
        const payload = (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<string, any>;
        return {
          ...item,
          title: payload.title || item.type.replace(/_/g, " "),
          message: payload.message || "",
        };
      })
      // Filter out unnecessary internal notifications (e.g. password reset token links or blank messages)
      .filter((n) => {
        if (!n.title && !n.message) return false;
        // Don't show password reset tokens in in-app notification dropdown
        if (n.message.includes("/reset-password?token=")) return false;
        return true;
      });

    return {
      items: formattedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }

  async getMissedNotifications(userId: string, options?: { since?: Date | undefined; lastNotificationId?: string | undefined; limit?: number | undefined }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Prisma query condition
    const whereCondition: any = { userId };

    if (options?.lastNotificationId) {
      const refNotif = await prisma.notification.findUnique({
        where: { id: options.lastNotificationId }
      });
      if (refNotif && refNotif.userId === userId) {
        whereCondition.createdAt = { gt: refNotif.createdAt };
      }
    } else if (options?.since) {
      whereCondition.createdAt = { gt: options.since };
    } else {
      whereCondition.readAt = null;
    }

    return prisma.notification.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'asc' },
      take: options?.limit || 50,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    if (notification.userId !== userId) {
      throw new Error("Unauthorized to access this notification");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    });
  }
}

export const notificationService = new NotificationService();
