require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const {  Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createBurnInstruction } = require('@solana/spl-token');


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
// - ✅ **5m & 1h price change must be positive** (>+2% preferred).

// async function getGrokResponse(tokenData, userBalance) {
//   try {
//     const completion = await client.chat.completions.create({
//       model: "grok-2-latest",
//       messages: [
//         {
//           "role": "system",
//           "content": "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
//         },
//         {
//           "role": "user",
//           "content": `
//             **Trading Strategy**:
//             - Analyze trending tokens from DEXscreener and filter based on liquidity, momentum, safety, and taxes.
//             - Suggest an investment percentage (between 20-50% of available balance).
//             - Suggest a sell price based on a reasonable profit margin (e.g., 10-30%).
        
//             **User Balance**: ${userBalance} SOL
//             **Token Data**: ${JSON.stringify(tokenData, null, 2)}
        
//             **Evaluation Rules**:
//             1️⃣ **Liquidity & Market Safety**:
//                 - ✅ Must have **$10k+ USD liquidity** and **h1 volume > $10k**.
//                 - ❌ Reject if **liquidity < $10k** or **volume too low**.
        
//             2️⃣ **Momentum Analysis**:
//                 - ❌ Reject if **price drops > -20% in any timeframe**.
        
//             3️⃣ **Security & Tax Detection**:
//                 - ✅ Contract must be **at least 6 hours old** (check \`pairCreatedAt\` timestamp).
//                 - ❌ Reject if rug pull signs (e.g., sudden liquidity drop) or honeypot detected.
        
//             **Output JSON**:
//             {
//               "recommendation": {
//                 "token": "name",
//                 "symbol": "symbol",
//                 "address": "tokenAddress",
//                 "action": "BUY" | "PASS",
//                 "investPercentage": 20-50,  // % of balance to invest (dynamic)
//                 "sellPrice": "target price (e.g., 10-30% above current priceUsd)",
//                 "priceUsd": "current price in USD"
//               },
//               "reasoning": "Short explanation (include tax concerns if applicable)...",
//               "confidence": "0-1 score (e.g., 0.9 for strong BUY, 0.4 for PASS)"
//             }
        
//             **Important**:
//             - Return *only* a valid JSON object, with no additional text outside the JSON.
//             - If tax information is missing, check volume, liquidity, and market momentum.
//             - Use the current timestamp Today to calculate contract age from \`pairCreatedAt\`.
//           `
//         }        
        
//       ],
//       max_tokens: 300,
//       temperature: 0.6
//     });

//     // const rawContent = completion.choices[0].message.content.trim();
//     // console.log("raw response ===>>>", rawContent); // Debug raw output

//     // const response = await JSON.parse(rawContent);
//     // console.log("buy response send ====>>>>>>", response);

//     const rawContent = completion.choices[0].message.content.trim();
//     console.log("raw response ===>>>", rawContent); // Debug raw output

//     // Extract JSON from ```json ... ``` block
//     let jsonContent = rawContent;
//     const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
//     if (jsonMatch && jsonMatch[1]) {
//       jsonContent = jsonMatch[1].trim(); // Extract the JSON string inside the block
//     } else {
//       throw new Error("No valid JSON block found in response");
//     }

//     const response = JSON.parse(jsonContent); // Parse the extracted JSON
//     console.log("buy response send ====>>>>>>", response);

//     // Convert percentage to actual SOL investment
//     if (response.recommendation.action === "BUY") {
//       response.recommendation.investAmount = (userBalance * response.recommendation.investPercentage) / 100;
//     }

//     return response;
//   } catch (error) {
//     console.error("❌ Error fetching response:", error);
//     return null;
//   }
// }

