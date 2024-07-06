const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const moment = require("moment-timezone");
const fetch = require('node-fetch');
const axios = require("axios");

const apiUrl = 'wss://api.csgoroll.com/graphql';
let socket;
let config = {
  cookie: 'Your_Session_cookie example: session=jfknsdjkgnjsdgjksjku124182482skdnsfksd',
  userId: 'Your_CSGORoll_userid',
  discordDepositWebhookUrl: 'Your_webhook_1',
  discordWithdrawWebhookUrl: 'Your_webhook_2'
  //Delete the following examples above and replace with your actual cookie, userid and webhook's.
};
let reconnectAttempts = 0;
let pingInterval;

async function fetchCoinBalance(cookie) {
  try{
      const response = await axios({
      method: "get",
      maxBodyLength: Infinity,
      url: "https://api.csgoroll.com/graphql?operationName=CurrentUser&variables=%7B%7D&extensions=%7B%22persistedQuery%22:%7B%22version%22:1,%22sha256Hash%22:%22324e1751a8004ccb4ce438aa1068883f53e28eacab64e30f6ab61f78768b3b75%22%7D%7D",
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Apollographql-Client-Name': 'csgoroll-www',
        'Apollographql-Client-Version': '086ab4a0',
        'Cookie': cookie,
        'Ngsw-Bypass': 'true',
        'Origin': 'https://www.csgoroll.com',
        'Referer': 'https://www.csgoroll.com/',
        'Sec-Ch-Ua': '"Opera GX";v="109", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
      },
    });

    const wallets = response.data?.data?.currentUser?.wallets;
    const mainWallet = wallets.find(wallet => wallet.name === "MAIN");
    return mainWallet ? mainWallet.amount : null;
  } catch (error) {
    console.error("Error fetching coin balance:", error);
    return null;
  }
}

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
        { name: 'Item', value: marketName, inline: true },
        { name: 'Value', value: value.toString(), inline: true },
        { name: 'Markup', value: `${markup}%`, inline: true },
        { name: 'Total Sticker Value', value: totalStickerValue.toString(), inline: true },
        { name: 'Applied Stickers', value: formatStickers(stickers), inline: false },
        { name: 'Balance', value: coinBalance.toString(), inline: true }
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
    console.error('Error sending to Discord:', error);
  }
}

async function handleTrade(trade) {
  if (trade.status === "LISTED") {
    return; // Skip trades with status "LISTED"
  }
  
  const depositor = trade.depositor || {};
  const withdrawer = trade.withdrawer || {};
  const item = trade.tradeItems && trade.tradeItems[0]; 

  let tradeType = '';
  let webhookUrl = '';
  if (depositor.id === config.userId) {
    tradeType = 'Deposit';
    webhookUrl = config.discordDepositWebhookUrl;
  } else if (withdrawer.id === config.userId) {
    tradeType = 'Withdraw';
    webhookUrl = config.discordWithdrawWebhookUrl;
  } else {
    return; // Not relevant to the user
  }

  const marketName = item ? item.marketName : '-';
  const value = item ? item.value : '-';
  const markup = item ? item.markupPercent : '-';
  const stickers = item ? item.stickers || [] : [];
  const totalStickerValue = calculateTotalStickerValue(stickers);
  
  const coinBalance = await fetchCoinBalance(config.cookie);

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
  try {
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
      reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: 'connection_init' }));
      socket.send(JSON.stringify(createTradePayload));
      socket.send(JSON.stringify(updateTradePayload));
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    });

    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'connection_ack') {
          console.log(`[${moment().tz('Europe/Berlin').format('HH:mm:ss')}] Connected`);
        } else if (message.payload?.data?.createTrade) {
          const trade = message.payload.data.createTrade.trade;
          await handleTrade(trade);
        } else if (message.payload?.data?.updateTrade) {
          const trade = message.payload.data.updateTrade.trade;
          await handleTrade(trade);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      attemptReconnect(config);
    });

    socket.on('close', () => {
      console.log('WebSocket closed, attempting to reconnect...');
      clearInterval(pingInterval);
      attemptReconnect(config);
    });
  } catch (error) {
    console.error('Error establishing WebSocket connection:', error);
    attemptReconnect(config);
  }
}

function attemptReconnect(config) {
  reconnectAttempts++;
  const delay = Math.min(1000 * (2 ** reconnectAttempts), 30000);
  setTimeout(() => connect(config), delay);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  attemptReconnect(config);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  attemptReconnect(config);
});

connect(config);
