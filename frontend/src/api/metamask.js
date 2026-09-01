// MetaMask + Web3.js wrapper for the one chain-writing action ACVS
// performs: anchorCertificate(bytes32, bytes32).
//
// This module is intentionally thin. We never use web3 for reads
// (the backend reads via web3.py — see backend/verification/chain.py
// — and exposes `pending_hash` and the chain state). We use web3
// here only to:
//   1. convert the public certificate_id string to bytes32 via keccak
//      (matching the backend's `Web3.keccak(text=certificate_id)` at
//      chain.py:80 so the contract key lines up);
//   2. encode the anchorCertificate call against the deployed ABI;
//   3. submit through the user's MetaMask via EIP-1193
//      (window.ethereum) and wait for the on-chain receipt.
//
// Error mapping lives here so the AnchoringConfirmation screen only
// has to handle a small set of typed AnchorError categories:
//
//   user_rejected   — MetaMask prompt rejected (EIP-1193 code 4001).
//                     Not an alarming error; the user explicitly said
//                     so in the spec.
//   reverted        — the contract reverted (e.g. double-anchor — the
//                     contract emits "CertificateRegistry: already
//                     anchored"). Surfaces the revert reason.
//   rpc_failed      — network down, Ganache stopped, or any other
//                     non-typed failure.
//
// The contract address comes from VITE_CHAIN_REGISTRY_ADDRESS. The
// ABI is bundled inline (Truffle's compiled artifact is small —
// 2 events + 3 functions) so the frontend has no JSON-loading
// ceremony at runtime.

import Web3 from 'web3'

// Minimal ABI for the two functions + events ACVS touches. Matches
// the verified contract at contracts/CertificateRegistry.sol:
//   - anchorCertificate(bytes32,bytes32) nonpayable
//   - CertificateAnchored(bytes32 indexed,bytes32)
const ABI = [
  {
    type: 'event',
    name: 'CertificateAnchored',
    inputs: [
      { name: 'certificateId', type: 'bytes32', indexed: true },
      { name: 'hash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'anchorCertificate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'certificateId', type: 'bytes32' },
      { name: 'hash', type: 'bytes32' },
    ],
    outputs: [],
  },
]

const CONTRACT_ADDRESS =
  import.meta.env.VITE_CHAIN_REGISTRY_ADDRESS ?? ''

/**
 * True iff MetaMask (or any EIP-1193 provider) is injected. Used to
 * decide whether to show a "Install MetaMask" prompt vs the connect
 * button.
 */
export function isMetaMaskInstalled() {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined'
}

/**
 * Returns the currently-connected MetaMask address, prompting the
 * user to connect via the MetaMask popup if not already. Resolves
 * with the lowercase 0x-prefixed address string, or null if no
 * provider is available.
 *
 * The `eth_requestAccounts` call is what surfaces the MetaMask
 * connect popup the first time; subsequent calls return the existing
 * permission silently.
 */
export async function getConnectedAddress() {
  if (!isMetaMaskInstalled()) return null
  // The browser-provider API used here is the same one MetaMask
  // exposes; we deliberately don't import @metamask/* packages to
  // avoid pulling extra deps into the bundle.
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null
}

/**
 * Submit anchorCertificate(certIdBytes32, hashBytes32) via MetaMask.
 *
 * @param {object} args
 * @param {string} args.certificateId  The public certificate_id string.
 *   Converted to bytes32 by keccak256, matching backend chain.py.
 * @param {string} args.hashHex         The 0x-prefixed 32-byte hash
 *   from the backend's pending_hash — passed through unchanged.
 * @returns {Promise<{txHash: string}>}
 *   Resolves with the 0x-prefixed transaction hash from MetaMask once
 *   the tx is mined (web3's `.send()` resolves on receipt, not on
 *   submission — so the "pending chain confirmation" interval in the
 *   UI naturally covers the mining wait).
 * @throws {AnchorError} Typed per category above.
 */
