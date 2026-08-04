import "dotenv/config";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  "https://rpc.testnet.arc.network"
);

const wallet = new ethers.Wallet(
  process.env.BUYER_PRIVATE_KEY,
  provider
);

const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

const amount = ethers.parseUnits("5", 6);

const usdc = new ethers.Contract(
  USDC,
  [
    "function approve(address spender,uint256 amount) returns(bool)"
  ],
  wallet
);

const gateway = new ethers.Contract(
  GATEWAY,
  [
    "function deposit(address token,uint256 value)"
  ],
  wallet
);

console.log("Buyer:", wallet.address);

console.log("Approving...");
await (await usdc.approve(GATEWAY, amount)).wait();

console.log("Depositing...");
const tx = await gateway.deposit(USDC, amount);
console.log("TX:", tx.hash);

await tx.wait();

console.log("DONE");
