// Edge-case suite for agent_tickets_escrow — companion to tests/escrow.test.ts,
// which owns the happy path, both timeout paths, and double-buy rejection.
//
// HOW TO RUN — read this before wondering why the suite is "pending":
// `Config` is a singleton PDA (seeds ["config"]) holding the one usdc_mint the whole
// program validates against, and `initialize_config` uses `init`, not `init_if_needed`.
// Two independent suites therefore cannot share one validator: whichever runs second
// fails to initialize, and its freshly-created mint would not match config.usdc_mint
// anyway. Since the default `anchor test` glob loads both files into one validator,
// this suite detects escrow.test.ts and skips itself rather than breaking it.
//
// To actually run these cases, give them their own validator:
//
//   solana-test-validator -r &            # or: anchor localnet
//   anchor deploy
//   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
//     npx ts-mocha -p ./tsconfig.json -t 1000000 tests/escrow-edge.test.ts
//
// See docs/escrow-integration.md §9.1 for the underlying constraint.

import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Same tiny windows as the base suite so timeout paths are reachable with sleeps.
const DELIVERY_WINDOW = 4;
const INSPECTION_WINDOW = 3;
const USDC_DECIMALS = 6;
const PRICE = 100_000_000n; // $100.00
const FEE_BPS = 300;

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

// Mocha loads every spec file before running any of them, so this is decided by the
// time `before` fires. Under Node's native ESM loader `require.cache` doesn't exist —
// there the suite always runs standalone (npm run test:edge), so no collision is possible.
const SHARES_VALIDATOR_WITH_BASE_SUITE =
  typeof require !== "undefined" && require.cache
    ? Object.keys(require.cache).some((p) => /(^|[\\/])escrow\.test\.ts$/.test(p))
    : false;

