// import { Keypair, VersionedTransaction } from '@solana/web3.js';
// import fetch from 'node-fetch';
// import sleep from './util/sleep.js';
// import dotenv from 'dotenv';

// dotenv.config();

// const inputToken = 'So11111111111111111111111111111111111111112';
// const outputToken = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs';
// const amount = '50000000';
// const fromAddress = '2kpJ5QRh16aRQ4oLZ5LnucHFDAZtEFz6omqWWMzDSNrx';
// const slippage = 0.5;
// const API_HOST = 'https://gmgn.ai';

// async function main() {
//   // Decode the private key from base64
//   let privateKeyBase64 = process.env.PRIVATE_KEY || '';
//   privateKeyBase64 = privateKeyBase64.trim();

//   console.log('Base64 Length:', privateKeyBase64.length);

//   // Convert Base64 string to raw bytes (32 bytes for private key)
//   const privateKey = Buffer.from(privateKeyBase64, 'base64').slice(0, 32); // Ensure it's 32 bytes
//   console.log("Decoded Private Key:", privateKey);
//   console.log("Decoded Private Key Length:", privateKey.length); // Should be 32 bytes

//   if (privateKey.length !== 32) {
//     throw new Error('bad private key size');
//   }

//   // Derive the public key from the private key
//   const keypair = Keypair.fromSecretKey(privateKey);
//   const publicKey = keypair.publicKey.toBytes();

//   // Combine private and public keys to create a 64-byte secret key
//   const secretKey = Buffer.concat([privateKey, publicKey]);
//   console.log("Combined Secret Key:", secretKey);
//   console.log("Combined Secret Key Length:", secretKey.length); // Should be 64 bytes

//   // Initialize the keypair with the 64-byte secret key
//   const finalKeypair = Keypair.fromSecretKey(secretKey);
//   console.log(`Wallet address: ${finalKeypair.publicKey.toString()}`);

//   try {
//     // Get quote and unsigned transaction
//     const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${inputToken}&token_out_address=${outputToken}&in_amount=${amount}&from_address=${fromAddress}&slippage=${slippage}`;
//     let routeResponse = await fetch(quoteUrl);
//     if (!routeResponse.ok) {
//       throw new Error(`Failed to fetch quote: ${routeResponse.statusText}`);
//     }
//     let route = await routeResponse.json();
//     console.log(route);

//     // Sign transaction
//     const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64');
//     const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
//     transaction.sign([finalKeypair]);
//     const signedTx = Buffer.from(transaction.serialize()).toString('base64');
//     console.log(signedTx);

//     // Submit transaction
//     let submitResponse = await fetch(`${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`, {
//       method: 'POST',
//       headers: { 'content-type': 'application/json' },
//       body: JSON.stringify({ "signed_tx": signedTx })
//     });
//     if (!submitResponse.ok) {
//       throw new Error(`Failed to submit transaction: ${submitResponse.statusText}`);
//     }
//     let submitResult = await submitResponse.json();
//     console.log(submitResult);

//     // Check transaction status
//     while (true) {
//       const hash = submitResult.data.hash;
//       const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;
//       const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
//       let statusResponse = await fetch(statusUrl);
//       if (!statusResponse.ok) {
//         throw new Error(`Failed to fetch transaction status: ${statusResponse.statusText}`);
//       }
//       let status = await statusResponse.json();
//       console.log(status);

//       if (status && (status.data.success === true || status.data.expired === true)) {
//         break;
//       }

//       await sleep(1000);
//     }
//   } catch (error) {
//     console.error('Error:', error);
//   }
// }

// main();


import { Wallet } from '@project-serum/anchor'
import { Connection, Keypair, VersionedTransaction,LAMPORTS_PER_SOL } from '@solana/web3.js'
import bs58 from 'bs58';
import fetch from 'node-fetch'
import sleep from './util/sleep.js'
const inputToken = 'So11111111111111111111111111111111111111112'
const outputToken = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'
const amount = '50000000'
const fromAddress = '2kpJ5QRh16aRQ4oLZ5LnucHFDAZtEFz6omqWWMzDSNrx'
const slippage = 0.5
// GMGN API domain
const API_HOST = 'https://gmgn.ai'
async function main() {
  // Wallet initialization, skip this step if using Phantom
  const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')))
  console.log(`wallet address: ${wallet.publicKey.toString()}`)
  // Get quote and unsigned transaction
  const quoteUrl = `${AdPI_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${inputToken}&token_out_address=${outputToken}&in_amount=${amount}&from_address=${fromAddress}&slippage=${slippage}`
  let route = await fetch(quoteUrl)
  route = await route.json()
  console.log(route)
  // Sign transaction
  const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64')
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf)
  transaction.sign([wallet.payer])
  const signedTx = Buffer.from(transaction.serialize()).toString('base64')
  console.log(signedTx)
  // Submit transaction
  let res = await fetch(`${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
    {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(
        {
          "signed_tx": signedTx
        }
      )
    })
  res = await res.json()
  console.log(res)
  // Check transaction status
  // If the transaction is successful, success returns true
  // If is does not go through，expired=true will be returned after 60 seconds
  while (true) {
    const hash =  res.data.hash
    const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight
    const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`
    let status = await fetch(statusUrl)
    status = await status.json()
    console.log(status)
    if (status && (status.data.success === true || status.data.expired === true))
      break
    await sleep(1000)
  }
}
main()
