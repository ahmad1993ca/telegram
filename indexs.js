// const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
// const fetch = require('node-fetch');
// const TelegramBot = require('node-telegram-bot-api');
// const bs58 = require('bs58');
// require('dotenv').config(); // Load environment variables
// // const OpenAI = require("openai");


// console.log("process.env.deepseek_token",process.env.CHAT_ID)

// // const openai = new OpenAI({
// //         baseURL: 'https://api.deepseek.com',
// //         apiKey: process.env.deepseek_token
// // });

// async function tradeAnalist(){

//   // const completion = await openai.chat.completions.create({
//   //   messages: [{ role: "system", content: "Today best trade , where is most of the people doing invest" }],
//   //   model: "deepseek-chat",
//   // });

//   const completion = await openai.chat.completions.create({
//     messages: [{ role: "system", content: "Today best trade , where is most of the people doing invest" }],
//     model: "gpt-3.5-turbo", // Use the correct model name
//   });
  
//   console.log(completion.choices[0].message.content);
// }




// // ✅ Load environment variables
// const API_HOST = 'https://gmgn.ai';
// const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// // ✅ Telegram Bot Configuration
// const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
// const chatId = process.env.CHAT_ID; // Your Telegram chat ID

// // ✅ Swap parameters
// const INPUT_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
// const OUTPUT_TOKEN = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs';

// const SLIPPAGE = 0.5;

// // ✅ Load private key securely


// const privateKey = process.env.PRIVATE_KEY;
// if (!privateKey) {
//   console.error('❌ PRIVATE_KEY not found!');
//   process.exit(1);
// }

// // ✅ Create wallet from private key
// const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
// const fromAddress = keypair.publicKey.toString();
// console.log(`✅ Wallet Address: ${fromAddress}`);

// // ✅ Connect to Solana network
// const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// // ✅ Utility function for delay
// const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// // ✅ Function to check balance
// async function checkBalance() {
//   // tradeAnalist();
//   const balance = await connection.getBalance(keypair.publicKey);
//   console.log(`✅ Wallet balance: ${balance / 1000000000} SOL`);
//   return balance;
// }

// // ✅ Function to check transaction status
// async function checkTransactionStatus(hash, lastValidBlockHeight) {
//   let attempts = 0;
//   const maxAttempts = 20; // Max attempts before giving up
//   const delayInterval = 5000; // 2 seconds delay between retries
//   // const { blockhash } = await connection.getLatestBlockhash();
//   // console.log("blockhash =====>>>",blockhash)

//   while (attempts < maxAttempts) {
//     attempts++;
//     console.log(`🔄 Checking transaction status attempt ${attempts}/${maxAttempts}...`);

//     const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
//      console.log("statusUrl ===>>",statusUrl);
//     const statusResponse = await fetch(statusUrl);
//     const status = await statusResponse.json();

//     console.log('🔄 Transaction Status:', status);

//     if (status?.data?.success === true) {
//       bot.sendMessage(chatId, '✅ Swap Completed Successfully! 🎉');
//       return true;
//     }

//     if (status?.data?.expired === true) {
//       bot.sendMessage(chatId, '⚠️ Swap Expired! Please try again.');
//       return false;
//     }

//     if (status?.data?.err) {
//       bot.sendMessage(chatId, `❌ Transaction failed: ${status.data.err}`);
//       console.error('Error Details:', status.data.err_details); // Log more details for debugging
//       return false;
//     }

//     if (status?.data?.err_code) {
//       bot.sendMessage(chatId, `❌ Error code: ${status.data.err_code}`);
//       console.error('Error Code:', status.data.err_code); // Log error code for debugging
//       return false;
//     }

//     if (attempts < maxAttempts) {
//       console.log(`⏳ Retrying in ${delayInterval / 1000} seconds...`);
//       await delay(delayInterval); // Wait before retrying
//     }
//   }

//   bot.sendMessage(chatId, '❌ Transaction failed after multiple attempts.');
//   return false;
// }

// // ✅ Function to execute token swap
// async function swapTokens(amount) {
//   try {
//     bot.sendMessage(chatId, '🔄 Processing trade... Fetching swap details.');

//     // Fetch Swap Quote
//     const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${INPUT_TOKEN}&token_out_address=${OUTPUT_TOKEN}&in_amount=${amount}&from_address=${fromAddress}&slippage=${SLIPPAGE}`;
//     const routeResponse = await fetch(quoteUrl);
//     const route = await routeResponse.json();
//     console.log('📥 Swap Route:', route);

