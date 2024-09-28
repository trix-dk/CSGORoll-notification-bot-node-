const readline = require('readline');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const moment = require("moment-timezone");
const axios = require("axios");

const apiUrl = 'wss://api.csgoroll.com/graphql';
let sockets = [];
let socket;
let pingInterval;
let reconnectAttempts = 0;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

const currentUserQuery = `
  query CurrentUser {
    currentUser {
      id
      wallets {
        name
        amount
      }
    }
  }
`;

async function fetchCurrentUser(cookie) {
  try {
    const response = await axios({
      method: "post",
      url: "https://api.csgoroll.com/graphql",
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0',
      },
      data: {
        query: currentUserQuery,
        variables: {}
      }
    });

    if (response.data && response.data.data && response.data.data.currentUser) {
      const userData = response.data.data.currentUser;
      console.log('User data fetched:', userData);

      // Set userId dynamically
      const userId = userData.id || null;

      // Get the main wallet balance or fallback to another wallet
      const wallets = userData.wallets || [];
      const mainWallet = wallets.find(wallet => wallet.name === "MAIN") || wallets[0];
      const mainWalletBalance = mainWallet ? mainWallet.amount : null;

      return { userId, mainWalletBalance };
    } else {
      console.error('Invalid response format:', response.data);
      return { userId: null, mainWalletBalance: null };
    }
  } catch (error) {
    console.error("Error fetching current user:", error);
    return { userId: null, mainWalletBalance: null };
  }
}

