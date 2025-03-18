require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');
const db = require('./config/dbconfig')
const { token } = require('@project-serum/anchor/dist/cjs/utils');
const express = require('express');
// const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3003;

// Middleware
app.use(bodyParser.json());
app.use(cors());
// const axios = require("axios");

// ✅ Constants & Configuration
const API_HOST = 'https://gmgn.ai';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const chatId = process.env.CHAT_ID;
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=SOL'; // Update if needed
const dex = 'https://api.dexscreener.com/token-boosts/top/v1'

// ✅ Swap Parameters
const INPUT_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
const SLIPPAGE = 100;

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



async function getPurchasedTokens(walletAddress) {
  // await sleep(1000);
  // Connect to the Solana mainnet
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  // Convert your wallet address to a PublicKey object
  const publicKey = new PublicKey(walletAddress);


  // Fetch token accounts owned by your wallet
  const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // SPL Token Program ID
  });


  // console.log("tokenAccounts =====>>",tokenAccounts.value)

  // Parse the token accounts to get token details
  const purchasedTokens = [];

  for (const account of tokenAccounts.value) {
    const accountInfo = await connection.getParsedAccountInfo(account.pubkey);
    console.log("accountInfo =====>>>>",accountInfo);
    const tokenAmount = accountInfo.value.data.parsed.info.tokenAmount;
     console.log("tokenAmount ===>>",tokenAmount,tokenAmount.uiAmount > 0.00001)
    // Only include tokens with a balance greater than 0
    if (tokenAmount.uiAmount > 0.00001) {
      purchasedTokens.push({
        mint: accountInfo.value.data.parsed.info.mint, // Token mint address
        balance: tokenAmount.amount, // Token balance
        owner: accountInfo.value.data.parsed.info.owner, // Wallet address
      });
    }
  }

  return purchasedTokens;
}



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

async function getGrokResponse(tokenData, userBalance) {
  try {
    const completion = await client.chat.completions.create({
      model: "grok-2-latest",
      messages: [
        {
          "role": "system",
          "content": "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
        },
        {
          "role": "user",
          "content": `
            **Trading Strategy**:
            - Analyze trending tokens from DEXscreener and filter based on liquidity, momentum, safety, and taxes.
            - Suggest an investment percentage (between 20-50% of available balance).
            - Suggest a sell price based on a reasonable profit margin (e.g., 10-30%).
        
            **User Balance**: ${userBalance} SOL
            **Token Data**: ${JSON.stringify(tokenData, null, 2)}
        
            **Evaluation Rules**:
            1️⃣ **Liquidity & Market Safety**:
                - ✅ Must have **$10k+ USD liquidity** and **h1 volume > $10k**.
                - ❌ Reject if **liquidity < $10k** or **volume too low**.
        
            2️⃣ **Momentum Analysis**:
                - ✅ **5m & 1h price change must be positive** (>+2% preferred).
                - ❌ Reject if **price drops > -20% in any timeframe**.
        
            3️⃣ **Security & Tax Detection**:
                - ✅ Contract must be **at least 6 hours old** (check \`pairCreatedAt\` timestamp).
                - ❌ Reject if **buy/sell taxes > 5%** (if tax data is unavailable, check volume, liquidity, and market momentum).
                - ❌ **Reject tokens with a transfer fee that automatically buys the token upon transfer/minting** (detect this via tokenomics, past transactions, or on-chain data).
                - ❌ Reject if rug pull signs (e.g., sudden liquidity drop) or honeypot detected.
        
            **Output JSON**:
            {
              "recommendation": {
                "token": "name",
                "symbol": "symbol",
                "address": "tokenAddress",
                "action": "BUY" | "PASS",
                "investPercentage": 20-50,  // % of balance to invest (dynamic)
                "sellPrice": "target price (e.g., 10-30% above current priceUsd)",
                "priceUsd": "current price in USD"
              },
              "reasoning": "Short explanation (include tax concerns if applicable)...",
              "confidence": "0-1 score (e.g., 0.9 for strong BUY, 0.4 for PASS)"
            }
        
            **Important**:
            - Return *only* a valid JSON object, with no additional text outside the JSON.
            - If tax information is missing, check volume, liquidity, and market momentum.
            - **Reject tokens that apply a transfer fee and auto-buy the token when transferred/minted.**
            - Use the current timestamp (March 17, 2025) to calculate contract age from \`pairCreatedAt\`.
          `
        }        
        
      ],
      max_tokens: 300,
      temperature: 0.6
    });

    // const rawContent = completion.choices[0].message.content.trim();
    // console.log("raw response ===>>>", rawContent); // Debug raw output

    // const response = await JSON.parse(rawContent);
    // console.log("buy response send ====>>>>>>", response);

    const rawContent = completion.choices[0].message.content.trim();
    console.log("raw response ===>>>", rawContent); // Debug raw output

    // Extract JSON from ```json ... ``` block
    let jsonContent = rawContent;
    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonContent = jsonMatch[1].trim(); // Extract the JSON string inside the block
    } else {
      throw new Error("No valid JSON block found in response");
    }

    const response = JSON.parse(jsonContent); // Parse the extracted JSON
    console.log("buy response send ====>>>>>>", response);

    // Convert percentage to actual SOL investment
    if (response.recommendation.action === "BUY") {
      response.recommendation.investAmount = (userBalance * response.recommendation.investPercentage) / 100;
    }

    return response;
  } catch (error) {
    console.error("❌ Error fetching response:", error);
    return null;
  }
}

