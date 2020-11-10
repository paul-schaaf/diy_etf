use serum_pool::{declare_pool_entrypoint, Pool, PoolContext};
use serum_pool_schema::PoolState;

use solana_program::program_error::ProgramError;
use std::convert::TryInto;

enum EtfPool {}

impl Pool for EtfPool {
    fn initialize_pool(context: &PoolContext, state: &mut PoolState) -> Result<(), ProgramError> {
        let custom_data = context
            .custom_data
            .as_ref()
            .ok_or(ProgramError::InvalidArgument)?;
        let mut amounts: Vec<u64> = vec![];
        for (index, _) in context.pool_vault_accounts.iter().enumerate() {
            amounts.push(u64::from_le_bytes(
                custom_data[index * 8..(index + 1) * 8]
                    .try_into()
                    .map_err(|_| ProgramError::InvalidArgument)?,
            ));
        }
        let min_value = *amounts.iter().min().unwrap();
        if min_value != amounts[0] {
            return Err(ProgramError::InvalidArgument);
        }
        if min_value == 0 {
            return Err(ProgramError::InvalidArgument);
        }

        state.custom_state = custom_data.clone();
        Ok(())
    }
}

#[cfg(not(feature = "no-entrypoint"))]
declare_pool_entrypoint!(EtfPool);
