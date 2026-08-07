// Unit suite for the settlement crank's decision logic (scripts/crank-core.ts).
//
// No validator, no RPC, no wallet — these run anywhere, including before the
// program has ever been deployed. That is deliberate: the crank moves buyer
// funds with no human in the loop, and until deploy day its logic would
// otherwise be entirely unexecuted code.
//
//   npx ts-mocha -p ./tsconfig.json tests/crank.test.ts

import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  isBenignRace,
  selectDue,
  stateOf,
  type OrderAccount,
} from "../scripts/crank-core";

const NOW = 1_700_000_000;

function order(
  state: string,
  opts: { deliveryDeadline?: number; inspectionDeadline?: number } = {}
): { publicKey: PublicKey; account: OrderAccount } {
  return {
    publicKey: PublicKey.unique(),
    account: {
      listing: PublicKey.unique(),
      buyer: PublicKey.unique(),
      seller: PublicKey.unique(),
      amount: new anchor.BN(50_000_000),
      feeBps: 250,
      state: { [state]: {} },
      lockedTs: new anchor.BN(NOW - 10_000),
      deliveryDeadline: new anchor.BN(opts.deliveryDeadline ?? NOW + 3_600),
      inspectionDeadline: new anchor.BN(opts.inspectionDeadline ?? 0),
      arbiter: PublicKey.unique(),
      attestation: PublicKey.default,
      bump: 254,
    },
  };
}

describe("crank-core: stateOf", () => {
  it("reads Anchor's single-key enum encoding", () => {
    expect(stateOf(order("locked").account)).to.equal("locked");
    expect(stateOf(order("arbiterResolved").account)).to.equal("arbiterResolved");
  });
});

describe("crank-core: selectDue", () => {
  it("selects a Locked order past its delivery deadline for timeout_refund", () => {
    const o = order("locked", { deliveryDeadline: NOW - 1 });
    const due = selectDue([o], NOW);
    expect(due).to.have.length(1);
    expect(due[0].action).to.equal("timeout_refund");
    expect(due[0].pubkey.equals(o.publicKey)).to.equal(true);
  });

  it("leaves a Locked order alone while its delivery deadline is in the future", () => {
    expect(selectDue([order("locked", { deliveryDeadline: NOW + 1 })], NOW)).to.have.length(0);
  });

  // Boundary. The program asserts `require!(now > deadline)`, so an order whose
  // deadline is exactly `now` is NOT settleable — submitting it burns a fee on
  // DeadlineNotReached. The comparison must stay strictly `>`, never `>=`.
  it("does NOT select a Locked order when now == deliveryDeadline", () => {
    expect(selectDue([order("locked", { deliveryDeadline: NOW })], NOW)).to.have.length(0);
  });

  it("selects a Delivered order past its inspection deadline for timeout_release", () => {
    const due = selectDue([order("delivered", { inspectionDeadline: NOW - 1 })], NOW);
    expect(due).to.have.length(1);
    expect(due[0].action).to.equal("timeout_release");
  });

  it("leaves a Delivered order alone while its inspection deadline is in the future", () => {
    expect(
      selectDue([order("delivered", { inspectionDeadline: NOW + 1 })], NOW)
    ).to.have.length(0);
  });

  it("does NOT select a Delivered order when now == inspectionDeadline", () => {
    expect(selectDue([order("delivered", { inspectionDeadline: NOW })], NOW)).to.have.length(0);
  });

  // Documented behavior for a state the program should never produce:
  // lock_purchase sets inspection_deadline = 0 and only mark_delivered fills it
  // in, so a Delivered order always has it non-zero. If one ever appeared with 0,
  // the crank treats it as immediately due (now > 0) and submits timeout_release;
  // the program is the backstop and would reject anything genuinely early.
  it("treats a Delivered order with a zero inspection deadline as immediately due", () => {
    const due = selectDue([order("delivered", { inspectionDeadline: 0 })], NOW);
    expect(due).to.have.length(1);
    expect(due[0].action).to.equal("timeout_release");
  });

  it("never selects a terminal-state order, however stale its deadlines", () => {
    const terminal = ["released", "refunded", "disputed", "arbiterResolved"].map((s) =>
      order(s, { deliveryDeadline: NOW - 99_999, inspectionDeadline: NOW - 99_999 })
    );
    expect(selectDue(terminal, NOW)).to.have.length(0);
  });

  it("picks exactly the right subset, with the right action each, from a mixed batch", () => {
    const dueRefund = order("locked", { deliveryDeadline: NOW - 60 });
    const dueRelease = order("delivered", { inspectionDeadline: NOW - 60 });
    const batch = [
      order("locked", { deliveryDeadline: NOW + 600 }),
      dueRefund,
      order("delivered", { inspectionDeadline: NOW + 600 }),
      dueRelease,
      order("released", { deliveryDeadline: NOW - 600, inspectionDeadline: NOW - 600 }),
      order("disputed", { deliveryDeadline: NOW - 600, inspectionDeadline: NOW - 600 }),
    ];

    const due = selectDue(batch, NOW);
    expect(due).to.have.length(2);
    const byKey = new Map(due.map((d) => [d.pubkey.toBase58(), d.action]));
    expect(byKey.get(dueRefund.publicKey.toBase58())).to.equal("timeout_refund");
    expect(byKey.get(dueRelease.publicKey.toBase58())).to.equal("timeout_release");
  });

  it("returns an empty list for an empty scan", () => {
    expect(selectDue([], NOW)).to.deep.equal([]);
  });
});