// ✅ Safety Check Function (Filter out risky tokens + Honeypot Check)

async function isSafeToken(token) {
  const { baseToken, liquidity, volume, info } = token;
   if(liquidity && volume){
  if (liquidity.usd < 5000 || volume.h1 < 5000) {
    console.log(`❌ Low liquidity/volume: ${baseToken.address}`);
    return false;
  }
}

  if (token.priceChange?.h1 < -20) {
    console.log(`❌ Price drop too high: ${baseToken.address}`);
    return false;
  }

  try {
    const honeypotResponse = await fetch(`https://api.honeypot.is/v2/IsHoneypot?address=${baseToken.address}`);
    const honeypotData = await honeypotResponse.json();

    if (honeypotData.IsHoneypot || honeypotData.SellTax > 10) {
      console.log(`❌ Honeypot or high tax: ${baseToken.address}`);
      return false;
    }

    // Check contract age (GMGN.AI suggests >24h)
    // const creationTime = new Date(info?.creationTime || 0);
    // if (Date.now() - creationTime.getTime() < 24 * 60 * 60 * 1000) {
    //   console.log(`❌ Token too new: ${baseToken.address}`);
    //   return false;
    // }

    return true;
  } catch (error) {
    console.error(`❌ Error checking safety for ${baseToken.address}:`, error);
    return false;
  }
}

async function getTrendingTokens(filters) {
  try { 
    console.log("Fetching trending tokens...");
    const trendingResponse = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    // const trendingResponse = await fetch('https://api.dexscreener.com/token-profiles/latest/v1')
    const trendingData = await trendingResponse.json();
    
  const solanaTokens = trendingData.filter(token => token.chainId === "solana");
  console.log("solanaTokens ===>>",solanaTokens)
    if (!solanaTokens || solanaTokens.length === 0) {
      bot.sendMessage(chatId, "❌ No trending tokens found!");
      return [];
    }

    const bestTokens = [];
    const balance = await checkBalance();
    if (balance <= 0.02) {
      bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
      return [];
    }

    for (const [index, element] of solanaTokens.entries()) {
      await sleep(index * 1000); // Staggered delay to avoid rate limits
      try {
         const highFee =await checkTokenTransferFee(element.tokenAddress);
         console.log("highFee =====>>>>>",highFee);
         if (highFee !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
        const tokenData = await response.json();

        for (const data of tokenData) {
          bestTokens.push(data);

          // if (await isSafeToken(data)) {
          // }
        }

        if (tokenData.length > 0 && balance > 0.020) {
          console.log("bestTokens",bestTokens);
          const intraday = await getGrokResponse(tokenData, balance);
          if (!intraday) {
            bot.sendMessage(chatId, '❌ No trading recommendation available');
            continue;
          }

          console.log("Intraday Recommendation:", intraday);
          if (intraday.confidence >= 0.8 && intraday.recommendation.action === 'BUY' && intraday.recommendation.address !== 'Ddm4DTxNZxABUYm2A87TFLY6GDG2ktM2eJhGZS3EbzHM'
            && intraday.recommendation.address !== 'G9Zo2oUJx1CWjTDrNdrpCSgXvsuUcH4aRPvkj7WjHMuw'
          ) {
            bot.sendMessage(chatId, `
              🎯 Best Trading Opportunity:
              Token: ${intraday.recommendation.token}
              Address: ${intraday.recommendation.address}
              Symbol: ${intraday.recommendation.symbol}
              Confidence: ${intraday.confidence}
              🔄 Trading ${intraday.recommendation.investPercentage}% of balance...
            `);
            const investAmount = balance - intraday.recommendation.investAmount ;
            console.log("43535664757 ===========",typeof balance ,typeof intraday.recommendation.investAmount)
            const tradeAmount = intraday.recommendation.investAmount * 1e9; // Convert SOL to lamports
            console.log("43535664757 ===========>>>>>>>>",investAmount > 0.020)
            // 
            if(investAmount > 0.020){
            console.log("43535664757 ===========>>>>>>>>000")

            await swapTokens(Math.round(tradeAmount), intraday.recommendation.address,intraday);
            }else{
              console.log("Buying stop, Reserve balance is 0.020")
            //  bot.sendMessage('❌ Buying stop, Reserve balance is 0.011');
            bot.sendMessage(chatId, '❌ No balance');

            }
          } else {
            bot.sendMessage(chatId, '❌ Confidence too low or no BUY signal');
          }
        }
      }
      } catch (error) {
        console.error(`Error processing token ${element.tokenAddress}:`, error);
      }
    }

    return bestTokens;
  } catch (error) {
    console.error('❌ Error fetching trending tokens:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch trending tokens');
    return [];
  }
}