async function getGrokResponse(tokenData, userBalance) {
  try {
    const completion = await client.chat.completions.create({
      model: "grok-2-latest",
      messages: [
        {
          "role": "system",
          "content": "You are Grok 2, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time and historical data analysis for maximizing profit."
        },
        {
          "role": "user",
          "content": `
            **Trading Strategy**:
            - Analyze trending tokens from DEXscreener and filter based on liquidity, momentum, safety, taxes, and historical performance.
            - Suggest an investment percentage (between 20-50% of available balance) based on risk-reward potential.
            - Suggest a sell price targeting a dynamic profit margin (15-50%) based on momentum and historical price action.
        
            **User Balance**: ${userBalance} SOL
            **Token Data**: ${JSON.stringify(tokenData, null, 2)}
        
            **Evaluation Rules**:
            1️⃣ **Liquidity & Market Safety**:
                - ✅ Must have **$15k+ USD liquidity** and **h1 volume > $20k**.
                - ❌ Reject if **liquidity < $15k** or **volume too low**.
        
            2️⃣ **Momentum & Historical Analysis**:
                - ✅ Favor tokens with **h6 price increase > 10%** or **h24 price increase > 20%**.
                - ❌ Reject if **price drops > -15% in any timeframe** or no upward momentum in last 24h.
                - Analyze historical data (e.g., h6, h12, h24 trends) to confirm consistent growth or breakout potential.
        
            3️⃣ **Security & Tax Detection**:
                - ✅ Contract must be **at least 6 hours old** (check \`pairCreatedAt\` timestamp).
                - ❌ Reject if rug pull signs (e.g., sudden liquidity drop > 50% in h24), honeypot detected, or **tax > 10%** (if tax data available).
        
            4️⃣ **Profit Optimization**:
                - Set sell price based on historical volatility and momentum:
                  - Low volatility (stable growth): Target **15-25% profit**.
                  - High volatility (strong momentum): Target **30-50% profit**.
                - Adjust investment percentage (20-50%) based on confidence and historical reliability.
        
            **Output JSON**:
            {
              "recommendation": {
                "token": "name",
                "symbol": "symbol",
                "address": "tokenAddress",
                "action": "BUY" | "PASS",
                "investPercentage": 20-50,  // % of balance to invest (dynamic)
                "sellPrice": "target price (e.g., 15-50% above current priceUsd)",
                "priceUsd": "current price in USD"
              },
              "reasoning": "Short explanation (include historical trends, tax concerns, and profit potential)...",
              "confidence": "0-1 score (e.g., 0.95 for strong BUY, 0.5 for PASS)"
            }
        
            **Important**:
            - Return *only* a valid JSON object, with no additional text outside the JSON.
            - If tax or historical data is missing, estimate based on volume, liquidity, and momentum.
            - Use the current timestamp (March 19, 2025) to calculate contract age from \`pairCreatedAt\`.
          `
        }
      ],
      max_tokens: 300,
      temperature: 0.6
    });

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



// async function getGrokSellResponse(tokenData) {
//   // console.log("data is coming ===>>>", tokenData);
//   try {
//     // Resolve the Promise if tokenData is an array containing a Promise
//     let resolvedData;
//     if (Array.isArray(tokenData) && tokenData[0] instanceof Promise) {
//       resolvedData = await tokenData[0]; // Await the first Promise in the array
//     } else {
//       resolvedData = tokenData; // Use as-is if not a Promise
//     }

//     const completion = await client.chat.completions.create({
//       model: "grok-2-latest",
//       messages: [
//         {
//           role: "system",
//           content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis, focusing on 2-10% profit after fees while minimizing premature exits."
//         },
//         {
//           role: "user",
//           content: `
//             As Grok 3, a crypto trading analyst built by xAI, you’re optimized for short-term trading insights with real-time data analysis. Today. Analyze the following token data from DEXscreener, including the current price (\`priceUsd\`) and my buy price (\`buy_price\`), to decide whether to sell for profit, sell on loss, or hold:
            
//             ${JSON.stringify(resolvedData, null, 2)}
            
//             Evaluate the token based on:
//             1. **Profit/Loss Calculation**: 
//                - Compare \`priceUsd\` (current price) with \`buy_price\`.
//                - Target a minimum 2% net profit after fees (e.g., 0.5% fee deducted); sell if profit ≥ 2%.
//                - Sell if loss ≥ -3% (i.e., \`priceUsd\` ≤ 97% of \`buy_price\`).
//             2. **Momentum**: 
//                - Use \`priceChange\` (m5: 5-min, h1: 1-hour); only consider momentum if profit < 2% and loss > -3%.
//             3. **Volume**: 
//                - Require \`volume.m5\` > $5000 and \`volume.h1\` > $5k; only consider volume if profit < 2% and loss > -3%.
//             4. **Liquidity**: 
//                - Filter out tokens with \`liquidity.usd\` < $5000; only consider liquidity if profit < 2% and loss > -3%.
            
//             Rules:
//             - **Sell for Profit**: Sell if profit ≥ 2% after fees, regardless of momentum, volume, or liquidity.
//             - **Sell on Loss**: Sell if loss ≥ -3% (i.e., \`priceUsd\` ≤ 97% of \`buy_price\`), regardless of momentum, volume, or liquidity.
//             - **Hold**: Default if profit < 2% and loss > -3%.
            
//             Output in JSON:
//             {
//               "recommendation": {
//                 "token": "name",
//                 "symbol": "symbol",
//                 "address": "address",
//                 "action": "SELL" | "HOLD",
//                 "profit_loss_percent": "calculated profit/loss % (e.g., +3.5% or -3.2%)"
//               },
//               "reasoning": "2-3 sentences on profit/loss, momentum, and volume/liquidity trends (only include momentum/volume/liquidity if HOLD)",
//               "confidence": "0-1 score (e.g., 0.8 for strong SELL, 0.7 for HOLD)"
//             }
            
//             Return the recommendation for the token; default to "HOLD" unless sell signals (profit ≥ 2% or loss ≥ -3%) are clear.
//           `
//         }
//       ],
//       max_tokens: 300,
//       temperature: 0.5
//     });

//     console.log("completion======>>>", completion.choices[0]);

//     let rawContent = completion.choices[0].message.content.trim();

//     // Extract JSON from the response (if wrapped in a code block)
//     let jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
//     if (jsonMatch) {
//       rawContent = jsonMatch[1].trim();
//     }

//     // Try to parse the JSON
//     try {
//       const response = JSON.parse(rawContent);
//       return response;
//     } catch (jsonError) {
//       console.warn("⚠ JSON parse failed:", jsonError.message);

//       // Fallback: Try to extract JSON from the response using a regex
//       const jsonRegex = /{[\s\S]*}/;
//       let possibleJsonMatch = rawContent.match(jsonRegex);
//       if (possibleJsonMatch) {
//         return JSON.parse(possibleJsonMatch[0]);
//       }

//       // If no valid JSON is found, throw an error
//       throw new Error("❌ No valid JSON found after multiple attempts.");
//     }
//   } catch (error) {
//     console.error("❌ Error fetching response:", error);
//     return null;
//   }
// }

async function getGrokSellResponse(tokenData) {
  try {
    // Resolve the Promise if tokenData is an array containing a Promise
    let resolvedData;
    if (Array.isArray(tokenData) && tokenData[0] instanceof Promise) {
      resolvedData = await tokenData[0]; // Await the first Promise in the array
    } else {
      resolvedData = tokenData; // Use as-is if not a Promise
    }

    const completion = await client.chat.completions.create({
      model: "grok-2-latest",
      messages: [
        {
          role: "system",
          content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time and historical data analysis, focusing on 2-10% profit after fees and proactive loss minimization."
        },
        {
          role: "user",
          content: `
            As Grok 3, a crypto trading analyst built by xAI, you’re optimized for short-term trading insights using real-time and historical data from DEXscreener. Today is March 19, 2025. Analyze the following token data, including the current price (\`priceUsd\`) and my buy price (\`buy_price\`), to decide whether to sell for profit, sell on loss, or hold:
            
            ${JSON.stringify(resolvedData, null, 2)}
            
            Evaluate the token based on:
            1. **Profit/Loss Calculation**: 
               - Compare \`priceUsd\` (current price) with \`buy_price\`.
               - Target a minimum 2% net profit after fees (e.g., 0.5% fee deducted); sell if profit ≥ 2%.
               - Sell if loss ≥ -2% (i.e., \`priceUsd\` ≤ 98% of \`buy_price\`) AND momentum is weak (see below).
            2. **Momentum & Historical Trends**: 
               - Check \`priceChange\` (m5: 5-min, h1: 1-hour, h6: 6-hour, h24: 24-hour).
               - Sell if profit < 2% and momentum weakens (e.g., h1 < 0% AND h6 < 5%) to avoid holding declining tokens.
               - Hold if h6 > 10% or h24 > 15% and profit < 2%, indicating potential for further growth.
            3. **Volume**: 
               - Require \`volume.m5\` > $5000 and \`volume.h1\` > $10k; sell if volume drops below these thresholds and momentum is weak.
            4. **Liquidity**: 
               - Filter out tokens with \`liquidity.usd\` < $10k; sell if liquidity falls below this AND momentum is weak.
            
            Rules:
            - **Sell for Profit**: Sell if profit ≥ 2% after fees, regardless of other factors.
            - **Sell on Loss**: 
               - Sell if loss ≥ -2% AND momentum is weak (e.g., h1 < 0% AND h6 < 5%) OR volume/liquidity is insufficient.
               - Escalate to sell if loss ≥ -5%, regardless of momentum, to minimize deeper losses (e.g., avoid -30% or -20%).
            - **Hold**: Default if profit < 2%, loss > -5%, and momentum remains strong (e.g., h6 > 10% or h24 > 15%).
            
            Output in JSON:
            {
              "recommendation": {
                "token": "name",
                "symbol": "symbol",
                "address": "address",
                "action": "SELL" | "HOLD",
                "profit_loss_percent": "calculated profit/loss % (e.g., +3.5% or -4.2%)"
              },
              "reasoning": "2-3 sentences on profit/loss, historical momentum, and volume/liquidity trends",
              "confidence": "0-1 score (e.g., 0.9 for strong SELL, 0.7 for HOLD)"
            }
            
            Return the recommendation for the token; prioritize faster exits if momentum weakens to avoid large losses.
          `
        }
      ],
      max_tokens: 300,
      temperature: 0.5
    });

    console.log("completion======>>>", completion.choices[0]);

    let rawContent = completion.choices[0].message.content.trim();

    // Extract JSON from the response (if wrapped in a code block)
    let jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      rawContent = jsonMatch[1].trim();
    }

    // Try to parse the JSON
    try {
      const response = JSON.parse(rawContent);
      return response;
    } catch (jsonError) {
      console.warn("⚠ JSON parse failed:", jsonError.message);

      // Fallback: Try to extract JSON from the response using a regex
      const jsonRegex = /{[\s\S]*}/;
      let possibleJsonMatch = rawContent.match(jsonRegex);
      if (possibleJsonMatch) {
        return JSON.parse(possibleJsonMatch[0]);
      }

      // If no valid JSON is found, throw an error
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
console.log("slippageBps =>>>>",slippageBps);
  try {
    bot.sendMessage(chatId, `🔄 ${action} token... Fetching swap details`);

    // Step 1: Fetch the quote
    const quoteUrl = isSell
      ? `https://api.jup.ag/swap/v1/quote?inputMint=${outputToken}&outputMint=${INPUT_TOKEN}&amount=${amount}&slippageBps=${slippageBps}`
      : `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${outputToken}&amount=${amount}&slippageBps=${slippageBps}`;
    const quoteResponse = await fetch(quoteUrl);
    const quote = await quoteResponse.json();
    console.log("quote =>>>>", quote);
    if (quote.error) throw new Error("No swap route available");

    // Step 2: Fetch a fresh blockhash *before* creating the transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
    console.log("blockhash =>>>>", blockhash);

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
    console.log("swapResponse ====>>>>",swapResponse)
    const swapData = await swapResponse.json();
    if (!swapData?.swapTransaction) throw new Error('Failed to get swap transaction');

    // Step 4: Deserialize and sign the transaction
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
    transaction.sign([keypair]);
   console.log("transaction ====>>>",transaction)
    // Step 5: Send the transaction with retries and preflight
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      maxRetries: 5, // Increase retries
      skipPreflight: false, // Enable preflight to catch issues early
    });
    console.log("signature =>>>>", signature);
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
  return await swapTokens(amount, '8okk9j6vJdYg3Ev5eMUwDYzCNMaVGAUbTTJHWnN1pump', true, slippage);
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
    //  await new Promise(resolve => setTimeout(resolve, 1000));s
    autoSellLoop();
     // Add delay before next cycles
    //  await new Promise(resolve => setTimeout(resolve, 1000));
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


async function sellWithRetry(fromAddress, tokenAddress, tokenOut, amount, initialSlippage = 100, chatId, maxRetries = 3) {
  let slippage = initialSlippage;
  const failedTokens = new Set();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      bot.sendMessage(chatId, `🔄 Attempting to sell ${amount} of ${tokenAddress} (Attempt ${attempt}/${maxRetries}) with slippage ${slippage / 100}%`);
      // await burnToken(fromAddress, tokenAddress, amount, chatId);
  
      // Attempt to sell the token
      await sellToken(fromAddress, tokenAddress, tokenOut, amount, slippage, 0, chatId);
      bot.sendMessage(chatId, `✅ Sold ${amount} of ${tokenAddress} successfully!`);
      return; // Exit on success
    } catch (error) {
      console.error(`Sell attempt ${attempt} failed for ${tokenAddress}:`, error.message);

      if (error.message.includes("No swap route available") || error.message.includes("COULD_NOT_FIND_ANY_ROUTE")) {
        if (attempt === maxRetries) {
          // If all retries fail, burn the tokens
          await burnToken(fromAddress, tokenAddress, amount, chatId);

          failedTokens.add(tokenAddress);
          bot.sendMessage(chatId, `❌ Failed to sell ${tokenAddress} after ${maxRetries} attempts. Burning tokens...`);
          break;
        }

        // Increase slippage for the next attempt
        slippage = Math.min(initialSlippage + (attempt * 200), 1000); // Cap at 10%
        console.log(`Retrying with slippage ${slippage / 100}% (attempt ${attempt + 1}/${maxRetries})...`);
      } else {
        // Non-recoverable error (e.g., insufficient balance), stop retrying
        bot.sendMessage(chatId, `❌ Sell failed for ${tokenAddress}: ${error.message}`);
        break;
      }

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
          db.query("SELECT * FROM transactions", (error, results) => {
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

      const validTokens = tokens.filter(token => !failedTokens.has(token.mint));
      const checkStopInterval = setInterval(() => {
        if (!isAutoTrading && !stopRequestTime) {
          stopRequestTime = Date.now();
          console.log('Stop detected during token selling operations');
          bot.sendMessage(chatId, '🛑 Stopping sell operations...');
        }
      }, 2000);

      try {
        if (isAutoTrading && validTokens.length > 0) {
          for (const token of validTokens) {
            if (!isAutoTrading) break;

            try {
              const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${token.mint}`);
              const tokenData = await response.json();

              const result = await new Promise((resolve, reject) => {
                db.query(`SELECT * FROM transactions WHERE address = '${token.mint}'`, (err, res) => {
                  if (err) reject(err);
                  else resolve(res);
                });
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

              // if (grokResponse?.recommendation?.action === "SELL") {
              //   const fullAmount = Math.floor(Number(token.balance) * 0.999); // Sell 99.9% to avoid dust
              //   const failedFromSell = await sellWithRetry(
              //     fromAddress,
              //     grokResponse.recommendation.address,
              //     tokenOut,
              //     fullAmount,
              //     SLIPPAGE,
              //     chatId
              //   );

              //   if (failedFromSell.size === 0) {
              //     // Update database only after successful sale
              //     await db.query('DELETE FROM transactions WHERE address = ?', [token.mint]);
              //     bot.sendMessage(chatId, `💰 Sold full amount of ${grokResponse.recommendation.symbol} (${fullAmount})`);
              //   } else {
              //     failedTokens.add(token.mint);
              //   }
              // }

              if (grokResponse?.recommendation?.action === "SELL") {
                const fullAmount = Math.floor(Number(token.balance) * 0.999);
                // console.log(`Calling sellWithRetry for ${token.mint} with amount ${fullAmount}`);
                const failedFromSell = await sellWithRetry(
                  fromAddress,
                  grokResponse.recommendation.address,
                  tokenOut,
                  fullAmount,
                  SLIPPAGE,
                  chatId
                );
                if (failedFromSell.holding_amount === 0) {
                  await db.query('DELETE FROM transactions WHERE address = ?', [token.mint]);
                  bot.sendMessage(chatId, `💰 Sold full amount of ${grokResponse.recommendation.symbol} (${fullAmount})`);
                } else {
                  failedTokens.add(token.mint);
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
  }

  console.log('Sell loop has stopped');
  bot.sendMessage(chatId, '✅ Sell loop has stopped completely');
}


async function burnToken(fromAddress, tokenAddress, amount, chatId) {
  try {
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const payer = keypair; // Use your Keypair
    const tokenMintPublicKey = new PublicKey(tokenAddress);

    // Get the associated token account
    const tokenAccountPublicKey = await getAssociatedTokenAddress(
      tokenMintPublicKey,
      payer.publicKey
    );

    // Create burn instruction
    const burnInstruction = createBurnInstruction(
      tokenAccountPublicKey, // Token account to burn from
      tokenMintPublicKey,   // Mint address of the token
      payer.publicKey,      // Owner of the token account
      BigInt(amount)        // Amount to burn (raw units)
    );

    // Create transaction
    const transaction = new Transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.add(burnInstruction);

    // Sign and send
    transaction.sign(payer);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "finalized");
    bot.sendMessage(chatId, `🔥 Successfully burned ${amount} of ${tokenAddress}. Tx: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error(`❌ Failed to burn ${tokenAddress}:`, error);
    bot.sendMessage(chatId, `❌ Failed to burn ${amount} of ${tokenAddress}: ${error.message}`);
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

