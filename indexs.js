require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');
// const axios = require("axios");

// ✅ Constants & Configuration
const API_HOST = 'https://gmgn.ai';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const chatId = process.env.CHAT_ID;
// const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=SOL'; // Update if needed
const dex = 'https://api.dexscreener.com/token-boosts/top/v1'

// ✅ Swap Parameters
const INPUT_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
const SLIPPAGE = 1;

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

  console.log("tokenAccounts =====>>",tokenAccounts.value)

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
      // console.error("❌ Error fetching response:", error);
      return null;
    }
  }


  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Modify getTrendingTokens to include Solana addresses
async function getTrendingTokens() {
  try {
    const response = await fetch(dex);
    const data = await response.json();
    data.forEach(async (element,index) => {
      await sleep(index * 1000);
      try {
          const responses = await fetch(`https://api.dexscreener.com/tokens/v1/${element.chainId}/${element.tokenAddress}`);
          const tokenData = await responses.json();
          
          // Get trading recommendation
          const intraday = await getGrokResponse(tokenData);
          const balance = await checkBalance();
  
          if (balance <= 0) {
              bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
              return;
          }
  
          if (intraday.recommendation.action === 'BUY') {
              // console.log("🤖 Grok 3 says:", intraday);
  
              bot.sendMessage(chatId, `
                🎯 Best Trading Opportunity Found:
                Token: ${intraday.recommendation.token}
                Address: ${intraday.recommendation.address}
                Symbol: ${intraday.recommendation.symbol}
  
                🔄 Automatically trading 25% of your balance...`);
  
              // Automatically calculate 25% of the balance and swap
              const tradeAmount = 0.00001; // 25% of balance in lamports
  
              if (tradeAmount <= 0) {
                  bot.sendMessage(chatId, '❌ Trade amount is too low.');
                  return;
              }
  
              bot.sendMessage(chatId, `💸 ${tradeAmount},Trading ${tradeAmount /100000000} SOL...`);
              console.log("o_token", intraday.recommendation.address);
  
             await swapTokens(tradeAmount* 1000000000, intraday.recommendation.address);
          }
  
      } catch (error) {
          // console.error("Error fetching token data:", error);
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
      
      const o_token = await getTrendingTokens()
      // console.log("o_token ====>>>",o_token);
      return

  } catch (error) {
      console.error('Error in trade command:', error);
      bot.sendMessage(chatId, '❌ Error analyzing market opportunities');
  }
});

async function sellToken(fromAddress, tokenIn, tokenOut, amounts, slippage, buyPrice, chatId) {
  try {
      bot.sendMessage(chatId, '🔄 Processing sale... Fetching swap details.');

     const jupiterRouteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${tokenIn}&outputMint=${tokenOut}&amount=${amounts}&slippageBps=${slippage}&restrictIntermediateTokens=true`;

      const jupiterResponse = await fetch(jupiterRouteUrl);
      const route = await jupiterResponse.json();
      // console.log('🔄 Jupiter Swap Route:', routes);

      console.log('📥 Swap Route:', route);

      if (!route) {
          throw new Error('Invalid Swap Transaction Data');
      }

      
      const swapUrl = `https://api.jup.ag/swap/v1/swap`;
      const swapResponse = await fetch(swapUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              userPublicKey: fromAddress, 
              wrapAndUnwrapSol: true,
              computeUnitPriceMicroLamports: 5000,
              quoteResponse: route // The JSON response you got from Jupiter quote API
          })
      });
      const swapData = await swapResponse.json();
      
      if (!swapData || !swapData.swapTransaction) {
          throw new Error('Failed to get swap transaction from Jupiter.');
      }
      
      const transactionBase64 = swapData.swapTransaction
      const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
      console.log(transaction);
      
      // transaction.sign([fromAddress]);
      transaction.sign([keypair]);
      
      const transactionBinary = transaction.serialize();
      console.log(transactionBinary);


      const signature = await connection.sendRawTransaction(transactionBinary, {
        maxRetries: 2,
        skipPreflight: true
    });

    const confirmation = await connection.confirmTransaction({signature,}, "finalized");
    bot.sendMessage(chatId, `🚀 Sending sell transaction... ${confirmation} signature: ${signature}`);
    if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
    } else console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);


      
  } catch (error) {
      console.error('❌ Error during token sale:', error.message);
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
      return { success: false };
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
const tokenIn = "47b3pp5G7ZQJ15U1nEgRmorUfVTwrotgsFeyfdhgpump"; // Token to sell
const tokenOut = "So11111111111111111111111111111111111111112"; // Token to receive (SOL)
const amounts = 24.76569 * 1e9; // Convert to lamports (adjust for token decimals)
const slippage = 2; // 1% slippage



async function getGrokSellResponse(tokenData) {
  try {
    const completion = await client.chat.completions.create({
      model: "grok-2-latest", // Updated to Grok 3 (hypothetical)
      messages: [
        {
          role: "system",
          content: "You are Grok 3, a crypto trading analyst built by xAI, optimized for short-term trading insights with real-time data analysis."
        },
        {
          role: "user",
          content: `
            As Grok 3, built by xAI, you’re an expert crypto trading analyst deciding whether to sell a token for profit or to exit if the market might drop 10-20% soon, as of March 06, 2025. Analyze these tokens from DEXscreener data:
            ${JSON.stringify(tokenData, null, 2)}
            
            Evaluate each token based on:
            1. **Short-Term Momentum**: Check priceChange in m12 (+12 min), m10 (if available), and h1 (+1 hour); flag drops below -5% in m5 or -10% in h1 as potential sell signals.
            2. **Profit Potential**: Favor selling if priceChange h1 > +10% (profit-taking) unless momentum remains strongly positive.
            3. **Recent Volume**: Assess volume trends (m5 > $500, h1 > $5k); declining volume with negative momentum suggests a sell.
            4. **Liquidity**: Ensure USD liquidity > $5,000 to execute trades effectively.
            5. **Sentiment**: Use X/web tools to detect bearish signals or fading hype in the last hour (e.g., panic selling, bad news).
            
            Rules:
            - Sell if short-term metrics suggest a 10-20% drop is likely (e.g., sharp m12/h1 decline + low volume).
            - Sell for profit if h1 gains > +10% and momentum slows (e.g., volume drops or m5 turns negative).
            - Hold if momentum is stable/positive and no red flags appear.
            - Filter out spam (e.g., liquidity < $5k, h1 volume < $5k).
            - No price forecasts; use current metrics and trends.
            
            Output in JSON:
            {
              "recommendation": {"token": "name", "symbol": "symbol", "address": "tokenAddress", "action": "SELL" | "HOLD"},
              "reasoning": "2-3 sentence explanation focusing on short-term metrics",
              "confidence": "0-1 score (e.g., 0.9 for strong SELL)"
            }
            Return the top token action or "HOLD" if no sell signals are clear.
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

// ✅ Wallet Balance Check
async function checkBalance() {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`✅ Wallet balance: ${balance / 1000000000} SOL`);
  return balance;
}



async function swapTokens(amount, OUTPUT_TOKEN) {
  try {
      bot.sendMessage(chatId, '🔄 Processing trade... Fetching swap details.');

      // Step 1: Fetch Swap Quote
      const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${INPUT_TOKEN}&outputMint=${OUTPUT_TOKEN}&amount=${amount}&slippageBps=${SLIPPAGE}`;
      console.log("quoteUrl:", quoteUrl);

      const quoteResponse = await fetch(quoteUrl);
      const quote = await quoteResponse.json();
      console.log('📥 Swap Quote:', quote);

      if (!quote || !quote.routePlan || quote.routePlan.length === 0) {
          throw new Error("No available route for the given token pair.");
      }

      // Step 2: Execute Swap Transaction using Jupiter `/swap`
      const swapUrl = `https://api.jup.ag/swap/v1/swap`;
      const swapResponse = await fetch(swapUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              userPublicKey: fromAddress,
              wrapAndUnwrapSol: true,
              computeUnitPriceMicroLamports: 5000,
              quoteResponse: quote // Send the entire quote response
          })
      });

      const swapData = await swapResponse.json();
      console.log("🔄 Swap Data:", swapData);

      if (!swapData || !swapData.swapTransaction) {
          throw new Error('Failed to get swap transaction from Jupiter.');
      }

      // Step 3: Deserialize, Sign, and Send Transaction
      const transactionBase64 = swapData.swapTransaction;
      const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
      console.log("🔄 Parsed Transaction:", transaction);

      // Sign transaction using your keypair
      transaction.sign([keypair]);

      const transactionBinary = transaction.serialize();
      console.log("🔄 Serialized Transaction:", transactionBinary);

      // Submit Transaction to Solana Network
      const signature = await connection.sendRawTransaction(transactionBinary, {
          maxRetries: 2,
          skipPreflight: true
      });

      // Step 4: Confirm Transaction
      const confirmation = await connection.confirmTransaction(signature, "finalized");
      console.log(`✅ Transaction successful: https://solscan.io/tx/${signature}/`);

      bot.sendMessage(chatId, `🚀 Transaction sent successfully! Tx Hash: ${signature}`);

      if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
      }

  } catch (error) {
      console.error("❌ Error during swap:", error.message);
      bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}


async function checkTransactionStatus(txid, maxRetries = 10, delayMs = 2000) {
  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const txStatus = await connection.getTransaction(txid, {
        commitment: 'confirmed',
      });

      if (txStatus && txStatus.meta) {
        if (txStatus.meta.err === null) {
          console.log(`✅ Transaction ${txid} confirmed!`);
          bot.sendMessage(chatId, `✅ Transaction ${txid} confirmed!`);
          return true;
        } else {
          console.log(`❌ Transaction ${txid} failed!`);
          bot.sendMessage(chatId, `❌ Transaction ${txid} failed!`);
          return false;
        }
      }

      console.log(`⏳ Checking transaction status... Attempt ${attempt + 1}/${maxRetries}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log(`⚠️ Transaction ${txid} not found or taking too long.`);
    bot.sendMessage(chatId, `⚠️ Transaction ${txid} not found or taking too long.`);
    return false;
  } catch (error) {
    console.error('❌ Error checking transaction status:', error.message);
    bot.sendMessage(chatId, `❌ Error checking transaction status: ${error.message}`);
    return false;
  }
}


// Add this function to handle automated trading
async function autoTradeLoop() {
  while (true) {
      try {
          // Check balance first
          const balance = await checkBalance();
          if (balance <= 0) {
              console.log('❌ Insufficient balance for trading');
              await sleep(60000); // Wait 1 minute before next check
              continue;
          }

          // Check for buy opportunities with timeout
          try {
            // if(balance > 0.0097)
            // await getTrendingTokensWithTimeout(80000); // 10 seconds timeout
          } catch (error) {
            console.error("❌ getTrendingTokens() failed:", error);
          }

          // Check for sell opportunities
          const tokens = await getPurchasedTokens(fromAddress);
            console.log("tokens  ===>>>",tokens)
          if (tokens.length > 0) {
            for (const element of tokens) {
                // await sleep(50000); // 1 second delay between tokens

                console.log("element", element);
                try {
                    const responses = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${element.mint}`);
                    const tokensData = await responses.json();
        
                    const sellForAnalysis = tokensData.map(token => ({
                        name: token.baseToken.address,
                        symbol: token.baseToken.symbol || "UNKNOWN",
                        address: token.baseToken.address,
                        priceChange: {
                            m5: token.priceChange?.m5 || 0,
                            h1: token.priceChange?.h1 || 0
                        },
                        volume: {
                            m5: token.volume?.m5 || 0,
                            h1: token.volume?.h1 || 0
                        },
                        liquidity: token.liquidity || 0,
                        balance: element.balance
                    }));
        
                    // console.log("sellForAnalysis", sellForAnalysis);
                    const grokResponse = await getGrokSellResponse(sellForAnalysis);
                    console.log("grokResponse ===>>>", grokResponse);  
                    // return
                    if (grokResponse && grokResponse.recommendation.action === "SELL") {
                        const { token, symbol, address } = grokResponse.recommendation;
                        const selectedToken = tokens.find(t => t.mint === address);
                        
                        if (selectedToken) {
                            // const amountToSell = Math.floor(Number(selectedToken.balance) * 0.999);
                            const amountToSell = Math.max(1, Math.floor(Number(selectedToken.balance) * 0.999));

                            
                            // Fetch the original buy price (store this when purchasing)
                            const buyPrice = selectedToken.buyPrice || 0; // Store this in DB when purchasing
            console.log("fromAddress, address, tokenOut, amountToSell, slippage, buyPrice,", fromAddress, address, tokenOut, amountToSell, slippage, buyPrice,)
                            const sellResult = await sellToken(fromAddress, address, tokenOut, amountToSell, slippage, buyPrice, chatId);
                            // let sellResult=null;
                            // console.log("sellResult", sellResult);
                            // bot.sendMessage(chatId, `⚠️ sellResult!  ${sellResult}`);

                            
                        }
                    }else {
                    console.log("grokResponse should be", grokResponse);

                    }
                } catch (error) {
                    console.error(`Error processing token ${element.mint}:`, error);
                }
                await sleep(1000); // 1 second delay between tokens
            }
        }
        
         else {
          bot.sendMessage(chatId, '❌ Noting for sell');

          }

          // Wait 5 minutes before next iteration
          // await sleep(300000);
      } catch (error) {
          console.error('Error in auto trade loop:', error);
          await sleep(1000); // Wait 1 minute on error
      }
  }
}

// Add a flag to track if auto-trading is running
let isAutoTrading = false;
let autoTradeInterval;

// Modify the start command handler
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
      
      // Start the auto-trading loop
      autoTradeLoop().catch(error => {
          console.error('Auto-trading loop error:', error);
          isAutoTrading = false;
          bot.sendMessage(chatId, '❌ Auto-trading stopped due to an error!');
      });

  } catch (error) {
      console.error('Error starting auto-trade:', error);
      isAutoTrading = false;
      bot.sendMessage(chatId, '❌ Failed to start auto-trading');
  }
});

// Add a stop command
bot.onText(/\/stop/, (msg) => {
  if (msg.chat.id.toString() !== chatId) {
      bot.sendMessage(msg.chat.id, '❌ Unauthorized!');
      return;
  }

  if (!isAutoTrading) {
      bot.sendMessage(chatId, '⚠️ Auto-trading is not running!');
      return;
  }

  isAutoTrading = false;
  bot.sendMessage(chatId, '🛑 Auto-trading stopped!');
});


// ✅ Telegram Bot Ready
bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
bot.sendMessage(chatId, '🤖 Bot is online! Send /trade to start a swap.');