(async function() {
  const cookie = await prompt('Enter your cookie: ');

  rl.close();

  const { userId, mainWalletBalance } = await fetchCurrentUser(cookie);

  if (!userId) {
    console.error("Failed to fetch user ID.");
    return;
  }

// MAKE SURE TO SET YOUR DISCORDWEBHOOK URLS!!!!
  const config = {
    cookie: cookie,
    userId: userId,
    discordDepositWebhookUrl: 'https://discord.com/api/webhooks/',
    discordWithdrawWebhookUrl: 'https://discord.com/api/webhooks/'
  };
// MAKE SURE TO SET YOUR DISCORDWEBHOOK URLS!!!!

  const createTradePayload = {
    id: uuidv4(),
    type: "subscribe",
    payload: {
      query: `subscription OnCreateTrade {
        createTrade {
          trade {
            id
            status
            depositor {
              id
              steamId
              displayName
              __typename
            }
            withdrawer {
              id
              steamId
              displayName
              __typename
            }
            tradeItems {
              marketName
              value
              markupPercent
              stickers {
                wear
                value
                name
                color
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }`
    }
  };

  const updateTradePayload = {
    id: uuidv4(),
    type: "subscribe",
    payload: {
      query: `subscription OnUpdateTrade {
        updateTrade {
          trade {
            id
            status
            depositor {
              id
              steamId
              displayName
              __typename
            }
            withdrawer {
              id
              steamId
              displayName
              __typename
            }
            tradeItems {
              marketName
              value
              markupPercent
              stickers {
                wear
                value
                name
                color
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }`
    }
  };

  function calculateTotalStickerValue(stickers) {
    return stickers.reduce((total, sticker) => total + (sticker.wear === 0 ? sticker.value || 0 : 0), 0);
  }

  function formatStickers(stickers) {
    return stickers.map(sticker => {
      const stickerInfo = sticker.color ? `${sticker.color} ${sticker.name}` : `${sticker.name}`;
      return sticker.wear === 0 ? `${stickerInfo} Value: ${sticker.value}` : `${stickerInfo} (scraped) Value: ${sticker.value}`;
    }).join('\n');
  }

  async function sendToDiscord(tradeData, webhookUrl) {
    const { tradeType, status, marketName, value, markup, totalStickerValue, coinBalance, stickers } = tradeData;
    const timestamp = moment().tz('Europe/Berlin').format('YYYY-MM-DD HH:mm:ss');
    const embed = {
      embeds: [{
        title: `${tradeType} Trade`,
        description: `**Status**: ${status}`,
        color: tradeType === 'Deposit' ? 15158332 : 3066993,
        fields: [
          {
            name: 'Item',
            value: marketName,
            inline: true
        },
        {
            name: 'Value',
            value: value !== null && value !== undefined ? value.toString() : '-',
            inline: true
        },
        {
            name: 'Markup',
            value: markup !== null && markup !== undefined ? `${markup}%` : '0%',
            inline: true
        },
        {
            name: 'Total Sticker Value',
            value: totalStickerValue !== null && totalStickerValue !== undefined ? totalStickerValue.toString() : '0',
            inline: true
        },
        {
            name: 'Applied Stickers',
            value: formatStickers(stickers) || '',
            inline: false
        },
        {
            name: 'Balance',
            value: coinBalance !== null && coinBalance !== undefined ? coinBalance.toString() : '-',
            inline: true
        }
        
        ],
        footer: { text: `Timestamp: ${timestamp}` }
      }]
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed)
      });

      const data = await response.json();
      console.log('Successfully sent to Discord:', data);
    } catch (error) {
    }
  }

  async function handleTrade(trade) {
    const depositor = trade.depositor || {};
    const withdrawer = trade.withdrawer || {};
    const item = trade.tradeItems && trade.tradeItems[0];

    // Skip "listed" trades (trades that are just listed but not completed)
    if (trade.status === 'listed') {
        return; // Ignore trades in the "listed" status
    }

    let tradeType = '';
    let webhookUrl = '';

    // Log both deposits and withdrawals, but ignore irrelevant trades
    if (depositor.id === config.userId) {
        tradeType = 'Deposit';
        webhookUrl = config.discordDepositWebhookUrl;
    } else if (withdrawer.id === config.userId) {
        tradeType = 'Withdraw';
        webhookUrl = config.discordWithdrawWebhookUrl;
    } else {
        return; // Not relevant for logging
    }

    const marketName = item ? item.marketName : '-';
    const value = item ? item.value : '-';
    const markup = item ? item.markupPercent : '-';
    const stickers = item ? item.stickers || [] : [];
    const totalStickerValue = calculateTotalStickerValue(stickers);

    const coinBalance = await fetchCurrentUser(config.cookie).then(result => result.mainWalletBalance);

    const tradeData = {
        tradeType,
        status: trade.status,
        marketName,
        value,
        markup,
        totalStickerValue,
        stickers,
        coinBalance
    };

    console.log(`[${moment().tz('Europe/Berlin').format('HH:mm:ss')}] [${tradeType}] Status: ${trade.status}, Item: ${marketName}, Value: ${value}, Markup: ${markup}%, Total Sticker Value: ${totalStickerValue}, Coin Balance: ${coinBalance}`);
    await sendToDiscord(tradeData, webhookUrl);
}

  function connect(config) {
    socket = new WebSocket(apiUrl, 'graphql-transport-ws', {
      headers: {
        'Cookie': config.cookie,
        "Sec-WebSocket-Protocol": "graphql-transport-ws",
        "Sec-WebSocket-Version": 13,
        "Upgrade": "websocket",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 OPR/100.0.0.0"
      }
    });

    socket.on('open', () => {
      console.log("Websocket opened")
      reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: 'connection_init' }));
      socket.send(JSON.stringify(createTradePayload));
      socket.send(JSON.stringify(updateTradePayload));
      sockets.push(socket);
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 5000);
    });

    socket.on('message', async (data) => {
      const message = JSON.parse(data);
      const trade = message.payload?.data?.createTrade?.trade || message.payload?.data?.updateTrade?.trade;
      if (trade) {
        await handleTrade(trade);
      }
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err.message);
      clearInterval(pingInterval);
    });

    socket.on('close', () => {
      console.log('WebSocket closed. Attempting to reconnect...');
      clearInterval(pingInterval);
      sockets = sockets.filter(s => s !== socket);
      if (reconnectAttempts < 5) {
        reconnectAttempts++;
        setTimeout(() => connect(config), 1000);
      } else {
        console.error('Failed to reconnect after multiple attempts.');
      }
    });
  }

  connect(config);
})();
