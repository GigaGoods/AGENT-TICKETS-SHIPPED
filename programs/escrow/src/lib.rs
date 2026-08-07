use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

declare_id!("J26zGhTfnDVqNZcRwerK5Aen7BXyGnjjxkG9CXkbSCRv");

// Deadlines clamp to the event: delivery must complete 2h before doors,
// inspection can run at most 6h past doors. See design doc §5.3.
const GRACE_BEFORE_EVENT_SECS: i64 = 7_200;
const GRACE_AFTER_EVENT_SECS: i64 = 21_600;
const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod agent_tickets_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_bps: u16,
        delivery_window_secs: i64,
        inspection_window_secs: i64,
    ) -> Result<()> {
        require!(fee_bps as u64 <= BPS_DENOMINATOR, EscrowError::InvalidFee);
        require!(
            delivery_window_secs > 0 && inspection_window_secs > 0,
            EscrowError::InvalidWindow
        );
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.arbiter = ctx.accounts.arbiter.key();
        config.fee_bps = fee_bps;
        config.fee_destination = ctx.accounts.fee_destination.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.delivery_window_secs = delivery_window_secs;
        config.inspection_window_secs = inspection_window_secs;
        config.paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_bps: Option<u16>,
        delivery_window_secs: Option<i64>,
        inspection_window_secs: Option<i64>,
        arbiter: Option<Pubkey>,
        paused: Option<bool>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(v) = fee_bps {
            require!(v as u64 <= BPS_DENOMINATOR, EscrowError::InvalidFee);
            config.fee_bps = v;
        }
        if let Some(v) = delivery_window_secs {
            require!(v > 0, EscrowError::InvalidWindow);
            config.delivery_window_secs = v;
        }
        if let Some(v) = inspection_window_secs {
            require!(v > 0, EscrowError::InvalidWindow);
            config.inspection_window_secs = v;
        }
        if let Some(v) = arbiter {
            config.arbiter = v;
        }
        if let Some(v) = paused {
            config.paused = v;
        }
        Ok(())
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        listing_id: u64,
        price: u64,
        event_hash: [u8; 32],
        event_start_ts: i64,
        qty: u16,
        metadata_uri: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, EscrowError::MarketPaused);
        require!(price > 0, EscrowError::InvalidPrice);
        require!(qty >= 1, EscrowError::InvalidQty);
        let now = Clock::get()?.unix_timestamp;
        require!(
            event_start_ts > now + GRACE_BEFORE_EVENT_SECS,
            EscrowError::EventTooSoon
        );

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.listing_id = listing_id;
        listing.price = price;
        listing.event_hash = event_hash;
        listing.event_start_ts = event_start_ts;
        listing.qty = qty;
        listing.status = ListingStatus::Active;
        listing.delivery_commit = [0u8; 32];
        listing.metadata_uri = metadata_uri;
        listing.created_ts = now;
        listing.bump = ctx.bumps.listing;

        emit!(ListingCreated {
            listing: listing.key(),
            seller: listing.seller,
            listing_id,
            price,
            event_hash,
            event_start_ts,
        });
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        require!(
            ctx.accounts.listing.status == ListingStatus::Active,
            EscrowError::ListingNotActive
        );
        emit!(ListingCancelled {
            listing: ctx.accounts.listing.key(),
            seller: ctx.accounts.seller.key(),
        });
        Ok(())
    }

    pub fn lock_purchase(ctx: Context<LockPurchase>) -> Result<()> {
        require!(!ctx.accounts.config.paused, EscrowError::MarketPaused);
        require!(
            ctx.accounts.listing.status == ListingStatus::Active,
            EscrowError::ListingNotActive
        );
        let now = Clock::get()?.unix_timestamp;
        let config = &ctx.accounts.config;
        let listing = &mut ctx.accounts.listing;

        let delivery_deadline = std::cmp::min(
            now.checked_add(config.delivery_window_secs)
                .ok_or(EscrowError::MathOverflow)?,
            listing
                .event_start_ts
                .checked_sub(GRACE_BEFORE_EVENT_SECS)
                .ok_or(EscrowError::MathOverflow)?,
        );
        require!(delivery_deadline > now, EscrowError::EventTooSoon);

        listing.status = ListingStatus::Locked;

        let order = &mut ctx.accounts.order;
        order.listing = listing.key();
        order.buyer = ctx.accounts.buyer.key();
        order.seller = listing.seller;
        order.amount = listing.price;
        order.fee_bps = config.fee_bps;
        order.state = OrderState::Locked;
        order.locked_ts = now;
        order.delivery_deadline = delivery_deadline;
        order.inspection_deadline = 0;
        order.arbiter = config.arbiter;
        order.attestation = Pubkey::default();
        order.bump = ctx.bumps.order;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            listing.price,
            ctx.accounts.usdc_mint.decimals,
        )?;

        emit!(PurchaseLocked {
            order: order.key(),
            listing: listing.key(),
            buyer: order.buyer,
            amount: order.amount,
            delivery_deadline,
        });
        Ok(())
    }

    pub fn mark_delivered(ctx: Context<MarkDelivered>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let order = &mut ctx.accounts.order;
        require!(order.state == OrderState::Locked, EscrowError::InvalidState);
        require!(now <= order.delivery_deadline, EscrowError::DeadlinePassed);

        let inspection_deadline = std::cmp::min(
            now.checked_add(ctx.accounts.config.inspection_window_secs)
                .ok_or(EscrowError::MathOverflow)?,
            ctx.accounts
                .listing
                .event_start_ts
                .checked_add(GRACE_AFTER_EVENT_SECS)
                .ok_or(EscrowError::MathOverflow)?,
        );
        order.state = OrderState::Delivered;
        order.inspection_deadline = inspection_deadline;

        emit!(DeliveryMarked {
            order: order.key(),
            inspection_deadline,
        });
        Ok(())
    }

    pub fn confirm_receipt(ctx: Context<Settle>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.order.buyer,
            EscrowError::UnauthorizedBuyer
        );
        require!(
            matches!(
                ctx.accounts.order.state,
                OrderState::Locked | OrderState::Delivered
            ),
            EscrowError::InvalidState
        );
        pay_out(ctx)
    }

    // Permissionless: silence past the inspection deadline settles to the seller,
    // but ONLY after delivery was asserted. A seller who never delivered can never
    // reach this path — see timeout_refund. Design doc §5.3.
    pub fn timeout_release(ctx: Context<Settle>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.order.state == OrderState::Delivered,
            EscrowError::InvalidState
        );
        require!(
            now > ctx.accounts.order.inspection_deadline,
            EscrowError::DeadlineNotReached
        );
        pay_out(ctx)
    }

    // Permissionless: seller never asserted delivery in the window -> full refund.
    pub fn timeout_refund(ctx: Context<TimeoutRefund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.order.state == OrderState::Locked,
            EscrowError::InvalidState
        );
        require!(
            now > ctx.accounts.order.delivery_deadline,
            EscrowError::DeadlineNotReached
        );
        ctx.accounts.listing.status = ListingStatus::Cancelled;
        ctx.accounts.order.state = OrderState::Refunded;
        refund_vault_to_buyer(
            &ctx.accounts.order,
            ctx.accounts.listing.key(),
            &ctx.accounts.vault,
            &ctx.accounts.buyer_token,
            &ctx.accounts.buyer,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.token_program,
        )?;
        emit!(OrderRefunded {
            order: ctx.accounts.order.key(),
            amount: ctx.accounts.order.amount,
            reason: RefundReason::DeliveryTimeout,
        });
        Ok(())
    }

    // Mutual unwind before things go bad: seller returns the money, listing relists.
    pub fn cancel_purchase(ctx: Context<CancelPurchase>) -> Result<()> {
        require!(
            matches!(
                ctx.accounts.order.state,
                OrderState::Locked | OrderState::Delivered
            ),
            EscrowError::InvalidState
        );
        ctx.accounts.listing.status = ListingStatus::Active;
        ctx.accounts.order.state = OrderState::Refunded;
        refund_vault_to_buyer(
            &ctx.accounts.order,
            ctx.accounts.listing.key(),
            &ctx.accounts.vault,
            &ctx.accounts.buyer_token,
            &ctx.accounts.buyer,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.token_program,
        )?;
        emit!(OrderRefunded {
            order: ctx.accounts.order.key(),
            amount: ctx.accounts.order.amount,
            reason: RefundReason::SellerCancelled,
        });
        Ok(())
    }

    // Dormant in V1 UI; shipped now so disputes are an instruction-add, not a migration.
    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.buyer.key(),
            ctx.accounts.order.buyer,
            EscrowError::UnauthorizedBuyer
        );
        require!(
            matches!(
                ctx.accounts.order.state,
                OrderState::Locked | OrderState::Delivered
            ),
            EscrowError::InvalidState
        );
        ctx.accounts.order.state = OrderState::Disputed;
        emit!(DisputeOpened {
            order: ctx.accounts.order.key(),
        });
        Ok(())
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, ruling: DisputeRuling) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.arbiter.key(),
            ctx.accounts.order.arbiter,
            EscrowError::UnauthorizedArbiter
        );
        require!(
            ctx.accounts.order.state == OrderState::Disputed,
            EscrowError::InvalidState
        );
        let listing_key = ctx.accounts.listing.key();
        match ruling {
            DisputeRuling::PaySeller => {
                ctx.accounts.listing.status = ListingStatus::Settled;
                ctx.accounts.order.state = OrderState::ArbiterResolved;
                let (to_seller, fee) = split_fee(&ctx.accounts.order)?;
                move_payout(
                    &ctx.accounts.order,
                    listing_key,
                    &ctx.accounts.vault,
                    &ctx.accounts.seller_token,
                    &ctx.accounts.fee_token,
                    &ctx.accounts.buyer,
                    &ctx.accounts.usdc_mint,
                    &ctx.accounts.token_program,
                    to_seller,
                    fee,
                )?;
            }
            DisputeRuling::RefundBuyer => {
                ctx.accounts.listing.status = ListingStatus::Cancelled;
                ctx.accounts.order.state = OrderState::ArbiterResolved;
                refund_vault_to_buyer(
                    &ctx.accounts.order,
                    listing_key,
                    &ctx.accounts.vault,
                    &ctx.accounts.buyer_token,
                    &ctx.accounts.buyer,
                    &ctx.accounts.usdc_mint,
                    &ctx.accounts.token_program,
                )?;
            }
        }
        emit!(DisputeResolved {
            order: ctx.accounts.order.key(),
            ruling,
        });
        Ok(())
    }
}

