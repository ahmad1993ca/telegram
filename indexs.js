require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');
const axios = require("axios");

// ✅ Constants & Configuration
const API_HOST = 'https://gmgn.ai';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const chatId = process.env.CHAT_ID;
// const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=SOL'; // Update if needed
const dex = 'https://api.dexscreener.com/token-boosts/top/v1'

// ✅ Swap Parameters
const INPUT_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
const SLIPPAGE = 0.5;

// ✅ Load Private Key
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error('❌ PRIVATE_KEY not found!');
  process.exit(1);
}
const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
const fromAddress = keypair.publicKey.toString();
console.log(`✅ Wallet Address: ${fromAddress}`);

// ✅ Connect to Solana Network
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// ✅ Utility Function for Delay
const delay = (ms) => new Promise((res) => setTimeout(res, ms));



async function getSolanaTokenAddress(tokenSymbol) {
  // Common Solana token addresses
  const tokenMap = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      // Add more token mappings as needed
  };
  
  return tokenMap[tokenSymbol] || null;
}


async function getPurchasedTokens(walletAddress) {
  // Connect to the Solana mainnet
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  // Convert your wallet address to a PublicKey object
  const publicKey = new PublicKey(walletAddress);

  // Fetch token accounts owned by your wallet
  const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // SPL Token Program ID
  });

  // Parse the token accounts to get token details
  const purchasedTokens = [];

  for (const account of tokenAccounts.value) {
    const accountInfo = await connection.getParsedAccountInfo(account.pubkey);
    const tokenAmount = accountInfo.value.data.parsed.info.tokenAmount;
     console.log("tokenAmount ===>>",tokenAmount)
    // Only include tokens with a balance greater than 0
    if (tokenAmount.uiAmount > 0) {
      purchasedTokens.push({
        mint: accountInfo.value.data.parsed.info.mint, // Token mint address
        balance: tokenAmount.uiAmount, // Token balance
        owner: accountInfo.value.data.parsed.info.owner, // Wallet address
      });
    }
  }

  return purchasedTokens;
}


  const filterSpamTokens = (tokenData) => {
    // Define spam keywords (case-insensitive)
    const spamWords = ["JAIL", "GAY", "SCAM", "RUG", "FRAUD", "HACK", "PUMP", "DUMP"];
  
    // Log input for debugging
    // console.log("tokenData ====>>", tokenData);
  
    // Check if essential fields are missing or invalid
    if (!tokenData || 
        !tokenData.baseToken || 
        !tokenData.liquidity || 
        typeof tokenData.priceUsd !== 'string' || 
        !tokenData.priceChange) {
      console.log("Missing essential data, marking as spam");
      return false;
    }
  
    const { baseToken, liquidity, priceChange } = tokenData;
  
    // Check if token name or symbol contains spam keywords
    const isSpamName = spamWords.some((word) => 
      baseToken.name.toUpperCase().includes(word) || 
      baseToken.symbol.toUpperCase().includes(word)
    );
  
    // Set minimum liquidity threshold (e.g., $1000 USD)
    const minLiquidity = 1000;
    const hasSufficientLiquidity = liquidity.usd >= minLiquidity; // Corrected: >=, not >
  
    // Check for extreme price volatility (adjusted to ±150% for 24h, more lenient for meme coins)
    const maxVolatility = 150;
    const isStableEnough = Math.abs(priceChange.h24) <= maxVolatility;
  
    // Additional check: Ensure FDV or marketCap isn’t absurdly low (e.g., < $100)
    const minMarketCap = 100;
    const hasReasonableMarketCap = (tokenData.fdv || tokenData.marketCap || 0) >= minMarketCap;
  
    // Log reasoning for debugging
    console.log({
      token: baseToken.name,
      isSpamName,
      hasSufficientLiquidity,
      isStableEnough,
      hasReasonableMarketCap
    });
  
    // Return true if token passes all checks (not spam)
    return !isSpamName && hasSufficientLiquidity && isStableEnough && hasReasonableMarketCap;
  };  


//   import { OpenAI } from "openai";
// import dotenv from "dotenv";

// // Load environment variables from .env file
// dotenv.config();

const XAI_API_KEY = process.env.XAI_API_KEY;

if (!XAI_API_KEY) {
    console.error("❌ Missing XAI_API_KEY in environment variables!");
    process.exit(1);
}