const tokenOut = "So11111111111111111111111111111111111111112"; // Token to receive (SOL)
const amounts = 24.76569 * 1e9; // Convert to lamports (adjust for token decimals)
const slippage = 2; // 1% slippage


async function getGrokSellResponse(tokenData) {
  console.log("data is coming ===>>>", tokenData);
  try {
    // Resolve the Promise if tokenData is an array containing a Promise
    let resolvedData;
    if (Array.isArray(tokenData) && tokenData[0] instanceof Promise) {
      resolvedData = await tokenData[0]; // Await the first Promise in the array
    } else {
      resolvedData = tokenData; // Use as-is if not a Promise
    }

    // console.log("resolved data ===>>>", resolvedData);


    const completion = await client.chat.completions.create({
      model: "grok-2-latest",
      messages: [
        {
          role: "system",
          content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis, focusing on 2-10% profit after fees while minimizing premature exits."
        },
        {
          role: "user",
          content: `
            As Grok 3, a crypto trading analyst built by xAI, you’re optimized for short-term trading insights with real-time data analysis. Today is March 17, 2025. Analyze the following token data from DEXscreener, including the current price (\`priceUsd\`) and my buy price (\`buy_price\`), to decide whether to sell for profit, sell on a loss, or hold:
    
            ${JSON.stringify(resolvedData, null, 2)}
    
            Evaluate the token based on:
            1. **Profit/Loss Calculation**: 
               - Compare \`priceUsd\` (current price) with \`buy_price\`.
               - Target a minimum 2% net profit after fees (e.g., 0.5% fee deducted); sell if profit ≥ 2%.
               - Sell if loss ≥ -5% (i.e., \`priceUsd\` < 95% of \`buy_price\`), regardless of other signals.
            2. **Momentum**: 
               - Use \`priceChange\` (m5: 5-min, h1: 1-hour); only consider momentum if profit < 2% and loss > -5%.
            3. **Volume**: 
               - Require \`volume.m5\` > $10,000 and \`volume.h1\` > $10k; only consider volume if profit < 2% and loss > -5%.
            4. **Liquidity**: 
               - Filter out tokens with \`liquidity.usd\` < $10,000; only consider liquidity if profit < 2% and loss > -5%.
    
            Rules:
            - **Sell for Profit**: Sell if profit ≥ 2% after fees, regardless of momentum or volume.
            - **Sell on Loss**: Exit if loss ≥ -5% (i.e., \`priceUsd\` < 95% of \`buy_price\`), regardless of other signals.
            - **Hold**: Default if profit < 2%, loss > -5%, and momentum (m5 > +2% or h1 > +5%) or volume suggests upside.
    
            Output in JSON:
            {
              "recommendation": {
                "token": "name",
                "symbol": "symbol",
                "address": "address",
                "action": "SELL" | "HOLD",
                "profit_loss_percent": "calculated profit/loss % (e.g., +3.5% or -6.2%)"
              },
              "reasoning": "2-3 sentences on profit/loss, momentum, and volume/liquidity trends",
              "confidence": "0-1 score (e.g., 0.9 for strong SELL, 0.7 for HOLD)"
            }
    
            Return the recommendation for the token; default to "HOLD" unless sell signals (profit ≥ 2% or loss ≤ -5%) are clear.
          `
        }
      ],
      max_tokens: 300,
      temperature: 0.5
    });

    console.log("completion======>>>", completion.choices[0]);

    let rawContent = completion.choices[0].message.content.trim();
    let jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      rawContent = jsonMatch[1].trim();
    }

    try {
      const response = JSON.parse(rawContent);
      return response;
    } catch (jsonError) {
      console.warn("⚠ JSON parse failed:", jsonError.message);
      const jsonRegex = /{[\s\S]*}/;
      let possibleJsonMatch = rawContent.match(jsonRegex);
      if (possibleJsonMatch) {
        return JSON.parse(possibleJsonMatch[0]);
      }
      throw new Error("❌ No valid JSON found after multiple attempts.");
    }
  } catch (error) {
    console.error("❌ Error fetching response:", error);
    return null;
  }
}