describe("agent_tickets_escrow — edge cases", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.agentTicketsEscrow as Program;
  const conn = provider.connection;

  // Fresh actors so listing PDAs can never collide with the base suite's.
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const feeWallet = Keypair.generate();
  // config.authority and config.arbiter are both the provider wallet, so the same
  // signer can flip the fee and rule on disputes.
  const arbiter = provider.wallet;

  let usdcMint: PublicKey;
  let sellerToken: PublicKey;
  let buyerToken: PublicKey;
  let feeToken: PublicKey;
  let configPda: PublicKey;
  let nextListingId = 100n;

  const listingPda = (s: PublicKey, id: bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), s.toBuffer(), Buffer.from(new Uint8Array(new BigUint64Array([id]).buffer))],
      program.programId
    )[0];
  const orderPda = (listing: PublicKey, b: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("order"), listing.toBuffer(), b.toBuffer()],
      program.programId
    )[0];

  before(async function () {
    if (SHARES_VALIDATOR_WITH_BASE_SUITE) {
      this.skip(); // see the header comment: singleton Config, one suite per validator
    }

    for (const kp of [seller, buyer, feeWallet]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig);
    }
    usdcMint = await createMint(conn, buyer, buyer.publicKey, null, USDC_DECIMALS);
    buyerToken = (await getOrCreateAssociatedTokenAccount(conn, buyer, usdcMint, buyer.publicKey)).address;
    sellerToken = (await getOrCreateAssociatedTokenAccount(conn, seller, usdcMint, seller.publicKey)).address;
    feeToken = (await getOrCreateAssociatedTokenAccount(conn, feeWallet, usdcMint, feeWallet.publicKey)).address;
    await mintTo(conn, buyer, usdcMint, buyerToken, buyer, 2_000_000_000); // $2000
    [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    await program.methods
      .initializeConfig(FEE_BPS, new BN(DELIVERY_WINDOW), new BN(INSPECTION_WINDOW))
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        arbiter: arbiter.publicKey,
        feeDestination: feeWallet.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // 3h out clears the 2h pre-event grace; override to test the create_listing guards.
  async function createListing(hoursOut = 3, price = PRICE, qty = 1) {
    const id = nextListingId++;
    const listing = listingPda(seller.publicKey, id);
    const eventStart = Math.floor(Date.now() / 1000) + Math.round(hoursOut * 3600);
    await program.methods
      .createListing(
        new BN(id.toString()),
        new BN(price.toString()),
        Array.from(new Uint8Array(32).fill(7)),
        new BN(eventStart),
        qty,
        "ipfs://edge"
      )
      .accounts({ config: configPda, listing, seller: seller.publicKey, systemProgram: SystemProgram.programId })
      .signers([seller])
      .rpc();
    return listing;
  }

  async function buy(listing: PublicKey) {
    const order = orderPda(listing, buyer.publicKey);
    const vault = getAssociatedTokenAddressSync(usdcMint, order, true);
    await program.methods
      .lockPurchase()
      .accounts({ config: configPda, listing, order, buyer: buyer.publicKey, buyerToken, vault, usdcMint, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([buyer])
      .rpc();
    return { order, vault };
  }

  const markDelivered = (listing: PublicKey, order: PublicKey) =>
    program.methods
      .markDelivered()
      .accounts({ config: configPda, listing, order, seller: seller.publicKey })
      .signers([seller])
      .rpc();

  const settleAccounts = (listing: PublicKey, order: PublicKey, vault: PublicKey, authority: PublicKey) => ({
    config: configPda,
    listing,
    order,
    authority,
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    vault,
    sellerToken,
    feeToken,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const refundAccounts = (listing: PublicKey, order: PublicKey, vault: PublicKey) => ({
    config: configPda,
    listing,
    order,
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    vault,
    buyerToken,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const disputeAccounts = (listing: PublicKey, order: PublicKey, vault: PublicKey) => ({
    config: configPda,
    listing,
    order,
    arbiter: arbiter.publicKey,
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    vault,
    buyerToken,
    sellerToken,
    feeToken,
    usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  async function expectError(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      assert.fail(`expected ${name}`);
    } catch (e: any) {
      assert.include(e.toString(), name);
    }
  }

  const balance = async (ata: PublicKey) => (await getAccount(conn, ata)).amount;

  it("cancel_listing: seller withdraws an active listing and gets the rent back", async () => {
    const listing = await createListing();
    const rent = (await conn.getAccountInfo(listing))!.lamports;
    const before = await conn.getBalance(seller.publicKey);

    await program.methods
      .cancelListing()
      .accounts({ listing, seller: seller.publicKey })
      .signers([seller])
      .rpc();

    assert.isNull(await conn.getAccountInfo(listing), "listing account closed");
    const after = await conn.getBalance(seller.publicKey);
    // Seller signed, so they also paid the fee; rent still dominates.
    assert.isAbove(after - before, rent - 10_000, "rent refunded to seller");
  });

  it("cancel_listing: rejected once the listing is locked by an order", async () => {
    const listing = await createListing();
    await buy(listing);

    await expectError("ListingNotActive", () =>
      program.methods
        .cancelListing()
        .accounts({ listing, seller: seller.publicKey })
        .signers([seller])
        .rpc()
    );
    assert.isNotNull(await conn.getAccountInfo(listing), "listing survives the failed cancel");
  });

  it("cancel_purchase: seller unwinds, buyer made whole, listing goes back to Active", async () => {
    const listing = await createListing();
    const { order, vault } = await buy(listing);
    const buyerBefore = await balance(buyerToken);
    const feeBefore = await balance(feeToken);

    await program.methods
      .cancelPurchase()
      .accounts({
        config: configPda,
        listing,
        order,
        seller: seller.publicKey,
        buyer: buyer.publicKey,
        vault,
        buyerToken,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    assert.equal((await balance(buyerToken)) - buyerBefore, PRICE, "full refund, no fee");
    assert.equal(await balance(feeToken), feeBefore, "fee destination untouched");
    assert.isNull(await conn.getAccountInfo(order), "order closed");
    assert.isNull(await conn.getAccountInfo(vault), "vault closed");

    const relisted = await (program.account as any).listing.fetch(listing);
    assert.property(relisted.status, "active", "listing is relistable again");

    // ...and it really is buyable: the closed order PDA re-inits cleanly.
    const second = await buy(listing);
    assert.isNotNull(await conn.getAccountInfo(second.order), "same listing sells again");
  });

  it("open_dispute: freezes both clocks — neither timeout can fire afterwards", async () => {
    const listing = await createListing();
    const { order, vault } = await buy(listing);
    await markDelivered(listing, order);

    await program.methods
      .openDispute()
      .accounts({ order, buyer: buyer.publicKey })
      .signers([buyer])
      .rpc();

    const disputed = await (program.account as any).order.fetch(order);
    assert.property(disputed.state, "disputed");

    // Past both deadlines now: delivery lapsed long ago, inspection has lapsed too.
    await sleep(Math.max(DELIVERY_WINDOW, INSPECTION_WINDOW) + 2);

    await expectError("InvalidState", () =>
      program.methods
        .timeoutRelease()
        .accounts(settleAccounts(listing, order, vault, provider.wallet.publicKey))
        .rpc()
    );
    await expectError("InvalidState", () =>
      program.methods.timeoutRefund().accounts(refundAccounts(listing, order, vault)).rpc()
    );
    // The buyer can't unilaterally release out of a dispute either.
    await expectError("InvalidState", () =>
      program.methods
        .confirmReceipt()
        .accounts(settleAccounts(listing, order, vault, buyer.publicKey))
        .signers([buyer])
        .rpc()
    );

    assert.equal(await balance(vault), PRICE, "funds still escrowed, awaiting the arbiter");
  });

  it("resolve_dispute(PaySeller): seller paid minus fee, everything closed", async () => {
    const listing = await createListing();
    const { order, vault } = await buy(listing);
    await markDelivered(listing, order);
    await program.methods
      .openDispute()
      .accounts({ order, buyer: buyer.publicKey })
      .signers([buyer])
      .rpc();

    const sellerBefore = await balance(sellerToken);
    const feeBefore = await balance(feeToken);
    await program.methods
      .resolveDispute({ paySeller: {} })
      .accounts(disputeAccounts(listing, order, vault))
      .rpc();

    const fee = (PRICE * BigInt(FEE_BPS)) / 10_000n;
    assert.equal((await balance(sellerToken)) - sellerBefore, PRICE - fee, "seller nets price minus fee");
    assert.equal((await balance(feeToken)) - feeBefore, fee, "fee routed");
    assert.isNull(await conn.getAccountInfo(vault), "vault closed");
    assert.isNull(await conn.getAccountInfo(order), "order closed");
    assert.isNull(await conn.getAccountInfo(listing), "listing closed");
  });

  it("resolve_dispute(RefundBuyer): buyer made whole, no fee taken", async () => {
    const listing = await createListing();
    const { order, vault } = await buy(listing);
    // Disputable straight from Locked — mark_delivered is not a precondition.
    await program.methods
      .openDispute()
      .accounts({ order, buyer: buyer.publicKey })
      .signers([buyer])
      .rpc();

    const buyerBefore = await balance(buyerToken);
    const feeBefore = await balance(feeToken);
    await program.methods
      .resolveDispute({ refundBuyer: {} })
      .accounts(disputeAccounts(listing, order, vault))
      .rpc();

    assert.equal((await balance(buyerToken)) - buyerBefore, PRICE, "full refund");
    assert.equal(await balance(feeToken), feeBefore, "no fee on a refund ruling");
    assert.isNull(await conn.getAccountInfo(order), "order closed");
    assert.isNull(await conn.getAccountInfo(listing), "listing closed");
  });

  it("mark_delivered: rejected once the delivery deadline has passed", async () => {
    const listing = await createListing();
    const { order, vault } = await buy(listing);

    await sleep(DELIVERY_WINDOW + 2);
    await expectError("DeadlinePassed", () => markDelivered(listing, order));

    // And the order is now firmly on the refund rail — a late seller can't rescue it.
    const buyerBefore = await balance(buyerToken);
    await program.methods.timeoutRefund().accounts(refundAccounts(listing, order, vault)).rpc();
    assert.equal((await balance(buyerToken)) - buyerBefore, PRICE, "buyer refunded in full");
  });

  it("create_listing: rejected when the event starts inside the 2h grace", async () => {
    // 1h out: delivery could never complete 2h before doors, so the listing is refused
    // at creation rather than becoming an unbuyable ghost.
    await expectError("EventTooSoon", () => createListing(1));
  });

  it("create_listing: rejected at price 0 and at qty 0", async () => {
    await expectError("InvalidPrice", () => createListing(3, 0n));
    await expectError("InvalidQty", () => createListing(3, PRICE, 0));
  });

  it("update_config: rejected for anyone but the config authority", async () => {
    await expectError("ConstraintHasOne", () =>
      program.methods
        .updateConfig(null, null, null, null, true)
        .accounts({ config: configPda, authority: seller.publicKey })
        .signers([seller])
        .rpc()
    );
    const cfg = await (program.account as any).config.fetch(configPda);
    assert.isFalse(cfg.paused, "market was not paused by the rejected update");
  });

  it("fee_bps = 0: seller receives the entire price and the fee account is untouched", async () => {
    await program.methods
      .updateConfig(0, null, null, null, null)
      .accounts({ config: configPda, authority: provider.wallet.publicKey })
      .rpc();

    try {
      // fee_bps is snapshotted at lock, so the config change must precede the buy.
      const listing = await createListing();
      const { order, vault } = await buy(listing);
      const locked = await (program.account as any).order.fetch(order);
      assert.equal(locked.feeBps, 0, "order snapshotted the zero fee");

      await markDelivered(listing, order);

      const sellerBefore = await balance(sellerToken);
      const feeBefore = await balance(feeToken);
      await program.methods
        .confirmReceipt()
        .accounts(settleAccounts(listing, order, vault, buyer.publicKey))
        .signers([buyer])
        .rpc();

      assert.equal((await balance(sellerToken)) - sellerBefore, PRICE, "seller gets 100% of the price");
      assert.equal(await balance(feeToken), feeBefore, "zero-fee transfer is skipped entirely");
      assert.isNull(await conn.getAccountInfo(vault), "vault still closed on the zero-fee path");
    } finally {
      await program.methods
        .updateConfig(FEE_BPS, null, null, null, null)
        .accounts({ config: configPda, authority: provider.wallet.publicKey })
        .rpc();
    }
  });
});
