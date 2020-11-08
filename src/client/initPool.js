import {
  TransactionInstruction,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { Store } from "./util/store";
import { newAccountWithLamports } from "./util/new-account-with-lamports";
import { sendAndConfirmTransaction } from "./util/send-and-confirm-transaction";
import { url } from "./url";

// u64
const POOL_REQUEST_TAG = [207, 196, 28, 205, 189, 108, 10, 34];

const VAULT_SIGNER_NONCE = 0;
const ASSETS_LENGTH = 2;
const BORSH_ETF = [3, 0, 0, 0, 101, 116, 102];

const INITIALIZE_POOL_REQUEST = [
  VAULT_SIGNER_NONCE,
  ASSETS_LENGTH,
  ...BORSH_ETF,
  ...[0, 0, 0, 0],
];
const REQUEST_INNER_INITIALIZE = [0, ...INITIALIZE_POOL_REQUEST];

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

  const initPoolInstruction = new TransactionInstruction({
    keys: [],
    programId,
    data: [...POOL_REQUEST_TAG, ...REQUEST_INNER_INITIALIZE],
  });

  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(initPoolInstruction),
    masterAccount
  );
};

initPool()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