async function checkBalance() {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`✅ Wallet balance: ${balance / 1000000000} SOL`);
  return balance / 1000000000;
}

async function swapTokens(amount, outputToken,intraday, isSell = false, slippageBps = SLIPPAGE) {
  const action = isSell ? "Selling" : "Buying";

  try {
    bot.sendMessage(chatId, `🔄 ${action} token... Fetching swap details`);

    // Step 1: Fetch the quote
    const quoteUrl = isSell
      ? `https://api.jup.ag/swap/v1/quote?inputMint=${outputToken}&outputMint=${INPUT_TOKEN}&amount=${amount}&slippageBps=${slippageBps}`
      : `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${outputToken}&amount=${amount}&slippageBps=${slippageBps}`;
    const quoteResponse = await fetch(quoteUrl);
    const quote = await quoteResponse.json();
    if (quote.error) throw new Error("No swap route available");

    // Step 2: Fetch a fresh blockhash *before* creating the transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

    // Step 3: Create the swap transaction with the fresh blockhash
    const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPublicKey: fromAddress,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 50000, // Increase priority fee for faster processing
        quoteResponse: quote,
        // Optionally pass the blockhash to Jupiter if supported (check API docs)
      })
    });
    const swapData = await swapResponse.json();
    if (!swapData?.swapTransaction) throw new Error('Failed to get swap transaction');

    // Step 4: Deserialize and sign the transaction
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
    transaction.sign([keypair]);

    // Step 5: Send the transaction with retries and preflight
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      maxRetries: 5, // Increase retries
      skipPreflight: false, // Enable preflight to catch issues early
    });

    // Step 6: Confirm the transaction using the same blockhash
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "finalized"
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    bot.sendMessage(chatId, `✅ ${action} successful! Tx: https://solscan.io/tx/${signature}`);
    console.log("isSell ====>>",isSell)
    if(!isSell){
    var sql = "INSERT INTO transactions (name, address, amount, hash, buy_price) VALUES ('" + intraday.recommendation.token + "','" + intraday.recommendation.address+ "' ,'" + amount + "','" + signature + "','" + intraday.recommendation.priceUsd +"')";
    db.query(sql, function (err, result) {
    console.log('result', err)
    if (err) {
        return result.json(err);
    }
    else {
      console.log("insert token ")

    }
  })
}else{
  
}
return signature;
  } catch (error) {
    console.error(`❌ Error during ${isSell ? 'sell' : 'swap'}:`, error.message);
    bot.sendMessage(chatId, `❌ ${action} failed: ${error.message}`);
    throw error;
  }
}

// Update sellToken to use swapTokens
async function sellToken(fromAddress, tokenIn, tokenOut, amount, slippage, buyPrice, chatId) {
  await sleep(3000)
  console.log(`Attempting to sell ${amount} of ${tokenIn} for ${tokenOut} with slippage ${slippage}`);
  return await swapTokens(amount, tokenIn, true, slippage);
}

// Add a flag to track if auto-trading is running
let isAutoTrading = false;
let autoTradeInterval;