export async function requestAnchor({ certificateId, hashHex }) {
  if (!CONTRACT_ADDRESS) {
    throw new AnchorError(
      'misconfigured',
      'VITE_CHAIN_REGISTRY_ADDRESS is not set in frontend/.env',
    )
  }
  if (!isMetaMaskInstalled()) {
    throw new AnchorError(
      'rpc_failed',
      'MetaMask is not installed. Install the MetaMask browser extension to anchor certificates.',
    )
  }
  if (!certificateId) {
    throw new AnchorError('misconfigured', 'certificateId is required')
  }
  if (!hashHex) {
    throw new AnchorError('misconfigured', 'hashHex is required')
  }

  // Lazily resolve the address on submit, so the user gets the
  // MetaMask prompt only when actually anchoring (not on page load).
  let address
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    address = accounts?.[0]
  } catch (err) {
    if (err?.code === 4001) {
      throw new AnchorError('user_rejected', 'You cancelled the MetaMask prompt.')
    }
    throw new AnchorError(
      'rpc_failed',
      `MetaMask could not provide an account: ${err?.message ?? 'unknown error'}`,
    )
  }
  if (!address) {
    throw new AnchorError('user_rejected', 'No MetaMask account is connected.')
  }

  // Same keccak variant the backend uses (web3.py's Web3.keccak(text=…)
  // is also keccak256). This is what the contract stores as the key.
  const certIdBytes32 = Web3.utils.keccak256(certificateId)
  // The hash arrives as 0x…66-char hex from the backend; web3 accepts
  // that shape as a bytes32 arg.
  const hashBytes32 = hashHex

  // Construct the Web3 instance against the injected provider. We don't
  // sign anything ourselves — MetaMask signs on submit.
  const web3 = new Web3(window.ethereum)
  const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS)

  let receipt
  try {
    receipt = await contract.methods
      .anchorCertificate(certIdBytes32, hashBytes32)
      .send({ from: address })
  } catch (err) {
    throw mapChainError(err)
  }

  // web3 v4 `.send()` resolves on receipt; if the receipt is missing
  // or has no transactionHash something went wrong upstream.
  const txHash = receipt?.transactionHash
  if (!txHash) {
    throw new AnchorError(
      'rpc_failed',
      'MetaMask returned no transaction hash for the anchor tx.',
    )
  }
  return { txHash }
}

/**
 * Categorize a thrown error from web3 / MetaMask into a small set
 * of AnchorError categories the UI can branch on. We don't try to
 * be exhaustive — anything we can't classify becomes 'rpc_failed'
 * with the original message intact for the UI to display.
 */
function mapChainError(err) {
  // EIP-1193 user rejection (MetaMask popup closed without confirming).
  if (err?.code === 4001 || err?.cause?.code === 4001) {
    return new AnchorError('user_rejected', 'You cancelled the MetaMask prompt.')
  }
  // Contract revert. web3 v4 surfaces the revert reason on
  // err.cause.shortMessage / err.data / err.reason depending on the
  // node. We pull whichever is populated.
  if (isRevert(err)) {
    const reason = extractRevertReason(err)
    return new AnchorError(
      'reverted',
      reason
        ? `The contract reverted: ${reason}`
        : 'The contract reverted the anchor transaction.',
    )
  }
  // Network / RPC / anything else.
  return new AnchorError(
    'rpc_failed',
    err?.message ?? 'MetaMask / Ganache could not complete the anchor.',
  )
}

function isRevert(err) {
  if (!err) return false
  if (err.code === 'CALL_EXCEPTION' || err.code === 'TRANSACTION_REVERT') return true
  const msg = String(err.message ?? '')
  return (
    msg.includes('reverted') ||
    msg.includes('revert') ||
    err.cause?.code === 'CALL_EXCEPTION'
  )
}

function extractRevertReason(err) {
  // web3 v4 puts the Solidity-style revert reason here; older shapes
  // surface it on err.data or err.reason. We try in order.
  return (
    err.cause?.shortMessage ||
    err.cause?.reason ||
    err.reason ||
    err.data?.message ||
    (typeof err.data === 'string' && err.data.startsWith('0x')
      ? decodeRevertString(err.data)
      : null)
  )
}

// Best-effort decode of a Solidity Error(string) revert payload to a
// human-readable string. Returns null on any decode failure — the UI
// just shows a generic "contract reverted" message in that case.
function decodeRevertString(hexData) {
  try {
    // 0x08c379a0 is the standard selector for Error(string).
    if (!hexData.startsWith('0x08c379a0')) return null
    // Skip the 4-byte selector + the 32-byte offset; the next 32-byte
    // word carries the string length, and the bytes after that carry
    // the UTF-8 string itself, right-padded with zeros.
    const withoutSelector = hexData.slice(2 + 8) // strip 0x + 4 bytes
    if (withoutSelector.length < 64) return null
    const lengthHex = withoutSelector.slice(0, 64)
    const length = parseInt(lengthHex, 16)
    if (!Number.isFinite(length) || length <= 0 || length > 1024) return null
    const stringHex = withoutSelector.slice(64, 64 + length * 2)
    let out = ''
    for (let i = 0; i < stringHex.length; i += 2) {
      out += String.fromCharCode(parseInt(stringHex.slice(i, i + 2), 16))
    }
    return out || null
  } catch {
    return null
  }
}

export class AnchorError extends Error {
  /**
   * @param {'user_rejected'|'reverted'|'rpc_failed'|'misconfigured'} kind
   * @param {string} message
   */
  constructor(kind, message) {
    super(message)
    this.name = 'AnchorError'
    this.kind = kind
  }
}
