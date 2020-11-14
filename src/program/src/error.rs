//! Error types

use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use thiserror::Error;

use solana_program::{
    decode_error::DecodeError,
    info,
    program_error::{PrintProgramError, ProgramError},
};

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum ETFError {
    /// Invalid Initialization Custom Data
    #[error("Invalid Initialization Custom Data")]
    InvalidInitializationCustomData,
    /// Invalid instruction
    #[error("Invalid Instruction")]
    InvalidInstruction,
    /// Missing initialization data
    #[error("Missing Initialization Data")]
    MissingInitializationData,
    /// Expected funds mismatch
    #[error("Expected Funds Mismatch")]
    ExpectedFundsMismatch,
    /// Unknown account
    #[error("Unknown Account")]
    UnknownAccount,
    /// Amount overflow
    #[error("Amount Overflow")]
    AmountOverflow,
}

impl solana_program::program_error::PrintProgramError for ETFError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            Self::InvalidInitializationCustomData => {
                info!("Error: Invalid Initialization Custom Data")
            }
            Self::ExpectedFundsMismatch => info!("Error: Expected funds mismatch"),
            Self::InvalidInstruction => info!("Error: Invalid Instruction"),
            Self::MissingInitializationData => info!("Error: Missing initialization data"),
            Self::UnknownAccount => info!("Error: Unknown account"),
            Self::AmountOverflow => info!("Error: Amount overflow"),
        }
    }
}

impl From<ETFError> for ProgramError {
    fn from(e: ETFError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for ETFError {
    fn type_of() -> &'static str {
        "ETFError"
    }
}
