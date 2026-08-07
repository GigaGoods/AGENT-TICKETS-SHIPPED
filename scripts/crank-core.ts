/**
 * Pure decision logic for the settlement crank.
 *
 * Everything here is tool-free: no RPC, no wallet, no clock. That is the point —
 * the crank cannot run end-to-end until the program deploys, so the part that
 * decides whether to move someone's money is isolated here and unit-tested
 * against fixtures instead. See tests/crank.test.ts.
 */

import type { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

export type OrderStateName =
  | "locked"
  | "delivered"
  | "released"
  | "refunded"
  | "disputed"
  | "arbiterResolved";

/** Decoded Order account, as Anchor hands it back. */
export interface OrderAccount {
  listing: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: BN;
  feeBps: number;
  state: Record<string, unknown>;
  lockedTs: BN;
  deliveryDeadline: BN;
  inspectionDeadline: BN;
  arbiter: PublicKey;
  attestation: PublicKey;
  bump: number;
}

export type CrankAction = "timeout_refund" | "timeout_release";

export interface DueOrder {
  pubkey: PublicKey;
  account: OrderAccount;
  state: OrderStateName;
  action: CrankAction;
}

/** Anchor renders a Rust enum as a single-key object: `{ locked: {} }`. */
export function stateOf(order: OrderAccount): OrderStateName {
  return Object.keys(order.state)[0] as OrderStateName;
}

/**
 * The orders the two-clock state machine has already decided, given `now`.
 *
 * Comparisons are strictly `>`, mirroring the program's `require!(now > deadline)`
 * — an order whose deadline equals `now` is NOT due, and submitting it would just
 * burn a fee on DeadlineNotReached.
 */
export function selectDue(
  orders: Array<{ publicKey: PublicKey; account: OrderAccount }>,
  now: number
): DueOrder[] {
  const due: DueOrder[] = [];
  for (const { publicKey, account } of orders) {
    const state = stateOf(account);
    if (state === "locked" && now > account.deliveryDeadline.toNumber()) {
      due.push({ pubkey: publicKey, account, state, action: "timeout_refund" });
    } else if (state === "delivered" && now > account.inspectionDeadline.toNumber()) {
      due.push({ pubkey: publicKey, account, state, action: "timeout_release" });
    }
  }
  return due;
}

/**
 * Races we expect to lose sometimes: another crank (or the buyer/seller acting
 * for themselves) settled the order between our getProgramAccounts snapshot and
 * our tx landing. The order + vault are closed by then, so Anchor's account
 * resolution or the program's own state check rejects us. That is a no-op, not
 * an incident. Returns the reason when benign, null when it's a real failure
 * that deserves an ERROR log.
 */
export function isBenignRace(err: unknown): string | null {
  const msg =
    (err instanceof Error ? err.message : String(err)) +
    JSON.stringify((err as { logs?: string[] })?.logs ?? []);
  const benign: Array<[RegExp, string]> = [
    [/AccountNotInitialized|3012/, "order/vault already closed"],
    [/Account does not exist|could not find account/i, "account already closed"],
    [/AccountOwnedByWrongProgram|3007/, "account already closed"],
    [/InvalidState|Order is not in a valid state/, "state changed under us"],
    [/DeadlineNotReached|Deadline has not been reached/, "deadline not reached on-chain yet"],
    [/already been processed|AlreadyProcessed/i, "duplicate tx, already landed"],
    [/ConstraintSeeds|2006/, "order pda mismatch (already closed/reused)"],
  ];
  for (const [re, reason] of benign) {
    if (re.test(msg)) return reason;
  }
  return null;
}
