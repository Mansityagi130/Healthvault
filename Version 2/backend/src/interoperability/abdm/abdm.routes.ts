import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware.js';
import { AbdmService, type ABDMConsentStatus } from './abdm.service.js';
import { databaseClient } from '../../config/database.js';

const router = Router();

const sweepInputSchema = z.object({
  maxAgeMinutes: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return 1440;
      if (typeof val === 'number') return val;
      if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) return Number(val.trim());
      return 'invalid_type';
    },
    z.number({ message: 'maxAgeMinutes must be a valid integer' })
      .int('maxAgeMinutes must be an integer')
      .min(1, 'maxAgeMinutes must be at least 1')
      .max(525600, 'maxAgeMinutes cannot exceed 525600 minutes (1 year)')
  )
});

router.use(authenticate);

router.post('/identity/link', async (req: Request, res: Response) => {
  try {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req typing
    const user = (req as any).user;
    const { abhaAddress, otp } = req.body;

    if (!abhaAddress || !otp) {
      return res.status(400).json({ error: 'Missing abhaAddress or otp' });
    }

    const identity = await AbdmService.linkIdentity(user.id, abhaAddress, otp);
    res.status(200).json({ success: true, identity });
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/consent/request', async (req: Request, res: Response) => {
  try {
    const { abhaAddress, purpose } = req.body;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req typing
    const authUser = (req as any).user;

    if (!abhaAddress || !purpose) {
      return res.status(400).json({ error: 'Missing abhaAddress or purpose' });
    }

    const profile = await databaseClient.getClient().patientProfile.findUnique({ where: { userId: authUser.id } });
    if (!profile) return res.status(404).json({ error: 'Patient profile not found' });

    const transaction = await AbdmService.requestConsent(profile.id, abhaAddress, purpose);
    res.status(200).json({ success: true, transaction });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Failed to request consent' });
  }
});

router.get('/consent/transactions', async (req: Request, res: Response) => {
  try {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req typing
    const authUser = (req as any).user;
    const transactions = await AbdmService.getPatientTransactions(authUser.id);
    res.status(200).json(transactions);
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/consent/transactions/:transactionId/status', async (req: Request, res: Response) => {
  try {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express req typing
    const authUser = (req as any).user;
    const transactionId = req.params.transactionId as string;
    const { status } = req.body as { status: ABDMConsentStatus };

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid transactionId' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Missing target status' });
    }

    const updated = await AbdmService.updateConsentState(transactionId, authUser.id, status);
    res.status(200).json({ success: true, transaction: updated });
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/consent/sweep', async (req: Request, res: Response) => {
  try {
    const parsed = sweepInputSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid maxAgeMinutes parameter' });
    }

    const result = await AbdmService.sweepExpiredConsents(parsed.data.maxAgeMinutes);
    res.status(200).json({ success: true, ...result });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Failed to sweep expired consents' });
  }
});

export default router;
