require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');
const db = require('./config/dbconfig')
const { token } = require('@project-serum/anchor/dist/cjs/utils');
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
    // console.log("accountInfo =====>>>>",accountInfo);
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
                  role: "system",
                  content: "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
              },
              {
                  role: "user",
                  content: `
                  **Trading Strategy**:
                  - Analyze trending tokens from DEXscreener and filter based on liquidity, momentum, and safety.
                  - **Suggest an investment percentage** (between 20-50% of available balance).
                  - **Suggest a sell price** based on a **reasonable profit margin** (e.g., 10-30%).

                  **User Balance**: ${userBalance} SOL
                  **Token Data**: ${JSON.stringify(tokenData, null, 2)}

                  **Evaluation Rules**:
                  1️⃣ **Liquidity & Market Safety**:
                      - ✅ Must have **$10k+ USD liquidity** and **h1 volume > $10k**.
                      - ❌ Reject if **liquidity < $10k** or **volume too low**.

                  2️⃣ **Momentum Analysis**:
                      - ✅ **5m & 1h price change must be positive** (>+2% preferred).
                      - ❌ Reject if **price drops > -20% in any timeframe**.

                  3️⃣ **Security & Scam Detection**:
                      - ✅ Contract must be **at least 24 hours old**.
                      - ✅ Reject if **high tax (>10%)**, rug pull signs, or honeypot detected.

                  **Output JSON (Example Format)**:
                  {
                      "recommendation": {
                          "token": "name",
                          "symbol": "symbol",
                          "address": "tokenAddress",
                          "action": "BUY" | "PASS",
                          "investPercentage": 30,  // % of balance to invest (dynamic)
                          "sellPrice": 1.10,        // Target price (10% profit)
                          "priceUsd":priceUsd
                      },
                      "reasoning": "Short explanation...",
                      "confidence": "0-1 score (e.g., 0.9 for strong BUY)"
                  }
                  `
              }
          ],
          max_tokens: 300,
          temperature: 0.6 
      });

      const response = JSON.parse(completion.choices[0].message.content);
       console.log("buy response send ====>>>>>>",response);
      // ✅ Convert percentage to actual SOL investment
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
    const creationTime = new Date(info?.creationTime || 0);
    if (Date.now() - creationTime.getTime() < 24 * 60 * 60 * 1000) {
      console.log(`❌ Token too new: ${baseToken.address}`);
      return false;
    }

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
    if (balance <= 0.01) {
      bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
      return [];
    }

    for (const [index, element] of solanaTokens.entries()) {
      await sleep(index * 1000); // Staggered delay to avoid rate limits
      try {
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
        const tokenData = await response.json();

        for (const data of tokenData) {
          if (await isSafeToken(data)) {
            bestTokens.push(data);
          }
        }

        if (tokenData.length > 0 && balance > 0.01) {
          console.log("bestTokens",bestTokens);
          const intraday = await getGrokResponse(tokenData, balance);
          if (!intraday) {
            bot.sendMessage(chatId, '❌ No trading recommendation available');
            continue;
          }

          console.log("Intraday Recommendation:", intraday);
          if (intraday.confidence >= 0.2 && intraday.recommendation.action === 'BUY' && intraday.recommendation.address !== 'Ddm4DTxNZxABUYm2A87TFLY6GDG2ktM2eJhGZS3EbzHM') {
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
            console.log("43535664757 ===========>>>>>>>>",investAmount > 0.011)
            // investAmount > 0.011
            if(true){
            console.log("43535664757 ===========>>>>>>>>000")

            await swapTokens(Math.round(tradeAmount), intraday.recommendation.address,intraday);
            }else{
              console.log("Buying stop, Reserve balance is 0.011")
            //  bot.sendMessage('❌ Buying stop, Reserve balance is 0.011');
            bot.sendMessage(chatId, '❌ No balance');

            }
          } else {
            bot.sendMessage(chatId, '❌ Confidence too low or no BUY signal');
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
  try {
    const completion = await client.chat.completions.create({
      model: "grok-2-latest", // Ensure this is the correct model name
      messages: [
        {
          role: "system",
          content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis, focusing on 2-10% profit after fees while minimizing premature exits."
        },
        {
          role: "user",
          content: `
            As Grok 3, a crypto trading analyst built by xAI, you’re optimized for short-term trading insights with real-time data analysis. Today is March 15, 2025. Analyze the following token data from DEXscreener, including the current price (\`priceUsd\`) and my buy price (\`buy_price\`), to decide whether to sell for profit, sell on a loss, or hold:

            ${JSON.stringify(tokenData, null, 2)}

            Evaluate the token based on:
            1. **Profit/Loss Calculation**: 
               - Compare \`priceUsd\` (current price) with \`buy_price\`.
               - Target a minimum 2% net profit after fees (e.g., 0.5% fee deducted); sell if profit ≥ 2%.
               - If momentum is strong (m5 > +5% or h1 > +10%), target >2% profit (e.g., 5-10%) before selling.
               - Sell if loss ≥ -5% (i.e., \`priceUsd\` < 95% of \`buy_price\`), regardless of other signals.
            2. **Momentum**: 
               - Use \`priceChange\` (m5: 5-min, h1: 1-hour); sell if m5 < -5% *and* h1 < -10% with declining volume, hold if m5 > +2% or h1 > +5%.
            3. **Volume**: 
               - Require \`volume.m5\` > $1000 and \`volume.h1\` > $10k; sell if volume drops >25% from h1 with negative price action.
            4. **Liquidity**: 
               - Filter out tokens with \`liquidity.usd\` < $10,000; sell if liquidity is insufficient to support price stability.

            Rules:
            - **Sell for Profit**: Sell if profit ≥ 2% after fees; if momentum is strong (m5 > +5% or h1 > +10%) and volume holds, wait for >2% (e.g., 5-10%) before selling.
            - **Sell on Loss**: Exit if loss ≥ -5% (i.e., \`priceUsd\` < 95% of \`buy_price\`), or if m5 < -5% *and* h1 < -10% with declining volume.
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

    // Extract raw text response
    let rawContent = completion.choices[0].message.content.trim();

    // 1️⃣ Try to extract JSON inside triple backticks (```json ... ```)
    let jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      rawContent = jsonMatch[1].trim(); // Extract JSON inside the block
    } 

    try {
      // 2️⃣ Attempt to parse JSON (either extracted or original)
      const response = JSON.parse(rawContent);
      return response;
    } catch (jsonError) {
      console.warn("⚠ JSON parse failed, possible mixed content:", jsonError.message);
      
      // 3️⃣ Fallback: Try to extract first valid JSON object from response
      const jsonRegex = /{[\s\S]*}/;
      let possibleJsonMatch = rawContent.match(jsonRegex);
      
      if (possibleJsonMatch) {
        try {
          return JSON.parse(possibleJsonMatch[0]); // Extract probable JSON
        } catch (fallbackError) {
          console.error("❌ Failed parsing extracted JSON:", fallbackError.message);
        }
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
  var sqlDelete = `DELETE FROM transactions WHERE address="${outputToken}"`;
  db.query(sqlDelete, function (err, result) {
    console.log('result', err)
    if (err) {
        return result.json(err);
    }
    else {
      console.log("Deleted token ")
    }
  })
  
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
    // autoBuyLoop();
    autoSellLoop();
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

        // Fetch all tokens from the database
        let sqlquery= "SELECT * FROM transactions"; // Adjust the query as per your database schema
        const allTokens  = await  db.query(sqlquery, function (err, result) {
          console.log('result', err)
          if (err) {
              return result.json(err);
          }
          else {
            console.log("insert token ",result)
             return result;
          }
        })
         console.log("allTokens",allTokens)

        // Extract the mint addresses of purchased tokens
        const purchasedTokenMints = tokens.map(token => token.mint);

        // Filter out tokens that are not in the purchased tokens list
        const tokensToDelete = allTokens.filter(token => !purchasedTokenMints.includes(token.mint));

        // Delete tokens that are not in the purchased tokens list
        if (tokensToDelete.length > 0) {
            for (const token of tokensToDelete) {
                await db.query('DELETE FROM tokens WHERE mint = ?', [token.mint]); // Adjust the query as per your database schema
                console.log(`Deleted token with mint: ${token.mint}`);
            }
        } else {
            console.log('No tokens to delete.');
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
        console.log("111111111111111111111111",)
        // Process tokens only if we're still auto-trading
        if (isAutoTrading && validTokens.length > 0) {
          // Process tokens in series instead of parallel for better control
          for (const token of validTokens) {
            // Check if stop was requested before each token
            if (!isAutoTrading) break;
            
            try {
        console.log("222222222222222222222")

              const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${token.mint}`);
              const tokenData = await response.json();
              console.log("tokenData =======>>",tokenData)
               db.query(`SELECT * FROM transactions WHERE address = '${token.mint}'`, async function (err, result) {
                console.log('result', err);
                if (err) {
                  // return result.json(err);
                }
                else {
                  await result;
                    const sumBuyPrice = result.reduce((sum, transaction) => {
                      return sum + parseFloat(transaction.buy_price);
                  }, 0);
                  console.log('result transaction table', result);

                  console.log('Sum of buy_price:', sumBuyPrice);

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
                      buy_price: sumBuyPrice / result.length || 0, // Your buy price
                    }));

                  // Check stop status before continuing
                  // if (!isAutoTrading) break;
                  console.log("sellData ==>>", sellData);
                  const grokResponse = await getGrokSellResponse(sellData);
                  console.log("grokResponseSell ==>>", grokResponse);
                  // Check stop status before continuing
                  // if (!isAutoTrading) break;

                  if (grokResponse?.recommendation?.action === "SELL") {
                    const amountToSell = Math.max(1, Math.floor(Number(token.balance) * 0.999));
                    const failedFromSell = await sellWithRetry(
                      fromAddress,
                      grokResponse.recommendation.address,
                      tokenOut, // Assuming tokenOut is defined
                      amountToSell,
                      SLIPPAGE, // Initial slippage
                      chatId
                    );
                    // Add any newly failed tokens to the blacklist
                    failedFromSell.forEach(token => failedTokens.add(token));
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
      await sellToken(fromAddress, tokenAddress, tokenOut, sellAmount, slippage, 0, chatId);
      bot.sendMessage(chatId, `✅ Sold ${sellAmount} of ${tokenAddress} successfully!`);
      return;
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
          throw new Error(`Sell failed: No swap route available for ${tokenAddress}`);
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


// ✅ Telegram Bot Ready
bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
bot.sendMessage(chatId, '🤖 Bot is online! Send /start to start a swap.');