//     if (!route.data?.raw_tx?.swapTransaction) {
//       throw new Error('Invalid Swap Transaction Data');
//     }

//     // Deserialize the Transaction
//     const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64');
//     const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

//     // Update recent blockhash
//     const { blockhash } = await connection.getLatestBlockhash();
//     transaction.message.recentBlockhash = blockhash;

//     // Sign the Transaction
//     transaction.sign([keypair]);
//     const signedTx = Buffer.from(transaction.serialize()).toString('base64');
//     console.log('✍️ Signed Transaction:', signedTx);

//     // Submit Signed Transaction
//     bot.sendMessage(chatId, '🚀 Sending transaction...');
//     const submitUrl = `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`;
//     const submitResponse = await fetch(submitUrl, {
//       method: 'POST',
//       headers: { 'content-type': 'application/json' },
//       body: JSON.stringify({ signed_tx: signedTx }),
//     });

//     const submitResult = await submitResponse.json();
//     console.log('🚀 Transaction Submitted:', submitResult);

//     if (!submitResult.data?.hash) {
//       throw new Error('Transaction submission failed!');
//     }

//     // Check Transaction Status
//     const { hash } = submitResult.data;
//     const { lastValidBlockHeight } = route.data.raw_tx;

//     bot.sendMessage(chatId, `📊 Transaction Submitted! Tx Hash: ${hash}`);

//     const success = await checkTransactionStatus(hash, lastValidBlockHeight);

//     if (!success) {
//       bot.sendMessage(chatId, '❌ Transaction did not succeed.');
//     }
//   } catch (error) {
//     console.error('❌ Error during swap:', error.message);
//     bot.sendMessage(chatId, `❌ Error: ${error.message}`);
//   }
// }
// // ✅ Telegram Command Handler
// bot.onText(/\/trade/, async (msg) => {
//   if (msg.chat.id.toString() !== chatId) {
//     bot.sendMessage(msg.chat.id, '❌ Unauthorized! You are not allowed to trade.');
//     return;
//   }

//   bot.sendMessage(chatId, '🔄 Checking wallet balance...');

//   const balance = await checkBalance();
//   if (balance <= 0) {
//     bot.sendMessage(chatId, '❌ Insufficient balance to trade!');
//     return;
//   }

//   bot.sendMessage(chatId, '🔄 Please enter the amount you want to trade in SOL:');

//   bot.on('message', async (msg) => {
//     const amount = parseFloat(msg.text);
//     if (isNaN(amount) || amount <= 0) {
//       bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid amount to trade.');
//       return;
//     }

//     if (amount > balance / 1000000000) { // Convert lamports to SOL
//       bot.sendMessage(chatId, '❌ Insufficient funds for this trade.');
//       return;
//     }

//     bot.sendMessage(chatId, `💸 You are about to trade ${amount} SOL.`);
//     swapTokens(amount * 1000000000); // Convert SOL to lamports
//   });
// });

// // ✅ Telegram Bot Ready Message
// bot.on('polling_error', (error) => console.log('Telegram Error:', error.message));
// bot.sendMessage(chatId, '🤖 Bot is online! Send /trade to start a swap.');


require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const {  PublicKey } = require("@solana/web3.js");

const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const OpenAI = require('openai');

// ✅ Constants & Configuration
const API_HOST = 'https://gmgn.ai';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const chatId = process.env.CHAT_ID;
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=SOL'; // Update if needed
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
// First, create a list of potential trading tokens
const TRADING_TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
};

// Function to get price data for a single token
async function getTokenPrice(tokenAddress) {
  try {
      const response = await fetch(`${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${INPUT_TOKEN}&token_out_address=${tokenAddress}&in_amount=1000000000&from_address=${fromAddress}&slippage=${SLIPPAGE}`);
      const data = await response.json();
      return data?.data?.price_impact || 0;
  } catch (error) {
      console.error(`Error fetching price for token ${tokenAddress}:`, error);
      return 0;
  }
}

