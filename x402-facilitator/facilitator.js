import { ethers } from "ethers";

const USDC_ABI = [
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external",
  "function authorizationState(address authorizer,bytes32 nonce) external view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

export function makeFacilitator(env) {
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const wallet = new ethers.Wallet(env.FACILITATOR_PRIVATE_KEY, provider);
  const usdc = new ethers.Contract(env.USDC_ADDRESS, USDC_ABI, wallet);

  // EIP-712 domain — Asama 0'da dogruladigin degerler
  const domain = {
    name: env.USDC_NAME,
    version: env.USDC_VERSION || undefined,
    chainId: Number(env.CHAIN_ID),
    verifyingContract: env.USDC_ADDRESS,
  };
  if (!domain.version) delete domain.version;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  // ---- /verify : imza gecerli mi, odeme sartlarina uyuyor mu ----
  async function verify(payment, requirements) {
    const { authorization, signature } = payment;
    const a = authorization;

    let recovered;
    try {
      recovered = ethers.verifyTypedData(domain, types, a, signature);
    } catch (e) {
      return { isValid: false, reason: "imza cozulemedi: " + e.message };
    }
    if (recovered.toLowerCase() !== a.from.toLowerCase())
      return { isValid: false, reason: "imzalayan from ile eslesmiyor" };

    const now = Math.floor(Date.now() / 1000);
    if (Number(a.validAfter) > now)
      return { isValid: false, reason: "yetki henuz gecerli degil" };
    if (Number(a.validBefore) < now)
      return { isValid: false, reason: "yetki suresi dolmus" };
    if (BigInt(a.value) < BigInt(requirements.maxAmountRequired))
      return { isValid: false, reason: "odenen miktar yetersiz" };
    if (a.to.toLowerCase() !== requirements.payTo.toLowerCase())
      return { isValid: false, reason: "alici (to) yanlis" };

    const used = await usdc.authorizationState(a.from, a.nonce);
    if (used) return { isValid: false, reason: "nonce zaten kullanilmis" };

    const bal = await usdc.balanceOf(a.from);
    if (bal < BigInt(a.value))
      return { isValid: false, reason: "gonderen bakiyesi yetersiz" };

    return { isValid: true };
  }

  // ---- /settle : zinciri yur, transferWithAuthorization gonder ----
  async function settle(payment) {
    const { authorization: a, signature } = payment;
    const sig = ethers.Signature.from(signature);
    const tx = await usdc.transferWithAuthorization(
      a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce,
      sig.v, sig.r, sig.s
    );
    const rc = await tx.wait();
    return { success: true, txHash: tx.hash, blockNumber: rc.blockNumber };
  }

  return { verify, settle, facilitatorAddress: wallet.address };
}