fn split_fee(order: &Account<Order>) -> Result<(u64, u64)> {
    let fee = (order.amount as u128)
        .checked_mul(order.fee_bps as u128)
        .ok_or(EscrowError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(EscrowError::MathOverflow)? as u64;
    let to_seller = order.amount.checked_sub(fee).ok_or(EscrowError::MathOverflow)?;
    Ok((to_seller, fee))
}

fn order_signer_seeds<'a>(
    listing: &'a Pubkey,
    buyer: &'a Pubkey,
    bump: &'a [u8; 1],
) -> [&'a [u8]; 4] {
    [b"order", listing.as_ref(), buyer.as_ref(), bump]
}

#[allow(clippy::too_many_arguments)]
fn move_payout<'info>(
    order: &Account<'info, Order>,
    listing_key: Pubkey,
    vault: &InterfaceAccount<'info, TokenAccount>,
    seller_token: &InterfaceAccount<'info, TokenAccount>,
    fee_token: &InterfaceAccount<'info, TokenAccount>,
    rent_recipient: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    to_seller: u64,
    fee: u64,
) -> Result<()> {
    let buyer_key = order.buyer;
    let bump = [order.bump];
    let seeds = order_signer_seeds(&listing_key, &buyer_key, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];

    if fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                TransferChecked {
                    from: vault.to_account_info(),
                    mint: mint.to_account_info(),
                    to: fee_token.to_account_info(),
                    authority: order.to_account_info(),
                },
                signer,
            ),
            fee,
            mint.decimals,
        )?;
    }
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: seller_token.to_account_info(),
                authority: order.to_account_info(),
            },
            signer,
        ),
        to_seller,
        mint.decimals,
    )?;
    close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_recipient.to_account_info(),
            authority: order.to_account_info(),
        },
        signer,
    ))?;
    Ok(())
}