describe("crank-core: isBenignRace", () => {
  it("classifies AccountNotInitialized / 3012 as a lost race", () => {
    expect(isBenignRace(new Error("AnchorError caused by account: order. Error Code: AccountNotInitialized")))
      .to.be.a("string");
    expect(isBenignRace(new Error("custom program error: 3012"))).to.be.a("string");
  });

  it("classifies a missing account as a lost race", () => {
    expect(isBenignRace(new Error("Account does not exist or has no data"))).to.be.a("string");
    expect(isBenignRace(new Error("Could not find account"))).to.be.a("string");
  });

  it("classifies InvalidState and DeadlineNotReached as lost races", () => {
    expect(isBenignRace(new Error("Error Message: Order is not in a valid state for this action")))
      .to.be.a("string");
    expect(isBenignRace(new Error("Error Code: DeadlineNotReached"))).to.be.a("string");
  });

  it("reads the program logs, not just the message", () => {
    const err = Object.assign(new Error("Transaction simulation failed"), {
      logs: [
        "Program log: AnchorError occurred. Error Code: InvalidState. Error Number: 6006.",
      ],
    });
    expect(isBenignRace(err)).to.equal("state changed under us");
  });

  it("does NOT swallow a genuine failure", () => {
    expect(isBenignRace(new Error("Attempt to debit an account but found no record of a prior credit")))
      .to.equal(null);
    expect(isBenignRace(new Error("Blockhash not found"))).to.equal(null);
    expect(isBenignRace(new Error("failed to get recent blockhash: connection refused"))).to.equal(null);
  });

  it("handles a non-Error throw without crashing", () => {
    expect(isBenignRace("AccountNotInitialized")).to.be.a("string");
    expect(isBenignRace(undefined)).to.equal(null);
  });
});

// The crank passes every account explicitly in `.accounts({...})`. Anchor 0.31
// with `resolution = true` may reject unknown keys or expect resolvable accounts
// to be omitted — an open question when the crank was written, unanswerable until
// the IDL exists. These cases answer it the moment `anchor build` lands the file,
// and skip cleanly (never fail) until then.
describe("crank: account names match the IDL", () => {
  // CRANK_IDL_PATH exists so this check can be exercised against a fixture
  // before the real build lands — otherwise it would sit pending forever and
  // nobody would know whether it works.
  const IDL_PATH =
    process.env.CRANK_IDL_PATH ??
    path.resolve(__dirname, "..", "target", "idl", "agent_tickets_escrow.json");

  // Kept in sync by hand with scripts/crank.ts's two .accounts({...}) calls.
  const CRANK_ACCOUNTS: Record<string, string[]> = {
    timeoutRefund: [
      "config", "listing", "order", "buyer", "seller",
      "vault", "buyerToken", "usdcMint", "tokenProgram",
    ],
    timeoutRelease: [
      "config", "listing", "order", "authority", "buyer", "seller",
      "vault", "sellerToken", "feeToken", "usdcMint", "tokenProgram",
    ],
  };

  let idl: any;

  before(function () {
    if (!fs.existsSync(IDL_PATH)) {
      this.skip(); // `anchor build` has not run yet; another session owns it.
    }
    idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  });

  for (const [ixName, expected] of Object.entries(CRANK_ACCOUNTS)) {
    it(`${ixName}: crank's account set equals the IDL's`, () => {
      const snake = ixName.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      const ix = idl.instructions.find(
        (i: any) => i.name === ixName || i.name === snake
      );
      expect(ix, `instruction ${ixName} missing from IDL`).to.not.equal(undefined);

      const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
      const idlNames = ix.accounts.map((a: any) => camel(a.name)).sort();
      expect(idlNames).to.deep.equal([...expected].sort());
    });
  }
});
