import {
  TransactionInstruction,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  Account,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { Store } from "./util/store";
import { newAccountWithLamports } from "./util/new-account-with-lamports";
import { sendAndConfirmTransaction } from "./util/send-and-confirm-transaction";
import { url } from "./url";

// u64
const POOL_REQUEST_TAG = [207, 196, 28, 205, 189, 108, 10, 34];

const createShares = async () => {
  const store = new Store();

  let deployConfig = await store.load("deploy.json");
  if (!deployConfig.programId) {
    throw new Error(
      "Deployment config file contains JSON data but not the programId"
    );
  }

  const connection = new Connection(url, "singleGossip");
  const version = await connection.getVersion();
  console.log("Connection to cluster established:", url, version);

  const programId = new PublicKey(deployConfig.programId);

  let poolConfig = await store.load("pool.json");

  const masterAccount = new Account(
    Object.values(poolConfig.masterAccountSecret)
  );

  let poolTokenMint = new Token(
    connection,
    new PublicKey(poolConfig.poolTokenMintAccount),
    TOKEN_PROGRAM_ID,
    masterAccount
  );
  let tokenAMint = new Token(
    connection,
    new PublicKey(poolConfig.tokenAMintAccount),
    TOKEN_PROGRAM_ID,
    masterAccount
  );
  let tokenBMint = new Token(
    connection,
    new PublicKey(poolConfig.tokenBMintAccount),
    TOKEN_PROGRAM_ID,
    masterAccount
  );

  console.log("Creating user account...");
  const userAccount = await newAccountWithLamports(
    connection,
    10 * LAMPORTS_PER_SOL
  );
  console.log("Creating user pool share token account...");
  const userPoolTokenAccountPublicKey = await poolTokenMint.createAccount(
    userAccount.publicKey
  );
  console.log("Creating user token A account...");
  const userTokenAAccountPublicKey = await tokenAMint.createAccount(
    userAccount.publicKey
  );
  console.log("Minting tokenAs to user...");
  await tokenAMint.mintTo(
    userTokenAAccountPublicKey,
    masterAccount.publicKey,
    [],
    1
  );
  console.log("Creating user token B account...");
  const userTokenBAccountPublicKey = await tokenBMint.createAccount(
    userAccount.publicKey
  );
  console.log("Minting tokenBs to user...");
  await tokenBMint.mintTo(
    userTokenBAccountPublicKey,
    masterAccount.publicKey,
    [],
    5
  );

  const REQUEST_INNER_CREATE = [2, 0, 1, 0, 0, 0, 0, 0, 0, 0];

  const createSharesInstruction = new TransactionInstruction({
    keys: [
      {
        pubkey: new PublicKey(poolConfig.poolKey),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: poolTokenMint.publicKey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(poolConfig.tokenAVaultAccount),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(poolConfig.tokenBVaultAccount),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(poolConfig.poolAuthority),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: userPoolTokenAccountPublicKey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: userTokenAAccountPublicKey, isSigner: false, isWritable: true },
      { pubkey: userTokenBAccountPublicKey, isSigner: false, isWritable: true },
      { pubkey: userAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId,
    data: [...POOL_REQUEST_TAG, ...REQUEST_INNER_CREATE],
  });

  console.log("Creating shares...");
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createSharesInstruction),
    userAccount
  );

  const userPoolTokenAccountData = await connection.getParsedAccountInfo(
    userPoolTokenAccountPublicKey,
    "singleGossip"
  );

  if (
    userPoolTokenAccountData.value.data.parsed.info.tokenAmount.amount !==
    "" + 1
  ) {
    throw new Error("User did not get their pool shares");
  }

  const userTokenAAccountData = await connection.getParsedAccountInfo(
    userTokenAAccountPublicKey,
    "singleGossip"
  );

  if (
    userTokenAAccountData.value.data.parsed.info.tokenAmount.amount !==
    "" + 0
  ) {
    throw new Error("User tokenA Account still has tokens");
  }

  const userTokenBAccountData = await connection.getParsedAccountInfo(
    userTokenBAccountPublicKey,
    "singleGossip"
  );

  if (
    userTokenBAccountData.value.data.parsed.info.tokenAmount.amount !==
    "" + 0
  ) {
    throw new Error("User tokenB Account still has tokens");
  }

  const tokenAVaultData = await connection.getParsedAccountInfo(
    new PublicKey(poolConfig.tokenAVaultAccount),
    "singleGossip"
  );

  if (
    tokenAVaultData.value.data.parsed.info.tokenAmount.amount !==
    "" + 1
  ) {
    throw new Error("Vault A did not get the tokens");
  }

  const tokenBVaultData = await connection.getParsedAccountInfo(
    new PublicKey(poolConfig.tokenBVaultAccount),
    "singleGossip"
  );

  if (
    tokenBVaultData.value.data.parsed.info.tokenAmount.amount !==
    "" + 5
  ) {
    throw new Error("Vault B did not get the tokens");
  }

  console.log("\x1b[32m%s\x1b[0m", "Share creation complete!");
};

createShares()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
