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

const initPool = async () => {
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

  console.log("Creating master account...");
  let masterAccount = await newAccountWithLamports(
    connection,
    LAMPORTS_PER_SOL * 10
  );

  console.log("Creating token A mint account...");
  const tokenAMintAccount = await Token.createMint(
    connection,
    masterAccount,
    masterAccount.publicKey,
    masterAccount.publicKey,
    0,
    TOKEN_PROGRAM_ID
  );

  console.log("Creating token B mint account...");
  const tokenBMintAccount = await Token.createMint(
    connection,
    masterAccount,
    masterAccount.publicKey,
    masterAccount.publicKey,
    0,
    TOKEN_PROGRAM_ID
  );

  const poolAccount = new Account();
  const createPoolAccountInstruction = SystemProgram.createAccount({
    fromPubkey: masterAccount.publicKey,
    newAccountPubkey: poolAccount.publicKey,
    lamports: 4 * LAMPORTS_PER_SOL,
    space: 300,
    programId,
  });

  const vaultAuthority = await PublicKey.findProgramAddress(
    [poolAccount.publicKey.toBuffer()],
    programId
  );

  const tokenATokenAccount = await tokenAMintAccount.createAccount(
    vaultAuthority[0]
  );

  const tokenBTokenAccount = await tokenBMintAccount.createAccount(
    vaultAuthority[0]
  );

  console.log("Creating pool token mint account...");
  const poolTokenMintAccount = await Token.createMint(
    connection,
    masterAccount,
    vaultAuthority[0],
    vaultAuthority[0],
    0,
    TOKEN_PROGRAM_ID
  );

  const VAULT_SIGNER_NONCE = vaultAuthority[1];
  const ASSETS_LENGTH = 2;
  const BORSH_ETF = [3, 0, 0, 0, 101, 116, 102];

  const amountTokenA = [1, 0, 0, 0, 0, 0, 0, 0];
  const amountTokenB = [5, 0, 0, 0, 0, 0, 0, 0];

  const INITIALIZE_POOL_REQUEST = [
    VAULT_SIGNER_NONCE,
    ASSETS_LENGTH,
    ...BORSH_ETF,
    ...[16, 0, 0, 0, ...amountTokenA, ...amountTokenB],
  ];
  const REQUEST_INNER_INITIALIZE = [0, ...INITIALIZE_POOL_REQUEST];

  const initPoolInstruction = new TransactionInstruction({
    keys: [
      { pubkey: poolAccount.publicKey, isSigner: false, isWritable: true },
      {
        pubkey: poolTokenMintAccount.publicKey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: tokenATokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenBTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority[0], isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId,
    data: [...POOL_REQUEST_TAG, ...REQUEST_INNER_INITIALIZE],
  });

  console.log("Initializing pool...");
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createPoolAccountInstruction, initPoolInstruction),
    masterAccount,
    poolAccount
  );

  console.log("\x1b[32m%s\x1b[0m", "Pool initialized!");
  await store.save("pool.json", {
    poolKey: poolAccount.publicKey.toBase58(),
    tokenAMintAccount: tokenAMintAccount.publicKey.toBase58(),
    tokenAVaultAccount: tokenATokenAccount.toBase58(),
    tokenBMintAccount: tokenBMintAccount.publicKey.toBase58(),
    tokenBVaultAccount: tokenBTokenAccount.toBase58(),
    poolTokenMintAccount: poolTokenMintAccount.publicKey.toBase58(),
    poolAuthority: vaultAuthority[0].toBase58(),
    masterAccountSecret: masterAccount.secretKey,
  });
};

initPool()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