// Initialize OpenAI client
const client = new OpenAI({
    apiKey: XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

  async function getGrokResponse(tokenData) {
    try {
      const completion = await client.chat.completions.create({
        model: "grok-2-latest", // Updated to Grok 3 (hypothetical)
        messages: [
          {
            role: "system",
            content: "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
          },
          {
            role: "user",
            content: `
              As Grok 2, built by xAI, you’re an expert crypto trading analyst identifying the best token to buy for short-term gains as of March 05, 2025. Analyze these tokens from DEXscreener data:
              ${JSON.stringify(tokenData, null, 2)}
              
              Evaluate each token based on:
              1. **Short-Term Momentum**: Prioritize positive priceChange in m5 (+5 min), m10 (if available), and h1 (+1 hour); flag drops below -20% in any timeframe as risky.
              2. **Recent Volume**: Favor higher volume in m5, h1 (e.g., m5 > $500, h1 > $5k) for active trading.
              3. **Liquidity**: Ensure USD liquidity > $5,000 for tradability.
              4. **Market Cap/FDV**: Minimum $5,000 to avoid microcap scams, prefer growth potential.
              5. **Sentiment**: Use X/web tools to check for sudden hype or red flags in the last hour.
              
              Rules:
              - Filter out spam (e.g., liquidity < $5k, h1 volume < $5k, or extreme short-term drops).
              - Focus on m5, h1 trends; ignore 24h unless short-term data is missing.
              - No price forecasts; use current metrics and momentum.
              
              Output in JSON:
              {
                "recommendation": {"token": "name", "symbol": "symbol", "address": "tokenAddress", "action": "BUY" | "PASS"},
                "reasoning": "2-3 sentence explanation focusing on short-term metrics",
                "confidence": "0-1 score (e.g., 0.9 for strong BUY)"
              }
              Return the top token or "PASS" if none qualify.
            `
          }
        ],
        max_tokens: 300, // Shorter response for quick analysis
        temperature: 0.6 // Slightly more deterministic for trading precision
      });
      const response = JSON.parse(completion.choices[0].message.content);
      // console.log("🤖 Grok 3 says:", response);
      return response;
    } catch (error) {
      console.error("❌ Error fetching response:", error);
      return null;
    }
  }




// Modify getTrendingTokens to include Solana addresses
async function getTrendingTokens() {
  try {
    const response = await fetch(dex);
    const data = await response.json();
    
    data.forEach(async (element) => {
        // console.log("Fetching token details for:", element.tokenAddress, element.chainId);
    
        try {
            const responses = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
            const tokenData = await responses.json(); // Store parsed JSON
            
            // console.log("responses ========>>>>>>", tokenData);
                // Run the function
           const intraday = await getGrokResponse(tokenData);
           if(intraday.recommendation.action == 'BUY'){
            console.log("🤖 Grok 3 says:", intraday);
            bot.sendMessage(chatId, `
              🎯 Best Trading Opportunity Found:
              Token: ${intraday.recommendation.token}
              Address: ${intraday.recommendation.address}
              symbol : ${intraday.recommendation.symbol}
              
              🔄 Checking wallet balance...`);
              
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
                          console.log("o_token", intraday.recommendation.address);
                          swapTokens(amount * 1000000000,intraday.recommendation.address); // Convert SOL to lamports
                        });

           }

            // if (filterSpamTokens(tokenData)) {
            //     console.log("Valid Token:", tokenData);
            //     // Process the valid token further
            // } else {
            //     console.log("Spam Token Detected and Skipped:");
            // }
        } catch (error) {
            console.error("Error fetching token data:", error);
        }
    });
  } catch (error) {
      console.error('❌ Error fetching trending tokens:', error);
      return [];
  }
}

// Modify your trade command to use dynamic token selection
bot.onText(/\/trade/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
      bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
      return;
  }

  try {
      bot.sendMessage(chatId, '🔍 Analyzing market for best trading opportunity...');
      
    // await getPurchasedTokens(fromAddress)
    // .then((tokens) => {
    //   console.log("Tokens You've Purchased:", tokens);
    // })
    // .catch((error) => {
    //   console.error("Error fetching tokens:", error);
    // });
    
      const o_token = await getTrendingTokens()
      // console.log("o_token ====>>>",o_token);
      return

  } catch (error) {
      console.error('Error in trade command:', error);
      bot.sendMessage(chatId, '❌ Error analyzing market opportunities');
  }
});

