require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');
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
                          "sellPrice": 1.10        // Target price (10% profit)
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


//   function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

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

// Modify getTrendingTokens to include Solana addresses
// async function getTrendingTokens() {
//   try {
//     await sleep(20000)
//     console.log("getTrendingTokens chalu")
//      // Step 1: Fetch trending tokens
//      const trendingResponse = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
//      const trendingData = await trendingResponse.json();
//       // console.log("trendingData check =>>>>",trendingData);
//      if (!trendingData || !trendingData || trendingData.length === 0) {
//          bot.sendMessage(chatId, "❌ No trending tokens found!");
//          return;
//      }

//      let bestTokens = [];


//      if (trendingData.length === 0) {
//          bot.sendMessage(chatId, "❌ No safe trading opportunities found.");
//          return;
//      }

//      // Step 4: Pick the best token and execute trade
//     //  const bestTrade = bestTokens[0];
//     trendingData.forEach(async (element,index) => {
//       await sleep(index * 1000);
//       try {
//           const responses = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
//           const tokenData = await responses.json();
//           // console.log("finl tokenData",tokenData)
      
//                    // Step 3: Run safety checks (filter out scams)
//                    for(const data of tokenData){
//                    if (isSafeToken(data)) {
//                     //  console.log("isSafeToken true",data);
//                        bestTokens.push(data);
//                    }}
              

//           // Get trading recommendation
//           const balance = await checkBalance();
//           if (balance <= 0.0001) {
//             bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
//             return;
//         }
//         console.log("bestTokens,balance ",bestTokens,balance)
//         // return
//           const intraday = await getGrokResponse(bestTokens,balance);
//           console.log("intraday ========>>",intraday);
//           if(intraday == null){
//             bot.sendMessage(chatId, '❌ no token');
//             return;
//           }
//           if (balance <= 0) {
//               bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
//               return;
//           }
//           if(intraday.confidence >= '0.8'){
//           if (intraday.recommendation.action === 'BUY') {
//               // console.log("🤖 Grok 3 says:", intraday);
  
//               bot.sendMessage(chatId, `
//                 🎯 Best Trading Opportunity Found:
//                 Token: ${intraday.recommendation.token}
//                 Address: ${intraday.recommendation.address}
//                 Symbol: ${intraday.recommendation.symbol}
//                 confidence: ${intraday.confidence}

  
//                 🔄 Automatically trading 25% of your balance...`);
  
//               // Automatically calculate 25% of the balance and swap
//               const tradeAmount = (balance / intraday.recommendation.investPercentage) * 100; // 25% of balance in lamports
  
//               if (tradeAmount <= 0) {
//                   bot.sendMessage(chatId, '❌ Trade amount is too low.');
//                   return;
//               }
  
//               bot.sendMessage( `💸 ${tradeAmount},Trading ${tradeAmount /100000000} SOL...`);
//               console.log("o_token", intraday.recommendation.address,tradeAmount);
  
//              await swapTokens(Math.round(tradeAmount* 1000000000), intraday.recommendation.address);
//           }
//         }else{
//           bot.sendMessage( '❌ confidence  low !');
//           return;
//         }
  
//       } catch (error) {
//           console.error("Error fetching token data:", error);
//       }
//   });
  