// Start command handler
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
    bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
    return;
  }

  if (isAutoTrading) {
    bot.sendMessage(chatId, '⚠️ Auto-trading is already running!');
    return;
  }

  try {
    isAutoTrading = true;
    bot.sendMessage(chatId, '🤖 Starting 24/7 auto-trading bot...');

    // Start parallel buy and sell loops
    autoBuyLoop();
     // Add delay between operations (e.g., 1 second)
     await new Promise(resolve => setTimeout(resolve, 1000));
    autoSellLoop();
     // Add delay before next cycle
     await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error('Error starting auto-trade:', error);
    isAutoTrading = false;
    bot.sendMessage(chatId, '❌ Failed to start auto-trading');
  }
});

// Stop command handler
bot.onText(/\/stop/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
    bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to control trading.');
    return;
  }

  if (!isAutoTrading) {
    bot.sendMessage(chatId, '⚠️ Auto-trading is already stopped.');
    return;
  }

  try {
    isAutoTrading = false;
    bot.sendMessage(chatId, '🛑 Stopping auto-trading bot...');
  } catch (error) {
    console.error('Error stopping auto-trade:', error);
    bot.sendMessage(chatId, '❌ Failed to stop auto-trading.');
  }
});

// Sleep utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Buy loop with improved stop handling
async function autoBuyLoop() {
  // Track when stop was requested for timeout enforcement
  let stopRequestTime = null;
  
  while (isAutoTrading || (stopRequestTime && Date.now() - stopRequestTime < 20000)) {
    try {
      // Check if stop was requested and set the time if not already set
      if (!isAutoTrading && !stopRequestTime) {
        stopRequestTime = Date.now();
        console.log('Stop requested in buyLoop, will exit within 20 seconds');
        bot.sendMessage(chatId, '🛑 Buy loop will stop within 20 seconds...');
      }
      
      // Force stop after 20 seconds from stop request
      if (stopRequestTime && Date.now() - stopRequestTime >= 20000) {
        console.log('Forcing buy loop to stop after timeout');
        break;
      }
      
      const balance = await checkBalance();
      if (balance <= 0.001 || !isAutoTrading) {
        if (!isAutoTrading) console.log('ℹ️ Stop requested, skipping buy operations');
        else console.log('ℹ️ Insufficient balance for buying');
        await sleep(5000); // Check more frequently when stopping
        continue;
      }

      // Setup a timeout to check isAutoTrading during long operations
      const checkStopInterval = setInterval(() => {
        if (!isAutoTrading && !stopRequestTime) {
          stopRequestTime = Date.now();
          console.log('Stop detected during trending tokens fetch');
          bot.sendMessage(chatId, '🛑 Stopping buy operations...');
        }
      }, 2000);

      try {
        // Only proceed with trending tokens fetch if still auto trading
        if (isAutoTrading) {
          await getTrendingTokens({
            minLiquidity: 10000, // $10k minimum liquidity
            minVolumeH1: 5000,   // $5k volume in last hour
            minAgeHours: 24      // Token must be at least 1 day old
          });
        }
      } finally {
        clearInterval(checkStopInterval); // Always clear the interval
      }

      // Check if stop is requested before sleeping
      if (!isAutoTrading) {
        await sleep(1000); // Short sleep to allow for stop processing
      } else {
        await sleep(30000); // Normal interval between operations
      }
    } catch (error) {
      console.error('Buy loop error:', error);
      if (isAutoTrading) {
        bot.sendMessage(chatId, '⚠️ Buy loop paused due to error');
      }
      await sleep(5000); // Shorter wait on error when stopping
    }
  }
  
  console.log('Buy loop has stopped');
  bot.sendMessage(chatId, '✅ Buy loop has stopped completely');
}

