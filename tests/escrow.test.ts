import * as anchor from "@coral-xyz/anchor";
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

// Windows are set tiny (seconds) at init so timeout paths are testable with sleeps.
const DELIVERY_WINDOW = 4;
const INSPECTION_WINDOW = 3;
const USDC_DECIMALS = 6;
const PRICE = 100_000_000n; // $100.00

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

describe("agent_tickets_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.agentTicketsEscrow as Program;
  const conn = provider.connection;

  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const feeWallet = Keypair.generate();
  let usdcMint: PublicKey;
  let sellerToken: PublicKey;
  let buyerToken: PublicKey;
  let feeToken: PublicKey;
  let configPda: PublicKey;

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

  before(async () => {
    for (const kp of [seller, buyer, feeWallet]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig);
    }
    usdcMint = await createMint(conn, buyer, buyer.publicKey, null, USDC_DECIMALS);
    buyerToken = (await getOrCreateAssociatedTokenAccount(conn, buyer, usdcMint, buyer.publicKey)).address;
    sellerToken = (await getOrCreateAssociatedTokenAccount(conn, seller, usdcMint, seller.publicKey)).address;
    feeToken = (await getOrCreateAssociatedTokenAccount(conn, feeWallet, usdcMint, feeWallet.publicKey)).address;
    await mintTo(conn, buyer, usdcMint, buyerToken, buyer, 1_000_000_000); // $1000
    [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    await program.methods
      .initializeConfig(300, new anchor.BN(DELIVERY_WINDOW), new anchor.BN(INSPECTION_WINDOW))
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        arbiter: provider.wallet.publicKey,
        feeDestination: feeWallet.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  async function createListing(id: bigint) {
    const listing = listingPda(seller.publicKey, id);
    const eventStart = Math.floor(Date.now() / 1000) + 3 * 3600; // 3h out clears the 2h grace
    await program.methods
      .createListing(
        new anchor.BN(id.toString()),
        new anchor.BN(PRICE.toString()),
        Array.from(new Uint8Array(32).fill(1)),
        new anchor.BN(eventStart),
        1,
        "ipfs://placeholder"
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
      .accounts({
        config: configPda,
        listing,
        order,
        buyer: buyer.publicKey,
        buyerToken,
        vault,
        usdcMint,
      })
      .signers([buyer])
      .rpc();
    return { order, vault };
  }

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
  });

  it("happy path: list -> buy -> mark_delivered -> confirm -> seller paid minus 3% fee", async () => {
    const listing = await createListing(1n);
    const { order, vault } = await buy(listing);

    const vaultAcc = await getAccount(conn, vault);
    assert.equal(vaultAcc.amount, PRICE, "escrow holds the full price");

    await program.methods
      .markDelivered()
      .accounts({ config: configPda, listing, order, seller: seller.publicKey })
      .signers([seller])
      .rpc();

    const sellerBefore = (await getAccount(conn, sellerToken)).amount;
    await program.methods
      .confirmReceipt()
      .accounts(settleAccounts(listing, order, vault, buyer.publicKey))
      .signers([buyer])
      .rpc();

    const sellerAfter = (await getAccount(conn, sellerToken)).amount;
    const fee = (PRICE * 300n) / 10_000n;
    assert.equal(sellerAfter - sellerBefore, PRICE - fee, "seller nets price minus fee");
    assert.equal((await getAccount(conn, feeToken)).amount, fee, "fee routed");
    assert.isNull(await conn.getAccountInfo(vault), "vault closed");
    assert.isNull(await conn.getAccountInfo(order), "order closed");
  });

  it("no-delivery path: seller silent past deadline -> permissionless full refund", async () => {
    const listing = await createListing(2n);
    const { order, vault } = await buy(listing);
    const buyerBefore = (await getAccount(conn, buyerToken)).amount;

    await sleep(DELIVERY_WINDOW + 2);
    await program.methods
      .timeoutRefund()
      .accounts({
        config: configPda,
        listing,
        order,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        vault,
        buyerToken,
        usdcMint,
      })
      .rpc(); // signed only by provider wallet: proves the crank is permissionless

    const buyerAfter = (await getAccount(conn, buyerToken)).amount;
    assert.equal(buyerAfter - buyerBefore, PRICE, "buyer made whole, no fee taken");
  });

  it("silent-buyer path: delivered, inspection lapses -> permissionless release to seller", async () => {
    const listing = await createListing(3n);
    const { order, vault } = await buy(listing);
    await program.methods
      .markDelivered()
      .accounts({ config: configPda, listing, order, seller: seller.publicKey })
      .signers([seller])
      .rpc();

    const sellerBefore = (await getAccount(conn, sellerToken)).amount;
    await sleep(INSPECTION_WINDOW + 2);
    await program.methods
      .timeoutRelease()
      .accounts(settleAccounts(listing, order, vault, provider.wallet.publicKey))
      .rpc();
    const sellerAfter = (await getAccount(conn, sellerToken)).amount;
    const fee = (PRICE * 300n) / 10_000n;
    assert.equal(sellerAfter - sellerBefore, PRICE - fee);
  });

  it("rejects double-buy of the same listing", async () => {
    const listing = await createListing(4n);
    await buy(listing);
    const buyer2 = Keypair.generate();
    const sig = await conn.requestAirdrop(buyer2.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig);
    const b2Token = (await getOrCreateAssociatedTokenAccount(conn, buyer2, usdcMint, buyer2.publicKey)).address;
    await mintTo(conn, buyer, usdcMint, b2Token, buyer, 200_000_000);

    const order2 = orderPda(listing, buyer2.publicKey);
    const vault2 = getAssociatedTokenAddressSync(usdcMint, order2, true);
    try {
      await program.methods
        .lockPurchase()
        .accounts({
          config: configPda,
          listing,
          order: order2,
          buyer: buyer2.publicKey,
          buyerToken: b2Token,
          vault: vault2,
          usdcMint,
        })
        .signers([buyer2])
        .rpc();
      assert.fail("second buy should have failed");
    } catch (e: any) {
      assert.include(e.toString(), "ListingNotActive");
    }
  });

  it("rejects timeout_refund before the delivery deadline", async () => {
    const listing = await createListing(5n);
    const { order, vault } = await buy(listing);
    try {
      await program.methods
        .timeoutRefund()
        .accounts({
          config: configPda,
          listing,
          order,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          vault,
          buyerToken,
          usdcMint,
        })
        .rpc();
      assert.fail("early refund should have failed");
    } catch (e: any) {
      assert.include(e.toString(), "DeadlineNotReached");
    }
  });
});
