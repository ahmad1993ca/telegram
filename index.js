const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
require('dotenv').config(); // Load environment variables

// ✅ Load environment variables
const API_HOST = 'https://gmgn.ai';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

// ✅ Telegram Bot Configuration
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const chatId = process.env.CHAT_ID; // Your Telegram chat ID

// ✅ Swap parameters
const INPUT_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
const OUTPUT_TOKEN = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs';

const SLIPPAGE = 0.5;

// ✅ Load private key securely


const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error('❌ PRIVATE_KEY not found!');
  process.exit(1);
}

// ✅ Create wallet from private key
const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
const fromAddress = keypair.publicKey.toString();
console.log(`✅ Wallet Address: ${fromAddress}`);

// ✅ Connect to Solana network
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// ✅ Utility function for delay
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ✅ Function to check balance
async function checkBalance() {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`✅ Wallet balance: ${balance / 1000000000} SOL`);
  return balance;
}

// ✅ Function to check transaction status
async function checkTransactionStatus(hash, lastValidBlockHeight) {
  let attempts = 0;
  const maxAttempts = 20; // Max attempts before giving up
  const delayInterval = 5000; // 2 seconds delay between retries
  // const { blockhash } = await connection.getLatestBlockhash();
  // console.log("blockhash =====>>>",blockhash)

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`🔄 Checking transaction status attempt ${attempts}/${maxAttempts}...`);

    const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
     console.log("statusUrl ===>>",statusUrl);
    const statusResponse = await fetch(statusUrl);
    const status = await statusResponse.json();

    console.log('🔄 Transaction Status:', status);

    if (status?.data?.success === true) {
      bot.sendMessage(chatId, '✅ Swap Completed Successfully! 🎉');
      return true;
    }

    if (status?.data?.expired === true) {
      bot.sendMessage(chatId, '⚠️ Swap Expired! Please try again.');
      return false;
    }

    if (status?.data?.err) {
      bot.sendMessage(chatId, `❌ Transaction failed: ${status.data.err}`);
      console.error('Error Details:', status.data.err_details); // Log more details for debugging
      return false;
    }

    if (status?.data?.err_code) {
      bot.sendMessage(chatId, `❌ Error code: ${status.data.err_code}`);
      console.error('Error Code:', status.data.err_code); // Log error code for debugging
      return false;
    }

    if (attempts < maxAttempts) {
      console.log(`⏳ Retrying in ${delayInterval / 1000} seconds...`);
      await delay(delayInterval); // Wait before retrying
    }
  }

  bot.sendMessage(chatId, '❌ Transaction failed after multiple attempts.');
  return false;
}

// ✅ Function to execute token swap
async function swapTokens(amount) {
  try {
    bot.sendMessage(chatId, '🔄 Processing trade... Fetching swap details.');

    // Fetch Swap Quote
    const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${INPUT_TOKEN}&token_out_address=${OUTPUT_TOKEN}&in_amount=${amount}&from_address=${fromAddress}&slippage=${SLIPPAGE}`;
    const routeResponse = await fetch(quoteUrl);
    const route = await routeResponse.json();
    console.log('📥 Swap Route:', route);

    if (!route.data?.raw_tx?.swapTransaction) {
      throw new Error('Invalid Swap Transaction Data');
    }

    // Deserialize the Transaction
    const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Update recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.message.recentBlockhash = blockhash;

    // Sign the Transaction
    transaction.sign([keypair]);
    const signedTx = Buffer.from(transaction.serialize()).toString('base64');
    console.log('✍️ Signed Transaction:', signedTx);

    // Submit Signed Transaction
    bot.sendMessage(chatId, '🚀 Sending transaction...');
    const submitUrl = `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`;
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed_tx: signedTx }),
    });

    const submitResult = await submitResponse.json();
    console.log('🚀 Transaction Submitted:', submitResult);

    if (!submitResult.data?.hash) {
      throw new Error('Transaction submission failed!');
    }

    // Check Transaction Status
    const { hash } = submitResult.data;
    const { lastValidBlockHeight } = route.data.raw_tx;

    bot.sendMessage(chatId, `📊 Transaction Submitted! Tx Hash: ${hash}`);

    const success = await checkTransactionStatus(hash, lastValidBlockHeight);

    if (!success) {
      bot.sendMessage(chatId, '❌ Transaction did not succeed.');
    }
  } catch (error) {
    console.error('❌ Error during swap:', error.message);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}
// ✅ Telegram Command Handler
bot.onText(/\/trade/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
    bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
    return;
  }

  bot.sendMessage(chatId, '🔄 Checking wallet balance...');

  const balance = await checkBalance();
  if (balance <= 0) {
    bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
    return;
  }

  bot.sendMessage(chatId, '🔄 Please enter the amount you want to trade in SOL:');

  bot.on('message', async (msg) => {
    const amount = parseFloat(msg.text);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid amount to trade.');
      return;
    }

    if (amount > balance / 1000000000) { // Convert lamports to SOL
      bot.sendMessage(chatId, '❌ Insufficient funds for this trade.');
      return;
    }

    bot.sendMessage(chatId, `💸 You are about to trade ${amount} SOL.`);
    swapTokens(amount * 1000000000); // Convert SOL to lamports
  });
});

// ✅ Telegram Bot Ready Message
bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
bot.sendMessage(chatId, '🤖 Bot is online! Send /trade to start a swap.');
