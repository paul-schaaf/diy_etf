use serum_pool::{declare_pool_entrypoint, Pool, PoolContext};
use serum_pool_schema::PoolState;
use solana_program::program_error::ProgramError;
use solana_program::{info, program, program_pack::Pack};
use spl_token::state::Mint;

use std::convert::TryInto;

mod error;

use error::ETFError;

solana_program::declare_id!("2CbhUUUhzWawdSB5DsKJ7r22zjaeB1m1EzpvieSd6pmw");

enum EtfPool {}

impl Pool for EtfPool {
    fn initialize_pool(context: &PoolContext, state: &mut PoolState) -> Result<(), ProgramError> {
        info!("Processing pool initialization request...");
        let custom_data = context
            .custom_data
            .as_ref()
            .ok_or(ETFError::InvalidInitializationCustomData)?;
        let mut amounts: Vec<u64> = vec![];
        for (index, _) in context.pool_vault_accounts.iter().enumerate() {
            amounts.push(u64::from_le_bytes(
                custom_data[index * 8..(index + 1) * 8]
                    .try_into()
                    .map_err(|_| ETFError::InvalidInitializationCustomData)?,
            ));
        }

        if Mint::unpack(&context.pool_token_mint.data.borrow())?.supply != 0 {
            return Err(ProgramError::InvalidAccountData);
        }

        state.custom_state = custom_data.clone();
        Ok(())
    }

    fn process_creation(
        context: &PoolContext,
        state: &mut PoolState,
        requested_shares: u64,
    ) -> Result<(), ProgramError> {
        info!("Processing pool share creation request...");
        let token_amounts_to_pull =
            Self::get_token_amounts_for_given_shares(state, requested_shares);
        let user_accounts = context
            .user_accounts
            .as_ref()
            .ok_or(ProgramError::InvalidArgument)?;

        let pool_vault_accounts = context.pool_vault_accounts;

        let spl_token_program = context
            .spl_token_program
            .ok_or(ProgramError::InvalidArgument)?;

        let zipped_iter = token_amounts_to_pull
            .iter()
            .zip(user_accounts.asset_accounts.iter())
            .zip(pool_vault_accounts.iter());

        // pull in components
        for ((&input_qty, user_asset_account), pool_vault_account) in zipped_iter {
            let source_pubkey = user_asset_account.key;
            let destination_pubkey = pool_vault_account.key;
            let authority_pubkey = user_accounts.authority.key;
            let signer_pubkeys = &[];

            let instruction = spl_token::instruction::transfer(
                &spl_token::ID,
                source_pubkey,
                destination_pubkey,
                authority_pubkey,
                signer_pubkeys,
                input_qty,
            )?;

            let account_infos = &[
                user_asset_account.clone(),
                pool_vault_account.clone(),
                user_accounts.authority.clone(),
                spl_token_program.clone(),
            ];

            program::invoke(&instruction, account_infos)?;
        }

        // push out shares
        {
            let mint_pubkey = context.pool_token_mint.key;
            let account_pubkey = user_accounts.pool_token_account.key;
            let owner_pubkey = context.pool_authority.key;
            let signer_pubkeys = &[];

            let instruction = spl_token::instruction::mint_to(
                &spl_token::ID,
                mint_pubkey,
                account_pubkey,
                owner_pubkey,
                signer_pubkeys,
                requested_shares,
            )?;

            let account_infos = &[
                user_accounts.pool_token_account.clone(),
                context.pool_token_mint.clone(),
                context.pool_authority.clone(),
                spl_token_program.clone(),
            ];

            program::invoke_signed(
                &instruction,
                account_infos,
                &[&[
                    context.pool_account.key.as_ref(),
                    &[state.vault_signer_nonce],
                ]],
            )?;
        };
        Ok(())
    }

    #[allow(unused_variables)]
    fn process_redemption(
        context: &PoolContext,
        state: &mut PoolState,
        shares_to_redeem: u64,
    ) -> Result<(), ProgramError> {
        info!("Processing pool share redemption request...");
        let token_amounts_to_push =
            Self::get_token_amounts_for_given_shares(state, shares_to_redeem);
        let user_accounts = context
            .user_accounts
            .as_ref()
            .ok_or(ProgramError::InvalidArgument)?;
        let pool_vault_accounts = context.pool_vault_accounts;

        let spl_token_program = context
            .spl_token_program
            .ok_or(ProgramError::InvalidArgument)?;

        let zipped_iter = token_amounts_to_push
            .iter()
            .zip(user_accounts.asset_accounts.iter())
            .zip(pool_vault_accounts.iter());

        // pull in shares
        {
            let mint_pubkey = context.pool_token_mint.key;
            let account_pubkey = user_accounts.pool_token_account.key;
            let authority_pubkey = user_accounts.authority.key;
            let signer_pubkeys = &[];

            let instruction = spl_token::instruction::burn(
                &spl_token::ID,
                account_pubkey,
                mint_pubkey,
                authority_pubkey,
                signer_pubkeys,
                shares_to_redeem,
            )?;

            let account_infos = &[
                context.pool_token_mint.clone(),
                user_accounts.pool_token_account.clone(),
                user_accounts.authority.clone(),
                spl_token_program.clone(),
            ];

            program::invoke(&instruction, account_infos)?;
        }

        // push out components
        for ((&output_qty, user_asset_account), pool_vault_account) in zipped_iter {
            let source_pubkey = pool_vault_account.key;
            let destination_pubkey = user_asset_account.key;
            let authority_pubkey = context.pool_authority.key;
            let signer_pubkeys = &[];

            let instruction = spl_token::instruction::transfer(
                &spl_token::ID,
                source_pubkey,
                destination_pubkey,
                authority_pubkey,
                signer_pubkeys,
                output_qty,
            )?;

            let account_infos = &[
                user_asset_account.clone(),
                pool_vault_account.clone(),
                context.pool_authority.clone(),
                spl_token_program.clone(),
            ];

            program::invoke_signed(
                &instruction,
                account_infos,
                &[&[
                    context.pool_account.key.as_ref(),
                    &[state.vault_signer_nonce],
                ]],
            )?;
        }
        Ok(())
    }
}

impl EtfPool {
    fn get_token_amounts_for_given_shares(state: &PoolState, shares: u64) -> Vec<u64> {
        state
            .assets
            .iter()
            .enumerate()
            .map(|(index, _)| {
                u64::from_le_bytes(
                    state.custom_state[index * 8..(index + 1) * 8]
                        .try_into()
                        .unwrap(),
                )
            })
            .map(|base_amount| base_amount * shares)
            .collect::<Vec<_>>()
    }
}

#[cfg(not(feature = "no-entrypoint"))]
declare_pool_entrypoint!(EtfPool);