//   } catch (error) {
//       console.error('❌ Error fetching trending tokens:', error);
//       return [];
//   }
// }

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
    if (balance <= 0.001) {
      bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
      return [];
    }

    for (const [index, element] of solanaTokens.entries()) {
      await sleep(index * 1000); // Staggered delay to avoid rate limits
      try {
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
        const tokenData = await response.json();
       
        // const finalData= tokenData.filter(t => 
        //   t.liquidity.usd >= filters.minLiquidity &&
        //   t.volume.h1 >= filters.minVolumeH1 &&
        //   (Date.now() - t.createdAt) / 3600000 >= filters.minAgeHours
        // );
        // console.log("tokenData",finalData);

        for (const data of tokenData) {
          if (await isSafeToken(data)) {
            bestTokens.push(data);
          }
        }

        if (bestTokens.length > 0) {
          const intraday = await getGrokResponse(bestTokens, balance);
          if (!intraday) {
            bot.sendMessage(chatId, '❌ No trading recommendation available');
            continue;
          }

          console.log("Intraday Recommendation:", intraday);
          if (intraday.confidence >= 0.8 && intraday.recommendation.action === 'BUY') {
            bot.sendMessage(chatId, `
              🎯 Best Trading Opportunity:
              Token: ${intraday.recommendation.token}
              Address: ${intraday.recommendation.address}
              Symbol: ${intraday.recommendation.symbol}
              Confidence: ${intraday.confidence}
              🔄 Trading ${intraday.recommendation.investPercentage}% of balance...
            `);

            const tradeAmount = intraday.recommendation.investAmount * 1e9; // Convert SOL to lamports
            await swapTokens(Math.round(tradeAmount), intraday.recommendation.address);
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

// Modify your trade command to use dynamic token selection
bot.onText(/\/trade/, async (msg) => {
  if (msg.chat.id.toString() !== chatId) {
      bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
      return;
  }

  try {
      bot.sendMessage(chatId, '🔍 Analyzing market for best trading opportunity...');
      
      const o_token = await getTrendingTokens()
      // console.log("o_token ====>>>",o_token);
      return

  } catch (error) {
      console.error('Error in trade command:', error);
      bot.sendMessage(chatId, '❌ Error analyzing market opportunities');
  }
});

// async function sellToken(fromAddress, tokenIn, tokenOut, amounts, slippage, buyPrice, chatId) {
//   try {
//       bot.sendMessage(chatId, '🔄 Processing sale... Fetching swap details.');

//      const jupiterRouteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${tokenIn}&outputMint=${tokenOut}&amount=${amounts}&slippageBps=${slippage}&restrictIntermediateTokens=true`;

//       const jupiterResponse = await fetch(jupiterRouteUrl);
//       const route = await jupiterResponse.json();
//       // console.log('🔄 Jupiter Swap Route:', routes);

//       console.log('📥 Swap Route:', route);

//       if (!route) {
//           throw new Error('Invalid Swap Transaction Data');
//       }

      
//       const swapUrl = `https://api.jup.ag/swap/v1/swap`;
//       const swapResponse = await fetch(swapUrl, {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({
//               userPublicKey: fromAddress, 
//               wrapAndUnwrapSol: true,
//               computeUnitPriceMicroLamports: 5000,
//               quoteResponse: route // The JSON response you got from Jupiter quote API
//           })
//       });
//       const swapData = await swapResponse.json();
      
//       if (!swapData || !swapData.swapTransaction) {
//           throw new Error('Failed to get swap transaction from Jupiter.');
//       }
      
//       const transactionBase64 = swapData.swapTransaction
//       const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
//       console.log("transaction",transaction);
      
//       // transaction.sign([fromAddress]);
//       transaction.sign([keypair]);
      
//       const transactionBinary = transaction.serialize();
//       console.log("transactionBinary",transactionBinary);


//       const signature = await connection.sendRawTransaction(transactionBinary, {
//         maxRetries: 2,
//         skipPreflight: true
//     });

//     const confirmation = await connection.confirmTransaction({signature,}, "finalized");
//     bot.sendMessage(chatId, `🚀 Sending sell transaction... ${confirmation} signature: ${signature}`);
//     if (confirmation.value.err) {
//         throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
//     } else console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);


      
//   } catch (error) {
//       console.error('❌ Error during token sale:', error.message);
//       bot.sendMessage(chatId, `❌ Error: ${error.message}`);
//       return { success: false };
//   }
// }

// Example usage
// const fromAddress = "27pKwDJuuzVN9Gd7vqRBA8zAhgnBU5tHJboE4m2b9vaF"; // Your Phantom wallet address
const tokenIn = "47b3pp5G7ZQJ15U1nEgRmorUfVTwrotgsFeyfdhgpump"; // Token to sell
const tokenOut = "So11111111111111111111111111111111111111112"; // Token to receive (SOL)
const amounts = 24.76569 * 1e9; // Convert to lamports (adjust for token decimals)
const slippage = 2; // 1% slippage



// async function getGrokSellResponse(tokenData) {
//   try {
//     const completion = await client.chat.completions.create({
//       model: "grok-2-latest", // Updated to Grok 3 (hypothetical)
//       messages: [
//         {
//           role: "system",
//           content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
//         },
//         {
//           role: "user",
//           content: `
//             As Grok 3, built by xAI, you’re an expert crypto trading analyst deciding whether to sell a token for profit or to exit if the market might drop 10-20% soon, as of March 06, 2025. Analyze these tokens from DEXscreener data:
//             ${JSON.stringify(tokenData, null, 2)}
            
//             Evaluate each token based on:
//             1. **Short-Term Momentum**: Check priceChange in m12 (+12 min), m10 (if available), and h1 (+1 hour); flag drops below -5% in m5 or -10% in h1 as potential sell signals.
//             2. **Profit Potential**: Favor selling if priceChange h1 > +10% (profit-taking) unless momentum remains strongly positive.
//             3. **Recent Volume**: Assess volume trends (m5 > $500, h1 > $5k); declining volume with negative momentum suggests a sell.
//             4. **Liquidity**: Ensure USD liquidity > $5,000 to execute trades effectively.
//             5. **Sentiment**: Use X/web tools to detect bearish signals or fading hype in the last hour (e.g., panic selling, bad news).
            
//             Rules:
//             - Sell if short-term metrics suggest a 10-20% drop is likely (e.g., sharp m12/h1 decline + low volume).
//             - Sell for profit if h1 gains > +10% and momentum slows (e.g., volume drops or m5 turns negative).
//             - Hold if momentum is stable/positive and no red flags appear.
//             - Filter out spam (e.g., liquidity < $5k, h1 volume < $5k).
//             - No price forecasts; use current metrics and trends.
            
//             Output in JSON:
//             {
//               "recommendation": {"token": "name", "symbol": "symbol", "address": "tokenAddress", "action": "SELL" | "HOLD"},
//               "reasoning": "2-3 sentence explanation focusing on short-term metrics",
//               "confidence": "0-1 score (e.g., 0.9 for strong SELL)"
//             }
//             Return the top token action or "HOLD" if no sell signals are clear.
//           `
//         }
//       ],
//       max_tokens: 300, // Shorter response for quick analysis
//       temperature: 0.6 // Slightly more deterministic for trading precision
//     });
//     const response = JSON.parse(completion.choices[0].message.content);
//     // console.log("🤖 Grok 3 says:", response);
//     return response;
//   } catch (error) {
//     console.error("❌ Error fetching response:", error);
//     return null;
//   }
// }

// ✅ Wallet Balance Check

async function getGrokSellResponse(tokenData) {
  try {
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
            As Grok 3, built by xAI, you’re an expert crypto trading analyst deciding whether to sell a token for profit or hold, exiting only if a 5% drop is imminent, as of March 12, 2025. Analyze these tokens from DEXscreener data:
            ${JSON.stringify(tokenData, null, 2)}

              Evaluate each token based on:
              1. **Momentum**: Use priceChange (m5: +5 min, m12: +10 min, h1: +1 hour); sell if m5 < -5% *and* h1 < -10% with declining volume, hold if m5 or m12 > +2%.
              2. **Profit Taking**: Sell if h1 > +10%, m5 stalls (< +1%), and volume drops >15% (target 2-10% net profit after fees); hold if m12 > +3% and volume suggests upside.
              3. **Volume**: Require m5 volume > $500, h1 > $5k; sell if volume falls >25% with negative price action.
              4. **Liquidity**: Filter out tokens with USD liquidity < $5,000.

              Rules:
              - **Sell for Profit**: Deduct fees, target 2-10% net gain, sell if momentum slows after h1 > +10%.
              - **Sell on Drop**: Exit if m5 < -5% *and* h1 < -10% with volume declining.
              - **Hold**: Default if m5 or m12 > +2%, volume supports price, or upside persists (m12 > +5%).
              - Filter low-quality tokens (liquidity < $5k, h1 volume < $5k).

              Output in JSON:
              {
                "recommendation": {"token": "name", "symbol": "symbol", "address": "tokenAddress", "action": "SELL" | "HOLD"},
                "reasoning": "2-3 sentences on momentum, profit potential, and volume trends",
                "confidence": "0-1 score (e.g., 0.8 for strong SELL, 0.65 for HOLD)"
              }
              Return the top token action; default to "HOLD" unless sell signals are clear.
           `
        }
      ],
      max_tokens: 300,
      temperature: 0.5
    });
    const response = JSON.parse(completion.choices[0].message.content);
    return response;
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



// async function swapTokens(amount, OUTPUT_TOKEN) {
//   try {
    
//       bot.sendMessage(chatId, '🔄 Processing trade... Fetching swap details.',amount);

//       // Step 1: Fetch Swap Quote
//       const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${OUTPUT_TOKEN}&amount=${amount}&slippageBps=${SLIPPAGE}`;
//       console.log("quoteUrl:", quoteUrl);

//       const quoteResponse = await fetch(quoteUrl);
//       const quote = await quoteResponse.json();
//       console.log('📥 Swap Quote:', quote);

//       if (!quote || !quote.routePlan || quote.routePlan.length === 0) {
//           throw new Error("No available route for the given token pair.");
//       }

//       // Step 2: Execute Swap Transaction using Jupiter `/swap`
//       const swapUrl = `https://api.jup.ag/swap/v1/swap`;
//       const swapResponse = await fetch(swapUrl, {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({
//               userPublicKey: fromAddress,
//               wrapAndUnwrapSol: true,
//               computeUnitPriceMicroLamports: 5000,
//               quoteResponse: quote // Send the entire quote response
//           })
//       });

//       const swapData = await swapResponse.json();
//       console.log("🔄 Swap Data:", swapData);

//       if (!swapData || !swapData.swapTransaction) {
//           throw new Error('Failed to get swap transaction from Jupiter.');
//       }

//       // Step 3: Deserialize, Sign, and Send Transaction
//       const transactionBase64 = swapData.swapTransaction;
//       const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
//       console.log("🔄 Parsed Transaction:", transaction);

//       // Sign transaction using your keypair
//       transaction.sign([keypair]);

//       const transactionBinary = transaction.serialize();
//       console.log("🔄 Serialized Transaction:", transactionBinary);

//       // Submit Transaction to Solana Network
//       const signature = await connection.sendRawTransaction(transactionBinary, {
//           maxRetries: 2,
//           skipPreflight: true
//       });

//       // Step 4: Confirm Transaction
//       const confirmation = await connection.confirmTransaction(signature, "finalized");
//       console.log(`✅ Transaction successful: https://solscan.io/tx/${signature}/`);

//       bot.sendMessage(chatId, `🚀 Transaction sent successfully! Tx Hash: ${signature}`);

//       if (confirmation.value.err) {
//           throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
//       }
//       await sleep(10000)
//   } catch (error) {
//       console.error("❌ Error during swap:", error.message);
//       bot.sendMessage(chatId, `❌ Error: ${error.message}`);
//   }
// }

// Add this function to handle automated trading

async function swapTokens(amount, outputToken, isSell = false, slippageBps = SLIPPAGE) {
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
    return signature;
  } catch (error) {
    console.error(`❌ Error during ${isSell ? 'sell' : 'swap'}:`, error.message);
    bot.sendMessage(chatId, `❌ ${action} failed: ${error.message}`);
    throw error;
  }
}

// Update sellToken to use swapTokens
async function sellToken(fromAddress, tokenIn, tokenOut, amount, slippage, buyPrice, chatId) {
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

// New improved implementations for autoBuyLoop and autoSellLoop

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
      
      const tokens = await getPurchasedTokens(fromAddress);
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
        // Process tokens only if we're still auto-trading
        if (isAutoTrading && validTokens.length > 0) {
          // Process tokens in series instead of parallel for better control
          for (const token of validTokens) {
            // Check if stop was requested before each token
            if (!isAutoTrading) break;
            
            try {
              const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${token.mint}`);
              const tokenData = await response.json();
              const sellData = tokenData.map(t => ({
                name: t.baseToken.name || "Unknown",
                symbol: t.baseToken.symbol || "UNKNOWN",
                address: t.baseToken.address,
                priceChange: { m5: t.priceChange?.m5 || 0, h1: t.priceChange?.h1 || 0 },
                volume: { m5: t.volume?.m5 || 0, h1: t.volume?.h1 || 0 },
                liquidity: t.liquidity || { usd: 0 },
                balance: token.balance
              }));

              // Check stop status before continuing
              if (!isAutoTrading) break;

              const grokResponse = await getGrokSellResponse(sellData);
              console.log("grokResponse ==>>",grokResponse)
              // Check stop status before continuing
              if (!isAutoTrading) break;
              
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
// Sell with retry logic
// async function sellWithRetry(fromAddress, tokenAddress, tokenOut, amount, initialSlippage, chatId, maxRetries = 3) {
//   let slippage = initialSlippage;
//   const failedTokens = new Set(); // Local blacklist for this session

//   for (let attempt = 1; attempt <= maxRetries; attempt++) {
//     try {
//       await sellToken(fromAddress, tokenAddress, tokenOut, amount, slippage, 0, chatId);
//       return; // Success, exit retry loop
//     } catch (error) {
//       console.error(`Sell attempt ${attempt} failed for ${tokenAddress}:`, error.message);
//       if (error.message === "No swap route available") {
//         // If no route is available, blacklist the token and exit early
//         failedTokens.add(tokenAddress);
//         bot.sendMessage(chatId, `❌ No swap route for ${tokenAddress}. Blacklisting token.`);
//         throw new Error(`Sell failed: No swap route available for ${tokenAddress}`);
//       }

//       if (attempt === maxRetries) {
//         bot.sendMessage(chatId, `❌ Failed to sell ${tokenAddress} after ${maxRetries} attempts`);
//         throw error; // Final failure
//       }

//       // Increase slippage dynamically (e.g., 2 → 52 → 102 bps, cap at 500 bps)
//       slippage = Math.min(initialSlippage + (attempt * 50), 500);
//       console.log(`Retrying sell with slippage ${slippage} (attempt ${attempt + 1}/${maxRetries})...`);
//       await sleep(5000 * attempt); // Exponential backoff: 5s, 10s, 15s
//     }
//   }
//   return failedTokens; // Return blacklist for use in autoSellLoop
// }

async function sellWithRetry(fromAddress, tokenAddress, tokenOut, amount, initialSlippage, chatId, maxRetries = 3) {
  let slippage = initialSlippage;
  const failedTokens = new Set(); // Local blacklist for this session

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sellToken(fromAddress, tokenAddress, tokenOut, amount, slippage, 0, chatId);
      return; // Success, exit retry loop
    } catch (error) {
      console.error(`Sell attempt ${attempt} failed for ${tokenAddress}:`, error.message);
      
      if (error.message === "No swap route available") {
        failedTokens.add(tokenAddress);
        // await burnToken(fromAddress, tokenAddress, amount, chatId);

        bot.sendMessage(chatId, `❌ No swap route for ${tokenAddress}. Blacklisting token.`);
        throw new Error(`Sell failed: No swap route available for ${tokenAddress}`);
      }

      if (attempt === maxRetries) {
        bot.sendMessage(chatId, `❌ Failed to sell ${tokenAddress} after ${maxRetries} attempts. Burning token...`);
        await burnToken(fromAddress, tokenAddress, amount, chatId);
        return; // Exit after burning
      }

      // Increase slippage dynamically (e.g., 2 → 52 → 102 bps, cap at 500 bps)
      slippage = Math.min(initialSlippage + (attempt * 50), 500);
      console.log(`Retrying sell with slippage ${slippage} (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(5000 * attempt); // Exponential backoff: 5s, 10s, 15s
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
bot.sendMessage(chatId, '🤖 Bot is online! Send /trade to start a swap.');
