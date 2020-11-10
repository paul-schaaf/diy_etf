import {
  TransactionInstruction,
  Connection,
  PublicKey,
  Transaction,
  Account,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { Store } from "./util/store";
import { sendAndConfirmTransaction } from "./util/send-and-confirm-transaction";
import { url } from "./url";

// u64
const POOL_REQUEST_TAG = [207, 196, 28, 205, 189, 108, 10, 34];

const redeemShares = async () => {
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

  const userAccount = new Account(Object.values(poolConfig.userSecret));

  const userPoolTokenAccountPublicKey = new PublicKey(
    poolConfig.userPoolTokenAccountPublicKey
  );
  const userTokenAAccountPublicKey = new PublicKey(
    poolConfig.userTokenAAccountPublicKey
  );
  const userTokenBAccountPublicKey = new PublicKey(
    poolConfig.userTokenBAccountPublicKey
  );

  const REQUEST_INNER_CREATE = [2, 1, 1, 0, 0, 0, 0, 0, 0, 0];

  const createSharesInstruction = new TransactionInstruction({
    keys: [
      {
        pubkey: new PublicKey(poolConfig.poolKey),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(poolConfig.poolTokenMintAccount),
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

  console.log("Redeeming shares...");
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
    "" + 0
  ) {
    throw new Error("User still has their pool shares");
  }

  const userTokenAAccountData = await connection.getParsedAccountInfo(
    userTokenAAccountPublicKey,
    "singleGossip"
  );

  if (
    userTokenAAccountData.value.data.parsed.info.tokenAmount.amount !==
    "" + 1
  ) {
    throw new Error("User did not get their ATokens");
  }

  const userTokenBAccountData = await connection.getParsedAccountInfo(
    userTokenBAccountPublicKey,
    "singleGossip"
  );

  if (
    userTokenBAccountData.value.data.parsed.info.tokenAmount.amount !==
    "" + 5
  ) {
    throw new Error("User did not get their BTokens");
  }

  const tokenAVaultData = await connection.getParsedAccountInfo(
    new PublicKey(poolConfig.tokenAVaultAccount),
    "singleGossip"
  );

  if (tokenAVaultData.value.data.parsed.info.tokenAmount.amount !== "" + 0) {
    throw new Error("Vault A still has tokens");
  }

  const tokenBVaultData = await connection.getParsedAccountInfo(
    new PublicKey(poolConfig.tokenBVaultAccount),
    "singleGossip"
  );

  if (tokenBVaultData.value.data.parsed.info.tokenAmount.amount !== "" + 0) {
    throw new Error("Vault B still has tokens");
  }

  console.log("\x1b[32m%s\x1b[0m", "Share redemption complete!");
};

redeemShares()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
