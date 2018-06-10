const log = require('../core/log');
const moment = require('moment');
const _ = require('lodash');
const config = require('../core/util').getConfig();
const watchConfig = config.watch;

const admin = require("firebase-admin");
const serviceAccount = config.firebase.serviceAccount;
const databaseURL = config.firebase.databaseURL;

const Actor = function() {
  _.bindAll(this);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL
  });

  this.gekkoStartTime = moment().utc().format('YYYY-MM-DD');

  this.dates = {
    start: false,
    end: false
  }

  this.startPrice = 0;
  this.endPrice = 0;

  this.exchange = watchConfig.exchange;
  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.trades = 0;

  this.sharpe = 0;

  this.roundTrips = [];
  this.roundTrip = {
    id: 0,
    entry: false,
    exit: false
  }

  this.db = admin.database();
  this.ref = this.db.ref('gekko');
};

Actor.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.dates.end = candle.start;

  if(!this.dates.start) {
    this.dates.start = candle.start;
    this.startPrice = candle.close;
  }

  this.endPrice = candle.close;

  done();
}

Actor.prototype.processTrade = function(trade) {
  let currency = config.watch.currency;
  let asset = config.watch.asset;
  let exchange = config.watch.exchange;
  
  this.current = trade.portfolio;

  // const report = this.calculateReportStatistics();

  this.logRoundtripPart(trade);
}

Actor.prototype.processPortfolioUpdate = function(portfolio) {
  this.start = portfolio;
  this.current = _.clone(portfolio);
}

// Actor.prototype.calculateReportStatistics = function() {
//   // the portfolio's balance is measured in {currency}
//   let balance = this.current.currency + this.price * this.current.asset;
//   let profit = balance - this.start.balance;
//   let timespan = moment.duration(
//     this.dates.end.diff(this.dates.start)
//   );
//   let relativeProfit = balance / this.start.balance * 100 - 100

//   let report = {
//     currency: this.currency,
//     asset: this.asset,

//     startTime: this.dates.start.utc().format('YYYY-MM-DD HH:mm:ss'),
//     endTime: this.dates.end.utc().format('YYYY-MM-DD HH:mm:ss'),
//     timespan: timespan.humanize(),
//     market: this.endPrice * 100 / this.startPrice - 100,

//     balance: balance,
//     profit: profit,
//     relativeProfit: relativeProfit,

//     yearlyProfit: this.round(profit / timespan.asYears()),
//     relativeYearlyProfit: this.round(relativeProfit / timespan.asYears()),

//     startPrice: this.startPrice,
//     endPrice: this.endPrice,
//     trades: this.trades,
//     startBalance: this.start.balance,
//     sharpe: this.sharpe
//   }

//   report.alpha = report.profit - report.market;

//   return report;
// }

Actor.prototype.logRoundtripPart = function(trade) {
  // this is not part of a valid roundtrip
  if(!this.roundTrip.entry && trade.action === 'sell') {
    return;
  }

  if(trade.action === 'buy') {
    if (this.roundTrip.exit) {
      this.roundTrip.id++;
      this.roundTrip.exit = false
    }

    this.roundTrip.entry = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
      percent: trade.percent
    }
  } else if(trade.action === 'sell') {
    this.roundTrip.exit = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }

    this.handleRoundtrip();
  }
}

Actor.prototype.handleRoundtrip = function() {
  var roundtrip = {
    id: this.roundTrip.id,

    entryAt: this.roundTrip.entry.date,
    entryPrice: this.roundTrip.entry.price,
    entryBalance: this.roundTrip.entry.total,
    entryPercent: this.roundTrip.entry.percent,

    exitAt: this.roundTrip.exit.date,
    exitPrice: this.roundTrip.exit.price,
    exitBalance: this.roundTrip.exit.total,

    duration: this.roundTrip.exit.date.diff(this.roundTrip.entry.date)
  }

  roundtrip.pnl = roundtrip.exitBalance - roundtrip.entryBalance;
  roundtrip.profit = (100 * roundtrip.exitBalance / roundtrip.entryBalance) - 100;

  this.roundTrips[this.roundTrip.id] = roundtrip;

  // this will keep resending roundtrips, that is not ideal.. what do we do about it?
  // this.handler.handleRoundtrip(roundtrip);

  var userRef = this.ref.child(`${this.exchange}/roundtrip_${this.currency}_${this.asset}_${this.gekkoStartTime}`);

  userRef.push({
    entryAt: roundtrip.entryAt.unix(),
    entryPrice: roundtrip.entryPrice,
    entryBalance: roundtrip.entryBalance,
    entryPercent: roundtrip.entryPercent,

    exitAt: roundtrip.exitAt.unix(),
    exitPrice: roundtrip.exitPrice,
    exitBalance: roundtrip.exitBalance,

    duration: roundtrip.duration,

    pnl: roundtrip.pnl,
    profit: roundtrip.profit
  });
}

Actor.prototype.round = function(amount) {
  return amount.toFixed(8);
}

module.exports = Actor;
