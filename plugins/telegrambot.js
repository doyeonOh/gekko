const log = require('../core/log');
const moment = require('moment');
const _ = require('lodash');
const config = require('../core/util').getConfig();
const telegrambot = config.telegrambot;
const utc = moment.utc;
const telegram = require("node-telegram-bot-api");

const Actor = function() {
  _.bindAll(this);

  this.advice = null;
  this.adviceTime = utc();

  this.price = 'Dont know yet :(';
  this.priceTime = utc();

  this.commands = {
    '/start': 'emitStart',
    '/advice': 'emitAdvice',
    '/subscribe': 'emitSubscribe',
    '/unsubscribe': 'emitUnSubscribe',
    '/price': 'emitPrice',
    '/help': 'emitHelp'
  };
  
  this.rawCommands = _.keys(this.commands);
  this.chatId = null;
  this.subscribers = [];
  this.bot = new telegram(telegrambot.token, { polling: true });
  this.bot.onText(/(.+)/, this.verifyQuestion);
};

Actor.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.priceTime = candle.start;

  done();
};

Actor.prototype.processAdvice = function(advice) {
  if (advice.recommendation === 'soft') return;
  this.advice = advice.recommendation;
  this.adviceTime = utc();
  this.advicePrice = this.price;

  for(let subscriber of this.subscribers) {
    this.emitAdvice(subscriber);
  }
  // this.subscribers.forEach(this.emitAdvice, this);
};

Actor.prototype.processTrade = function(trade) {
  for(let subscriber of this.subscribers) {
    this.emitTrade(subscriber, trade);
  }
}

Actor.prototype.emitTrade = function(chatId, trade) {
  let message = '';
  
  if (trade) {
    const tradeDate = new Date(trade.date);
    const dateString = tradeDate.getFullYear() + '-' + (tradeDate.getMonth() + 1) + '-' + tradeDate.getDate() + ' ' 
      + tradeDate.getHours() + ':' + tradeDate.getMinutes() + ':' + tradeDate.getSeconds();
  
    message += 
      '시간: ' + dateString + '\n' + 
      '거래소: '+ config.watch.exchange + ' ' + config.watch.currency + '/' + config.watch.asset + '\n' +
      '전략: ' + config.tradingAdvisor.method + '\n' +
      '액션: ' + trade.action.toUpperCase() + '\n' +
      '거래가격: ' + trade.price + ' ' + config.watch.asset  + '\n' +
      (trade.action === 'buy' ? ('변동성 조절: ' + `${trade.percent * 100} %`)  + '\n' : '') + 
      '거래 후 자산: ' + trade.portfolio.asset + ' ' + config.watch.asset + '\n' +
      '거래 후 통화: ' + trade.portfolio.currency + ' ' + config.watch.currency + '\n' +
      '잔액: 약' + Math.round(trade.portfolio.asset * trade.price + trade.portfolio.currency) + ' ' + config.watch.currency + '\n';
  } else {
    message += '없음'
  }

  if (chatId) {
    this.bot.sendMessage(chatId, message);
  } else {
    this.bot.sendMessage(this.chatId, message);
  }
}


Actor.prototype.verifyQuestion = function(msg, text) {
  this.chatId = msg.chat.id;
  if (text[1].toLowerCase() in this.commands) {
    this[this.commands[text[1].toLowerCase()]]();
  } else {
    this.emitHelp();
  }
};

Actor.prototype.emitStart = function() {
  this.bot.sendMessage(this.chatId, 'Hello! How can I help you?');
};

Actor.prototype.emitSubscribe = function() {
  if (this.subscribers.indexOf(this.chatId) === -1) {
    this.subscribers.push(this.chatId);
    this.bot.sendMessage(this.chatId, `Success! Got ${this.subscribers.length} subscribers.`);
  } else {
    this.bot.sendMessage(this.chatId, "You are already subscribed.");
    console.log(this.subscribers);
  }
};

Actor.prototype.emitUnSubscribe = function() {
  if (this.subscribers.indexOf(this.chatId) > -1) {
    this.subscribers.splice(this.subscribers.indexOf(this.chatId), 1);
    this.bot.sendMessage(this.chatId, "Success!");
  } else {
    this.bot.sendMessage(this.chatId, "You are not subscribed.");
  }
};

Actor.prototype.emitAdvice = function(chatId) {
  let message = [
    '거래소: ', config.watch.exchange, '\n', 
    '통화: ', config.watch.currency, '/', config.watch.asset, '\n',
    '전략: ', config.tradingAdvisor.method, '\n',
    '캔들사이즈: ', config.tradingAdvisor.candleSize, '분\n',
  ].join('');
  if (this.advice) {
    message += 
      '거래: ' + this.advice + '\n' +
      '거래가격: ' + this.advicePrice + config.watch.asset + '\n' +
      '시간: ' + this.adviceTime.fromNow();
  } else {
    message += '없음'
  }

  if (chatId) {
    // this.bot.sendMessage(chatId, message);
  } else {
    this.bot.sendMessage(this.chatId, message);
  }
};

// sent price over to the last chat
Actor.prototype.emitPrice = function() {
  const message = [
    'Current price at ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' is ',
    this.price,
    ' ',
    config.watch.currency,
    ' (from ',
    this.priceTime.fromNow(),
    ')'
  ].join('');

  this.bot.sendMessage(this.chatId, message);
};

Actor.prototype.emitDonate = function() {
  this.bot.sendMessage(this.chatId, telegrambot.donate);
};

Actor.prototype.emitHelp = function() {
  let message = _.reduce(
    this.rawCommands,
    function(message, command) {
      return message + ' ' + command + ',';
    },
    'Possible commands are:'
  );
  message = message.substr(0, _.size(message) - 1) + '.';
  this.bot.sendMessage(this.chatId, message);
};

Actor.prototype.logError = function(message) {
  log.error('Telegram ERROR:', message);
};

module.exports = Actor;