fn refund_vault_to_buyer<'info>(
    order: &Account<'info, Order>,
    listing_key: Pubkey,
    vault: &InterfaceAccount<'info, TokenAccount>,
    buyer_token: &InterfaceAccount<'info, TokenAccount>,
    buyer: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let buyer_key = order.buyer;
    let bump = [order.bump];
    let seeds = order_signer_seeds(&listing_key, &buyer_key, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];

    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: buyer_token.to_account_info(),
                authority: order.to_account_info(),
            },
            signer,
        ),
        order.amount,
        mint.decimals,
    )?;
    close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: buyer.to_account_info(),
            authority: order.to_account_info(),
        },
        signer,
    ))?;
    Ok(())
}

fn pay_out(ctx: Context<Settle>) -> Result<()> {
    ctx.accounts.listing.status = ListingStatus::Settled;
    ctx.accounts.order.state = OrderState::Released;
    let (to_seller, fee) = split_fee(&ctx.accounts.order)?;
    let listing_key = ctx.accounts.listing.key();
    move_payout(
        &ctx.accounts.order,
        listing_key,
        &ctx.accounts.vault,
        &ctx.accounts.seller_token,
        &ctx.accounts.fee_token,
        &ctx.accounts.buyer,
        &ctx.accounts.usdc_mint,
        &ctx.accounts.token_program,
        to_seller,
        fee,
    )?;
    emit!(OrderReleased {
        order: ctx.accounts.order.key(),
        to_seller,
        fee,
    });
    Ok(())
}

