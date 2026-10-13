import type { RoleName } from './session';

/** Boleh menginput pending (Fulfillment). */
export const canInput = (r: RoleName) => r === 'ADMIN' || r === 'FULFILLMENT' || r === 'INVENTORY';
/** Boleh mengisi tindak lanjut (Inventory). */
export const canFollowUp = (r: RoleName) => r === 'ADMIN' || r === 'INVENTORY';
export const isAdmin = (r: RoleName) => r === 'ADMIN';
export const canWrite = (r: RoleName) => r !== 'VIEWER';

/** Review Monitoring Cancel: Admin atau user bertanda Lead. */
export const canReviewCancel = (u: { role: RoleName; isLead?: boolean }) => u.role === 'ADMIN' || Boolean(u.isLead);