async function sellToken(fromAddress, tokenIn, tokenOut, amounts, slippage) {
    try {
        bot.sendMessage(chatId, '🔄 Processing sale... Fetching swap details.');

        // Here we swap from the token to SOL (reverse of buying)
        // const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${tokenAddress}&token_out_address=${INPUT_TOKEN}&in_amount=${amount}&from_address=${fromAddress}&slippage=${SLIPPAGE}`;
        const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${tokenIn}&token_out_address=${tokenOut}&in_amount=${amounts}&from_address=${fromAddress}&slippage=${slippage}`;
        console.log("quoteUrl",quoteUrl);
        const routeResponse = await fetch(quoteUrl);
        const route = await routeResponse.json();
        console.log('📥 Swap Route:', route);

        if (!route.data?.raw_tx?.swapTransaction) {
            throw new Error('Invalid Swap Transaction Data');
        }

        // Deserialize and process the transaction
        const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        // Update recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.message.recentBlockhash = blockhash;

        // Sign and submit transaction
        transaction.sign([keypair]);
        const signedTx = Buffer.from(transaction.serialize()).toString('base64');

        bot.sendMessage(chatId, '🚀 Sending sell transaction...');
        const submitUrl = `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`;
        const submitResponse = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signed_tx: signedTx }),
        });

        const submitResult = await submitResponse.json();
        if (!submitResult.data?.hash) {
            throw new Error('Transaction submission failed!');
        }

        // Check transaction status
        const { hash } = submitResult.data;
        const { lastValidBlockHeight } = route.data.raw_tx;

        bot.sendMessage(chatId, `📊 Sell Transaction Submitted! Tx Hash: ${hash}`);

        const success = await checkTransactionStatus(hash, lastValidBlockHeight);
        if (!success) {
            bot.sendMessage(chatId, '❌ Sell transaction did not succeed.');
        }

    } catch (error) {
        console.error('❌ Error during token sale:', error.message);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
}



async function sendSwapTransaction(swapTransaction) {
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  // Convert the swap transaction from base64 to a Transaction object
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  // Sign the transaction using Phantom wallet
  const signedTransaction = await window.solana.signTransaction(transaction);

  // Send the signed transaction
  const signature = await connection.sendRawTransaction(signedTransaction.serialize());

  // Confirm the transaction
  await connection.confirmTransaction(signature, "confirmed");

  console.log("Transaction successful. Signature:", signature);
}

// Example usage
// const fromAddress = "27pKwDJuuzVN9Gd7vqRBA8zAhgnBU5tHJboE4m2b9vaF"; // Your Phantom wallet address
const tokenIn = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs"; // Token to sell
const tokenOut = "So11111111111111111111111111111111111111112"; // Token to receive (SOL)
const amounts = 5.484927614 * 1e9; // Convert to lamports (adjust for token decimals)
const slippage = 1; // 1% slippage


// Add a command to sell tokens
bot.onText(/\/sell/, async (msg) => {
    if (msg.chat.id.toString() !== chatId) {
        bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
        return;
    }

    try {
        // First, get the list of tokens in the wallet
        const tokens = await getPurchasedTokens(fromAddress);
        
        if (tokens.length === 0) {
            bot.sendMessage(chatId, '❌ No tokens found in your wallet to sell!');
            return;
        }

        // Display available tokens
        let message = '🪙 Available tokens to sell:\n\n';
        tokens.forEach((token, index) => {
            message += `${index + 1}. Token: ${token.mint}\n`;
            message += `   Balance: ${token.balance}\n\n`;
        });
        message += 'To sell, reply with: <token_number> <amount>\n';
        message += 'Example: "1 100" to sell 100 tokens of the first token';

        bot.sendMessage(chatId, message);

        // Listen for the response
        bot.once('message', async (response) => {
            const [tokenIndex, amount] = response.text.split(' ').map(Number);
            
            if (isNaN(tokenIndex) || isNaN(amount) || !tokens[tokenIndex - 1]) {
                bot.sendMessage(chatId, '❌ Invalid input. Please try again with correct format.');
                return;
            }

            const selectedToken = tokens[tokenIndex - 1];
            if (amount > selectedToken.balance) {
                bot.sendMessage(chatId, '❌ Insufficient token balance for this sale.');
                return;
            }

            // Execute the sale
            // await sellToken(selectedToken.mint, amount);
            
            sellToken(fromAddress, tokenIn, tokenOut, amounts, slippage).then((quote) => {
            console.log("Swap Quote:", quote);
            return sendSwapTransaction(quote.swapTransaction);
           }).then(() => {
            console.log("Swap transaction sent successfully.");
          })
          .catch((error) => {
            console.error("Failed to get swap quote or send transaction:", error);
          });
       });

    } catch (error) {
        console.error('Error in sell command:', error);
        bot.sendMessage(chatId, '❌ Error processing sell command');
    }
});



// ✅ Wallet Balance Check
async function checkBalance() {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`✅ Wallet balance: ${balance / 1000000000} SOL`);
  return balance;
}


async function swapTokens(amount,OUTPUT_TOKEN) {
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

    if (status?.msg === 'success') {
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


async function automateTrades() {
  while (true) {
    const tokens = await getTrendingTokens();
    for (const token of tokens) {
      const prompt = `Should I buy or sell ${token.symbol} at $${token.price} with volume $${token.volume}?`;
      const advice = await askGrok(prompt);
      if (advice.includes('buy')) {
        await buyToken(token.id, 1); // 1 SOL example
      } else if (advice.includes('sell')) {
        // Add sell logic
      }
    }
    await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
  }
}

// ✅ Telegram Bot Ready
bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
bot.sendMessage(chatId, '🤖 Bot is online! Send /trade to start a swap.');