// Sell loop with improved stop handling
async function autoSellLoop() {
  const failedTokens = new Set(); // Persistent blacklist across loop iterations
  // Track when stop was requested for timeout enforcement
  let stopRequestTime = null;
  
  while (isAutoTrading || (stopRequestTime && Date.now() - stopRequestTime < 20000)) {
    try {
      // Check if stop was requested and set the time if not already set
      if (!isAutoTrading && !stopRequestTime) {
        stopRequestTime = Date.now();
        console.log('Stop requested in sellLoop, will exit within 20 seconds');
        bot.sendMessage(chatId, '🛑 Sell loop will stop within 20 seconds...');
      }
      
      // Force stop after 20 seconds from stop request
      if (stopRequestTime && Date.now() - stopRequestTime >= 20000) {
        console.log('Forcing sell loop to stop after timeout');
        break;
      }
      // Fetch purchased tokens
        const tokens = await getPurchasedTokens(fromAddress);
        console.log("purchased token ===>>>", tokens);
        let allTokens;
        // Fetch all tokens from the database
        try {
          const sqlquery = "SELECT * FROM transactions";
          const allTokens = await new Promise((resolve, reject) => {
              db.query(sqlquery, (error, results) => {
                  if (error) {
                      reject(error);
                      return;
                  }
                  resolve(results);
              });
          });
  
          // console.log("allTokens", allTokens);
                  // Extract the mint addresses of purchased tokens
        const purchasedTokenMints = tokens.map(token => token.mint);

        // Filter out tokens that are not in the purchased tokens list
        const tokensToDelete = allTokens.filter(token => !purchasedTokenMints.includes(token.address));
          // console.log("tokensToDelete",tokensToDelete)
          // Continue with your token processing...
          // Delete tokens that are not in the purchased tokens list
        if (tokensToDelete.length > 0) {
            for (const token of tokensToDelete) {
                await db.query('DELETE FROM transactions WHERE hash = ?', [token.hash]); // Adjust the query as per your database schema
                console.log(`Deleted token with mint: ${token.address}`);
            }
        } else {
            console.log('No tokens to delete.');
        }
  
      } catch (error) {
          console.error("Database error:", error);
          // Handle the error appropriately
      }

        
      if (!tokens.length || !isAutoTrading) {
        if (!isAutoTrading) {
          await sleep(1000); // Short sleep when stopping
          continue;
        }
        
        bot.sendMessage(chatId, 'ℹ️ No tokens to sell');
        await sleep(30000);
        continue;
      }

      // Filter out blacklisted tokens
      const validTokens = tokens.filter(token => !failedTokens.has(token.mint));

      // Setup a timeout to check isAutoTrading during long operations
      const checkStopInterval = setInterval(() => {
        if (!isAutoTrading && !stopRequestTime) {
          stopRequestTime = Date.now();
          console.log('Stop detected during token selling operations');
          bot.sendMessage(chatId, '🛑 Stopping sell operations...');
        }
      }, 2000);
      
      try {
        // console.log("111111111111111111111111",)
        // Process tokens only if we're still auto-trading
        if (isAutoTrading && validTokens.length > 0) {
          // Process tokens in series instead of parallel for better control
          for (const token of validTokens) {
            // Check if stop was requested before each token
            if (!isAutoTrading) break;
            
            try {
        // console.log("222222222222222222222")

              const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${token.mint}`);
              const tokenData = await response.json();
              // console.log("tokenData =======>>",tokenData)
               db.query(`SELECT * FROM transactions WHERE address = '${token.mint}'`, async function (err, result) {
                // console.log('result', err);
                if (err) {
                  // return result.json(err);
                }
                else {
                  await result;
                    const sumBuyPrice = result.reduce((sum, transaction) => {
                      return sum + parseFloat(transaction.buy_price);
                  }, 0);

                  //  result;
                  const sellData = await tokenData.map(async (t) => (

                    {
                      name: t.baseToken.name || "Unknown",
                      symbol: t.baseToken.symbol || "UNKNOWN",
                      address: t.baseToken.address,
                      priceUsd: t.priceUsd || 0, // Current price in USD
                      priceNative: t.priceNative || 0, // Price in SOL
                      priceChange: {
                        m5: t.priceChange?.m5 || 0, // 5-min change
                        h1: t.priceChange?.h1 || 0, // 1-hour change
                        h6: t.priceChange?.h6 || 0, // 6-hour change
                        h24: t.priceChange?.h24 || 0 // 24-hour change
                      },
                      volume: {
                        m5: t.volume?.m5 || 0,
                        h1: t.volume?.h1 || 0,
                        h6: t.volume?.h6 || 0,
                        h24: t.volume?.h24 || 0
                      },
                      liquidity: {
                        usd: t.liquidity?.usd || 0,
                        base: t.liquidity?.base || 0, // Base token amount in pool
                        quote: t.liquidity?.quote || 0 // Quote token (e.g., SOL) amount
                      },
                      marketCap: t.marketCap || 0, // Market cap for valuation


                      fdv: t.fdv || 0, // Fully diluted valuation
                      holding_amount: token.balance || 0, // Your holding amount
                      buy_price: sumBuyPrice ? (sumBuyPrice / result.length) : (t.priceUsd * 1.01) || t.priceUsd * 0.01, // Your buy price
                    }));

                  // Check stop status before continuing
                  // if (!isAutoTrading) break;
                  console.log("sellData ==>>", sellData);
                  const grokResponse = await getGrokSellResponse(sellData);
                  console.log("grokResponseSell ==>>", grokResponse);
                  // Check stop status before continuing
                  // if (!isAutoTrading) break;

                  if (grokResponse?.recommendation?.action === "SELL") {
                    const decimals = 6; // Replace with actual token decimals
                    const amountToSell = Math.floor(Number(token.balance) * (10 ** decimals));
                    // const amountToSell = Math.max(1, Math.floor(Number(token.balance) * 0.999));
                    const failedFromSell = await sellWithRetry(
                      fromAddress,
                      grokResponse.recommendation.address,
                      tokenOut, // Assuming tokenOut is defined
                      amountToSell,
                      SLIPPAGE, // Initial slippage
                      chatId
                    );
                    // Add any newly failed tokens to the blacklist
                    // failedFromSell.forEach(token => failedTokens.add(token));
                    bot.sendMessage(chatId, `💰 Sold ${grokResponse.recommendation.symbol}`);
                  }
                }
              })    
             
            } catch (error) {
              console.error(`Error processing sell for ${token.mint}:`, error);
              if (error.message.includes("No swap route available")) {
                failedTokens.add(token.mint);
              }
            }
          }
        }
      } finally {
        clearInterval(checkStopInterval); // Always clear the interval
      }

      // Check if stop is requested before sleeping
      if (!isAutoTrading) {
        await sleep(1000); // Short sleep to allow for stop processing
      } else {
        await sleep(30000); // Normal interval between operations
      }
    } catch (error) {
      console.error('Sell loop error:', error);
      if (isAutoTrading) {
        bot.sendMessage(chatId, '⚠️ Sell loop paused due to error');
      }
      await sleep(5000); // Shorter wait on error when stopping
    }
  }
  
  console.log('Sell loop has stopped');
  bot.sendMessage(chatId, '✅ Sell loop has stopped completely');
}

async function sellWithRetry(fromAddress, tokenAddress, tokenOut, amount, initialSlippage = 100, chatId, maxRetries = 3) {
  let slippage = initialSlippage;
  let sellAmount = amount;
  const failedTokens = new Set();


  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // console.log("failedTokens.has(tokenAddress)",failedTokens.has(tokenAddress))
      // if(failedTokens.has(tokenAddress)){
      await sellToken(fromAddress, tokenAddress, tokenOut, sellAmount, slippage, 0, chatId);
      bot.sendMessage(chatId, `✅ Sold ${sellAmount} of ${tokenAddress} successfully!`);
      return;
      // }
    } catch (error) {
      console.error(`Sell attempt ${attempt} failed for ${tokenAddress}:`, error.message);

      if (error.message === "No swap route available") {
        if (attempt === 1 && sellAmount > 0.01) { // Avoid infinite reduction
          sellAmount = sellAmount / 2;
          console.log(`Reducing amount to ${sellAmount} for retry...`);
          continue;
        } else {
          failedTokens.add(tokenAddress);
          bot.sendMessage(chatId, `❌ No swap route for ${tokenAddress}. Blacklisting token.`);
          // throw new Error(`Sell failed: No swap route available for ${tokenAddress}`);
        }
      }

      if (attempt === maxRetries) {
        bot.sendMessage(chatId, `❌ Failed to sell ${tokenAddress} after ${maxRetries} attempts. Burning token...`);
        await burnToken(fromAddress, tokenAddress, amount, chatId);
        return;
      }

      slippage = Math.min(initialSlippage + (attempt * 200), 1000);
      console.log(`Retrying sell with slippage ${slippage} and amount ${sellAmount} (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(5000 * attempt);
    }
  }
  return failedTokens;
}

async function burnToken(fromAddress, tokenAddress, amount, chatId) {
  try {
    bot.sendMessage(chatId, `🔥 Burning ${amount} of ${tokenAddress} as it could not be sold.`);

    const burnAddress = "0x000000000000000000000000000000000000dead";
    const signature = await transferTokens(fromAddress, tokenAddress, burnAddress, amount);

    bot.sendMessage(chatId, `🔥 Successfully burned ${amount} of ${tokenAddress}. Tx: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error(`Failed to burn ${tokenAddress}:`, error.message);
    bot.sendMessage(chatId, `❌ Failed to burn ${tokenAddress}: ${error.message}`);
  }
}

async function transferTokens(fromAddress, tokenAddress, toAddress, amount) {
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const tokenPubkey = new PublicKey(tokenAddress);

  // Get sender's token account
  const fromTokenAccount = await Token.getAssociatedTokenAddress(
    TOKEN_PROGRAM_ID,
    tokenPubkey,
    fromPubkey
  );

  // Check if burn address has an ATA (create if needed, though unnecessary for burn)
  let toTokenAccount = await connection.getAccountInfo(toPubkey);
  if (!toTokenAccount) {
    const tx = new Transaction().add(
      Token.createAssociatedTokenAccountInstruction(
        TOKEN_PROGRAM_ID,
        tokenPubkey,
        toPubkey,
        fromPubkey, // Payer
        fromPubkey,
        []
      )
    );
    await connection.sendTransaction(tx, [keypair]);
  }

  // Transfer to burn address
  const transaction = new Transaction().add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      fromTokenAccount,
      toPubkey,
      fromPubkey,
      [],
      amount // Adjust for decimals, e.g., amount * 10 ** decimals
    )
  );

  const signature = await connection.sendTransaction(transaction, [keypair]);
  await connection.confirmTransaction(signature, 'finalized');
  return signature;
}



async function checkTokenTransferFee(mintAddress) {
    try {
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        const mintPublicKey = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mintPublicKey);
        
        if (!accountInfo) {
            console.log('Mint account not found');
            return;
        }

        const owner = accountInfo.owner.toString();
        console.log('Token Program Owner:', owner);
        return owner;
        if (owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
            console.log('This token uses Token-2022 program');
            
            const data = accountInfo.data;
            console.log('Data length:', data.length);

            // Check for transfer hook program
            // Look for hook program identifier in the data
            let hookProgramFound = false;
            for (let i = 0; i < data.length - 32; i++) {
                try {
                    // Look for the extension type for transfer hook (type 10)
                    const extensionType = data.readUInt16LE(i);
                    if (extensionType === 10) {
                        console.log('\nTransfer Hook Extension found at offset:', i);
                        
                        // Try to read the program ID that handles the transfer hook
                        const programIdBytes = data.slice(i + 4, i + 36);
                        const programId = new PublicKey(programIdBytes);
                        console.log('Transfer Hook Program:', programId.toString());
                        
                        hookProgramFound = true;
                        
                        // Get the hook program's account info
                        try {
                            const hookProgramInfo = await connection.getAccountInfo(programId);
                            if (hookProgramInfo) {
                                console.log('Hook Program exists');
                                console.log('Hook Program data size:', hookProgramInfo.data.length);
                            }
                        } catch (e) {
                            console.log('Error fetching hook program info:', e);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (hookProgramFound) {
                console.log('\nWARNING: This token uses transfer hooks which may implement a 10% transfer fee');
                console.log('The fee is likely implemented in the transfer hook program');
            }

            // Print relevant sections of the data for analysis
            console.log('\nRelevant data sections:');
            
            // Check specific offsets where transfer fee info might be stored
            const relevantOffsets = [160, 224, 256];
            for (const offset of relevantOffsets) {
                console.log(`\nOffset ${offset}:`);
                const chunk = data.slice(offset, offset + 32);
                console.log(Buffer.from(chunk).toString('hex'));
                
                // Try to interpret potential fee values
                try {
                    const possibleFee = data.readUInt16LE(offset);
                    if (possibleFee > 0 && possibleFee <= 10000) {
                        console.log(`Possible fee at ${offset}: ${(possibleFee/100).toFixed(2)}%`);
                    }
                } catch (e) {}
            }
        }
        
    } catch (error) {
        console.error('Error checking transfer fee:', error);
        if (error.logs) {
            console.error('Error logs:', error.logs);
        }
    }
}

// Test with your token mint
// const tokenMint = 'GmMautNDHVBsaxt2W38SMi2kqAgrG1HZJkHhdE7Ypump';
// // checkTokenTransferFee(tokenMint);

// ✅ Telegram Bot Ready
bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
bot.sendMessage(chatId, '🤖 Bot is online! Send /start to start a swap.');

