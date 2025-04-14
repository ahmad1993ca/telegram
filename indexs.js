  require('dotenv').config();
  const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
  const {  PublicKey } = require("@solana/web3.js");

  const {  Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
  const { createBurnInstruction } = require('@solana/spl-token');

  const  { createCloseAccountInstruction }  = require('@solana/spl-token');

  const { TOKEN_PROGRAM_ID,getAssociatedTokenAddress } = require('@solana/spl-token');

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
  let initialBalance = 0; // Initial SOL balance when bot starts
  let totalProfit = 0;    // Track total profit
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

  let TARGET_WALLET;

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
      // if (tokenAmount.uiAmount > 0.00001) {
        purchasedTokens.push({
          mint: accountInfo.value.data.parsed.info.mint, // Token mint address
          balance: tokenAmount.amount, // Token balance
          owner: accountInfo.value.data.parsed.info.owner, // Wallet address
        });
      // }
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
      // console.log("tokenData getGrokResponse",tokenData)
      const completion = await client.chat.completions.create({
        model: "grok-2-latest",
        messages: [
          {
            "role": "system",
            "content": "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time and historical data analysis for maximizing profit on volatile meme coins."
          },
          {
            "role": "user",
            "content": `
              **Trading Strategy**:
              - Analyze trending tokens from DEXscreener for quick-profit meme coin opportunities.
              - Suggest an investment percentage (20-50% of balance) based on volatility and upside potential.
              - Suggest a sell price targeting 5-20% profit for fast flips, adjustable based on short-term momentum.
          
              **User Balance**: ${userBalance} SOL
              **Token Data**: ${JSON.stringify(tokenData, null, 2)}
          
              **Evaluation Rules**:
              1️⃣ **Liquidity & Market Safety**:
                  - ✅ Must have **$5k+ USD liquidity** and **h1 volume > $5k**.
                  - ❌ Reject if **liquidity < $5k** or **volume too low**.
          
              2️⃣ **Momentum & Historical Analysis**:
                  - ✅ Favor tokens with **m5 price increase > 10%** or **h1 > 15%**.
                  - ❌ Reject if **price drops > -10% in m5 or h1**.
                  - Focus on short-term breakout potential (m5, h1) over long-term trends.
          
              3️⃣ **Security & Tax Detection**:
                  - ✅ Contract must be **at least 1 hour old** (check \`pairCreatedAt\`).
                  - ❌ Reject if rug pull signs (e.g., liquidity drop > 50% in h1) or **tax > 10%**.
          
              4️⃣ **Profit Optimization**:
                  - Target **5-20% profit** based on momentum (e.g., 5% for low volatility, 20% for high).
                  - Adjust investment percentage (20-50%) based on breakout confidence.
          
              **Output JSON**:
              {
                "recommendation": {
                  "token": "name",
                  "symbol": "symbol",
                  "address": "tokenAddress",
                  "action": "BUY" | "PASS",
                  "investPercentage": 20-50,
                  "sellPrice": "target price (5-20% above current priceUsd)",
                  "priceUsd": "current price in USD"
                },
                "reasoning": "Short explanation (focus on breakout potential and profit)...",
                "confidence": "0-1 score (e.g., 0.95 for strong BUY, 0.5 for PASS)"
              }
          
              **Important**:
              - Return *only* a valid JSON object.
              - Estimate tax/volume if data is missing.
              - Use timestamp ${Date.now()} for contract age from \`pairCreatedAt\`.
            `
          }
        ],
        max_tokens: 300,
        temperature: 0.6
      });
      // ... (rest of the function unchanged)
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
    // console.log("solanaTokens ===>>",solanaTokens)
      if (!solanaTokens || solanaTokens.length === 0) {
        bot.sendMessage(chatId, "❌ No trending tokens found!");
        return [];
      }

      const bestTokens = [];
      const balance = await checkBalance();
      const tradingBalance = Math.min(initialBalance, balance);
      const actualAmount =  totalProfit > 0 ? balance - totalProfit : balance;
              
      console.log("tradingBalance ====>>>>>actualAmount",tradingBalance,actualAmount);
      if (tradingBalance <= 0.02) {
        bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
        return [];
      }

      for (const [index, element] of solanaTokens.entries()) {
        await sleep(index * 1000); // Staggered delay to avoid rate limits
        try {
          const highFee =await checkTokenTransferFee(element.tokenAddress);
          //  console.log("highFee =====>>>>>",highFee);
          if (highFee !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
      
            // const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${element.tokenAddress}`)
          const response = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
          const tokenData = await response.json();

          for (const data of tokenData) {
            bestTokens.push(data);

            // if (await isSafeToken(data)) {
            // }
          }

          if (tokenData.length > 0 && tradingBalance > 0.020) {
            // console.log("bestTokens",bestTokens);
            const intraday = await getGrokResponse(tokenData, tradingBalance);
            console.log("intraday",intraday)
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
              const investAmount = tradingBalance - intraday.recommendation.investAmount;
              
              const tradeAmount = intraday.recommendation.investAmount * 1e9; // Convert SOL to lamports
            
              if(investAmount > 0.020){
              intraday.tradingBalance;
              intraday.investAmount
              await swapTokens(Math.round(tradeAmount), intraday.recommendation.address,intraday);
              }else{
                // console.log("Buying stop, Reserve balance is 0.020")
              //  bot.sendMessage('❌ Buying stop, Reserve balance is 0.011');
              bot.sendMessage(chatId, '❌ Buying stop, Reserve balance is 0.020');

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
    try {
      let resolvedData;
      if (Array.isArray(tokenData) && tokenData[0] instanceof Promise) {
        resolvedData = await tokenData[0];
      } else {
        resolvedData = tokenData;
      }

      const completion = await client.chat.completions.create({
        model: "grok-2-latest",
        messages: [
          {
            role: "system",
            content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time and historical data analysis, focusing on quick profits after fees and proactive loss minimization for volatile meme coins."
          },
          {
            role: "user",
            content: `
              As Grok 3, a crypto trading analyst built by xAI, you’re optimized for short-term trading insights using real-time data from DEXscreener. Today is ${Date.now()}. Analyze the following token data, including the current price (\`priceUsd\`) and my buy price (\`buy_price\`), to recommend whether to sell for profit, sell to cut losses, or hold. Since this is a meme coin with low stability swapped on Jupiter, prioritize quick sells for profits (gross ≥5% to net ≥4.5% after 0.2% Jupiter fee + $0.01 gas) and cut losses early:
          
              ${JSON.stringify(resolvedData, null, 2)}
          
              Evaluate the token based on:
              1. **Profit/Loss Calculation**:
                - Compare \`priceUsd\` with \`buy_price\`.
                - Target a gross profit of ≥5% to net ≥4.5% after fees; sell if profit ≥ 5%.
                - Sell if loss ≥ -2% AND momentum is weak; escalate to sell if loss ≥ -5% regardless.
              2. **Momentum**:
                - Hold if profit < 5% AND momentum is strong (e.g., m5 > 5% OR h1 > 10%).
                - Sell if loss ≥ -2% AND momentum weakens (e.g., m5 < 0% AND h1 < 0%).
          
              Rules:
              - **Sell for Profit**: Sell if gross profit ≥ 5% (nets ≥4.5% after fees); do not sell below this.
              - **Sell on Loss**: Sell if loss ≥ -2% AND momentum weak (m5 < 0%, h1 < 0%), or ≥ -5% regardless.
              - **Hold**: Hold if profit < 5% AND loss > -2% with strong momentum (m5 > 5% OR h1 > 10%), max 1-2 hours.
              - **Strict Thresholds**: No sell for profit < 5% or hold past -5% loss.
          
              Output in JSON:
              {
                "recommendation": {
                  "token": "name",
                  "symbol": "symbol",
                  "address": "address",
                  "action": "SELL" | "HOLD",
                  "profit_loss_percent": "calculated profit/loss % (e.g., +5.3% or -2.4%)",
                  "estimated_hold_time": "if HOLD, '1-2 hours'; null if SELL"
                },
                "reasoning": "2-3 sentences explaining profit/loss, momentum, and rationale; flag if fees exceed 0.5% of trade value",
                "confidence": "0-1 score (e.g., 0.9 for SELL, 0.7 for HOLD)"
              }
          
              Focus on ≥5% gross profit to net ≥4.5% after fees; hold for pumps if momentum is strong, otherwise cut losses early.
            `
          }
        ],
        max_tokens: 300,
        temperature: 0.5
      });
      // ... (rest of the function unchanged)
      let rawContent = completion.choices[0].message.content.trim();
      let jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) rawContent = jsonMatch[1].trim();

      try {
        return JSON.parse(rawContent);
      } catch (jsonError) {
        console.warn("⚠ JSON parse failed:", jsonError.message);
        const jsonRegex = /{[\s\S]*}/;
        let possibleJsonMatch = rawContent.match(jsonRegex);
        if (possibleJsonMatch) return JSON.parse(possibleJsonMatch[0]);
        throw new Error("❌ No valid JSON found.");
      }
  
    } catch (error) {
      console.error("❌ Error fetching response:", error);
      return null;
    }
  }

  async function updateProfitInDb(totalProfits) {
    // console.log("totalProfits is coming",totalProfits);
    await new Promise((resolve, reject) => {
      db.query("UPDATE wallet_balance SET total_profit = ? WHERE wallet_address = ?", [totalProfits, fromAddress], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function getInitialBalanceFromDB() {
    try {
      const result = await new Promise((resolve, reject) => {
        db.query(
          "SELECT balance FROM wallet_balance WHERE wallet_address = ? ORDER BY last_updated DESC LIMIT 1",
          [fromAddress],
          (error, results) => {
            if (error) reject(error);
            else resolve(results);
          }
        );
      });

      if (result && result.length > 0) {
        return parseFloat(result[0].balance);
      }
      return null;
    } catch (error) {
      console.error("Error fetching initial balance from DB:", error);
      return null;
    }
  }

  async function checkBalance() {
    const balance = await connection.getBalance(keypair.publicKey) / 1e9; // Convert to SOL
    initialBalance = await getInitialBalanceFromDB();
    // console.log(`✅ Wallet balance: ${balance} SOL`,typeof balance, initialBalance);

    if (initialBalance > 0) {
      totalProfit = parseInt(balance) - parseInt(initialBalance) >= 0 ? parseFloat(balance) - parseFloat(initialBalance) : totalProfit === NaN ? 0 : totalProfit; // Only increase profit, don’t decrease below last known
      // console.log(`💰 Total profits: ${totalProfit} SOL`,typeof totalProfit);
      await updateProfitInDb(totalProfit);
    }
    return balance;
  }

  // async function swapTokens(amount, outputToken,intraday, isSell = false, slippageBps = SLIPPAGE) {
  //   const action = isSell ? "Selling" : "Buying";
  // // console.log("slippageBps =>>>>,intraday",intraday);
  //   try {
  //     const tradeValueUsd = isSell ? (intraday.recommendation.priceUsd * amount / 1e9) : (amount / 1e9 * 0.1); // Assume 0.1 SOL/USD for buy
  //     // if (tradeValueUsd < 2) {
  //     //   throw new Error(`Trade value $${tradeValueUsd.toFixed(2)} too small to net profit after $0.01 gas`);
  //     // }
  //     bot.sendMessage(chatId, `🔄 ${action} token... Fetching swap details`);

  //     // Step 1: Fetch the quote
  //     const quoteUrl = isSell
  //       ? `https://api.jup.ag/swap/v1/quote?inputMint=${outputToken}&outputMint=${INPUT_TOKEN}&amount=${amount}&slippageBps=${slippageBps}`
  //       : `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${outputToken}&amount=${amount}&slippageBps=${slippageBps}`;
  //     const quoteResponse = await fetch(quoteUrl);
  //     const quote = await quoteResponse.json();
  //     console.log("quote =>>>>", quote);
  //     if (quote.error){
  //   // await burnToken(fromAddress, outputToken, amount);
  //   throw new Error("No swap route available");
  // } 

  //     // Step 2: Fetch a fresh blockhash *before* creating the transaction
  //     const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  //     // console.log("blockhash =>>>>", blockhash);

  //     // Step 3: Create the swap transaction with the fresh blockhash
  //     const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         userPublicKey: fromAddress,
  //         wrapAndUnwrapSol: true,
  //         computeUnitPriceMicroLamports: 50000, // Increase priority fee for faster processing
  //         quoteResponse: quote,
  //         // Optionally pass the blockhash to Jupiter if supported (check API docs)
  //       })
  //     });
  //     // console.log("swapResponse ====>>>>",swapResponse)
  //     const swapData = await swapResponse.json();
  //     if (!swapData?.swapTransaction) throw new Error('Failed to get swap transaction');

  //     // Step 4: Deserialize and sign the transaction
  //     const transaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  //     transaction.sign([keypair]);
  //   //  console.log("transaction ====>>>",transaction)
  //     // Step 5: Send the transaction with retries and preflight
  //     const signature = await connection.sendRawTransaction(transaction.serialize(), {
  //       maxRetries: 5, // Increase retries
  //       skipPreflight: false, // Enable preflight to catch issues early
  //     });
  //     console.log("signature =>>>>", signature);
  //     // Step 6: Confirm the transaction using the same blockhash
  //     const confirmation = await connection.confirmTransaction(
  //       {
  //         signature,
  //         blockhash,
  //         lastValidBlockHeight,
  //       },
  //       "finalized"
  //     );

  //     if (confirmation.value.err) {
  //       throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  //     }
  //     console.log("isSell ====>>",isSell)
  //     let tradeProfit = 0;

  //     if (isSell) {
  //       const sellValue = amount * intraday.recommendation.priceUsd / 1e9; // Approx USD value sold
  //       const buyValue = amount * intraday.recommendation.buy_price / 1e9; // Approx USD value bought
  //       tradeProfit = sellValue - buyValue - 0.01; // Subtract gas fee
  //       totalProfit += tradeProfit;
  //     }

  //       if(isSell){
  //     bot.sendMessage(chatId, `✅ ${action} successful! Tx: https://solscan.io/tx/${signature},
  //       token: ${intraday.recommendation.token},
  //       symbol: ${intraday.recommendation.symbol},
  //       address: ${intraday.recommendation.address},
  //       action: ${intraday.recommendation.action},
  //       profit_loss_percent: ${intraday.recommendation.profit_loss_percent},
  //       balance:${await checkBalance()}
  //         `);
  //       }else{
  //         bot.sendMessage(chatId, `✅ ${action} successful! Tx: https://solscan.io/tx/${signature},
  //           token: ${intraday.recommendation.token},
  //           symbol: ${intraday.recommendation.symbol},
  //           address: ${intraday.recommendation.address},
  //           action: ${intraday.recommendation.action},
  //           investPercentage: ${intraday.recommendation.investPercentage},
  //           priceUsd: ${intraday.recommendation.priceUsd},
  //           balance:${await checkBalance()}
  //           investAmount: ${intraday.recommendation.investAmount}
  //             `);
  //       }
  //     if(!isSell){
  //       var sql = "INSERT INTO transactions (name, address, amount, hash, buy_price,wallet_address) VALUES (?, ?, ?, ?, ?, ?)";
  //       var values = [
  //           intraday.recommendation.token,
  //           intraday.recommendation.address,
  //           amount,
  //           signature,
  //           intraday.recommendation.priceUsd,
  //           fromAddress
  //       ];
        
  //       db.query(sql, values, function (err, result) {
  //           if (err) {
  //               console.error("Error inserting data:", err);
  //               return;
  //           }
  //           console.log("Insert successful:", result);
  //       });
        
  // }else{
    
  // }
  // return signature;
  //   } catch (error) {
  //     console.error(`❌ Error during ${isSell ? 'sell' : 'swap'}:`, error.message);
  //     bot.sendMessage(chatId, `❌ ${action} failed: due to insufficient amount , need to burn`);
  //     throw error;
  //   }
  // }

  // Update sellToken to use swapTokens
  async function sellToken(fromAddress, tokenIn, tokenOut, amount, slippage, buyPrice, chatId,grokResponse) {
    await sleep(3000)
    // console.log(`Attempting to sell ${amount} of ${tokenIn} for ${tokenOut} with slippage ${slippage}`);

    return await swapTokens(amount, tokenIn, grokResponse,true, slippage);
  }

  // Add a flag to track if auto-trading is running
  let isAutoTrading = false;
  let autoTradeInterval;

  // bot.onText(/\/start/, async (msg) => {
  //   if (msg.chat.id.toString() !== chatId) {
  //     bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
  //     return;
  //   }

  //   if (isAutoTrading) {
  //     bot.sendMessage(chatId, '⚠️ Auto-trading is already running!');
  //     return;
  //   }

  //   try {
  //     isAutoTrading = true;
  //     initialBalance = await checkBalance();
  //     totalProfit = 0; // Reset profit at start
  //     // Get current balance
  //     // const currentBalance = await checkBalance();
      
  //     // Update balance in database
  //     const updateBalanceQuery = `
  //       UPDATE wallet_balance 
  //       SET 
  //         balance = ?,
  //         last_updated = CURRENT_TIMESTAMP
  //       WHERE wallet_address = ?
  //     `;

  //     // If no rows were updated, insert new record
  //     const insertBalanceQuery = `
  //       INSERT INTO wallet_balance (wallet_address, balance, last_updated)
  //       SELECT ?, ?, CURRENT_TIMESTAMP
  //       WHERE NOT EXISTS (
  //         SELECT 1 FROM wallet_balance WHERE wallet_address = ?
  //       )
  //     `;
  //     //  const balance = await checkBalance();
  //     try {
  //       // Use Promise wrapper for database operations
  //       await new Promise((resolve, reject) => {
  //         db.query(updateBalanceQuery, [initialBalance, fromAddress], (error, results) => {
  //           if (error) {
  //             reject(error);
  //             return;
  //           }
            
  //           // If no rows were updated, insert new record
  //           if (results.affectedRows === 0) {
  //             db.query(insertBalanceQuery, [fromAddress, initialBalance, fromAddress], (insertError) => {
  //               if (insertError) {
  //                 reject(insertError);
  //                 return;
  //               }
  //               resolve();
  //             });
  //           } else {
  //             resolve();
  //           }
  //         });
  //       });

  //       bot.sendMessage(chatId, `🤖 Starting 24/7 auto-trading bot...\n💰 Current balance: ${initialBalance} SOL`);

  //       // Start parallel buy and sell loops
  //       // autoBuyLoop();
  //       // Add delay between operations
  //       await new Promise(resolve => setTimeout(resolve, 1000));
  //       // autoSellLoop();
  //       await copyTrade()
  //       // Add delay before next cycles
  //       await new Promise(resolve => setTimeout(resolve, 300000));

  //     } catch (dbError) {
  //       console.error('Database error:', dbError);
  //       bot.sendMessage(chatId, '⚠️ Warning: Failed to update balance in database');
  //       // Continue with bot startup despite DB error
  //     }

  //   } catch (error) {
  //     console.error('Error starting auto-trade:', error);
  //     isAutoTrading = false;
  //     bot.sendMessage(chatId, '❌ Failed to start auto-trading');
  //   }
  // });


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

  async function autoBuyLoop() {
    let stopRequestTime = null;

    while (isAutoTrading || (stopRequestTime && Date.now() - stopRequestTime < 20000)) {
      try {
        // Check stop conditions
        if (!isAutoTrading && !stopRequestTime) {
          stopRequestTime = Date.now();
          console.log('Stop requested in buyLoop, will exit within 20 seconds');
          bot.sendMessage(chatId, '🛑 Buy loop will stop within 20 seconds...');
        }
        
        if (stopRequestTime && Date.now() - stopRequestTime >= 20000) {
          console.log('Forcing buy loop to stop after timeout');
          break;
        }

        // Check balance
        const balance = await checkBalance();
        const tradingBalance = Math.min(initialBalance, balance);
        if (tradingBalance <= 0.020 || !isAutoTrading) {
          if (!isAutoTrading) console.log('ℹ️ Stop requested, skipping buy operations');
          else bot.sendMessage(chatId, '🛑 Insufficient trading balance 0.020 reserved...');
          await sleep(5000);
          continue;
        }

        // ===== MOMENTUM ANALYSIS SECTION =====
        const ohlcData = await fetchOHLCData();
        const now = new Date();
        const analysisPeriod = 12; // hours to analyze
        const periodStart = new Date(now.getTime() - analysisPeriod * 60 * 60 * 1000);
        
        // Format and filter data
        const formattedData = ohlcData
          .map(entry => ({
            date: new Date(entry[0]),
            open: entry[1],
            high: entry[2],
            low: entry[3],
            close: entry[4],
            changePercent: ((entry[4] - entry[1]) / entry[1] * 100)
          }))
          .filter(entry => entry.date >= periodStart && entry.date <= now);
        
        // console.log("formattedData", formattedData);

      

        // Momentum analysis
        if (formattedData.length > 0) {
          const firstPrice = formattedData[0].open;
          const lastPrice = formattedData[formattedData.length - 1].close;
          const netChange = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
          
          console.log(`Momentum: ${netChange}% over ${analysisPeriod} hours`);
          console.log(`analysisResult.recommendation `,netChange > 0.5);
          // Trading decision based on momentum
          // Get analysis from Grok
        if( netChange > 0){
        let analysisResult;
        try {
          analysisResult = await analyzeWithGrok(formattedData, client);
          console.log("Final Recommendation:", analysisResult.recommendation);
          console.log("Detailed Analysis:", JSON.stringify(analysisResult.analysis, null, 2));
        } catch (error) {
          console.error("Error in Grok analysis:", error);
          await sleep(10000);
          continue;
        }
          if (analysisResult.recommendation === 'buy') {
            console.log('✅ Bullish momentum confirmed - proceeding with token analysis');
            
            // Setup timeout check for auto-trading stop
            const checkStopInterval = setInterval(() => {
              if (!isAutoTrading && !stopRequestTime) {
                stopRequestTime = Date.now();
                console.log('Stop detected during trending tokens fetch');
                bot.sendMessage(chatId, '🛑 Stopping buy operations...');
              }
            }, 2000);

            try {
              if (isAutoTrading) {
                await getTrendingTokens({
                  minLiquidity: 10000,
                  minVolumeH1: 5000,
                  minAgeHours: 24
                });
              }
            } finally {
              clearInterval(checkStopInterval);
            }
          } else {
            console.log('⏳ Waiting for better momentum conditions');
            bot.sendMessage(chatId, `⏳ Market momentum neutral (${netChange}%), waiting...`);
            await sleep(30000); // Longer wait when conditions not ideal
            continue;
          }
        }else{
          console.log('⏳ Waiting for better momentum conditions');
          bot.sendMessage(chatId, `⏳ Market momentum neutral (${netChange}%), waiting...`);
          await sleep(30000); // Longer wait when conditions not ideal
          continue;
        }
        } else {
          console.log('No OHLC data available for analysis');
          await sleep(10000);
          continue;
        }
        // ===== END MOMENTUM ANALYSIS SECTION =====

        await sleep(isAutoTrading ? 15000 : 1000);
      } catch (error) {
        console.error('Buy loop error:', error);
        if (isAutoTrading) {
          bot.sendMessage(chatId, '⚠️ Buy loop paused due to error: ' + error.message);
        }
        await sleep(5000); // Wait longer after errors
      }
    }
    
    console.log('Buy loop has stopped');
    bot.sendMessage(chatId, '✅ Buy loop has stopped completely');
  }

  async function sellWithRetry(fromAddress, tokenAddress, tokenOut, amount, initialSlippage = 100, chatId,grokResponse, maxRetries = 3) {
    let slippage = initialSlippage;
    const failedTokens = new Set();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        bot.sendMessage(chatId, `🔄 Attempting to sell ${amount} of ${tokenAddress} (Attempt ${attempt}/${maxRetries}) with slippage ${slippage / 100}%`);
    
    
        // Attempt to sell the token
        await sellToken(fromAddress, tokenAddress, tokenOut, amount, slippage, 0, chatId,grokResponse);
        bot.sendMessage(chatId, `✅ Sold ${amount} of ${tokenAddress} successfully!`);
        return; // Exit on success
      } catch (error) {
        console.error(`Sell attempt ${attempt} failed for ${tokenAddress}:`, error.message);

        // if (error.message.includes("No swap route available") || error.message.includes("COULD_NOT_FIND_ANY_ROUTE")) {
          if (attempt === 3) {
            // If all retries fail, burn the tokens
            if(amount<350000)
            await burnToken(fromAddress, tokenAddress, amount);

            // failedTokens.add(tokenAddress);
            // bot.sendMessage(chatId, `❌ Failed to sell ${tokenAddress} after ${maxRetries} attempts. Burning tokens...`);
            break;
          }

          // Increase slippage for the next attempt
          slippage = Math.min(initialSlippage + (attempt * 200), 1000); // Cap at 10%
          console.log(`Retrying with slippage ${slippage / 100}% (attempt ${attempt + 1}/${maxRetries})...`);
     
        await sleep(5000 * attempt); // Exponential backoff
      }
    }

    return failedTokens;
  }

  async function autoSellLoop() {
    const failedTokens = new Set(); // Persistent blacklist across loop iterations
    let stopRequestTime = null;

    while (isAutoTrading || (stopRequestTime && Date.now() - stopRequestTime < 20000)) {
      try {
        if (!isAutoTrading && !stopRequestTime) {
          stopRequestTime = Date.now();
          console.log('Stop requested in sellLoop, will exit within 20 seconds');
          bot.sendMessage(chatId, '🛑 Sell loop will stop within 20 seconds...');
        }

        if (stopRequestTime && Date.now() - stopRequestTime >= 20000) {
          console.log('Forcing sell loop to stop after timeout');
          break;
        }

        // Fetch purchased tokens
        const tokens = await getPurchasedTokens(fromAddress);
        console.log("Purchased tokens ===>>>", tokens);

        if (!tokens.length || !isAutoTrading) {
          if (!isAutoTrading) {
            await sleep(1000);
            continue;
          }
          bot.sendMessage(chatId, 'ℹ️ No tokens to sell');
          await sleep(30000);
          continue;
        }

        // Sync with database
        try {
          const allTokens = await new Promise((resolve, reject) => {
            db.query("SELECT * FROM transactions  WHERE wallet_address = ?", 
          [fromAddress], (error, results) => {
              if (error) reject(error);
              else resolve(results);
            });
          });

          const purchasedTokenMints = tokens.map(token => token.mint);
          const tokensToDelete = allTokens.filter(token => !purchasedTokenMints.includes(token.address));

          if (tokensToDelete.length > 0) {
            for (const token of tokensToDelete) {
              await db.query('DELETE FROM transactions WHERE hash = ?', [token.hash]);
              console.log(`Deleted token with mint: ${token.address}`);
            }
          }
        } catch (error) {
          console.error("Database sync error:", error);
        }

        // const validTokens = tokens.filter(token => !failedTokens.has(token.mint));
        const checkStopInterval = setInterval(() => {
          if (!isAutoTrading && !stopRequestTime) {
            stopRequestTime = Date.now();
            console.log('Stop detected during token selling operations');
            bot.sendMessage(chatId, '🛑 Stopping sell operations...');
          }
        }, 2000);

        try {
          if (isAutoTrading && tokens.length > 0) {
            for (const token of tokens) {
              if (!isAutoTrading) break;

              try {
                const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${token.mint}`);
                const tokenData = await response.json();

                const result = await new Promise((resolve, reject) => {
                  db.query(
                    "SELECT * FROM transactions WHERE address = ? AND wallet_address = ?",
                    [token.mint, fromAddress],
                    (err, res) => {
                      if (err) reject(err);
                      else resolve(res);
                    }
                  );
                });
                
                const sumBuyPrice = result.reduce((sum, tx) => sum + parseFloat(tx.buy_price), 0);
                const avgBuyPrice = result.length ? sumBuyPrice / result.length : tokenData[0]?.priceUsd * 1.01 || 0;

                const sellData = tokenData.map(t => ({
                  name: t.baseToken.name || "Unknown",
                  symbol: t.baseToken.symbol || "UNKNOWN",
                  address: t.baseToken.address,
                  priceUsd: t.priceUsd || 0,
                  priceNative: t.priceNative || 0,
                  priceChange: {
                    m5: t.priceChange?.m5 || 0,
                    h1: t.priceChange?.h1 || 0,
                    h6: t.priceChange?.h6 || 0,
                    h24: t.priceChange?.h24 || 0
                  },
                  volume: {
                    m5: t.volume?.m5 || 0,
                    h1: t.volume?.h1 || 0,
                    h6: t.volume?.h6 || 0,
                    h24: t.volume?.h24 || 0
                  },
                  liquidity: {
                    usd: t.liquidity?.usd || 0,
                    base: t.liquidity?.base || 0,
                    quote: t.liquidity?.quote || 0
                  },
                  marketCap: t.marketCap || 0,
                  fdv: t.fdv || 0,
                  holding_amount: token.balance || 0,
                  buy_price: avgBuyPrice
                }));

                const grokResponse = await getGrokSellResponse(sellData);
                console.log("Grok Sell Response ==>>", grokResponse);

                if (grokResponse?.recommendation?.action === "SELL") {
                  const fullAmount = Math.floor(Number(token.balance) * 0.999);
                  // console.log(`Calling sellWithRetry for ${token.mint} with amount ${fullAmount}`);
                  const failedFromSell = await sellWithRetry(
                    fromAddress,
                    grokResponse.recommendation.address,
                    tokenOut,
                    fullAmount,
                    SLIPPAGE,
                    chatId,
                    grokResponse
                  );
                  console.log(`sellWithRetry result for ${token.mint}:`, failedFromSell);
                  if (failedFromSell.fullAmount === 0) {
                    // await db.query('DELETE FROM transactions WHERE address = ? AND wallet_address = ?"),[token.mint, fromAddress];
                    await db.query(
                      'DELETE FROM transactions WHERE address = ? AND wallet_address = ?',
                      [token.mint, fromAddress],
                      (err, result) => {
                        if (err) {
                          console.error('Error deleting transaction:', err);
                        }
                      }
                    );
                    
                    bot.sendMessage(chatId, `💰 Sold full amount of ${grokResponse.recommendation.symbol} (${fullAmount})`);
                  } else {
                    // failedTokens.add(token.mint);
                  }
                }


              } catch (error) {
                console.error(`Error processing sell for ${token.mint}:`, error);
                if (error.message.includes("No swap route available")) {
                  failedTokens.add(token.mint);
                }
              }
            }
          }
        } finally {
          clearInterval(checkStopInterval);
        }

        if (!isAutoTrading) await sleep(1000);
        else await sleep(30000);
      } catch (error) {
        console.error('Sell loop error:', error);
        if (isAutoTrading) bot.sendMessage(chatId, '⚠️ Sell loop paused due to error');
        await sleep(5000);
      }
      await sleep(isAutoTrading ? 10000 : 1000);
    }

    console.log('Sell loop has stopped');
    bot.sendMessage(chatId, '✅ Sell loop has stopped completely');
  }


  async function burnToken(fromAddress, tokenAddress, amount) {
    try {
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const payer = keypair;
      const tokenMintPublicKey = new PublicKey(tokenAddress);

      // Get the associated token account
      const tokenAccountPublicKey = await getAssociatedTokenAddress(
        tokenMintPublicKey,
        payer.publicKey
      );

      // Check balance before burning
      const accountInfo = await connection.getTokenAccountBalance(tokenAccountPublicKey);
      const currentBalance = parseFloat(accountInfo.value.amount); // Balance in raw units
      console.log(`Current balance of ${tokenAddress}: ${currentBalance}`);
     
      const burnAmount = currentBalance;

      // Create burn instruction
      const burnInstruction = createBurnInstruction(
        tokenAccountPublicKey,
        tokenMintPublicKey,
        payer.publicKey,
        burnAmount
      );

      // Create transaction for burn only
      const burnTransaction = new Transaction().add(burnInstruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      burnTransaction.recentBlockhash = blockhash;
      burnTransaction.feePayer = payer.publicKey;

      // Sign and send burn transaction
      burnTransaction.sign(payer);
      const burnSignature = await
      
      connection.sendRawTransaction(burnTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
      });
    console.log("burnSignature",burnSignature)
      // Implement robust confirmation strategy
      const confirmationStrategy = {
        signature: burnSignature,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
      };
      
      try {
        const confirmation = await Promise.race([
          connection.confirmTransaction(confirmationStrategy, "confirmed"),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Transaction confirmation timeout")), 60000)
          )
        ]);
        
        if (confirmation?.value?.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
      } catch (error) {
        if (error.message === "Transaction confirmation timeout") {
          // Check if the transaction was actually successful despite the timeout
          const signatureStatus = await connection.getSignatureStatus(burnSignature);
          if (signatureStatus?.value?.confirmationStatus === "confirmed" || 
              signatureStatus?.value?.confirmationStatus === "finalized") {
            console.log("Transaction succeeded despite timeout");
          } else {
            throw new Error("Transaction confirmation timed out");
          }
        } else {
          throw error;
        }
      }

      console.log(`🔥 Burned ${burnAmount} tokens: https://solscan.io/tx/${burnSignature}`);
      bot.sendMessage(chatId, `🔥 Successfully burned ${burnAmount} tokens from ${tokenAddress}. Tx: https://solscan.io/tx/${burnSignature}`);

      // 🔄 **Wait for balance update before closing**
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Small delay to allow Solana state update

      // Check balance again
      const updatedAccountInfo = await connection.getTokenAccountBalance(tokenAccountPublicKey);
      const updatedBalance = parseFloat(updatedAccountInfo.value.amount);

      // if (updatedBalance > 0n) {
      //   console.log(`🚨 Token balance not zero after burn. Remaining: ${updatedBalance}`);
      //   bot.sendMessage(chatId, `⚠ Unable to close account, balance still: ${updatedBalance}`);
      //   return;
      // }
        console.log(`🚨 Token balance not zero after burn. Remaining: ${updatedBalance}`);

      await closeTokenAccount(connection, tokenAccountPublicKey, payer, tokenAddress, chatId, bot);

     } catch (error) {
      console.error(`❌ Failed to burn or close account for ${tokenAddress}:`, error);
      bot.sendMessage(chatId, `❌ Burn failed: ${error.message}`);
    }
  }

  async function closeTokenAccount(connection, tokenAccountPublicKey, payer, tokenAddress, chatId, bot) {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        await sleep(1000);
        console.log(`🔄 Attempt ${attempt + 1} to close token account...`);

        // 🔹 Fetch latest blockhash every retry
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        // 🔹 Create close account instruction
        const closeAccountInstruction = createCloseAccountInstruction(
          tokenAccountPublicKey,
          payer.publicKey,
          payer.publicKey
        );

        // 🔹 Construct transaction with fresh blockhash
        const closeTransaction = new Transaction()
          .add(closeAccountInstruction);
        closeTransaction.recentBlockhash = blockhash;
        closeTransaction.feePayer = payer.publicKey;

        // 🔹 Sign and send transaction safely
        const closeSignature = await sendAndConfirmTransaction(connection, closeTransaction, [payer], {
          commitment: "finalized",
          preflightCommitment: "processed",
          maxRetries: 5
        });

        console.log(`✅ Token account closed: https://solscan.io/tx/${closeSignature}`);
        bot.sendMessage(chatId, `✅ Token account closed for ${tokenAddress}. Rent refunded. Tx: https://solscan.io/tx/${closeSignature} 
          token: ${tokenAddress},
          burn:'true'
        balance:${await checkBalance()}
          `
        );
        return; // 🔹 Exit loop if successful

      } catch (error) {
        console.error(`❌ Attempt ${attempt + 1} failed to close account:`, error);

        // 🔸 Check if it's a balance issue
        if (error.message.includes("Non-native account can only be closed if its balance is zero")) {
          console.log("⚠ Account still has a balance. Retrying in 3s...");
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 🔹 Wait before retrying
        } else {
          console.log("❌ Unknown error occurred, stopping retries.");
          bot.sendMessage(chatId, `❌ Failed to close account: ${error.message}`);
          return;
        }
      }
      attempt++;
    }

    console.log("❌ Max retry attempts reached. Unable to close account.");
    bot.sendMessage(chatId, `❌ Max retry attempts reached. Unable to close token account for ${tokenAddress}.`);
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
        
      } catch (error) {
          console.error('Error checking transfer fee:', error);
          if (error.logs) {
              console.error('Error logs:', error.logs);
          }
      }
  }

  // Profit command handler
  bot.onText(/\/profit/, async (msg) => {
    if (msg.chat.id.toString() !== chatId) {
      bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to view profit.');
      return;
    }

    try {
      // Fetch the latest balance to ensure profit is up-to-date
      const currentBalance = await checkBalance();
      
      // Retrieve total profit from the database (optional, if you want to ensure consistency)
      const profitQuery = `SELECT total_profit FROM wallet_balance WHERE wallet_address = ?`;
      const dbProfit = await new Promise((resolve, reject) => {
        db.query(profitQuery, [fromAddress], (error, results) => {
          if (error) reject(error);
          else resolve(results[0]?.total_profit || 0);
        });
      });

      // Use the in-memory totalProfit if it's higher (to account for recent trades not yet saved)
      const displayedProfit = Math.max(totalProfit, dbProfit);

      // Format the response
      const profitMessage = `
        💰 Total Profit: ${displayedProfit.toFixed(6)} SOL
        📊 Current Balance: ${currentBalance.toFixed(6)} SOL
        📅 As of: ${new Date().toLocaleString()}
      `;
      
      bot.sendMessage(chatId, profitMessage);
    } catch (error) {
      console.error('Error fetching profit:', error);
      bot.sendMessage(chatId, '❌ Failed to retrieve profit information');
    }
  });
  const axios = require('axios');

  // Constants
  const API_URL = 'https://api.coingecko.com/api/v3/coins/solana/ohlc';
  const VS_CURRENCY = 'usd';
  const DAYS = '1'; // Get 1 day of data to ensure we cover 12 hours

  async function fetchOHLCData(vs_currency = VS_CURRENCY, days = DAYS) {
    try {
      const response = await axios.get(API_URL, {
        params: {
          vs_currency,
          days
        },
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SOL-Analyzer'
        },
        timeout: 10000
      });

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response format from CoinGecko API');
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching OHLC data:');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        if (error.response.status === 429) {
          console.error('Rate limit exceeded. Please wait and try again later.');
        }
      }
      throw error;
    }
  }


  // const { Grok } = require('xai'); // Assuming this is how you import the Grok client

  async function analyzeWithGrok(data, client) {
      /**
       * Enhanced stock analysis combining technical indicators with Grok AI insights
       * 
       * @param {Array} data - OHLC data with changePercent
       * @param {Object} client - Initialized Grok client with API key
       * @returns {Object} - Recommendation and detailed analysis
       */
      
      if (!data || data.length < 2) {
          return {
              recommendation: "wait",
              analysis: { error: "Insufficient data points" }
          };
      }

      // 1. First perform technical analysis
      const technicalAnalysis = performTechnicalAnalysis(data);
      
      // 2. Enhance with Grok AI analysis
      try {
          const grokAnalysis = await getGrokInsights(data, client);
          
          // Combine both analyses
          const combinedAnalysis = {
              ...technicalAnalysis,
              grok_insights: grokAnalysis,
              confidence: Math.min(95, technicalAnalysis.confidence + grokAnalysis.confidence_boost)
          };
          
          // Final decision logic incorporating both analyses
          if (combinedAnalysis.confidence >= 60) {
              combinedAnalysis.recommendation = "buy";
          } else {
              combinedAnalysis.recommendation = "wait";
          }
          
          return {
              recommendation: combinedAnalysis.recommendation,
              analysis: combinedAnalysis
          };
          
      } catch (error) {
          console.error("Grok API error:", error);
          // Fallback to technical analysis only
          return {
              recommendation: technicalAnalysis.recommendation,
              analysis: {
                  ...technicalAnalysis,
                  grok_error: "Failed to get AI insights"
              }
          };
      }
  }

  // Technical analysis (similar to previous function)
  function performTechnicalAnalysis(data) {
      const current = data[data.length - 1];
      const previous = data[data.length - 2];
      const candleRange = current.high - current.low;
      const bodySize = Math.abs(current.close - current.open);
      
      const analysis = {
          current_candle: {
              type: current.close > current.open ? "bullish" : "bearish",
              body_ratio: candleRange !== 0 ? bodySize / candleRange : 0,
              upper_shadow: current.high - Math.max(current.open, current.close),
              lower_shadow: Math.min(current.open, current.close) - current.low,
              close_position: candleRange !== 0 ? (current.close - current.low) / candleRange : 0
          },
          recommendation: "wait",
          confidence: 0
      };
      
      // ... rest of technical analysis logic ...
      
      return analysis;
  }

  // Get insights from Grok AI
  async function getGrokInsights(data, client) {
      const current = data[data.length - 1];
      const previous = data[data.length - 2];
      
      const prompt = `
      Analyze this crypto trading data for short-term trading opportunities:
      
      Current Candle:
      - Open: ${current.open}
      - High: ${current.high}
      - Low: ${current.low}
      - Close: ${current.close}
      - Change: ${current.changePercent}%
      
      Previous Candle:
      - Open: ${previous.open}
      - High: ${previous.high}
      - Low: ${previous.low}
      - Close: ${previous.close}
      - Change: ${previous.changePercent}%
      
      As an expert crypto trading analyst, provide:
      1. Market sentiment analysis
      2. Short-term price prediction
      3. Confidence score (0-100)
      4. Key factors influencing your assessment
      5. Any unusual patterns detected
      
      Format your response as JSON with these fields:
      - sentiment
      - prediction
      - confidence_boost
      - key_factors
      - patterns
      `;
      
      const completion = await client.chat.completions.create({
          model: "grok-2-latest",
          messages: [
              {
                  "role": "system",
                  "content": "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time and historical data analysis for maximizing profit on volatile meme coins. Respond ONLY with valid JSON in the requested format."
              },
              {
                  "role": "user",
                  "content": prompt
              }
          ],
          response_format: { type: "json_object" }
      });
      
      try {
          return JSON.parse(completion.choices[0].message.content);
      } catch (e) {
          console.error("Failed to parse Grok response:", e);
          return {
              sentiment: "neutral",
              prediction: "unknown",
              confidence_boost: 0,
              key_factors: ["Failed to parse AI response"],
              patterns: []
          };
      }
  }


  

// Add this near your other imports
// const { PublicKey, Connection } = require('@solana/web3.js');

// Target wallet to copy trades from
// const TARGET_WALLET = '6ZLZt3Mkvpr6YpbWUVusR7gqPbhGVSaA4thBs5NtH2YF';

// async function copyTrade() {
//   try {
//     bot.sendMessage(chatId, `🤖 Starting copy trading for wallet: ${TARGET_WALLET}`);
//     const targetPublicKey = new PublicKey(TARGET_WALLET);

//     // Subscription with rate-limited polling instead of onAccountChange
//     let lastProcessedSlot = 0;
//     while (isAutoTrading) {
//       try {
//         const latestSlot = await connection.getSlot('confirmed');
//         if (latestSlot > lastProcessedSlot) {
//           await processTargetWalletTransactions(targetPublicKey);
//           lastProcessedSlot = latestSlot;
//         }
//       } catch (error) {
//         if (error.code === 429) {
//           console.warn('Rate limit hit, backing off...');
//           await sleep(10000); // Wait 10 seconds before retrying
//         } else {
//           console.error('Error in copyTrade loop:', error);
//           bot.sendMessage(chatId, `⚠️ Copy trading error: ${error.message}`);
//           await sleep(5000);
//         }
//       }
//       await sleep(30000); // Poll every 30 seconds to reduce load
//     }

//     bot.sendMessage(chatId, '🛑 Copy trading stopped');
//   } catch (error) {
//     console.error('❌ Error starting copyTrade:', error);
//     bot.sendMessage(chatId, `❌ Copy trading failed to start: ${error.message}`);
//   }
// }

async function processTargetWalletTransactions(targetPublicKey) {
  try {
    const signatures = await connection.getSignaturesForAddress(targetPublicKey, { limit: 5 }, 'confirmed'); // Reduce limit to 5
    if (!signatures.length) {
      console.log(`No recent transactions found for ${TARGET_WALLET}`);
      return;
    }

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx) continue;

        const tradeDetails = await analyzeTransaction(tx, targetPublicKey);
        if (tradeDetails) {
          await replicateTrade(tradeDetails);
        }
        await sleep(2000); // 2-second delay between transaction processing
      } catch (error) {
        if (error.code === 429) {
          console.warn(`Rate limit hit for tx ${sig.signature}, retrying...`);
          await sleep(10000); // Wait 10 seconds on 429
          continue;
        }
        console.error(`Error processing tx ${sig.signature}:`, error);
      }
    }
  } catch (error) {
    if (error.code === 429) {
      console.warn('Rate limit hit in processTargetWalletTransactions, backing off...');
      await sleep(15000); // Wait 15 seconds
    } else {
      throw error;
    }
  }
}

// Analyze a transaction to detect token trades
async function analyzeTransaction(tx, targetPublicKey) {
  try {
    await sleep(1000)
    const instructions = tx.transaction.message.instructions;
    const postTokenBalances = tx.meta.postTokenBalances || [];
    const preTokenBalances = tx.meta.preTokenBalances || [];

    let tradeDetails = null;

    for (const balance of postTokenBalances) {
      const preBalance = preTokenBalances.find(pb => pb.accountIndex === balance.accountIndex);
      if (!preBalance) continue;

      const tokenMint = balance.mint;
      const amountChange = BigInt(balance.uiTokenAmount.amount) - BigInt(preBalance.uiTokenAmount.amount);

      // Detect if the target wallet bought or sold tokens
      if (balance.owner === targetPublicKey.toString() && amountChange !== 0n) {
        const isBuy = amountChange > 0n;
        const amount = Number(amountChange > 0n ? amountChange : -amountChange);

        // Fetch token price from DEXscreener
        const tokenDataResponse = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`);
        const tokenData = await tokenDataResponse.json();
        const priceUsd = tokenData[0]?.priceUsd || 0;

        tradeDetails = {
          tokenAddress: tokenMint,
          tokenName: tokenData[0]?.baseToken.name || 'Unknown',
          tokenSymbol: tokenData[0]?.baseToken.symbol || 'UNKNOWN',
          action: isBuy ? 'BUY' : 'SELL',
          amount: amount,
          priceUsd: priceUsd,
          timestamp: tx.blockTime * 1000 // Convert to milliseconds
        };

        console.log(`Detected ${isBuy ? 'BUY' : 'SELL'} of ${tradeDetails.tokenSymbol} (${tokenMint})`);
        break; // Process one trade per transaction for simplicity
      }
    }

    return tradeDetails;
  } catch (error) {
    console.error('❌ Error analyzing transaction:', error);
    return null;
  }
}

// Replicate the detected trade with your wallet
async function replicateTrade(tradeDetails) {
  try {
    const { tokenAddress, tokenName, tokenSymbol, action, amount, priceUsd } = tradeDetails;
    console.log("tokenAddress",tokenAddress,action);
    const balance = await checkBalance();


    // Adjust investment amount based on your balance (e.g., proportional or fixed percentage)
    const investPercentage = Math.min(20, (amount * priceUsd) / (balance * 0.1) * 100); // Cap at 20% of your balance
    const investAmountSol = (balance * investPercentage) / 100;
    const investAmountLamports = Math.round(investAmountSol * 1e9);

    const grokResponseMock = {
      recommendation: {
        token: tokenName,
        symbol: tokenSymbol,
        address: tokenAddress,
        action: action,
        investPercentage: investPercentage,
        priceUsd: priceUsd,
        investAmount: investAmountSol
      },
      reasoning: `Copying trade from ${TARGET_WALLET}`,
      confidence: 0.9
    };

    if (action === 'BUY') {

    if (balance <= 0.020) {
      bot.sendMessage(chatId, '❌ Insufficient balance to copy trade Buy');
      return;
    }

      bot.sendMessage(chatId, `
        🎯 Copying BUY from ${TARGET_WALLET}:
        Token: ${tokenName} (${tokenSymbol})
        Address: ${tokenAddress}
        Amount: ${investAmountSol} SOL (${investPercentage}%)
      `);
      await swapTokens(investAmountLamports, tokenAddress, grokResponseMock, false);
    } else if (action === 'SELL') {
      // Check if you hold this token
      const tokens = await getPurchasedTokens(fromAddress);
      console.log("tokens =====>>>>>",tokens);
      const heldToken = tokens.find(t => t.mint === tokenAddress);
      if (!heldToken) {
        bot.sendMessage(chatId, `ℹ️ Skipping SELL of ${tokenSymbol}: Not held in wallet`);
        return;
      }

      const sellAmount = Math.min(Number(heldToken.balance), amount); // Sell what you have or the copied amount
      grokResponseMock.recommendation.profit_loss_percent = ((priceUsd - heldToken.buy_price) / heldToken.buy_price * 100).toFixed(2);

      bot.sendMessage(chatId, `
        🎯 Copying SELL from ${TARGET_WALLET}:
        Token: ${tokenName} (${tokenSymbol})
        Address: ${tokenAddress}
        Amount: ${sellAmount}
      `);
      await sellWithRetry(fromAddress, tokenAddress, INPUT_TOKEN, sellAmount, SLIPPAGE, chatId, grokResponseMock);
    }
  } catch (error) {
    console.error('❌ Error replicating trade:', error);
    bot.sendMessage(chatId, `❌ Failed to copy trade: ${error.message}`);
  }
}

// Update your /start command to include copy trading
// bot.onText(/\/start/, async (msg) => {
//   if (msg.chat.id.toString() !== chatId) {
//     bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
//     return;
//   }

//   if (isAutoTrading) {
//     bot.sendMessage(chatId, '⚠️ Auto-trading is already running!');
//     return;
//   }

//   try {
//     isAutoTrading = true;
//     initialBalance = await checkBalance();
//     totalProfit = 0;

//     // Update balance in database (existing code)
//     const updateBalanceQuery = `
//       UPDATE wallet_balance 
//       SET balance = ?, last_updated = CURRENT_TIMESTAMP
//       WHERE wallet_address = ?
//     `;
//     const insertBalanceQuery = `
//       INSERT INTO wallet_balance (wallet_address, balance, last_updated)
//       SELECT ?, ?, CURRENT_TIMESTAMP
//       WHERE NOT EXISTS (SELECT 1 FROM wallet_balance WHERE wallet_address = ?)
//     `;
//     await new Promise((resolve, reject) => {
//       db.query(updateBalanceQuery, [initialBalance, fromAddress], (error, results) => {
//         if (error) reject(error);
//         if (results.affectedRows === 0) {
//           db.query(insertBalanceQuery, [fromAddress, initialBalance, fromAddress], (err) => {
//             if (err) reject(err);
//             else resolve();
//           });
//         } else resolve();
//       });
//     });

//     bot.sendMessage(chatId, `🤖 Starting 24/7 auto-trading bot...\n💰 Current balance: ${initialBalance} SOL`);

//     // Start all trading loops in parallel
//     Promise.all([
//       // autoBuyLoop(),
//       // autoSellLoop(),
//       copyTrade() // Add copy trading loop
//     ]).catch(err => {
//       console.error('Error in trading loops:', err);
//       isAutoTrading = false;
//     });

//   } catch (error) {
//     console.error('Error starting auto-trade:', error);
//     isAutoTrading = false;
//     bot.sendMessage(chatId, '❌ Failed to start auto-trading');
//   }
// });
  
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
    bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
    return;
  }

  if (isAutoTrading) {
    bot.sendMessage(chatId, '⚠️ Auto-trading is already running!');
    return;
  }

  bot.sendMessage(chatId, '📥 Please enter the target wallet address for copy trading:');

  bot.once('message', async (response) => {
    const targetWallet = response.text.trim();
    if (!/^([1-9A-HJ-NP-Za-km-z]{32,44})$/.test(targetWallet)) {
      bot.sendMessage(chatId, '❌ Invalid wallet address! Please enter a valid Solana wallet address.');
      return;
    }

    try {
      isAutoTrading = true;
      initialBalance = await checkBalance();
      totalProfit = 0;

      // Update balance in database
      const updateBalanceQuery = `
        UPDATE wallet_balance 
        SET balance = ?, last_updated = CURRENT_TIMESTAMP
        WHERE wallet_address = ?
      `;
      const insertBalanceQuery = `
        INSERT INTO wallet_balance (wallet_address, balance, last_updated)
        SELECT ?, ?, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (SELECT 1 FROM wallet_balance WHERE wallet_address = ?)
      `;
      await new Promise((resolve, reject) => {
        db.query(updateBalanceQuery, [initialBalance, fromAddress], (error, results) => {
          if (error) reject(error);
          if (results.affectedRows === 0) {
            db.query(insertBalanceQuery, [fromAddress, initialBalance, fromAddress], (err) => {
              if (err) reject(err);
              else resolve();
            });
          } else resolve();
        });
      });

      bot.sendMessage(chatId, `🤖 Starting 24/7 auto-trading bot...\n💰 Current balance: ${initialBalance} SOL\n📍 Copy trading target: ${targetWallet}`);

      // Start all trading loops
      Promise.all([
        copyTrade(targetWallet) // Pass the dynamic wallet address
      ]).catch(err => {
        console.error('Error in trading loops:', err);
        isAutoTrading = false;
      });

    } catch (error) {
      console.error('Error starting auto-trade:', error);
      isAutoTrading = false;
      bot.sendMessage(chatId, '❌ Failed to start auto-trading');
    }
  });
});

// Updated copyTrade function to accept a dynamic target wallet
async function copyTrade(targetWallet) {
  TARGET_WALLET = targetWallet;
  try {
    bot.sendMessage(chatId, `🤖 Starting copy trading for wallet: ${targetWallet}`);
    const targetPublicKey = new PublicKey(targetWallet);

    // Subscription with rate-limited polling instead of onAccountChange
    let lastProcessedSlot = 0;
    while (isAutoTrading) {
      try {
        const latestSlot = await connection.getSlot('confirmed');
        if (latestSlot > lastProcessedSlot) {
          await processTargetWalletTransactions(targetPublicKey);
          lastProcessedSlot = latestSlot;
        }
      } catch (error) {
        if (error.code === 429) {
          console.warn('Rate limit hit, backing off...');
          await sleep(10000); // Wait 10 seconds before retrying
        } else {
          console.error('Error in copyTrade loop:', error);
          bot.sendMessage(chatId, `⚠️ Copy trading error: ${error.message}`);
          await sleep(5000);
        }
      }
      await sleep(30000); // Poll every 30 seconds to reduce load
    }

    bot.sendMessage(chatId, '🛑 Copy trading stopped');
  } catch (error) {
    console.error('❌ Error starting copyTrade:', error);
    bot.sendMessage(chatId, `❌ Copy trading failed to start: ${error.message}`);
  }
}


async function swapTokens(amount, outputToken, intraday, isSell = false, slippageBps = SLIPPAGE) {
  const action = isSell ? "Selling" : "Buying";
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      bot.sendMessage(chatId, `🔄 ${action} token... Attempt ${attempt}/${maxRetries}`);

      // Step 1: Fetch the quote
      const quoteUrl = isSell
        ? `https://api.jup.ag/swap/v1/quote?inputMint=${outputToken}&outputMint=${INPUT_TOKEN}&amount=${amount}&slippageBps=${slippageBps}`
        : `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${outputToken}&amount=${amount}&slippageBps=${slippageBps}`;
      const quoteResponse = await fetch(quoteUrl);
      const quote = await quoteResponse.json();
      if (quote.error) {
        throw new Error(`Quote error: ${quote.error}`);
      }

      // Step 2: Fetch a fresh blockhash and set high priority fee
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      const priorityFee = 250000; // 0.00025 SOL, adjust based on network conditions

      // Step 3: Create the swap transaction with minimal delay
      const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPublicKey: fromAddress,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: priorityFee, // Higher fee for faster confirmation
          quoteResponse: quote,
        }),
      });
      const swapData = await swapResponse.json();
      if (!swapData?.swapTransaction) throw new Error('Failed to get swap transaction');

      // Step 4: Deserialize, update blockhash, and sign immediately
      const transaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
      transaction.recentBlockhash = blockhash; // Ensure freshest blockhash
      transaction.sign([keypair]);

      // Step 5: Send transaction with aggressive confirmation settings
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        maxRetries: 10, // More retries for robustness
        skipPreflight: false, // Validate before sending
        preflightCommitment: 'processed', // Faster preflight check
      });
      console.log(`Signature: ${signature}`);

      // Step 6: Confirm transaction with a tighter timeout
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed', // Use 'confirmed' instead of 'finalized' for faster feedback
        { timeout: 20000 } // 20-second timeout
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Handle success
      let tradeProfit = 0;
      if (isSell) {
        const sellValue = (amount * intraday.recommendation.priceUsd) / 1e9;
        const buyValue = (amount * intraday.recommendation.buy_price) / 1e9;
        tradeProfit = sellValue - buyValue - 0.01;
        totalProfit += tradeProfit;
      }

      const message = isSell
        ? `✅ ${action} successful! Tx: https://solscan.io/tx/${signature}\n` +
          `Token: ${intraday.recommendation.token}\n` +
          `Symbol: ${intraday.recommendation.symbol}\n` +
          `Address: ${intraday.recommendation.address}\n` +
          `Profit/Loss: ${intraday.recommendation.profit_loss_percent}%\n` +
          `Balance: ${await checkBalance()} SOL`
        : `✅ ${action} successful! Tx: https://solscan.io/tx/${signature}\n` +
          `Token: ${intraday.recommendation.token}\n` +
          `Symbol: ${intraday.recommendation.symbol}\n` +
          `Address: ${intraday.recommendation.address}\n` +
          `Invested: ${intraday.recommendation.investPercentage}% (${intraday.recommendation.investAmount} SOL)\n` +
          `Price: ${intraday.recommendation.priceUsd} USD\n` +
          `Balance: ${await checkBalance()} SOL`;

      bot.sendMessage(chatId, message);

      if (!isSell) {
        const sql = "INSERT INTO transactions (name, address, amount, hash, buy_price, wallet_address) VALUES (?, ?, ?, ?, ?, ?)";
        const values = [
          intraday.recommendation.token,
          intraday.recommendation.address,
          amount,
          signature,
          intraday.recommendation.priceUsd,
          fromAddress,
        ];
        await new Promise((resolve, reject) => {
          db.query(sql, values, (err, result) => (err ? reject(err) : resolve(result)));
        });
      }

      return signature; // Success
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed during ${action}:`, error.message);
      if (attempt === maxRetries) {
        bot.sendMessage(chatId, `❌ ${action} failed after ${maxRetries} attempts: ${error.message}`);
        throw error;
      }
      if (error.message.includes('block height exceeded')) {
        console.warn('Block height exceeded, retrying with fresh blockhash...');
      } else if (error.message.includes('insufficient')) {
        bot.sendMessage(chatId, `❌ ${action} failed: Insufficient funds or liquidity`);
        break;
      }
      await sleep(1000 * attempt); // Shorter backoff: 1s, 2s, 3s
    }
  }
}


  // ✅ Telegram Bot Ready
  bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
  bot.sendMessage(chatId, '🤖 Bot is online! Send /start to start a swap.');

