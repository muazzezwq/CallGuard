import "dotenv/config";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "https://rpc.testnet.arc.network"
);

const wallet = new ethers.Wallet(
  process.env.BUYER_PRIVATE_KEY,
  provider
);

const gateway = new ethers.Contract(
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  [
    "function deposit(address token,uint256 value)"
  ],
  wallet
);

const USDC = "0x3600000000000000000000000000000000000000";

const tx = await gateway.deposit(
  USDC,
  ethers.parseUnits("5", 6)
);

console.log("TX:", tx.hash);

await tx.wait();

console.log("DEPOSIT DONE");
