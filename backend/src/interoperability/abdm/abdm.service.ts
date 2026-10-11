import { databaseClient } from '../../config/database.js';
import type { AbdmAdapter } from './abdm.adapter.js';
import { MockAbdmAdapter } from './abdm.adapter.js';
import { AuditAction } from '../../generated/prisma/enums.js';

const prisma = databaseClient.getClient();
const adapter: AbdmAdapter = new MockAbdmAdapter();

export type ABDMConsentStatus = 'REQUESTED' | 'GRANTED' | 'DENIED' | 'EXPIRED' | 'AUTHORIZED' | 'CANCELLED';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  'REQUESTED': ['GRANTED', 'DENIED', 'EXPIRED', 'AUTHORIZED', 'CANCELLED'],
  'AUTHORIZED': [],
  'GRANTED': [],
  'CANCELLED': [],
  'DENIED': [],
  'EXPIRED': []
};

const DB_STATUS_MAP: Record<string, string> = {
  'GRANTED': 'AUTHORIZED',
  'DENIED': 'CANCELLED',
  'EXPIRED': 'EXPIRED',
  'REQUESTED': 'REQUESTED',
  'AUTHORIZED': 'AUTHORIZED',
  'CANCELLED': 'CANCELLED'
};

export class AbdmService {
  public static async linkIdentity(userId: string, abhaAddress: string, otp: string) {
    const isValid = await adapter.linkIdentity(abhaAddress, otp);
    if (!isValid) throw new Error('Invalid OTP for ABHA linking');

    // Check if identity already linked to another user
    const existing = await prisma.externalIdentity.findUnique({
      where: { externalSystem_identifierHash: { externalSystem: 'ABDM', identifierHash: abhaAddress } }
    });

    if (existing && existing.userId !== userId) {
      throw new Error('ABHA address already linked to a different patient');
    }

    // Upsert identity manually since userId is not purely unique
    const identity = await prisma.externalIdentity.findFirst({
      where: { userId, externalSystem: 'ABDM' }
    });

    if (identity) {
      return prisma.externalIdentity.update({
        where: { id: identity.id },
        data: {
          identifierType: 'ABHA_ADDRESS',
          identifierEncrypted: abhaAddress,
          identifierHash: abhaAddress,
          status: 'VERIFIED',
          verifiedAt: new Date()
        }
      });
    }

    return prisma.externalIdentity.create({
      data: {
        userId,
        externalSystem: 'ABDM',
        identifierType: 'ABHA_ADDRESS',
        identifierEncrypted: abhaAddress,
        identifierHash: abhaAddress,
        status: 'VERIFIED',
        verifiedAt: new Date()
      }
    });
  }

  public static async requestConsent(patientId: string, abhaAddress: string, purpose: string) {
    return prisma.$transaction(async (txn) => {
      const transaction = await txn.externalExchangeTransaction.create({
        data: {
          type: 'CONSENT_REQUEST',
          patientId,
          status: 'REQUESTED'
        }
      });

      await txn.outboxEvent.create({
        data: {
          topic: 'ABDM_EXCHANGE',
          payload: { transactionId: transaction.id, abhaAddress, purpose }
        }
      });

      return transaction;
    });
  }

  public static async updateConsentState(transactionId: string, userId: string, targetStatus: ABDMConsentStatus) {
    const profile = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new Error('Patient profile not found');

    const transaction = await prisma.externalExchangeTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) throw new Error('Transaction not found');
    if (transaction.patientId !== profile.id) throw new Error('Unauthorized: Transaction belongs to a different patient');

    const currentStatus = transaction.status as string;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(targetStatus)) {
      throw new Error(`Invalid state transition from '${currentStatus}' to '${targetStatus}'`);
    }

    const nextDbStatus = (DB_STATUS_MAP[targetStatus] || targetStatus) as any;

    return prisma.$transaction(async (txn) => {
      const updated = await txn.externalExchangeTransaction.update({
        where: { id: transactionId },
        data: { status: nextDbStatus }
      });

      let auditAction: AuditAction = AuditAction.CONSENT_APPROVED;
      if (targetStatus === 'DENIED' || targetStatus === 'CANCELLED') auditAction = AuditAction.CONSENT_REJECTED;
      if (targetStatus === 'EXPIRED') auditAction = AuditAction.CONSENT_REVOKED;

      await txn.auditLog.create({
        data: {
          actorUserId: userId,
          action: auditAction,
          targetType: 'ExternalExchangeTransaction',
          targetId: transactionId,
          metadata: { previousStatus: currentStatus, newStatus: nextDbStatus }
        }
      });

      await txn.outboxEvent.create({
        data: {
          topic: 'ABDM_EXCHANGE',
          payload: { transactionId, status: nextDbStatus }
        }
      });

      await txn.notification.create({
        data: {
          userId,
          type: 'CONSENT_DECISION',
          status: 'PENDING',
          payload: {
            title: 'ABDM Consent Decision',
            message: `Consent request status updated to ${targetStatus}`,
            relatedResource: { type: 'ExternalExchangeTransaction', id: transactionId }
          }
        }
      }).catch(() => {});

      return updated;
    });
  }

  public static async getPatientTransactions(userId: string) {
    const profile = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new Error('Patient profile not found');

    return prisma.externalExchangeTransaction.findMany({
      where: { patientId: profile.id },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async sweepExpiredConsents(maxAgeMinutes: number = 1440) {
    const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const expiredTransactions = await prisma.externalExchangeTransaction.findMany({
      where: {
        type: 'CONSENT_REQUEST',
        status: 'REQUESTED',
        createdAt: { lte: threshold }
      },
      include: {
        patient: {
          select: { userId: true }
        }
      }
    });

    const expiredIds: string[] = [];

    for (const transaction of expiredTransactions) {
      await prisma.$transaction(async (txn) => {
        // Atomic status transition check to guarantee single execution under multi-process concurrency
        const updateResult = await txn.externalExchangeTransaction.updateMany({
          where: {
            id: transaction.id,
            status: 'REQUESTED'
          },
          data: { status: 'EXPIRED' }
        });

        // If another process or parallel thread swept this transaction concurrently, count will be 0
        if (updateResult.count === 0) {
          return;
        }

        await txn.auditLog.create({
          data: {
            actorUserId: transaction.patient?.userId || null,
            action: AuditAction.CONSENT_REVOKED,
            targetType: 'ExternalExchangeTransaction',
            targetId: transaction.id,
            metadata: { previousStatus: 'REQUESTED', newStatus: 'EXPIRED', reason: 'AUTOMATED_EXPIRATION_SWEEP' }
          }
        });

        await txn.outboxEvent.create({
          data: {
            topic: 'ABDM_EXCHANGE',
            payload: { transactionId: transaction.id, status: 'EXPIRED' }
          }
        });

        if (transaction.patient?.userId) {
          await txn.notification.create({
            data: {
              userId: transaction.patient.userId,
              type: 'CONSENT_DECISION',
              status: 'PENDING',
              payload: {
                title: 'ABDM Consent Expired',
                message: `Consent request ${transaction.id} has expired`,
                relatedResource: { type: 'ExternalExchangeTransaction', id: transaction.id }
              }
            }
          }).catch(() => {});
        }

        expiredIds.push(transaction.id);
      });
    }

    return {
      sweptCount: expiredIds.length,
      expiredIds
    };
  }
}