// ---------- Accounts ----------

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: stored as the dispute arbiter; platform multisig later
    pub arbiter: UncheckedAccount<'info>,
    /// CHECK: fee destination wallet
    pub fee_destination: UncheckedAccount<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct CreateListing<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", seller.key().as_ref(), listing_id.to_le_bytes().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        close = seller,
        seeds = [b"listing", seller.key().as_ref(), listing.listing_id.to_le_bytes().as_ref()],
        bump = listing.bump,
        has_one = seller
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct LockPurchase<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Order::INIT_SPACE,
        seeds = [b"order", listing.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        constraint = buyer_token.owner == buyer.key() @ EscrowError::InvalidTokenAccount,
        constraint = buyer_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = order,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint @ EscrowError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkDelivered<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = listing.key() == order.listing @ EscrowError::ListingMismatch)]
    pub listing: Account<'info, Listing>,
    #[account(mut, constraint = order.seller == seller.key() @ EscrowError::UnauthorizedSeller)]
    pub order: Account<'info, Order>,
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = seller,
        constraint = listing.key() == order.listing @ EscrowError::ListingMismatch
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = buyer,
        seeds = [b"order", listing.key().as_ref(), order.buyer.as_ref()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    pub authority: Signer<'info>,
    /// CHECK: validated against order.buyer; receives order + vault rent
    #[account(mut, address = order.buyer @ EscrowError::InvalidTokenAccount)]
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: validated against order.seller; receives listing rent
    #[account(mut, address = order.seller @ EscrowError::InvalidTokenAccount)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_token.owner == order.seller @ EscrowError::InvalidTokenAccount,
        constraint = seller_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = fee_token.owner == config.fee_destination @ EscrowError::InvalidTokenAccount,
        constraint = fee_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub fee_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint @ EscrowError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct TimeoutRefund<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = seller,
        constraint = listing.key() == order.listing @ EscrowError::ListingMismatch
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = buyer,
        seeds = [b"order", listing.key().as_ref(), order.buyer.as_ref()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    /// CHECK: validated against order.buyer; receives refund + rent
    #[account(mut, address = order.buyer @ EscrowError::InvalidTokenAccount)]
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: validated against order.seller; receives listing rent
    #[account(mut, address = order.seller @ EscrowError::InvalidTokenAccount)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = buyer_token.owner == order.buyer @ EscrowError::InvalidTokenAccount,
        constraint = buyer_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint @ EscrowError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CancelPurchase<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = listing.key() == order.listing @ EscrowError::ListingMismatch)]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = buyer,
        seeds = [b"order", listing.key().as_ref(), order.buyer.as_ref()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    #[account(constraint = order.seller == seller.key() @ EscrowError::UnauthorizedSeller)]
    pub seller: Signer<'info>,
    /// CHECK: validated against order.buyer; receives refund + rent
    #[account(mut, address = order.buyer @ EscrowError::InvalidTokenAccount)]
    pub buyer: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = buyer_token.owner == order.buyer @ EscrowError::InvalidTokenAccount,
        constraint = buyer_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint @ EscrowError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,
    pub buyer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = seller,
        constraint = listing.key() == order.listing @ EscrowError::ListingMismatch
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = buyer,
        seeds = [b"order", listing.key().as_ref(), order.buyer.as_ref()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    pub arbiter: Signer<'info>,
    /// CHECK: validated against order.buyer
    #[account(mut, address = order.buyer @ EscrowError::InvalidTokenAccount)]
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: validated against order.seller
    #[account(mut, address = order.seller @ EscrowError::InvalidTokenAccount)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = buyer_token.owner == order.buyer @ EscrowError::InvalidTokenAccount,
        constraint = buyer_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_token.owner == order.seller @ EscrowError::InvalidTokenAccount,
        constraint = seller_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = fee_token.owner == config.fee_destination @ EscrowError::InvalidTokenAccount,
        constraint = fee_token.mint == config.usdc_mint @ EscrowError::InvalidTokenAccount
    )]
    pub fee_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint @ EscrowError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ---------- State ----------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub arbiter: Pubkey,
    pub fee_bps: u16,
    pub fee_destination: Pubkey,
    pub usdc_mint: Pubkey,
    pub delivery_window_secs: i64,
    pub inspection_window_secs: i64,
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 128],
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub listing_id: u64,
    pub price: u64,
    pub event_hash: [u8; 32],
    pub event_start_ts: i64,
    pub qty: u16,
    pub status: ListingStatus,
    pub delivery_commit: [u8; 32],
    #[max_len(96)]
    pub metadata_uri: String,
    pub created_ts: i64,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Order {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub fee_bps: u16,
    pub state: OrderState,
    pub locked_ts: i64,
    pub delivery_deadline: i64,
    pub inspection_deadline: i64,
    pub arbiter: Pubkey,
    pub attestation: Pubkey,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ListingStatus {
    Active,
    Locked,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderState {
    Locked,
    Delivered,
    Released,
    Refunded,
    Disputed,
    ArbiterResolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DisputeRuling {
    PaySeller,
    RefundBuyer,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RefundReason {
    DeliveryTimeout,
    SellerCancelled,
}

// ---------- Events ----------

#[event]
pub struct ListingCreated {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub listing_id: u64,
    pub price: u64,
    pub event_hash: [u8; 32],
    pub event_start_ts: i64,
}

#[event]
pub struct ListingCancelled {
    pub listing: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct PurchaseLocked {
    pub order: Pubkey,
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub delivery_deadline: i64,
}

#[event]
pub struct DeliveryMarked {
    pub order: Pubkey,
    pub inspection_deadline: i64,
}

#[event]
pub struct OrderReleased {
    pub order: Pubkey,
    pub to_seller: u64,
    pub fee: u64,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub amount: u64,
    pub reason: RefundReason,
}

#[event]
pub struct DisputeOpened {
    pub order: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub order: Pubkey,
    pub ruling: DisputeRuling,
}

// ---------- Errors ----------

#[error_code]
pub enum EscrowError {
    #[msg("Marketplace is paused")]
    MarketPaused,
    #[msg("Fee must be <= 10000 bps")]
    InvalidFee,
    #[msg("Window must be positive")]
    InvalidWindow,
    #[msg("Price must be > 0")]
    InvalidPrice,
    #[msg("Quantity must be >= 1")]
    InvalidQty,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Order is not in a valid state for this action")]
    InvalidState,
    #[msg("Event starts too soon for the escrow window")]
    EventTooSoon,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Deadline has already passed")]
    DeadlinePassed,
    #[msg("Signer is not the order's buyer")]
    UnauthorizedBuyer,
    #[msg("Signer is not the order's seller")]
    UnauthorizedSeller,
    #[msg("Signer is not the configured arbiter")]
    UnauthorizedArbiter,
    #[msg("Listing does not match order")]
    ListingMismatch,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Math overflow")]
    MathOverflow,
}