// Function to analyze and find the best trading opportunity
async function findBestTradingOpportunity() {
  try {
      let opportunities = [];
      
      // Get prices for all tokens
      for (const [tokenName, tokenAddress] of Object.entries(TRADING_TOKENS)) {
          try {
              const priceImpact = await getTokenPrice(tokenAddress);
            console.log("tokenAddress",tokenName);
              
              opportunities.push({
                  token: tokenName,
                  address: tokenAddress,
                  priceImpact: priceImpact,
                  score: calculateOpportunityScore(priceImpact)
              });

              // Add delay between requests to avoid rate limiting
              await delay(1000);
          } catch (error) {
              console.error(`Error processing ${tokenName}:`, error);
          }
      }

      // Sort by score (higher score is better)
      opportunities.sort((a, b) => b.score - a.score);
      
      // Send analysis to Telegram
      const analysisMessage = formatOpportunityAnalysis(opportunities);
      await bot.sendMessage(chatId, analysisMessage);

      return opportunities[0]; // Return the best opportunity
  } catch (error) {
      console.error('Error finding best trading opportunity:', error);
      throw error;
  }
}

// Calculate a score for each trading opportunity
function calculateOpportunityScore(priceImpact) {
  // Lower price impact is better
  return -Math.abs(priceImpact); // Negative because lower price impact is better
}

// Format the analysis for Telegram
function formatOpportunityAnalysis(opportunities) {
  return `
🎯 Trading Opportunities Analysis
───────────────────────

${opportunities.map((opp, index) => `
${index + 1}. ${opp.token}
📊 Price Impact: ${opp.priceImpact.toFixed(4)}%
🎯 Score: ${opp.score.toFixed(2)}
`).join('\n')}

Recommendation: ${opportunities[0].token} (${opportunities[0].address})
`;
}



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

function filterSpamTokens(tokens) {
  return tokens.filter(token => {
    const hasDescription = token.description && token.description.trim().length > 10; // Min length to avoid vague entries
    const hasDecentLiquidity = token.totalAmount >= 500; // Arbitrary threshold based on your list
    const notPureMeme = !/pump|pwesident|amewica/i.test(token.description.toLowerCase()); // Exclude obvious meme spam
    return hasDescription && hasDecentLiquidity && notPureMeme;
  });
}


// Modify getTrendingTokens to include Solana addresses
async function getTrendingTokens() {
  try {
      const response = await fetch(dex);
      // console.log("responce =====>>",response);
      const data = await response.json();
      // console.log("data ====>>>>>", data);
            
      // Example usage with your first 15 tokens
      // const first15Tokens = tokens.slice(0, 15);
      const filteredTokens = filterSpamTokens(data);
      console.log("Filtered Tokens:", filteredTokens.length, filteredTokens);
      return data;

      if (!data || !data.pairs) {
          throw new Error('No trending tokens found!');
      }
      // Filter for Solana pairs only
      const solanaPairs = data.pairs.filter(pair => 
          pair.chainId === 'solana' || 
          pair.dexId === 'raydium' || 
          pair.dexId === 'orca'
      );

      // Get top 5 Solana pairs
      const topPairs = solanaPairs.slice(0, 5);

      // Enhance pairs with Solana token addresses
      const enhancedPairs = await Promise.all(topPairs.map(async pair => {
          const solanaTokenAddress = await getSolanaTokenAddress(pair.baseToken.symbol);
          return {
              ...pair,
              baseToken: {
                  ...pair.baseToken,
                  solanaAddress: solanaTokenAddress || pair.baseToken.address
              }
          };
      }));

      return enhancedPairs;
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
      // Find the best trading opportunity
      // const bestOpportunity = await findBestTradingOpportunity();
      const o_token = await getTrendingTokens()
      
      bot.sendMessage(chatId, `
🎯 Best Trading Opportunity Found:
Token: ${o_token[0].tokenAddress}
Address: ${o_token[0].tokenAddress}
Price : ${o_token[0].totalAmount}

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
            console.log("o_token", o_token[0].tokenAddress);
            // swapTokens(amount * 1000000000,o_token[0].tokenAddress); // Convert SOL to lamports
          });
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

const axios = require("axios");

async function getSwapQuote(fromAddress, tokenIn, tokenOut, amount, slippage) {
  const API_HOST = "https://quote-api.jup.ag"; // Jupiter API host
  const quoteUrl = `${API_HOST}/v6/quote?inputMint=${tokenIn}&outputMint=${tokenOut}&amount=${amount}&slippageBps=${slippage * 100}&userPublicKey=${fromAddress}`;

  try {
    const response = await axios.get(quoteUrl);
    return response.data; // Returns the swap route and transaction details
  } catch (error) {
    console.error("Error fetching swap quote:", error.response ? error.response.data : error.message);
    throw error;
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
            
   sellToken(fromAddress, tokenIn, tokenOut, amounts, slippage)
.then((quote) => {
  console.log("Swap Quote:", quote);
  return sendSwapTransaction(quote.swapTransaction);
})
.then(() => {
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
