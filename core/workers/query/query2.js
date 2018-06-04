const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');

const util = require('../../util');
const dirs = util.dirs();
const log = require(dirs.core + '/log');


var sqlite3 = require('sqlite3').verbose();
// // should be good now
// if (config.debug) var sqlite3 = require('sqlite3').verbose();
// else var sqlite3 = require('sqlite3');


module.exports = function(_config, done) {

  const adapter = _config[_config.adapter];

  _.merge(adapter, {
    dependencies: [{
      module: 'sqlite3',
      version: '3.1.4'
    }]
  });

  var version = adapter.version;
  var dbName = _config.watch.exchange.toLowerCase() + '_' + version + '.db';
  var dir = dirs.gekko + adapter.dataDirectory;

  var fullPath = [dir, dbName].join('/');

  var journalMode = _config.sqlite.journalMode || 'PERSIST';
  var syncMode = journalMode === 'WAL' ? 'NORMAL' : 'FULL';

  var db = new sqlite3.Database(fullPath);
  db.run('PRAGMA synchronous = ' + syncMode);
  db.run('PRAGMA journal_mode = ' + journalMode);
  db.configure('busyTimeout', 1500);

  let statement = `
    
  select 
    'prevAm' as dayOrAm,
    max(a.high) as high,
    min(a.low) as low,
    max(a.dayOpen) as open,
    date
  from (
    select 
      *,
      datetime(start, 'unixepoch', 'localtime') as localtime,
      case when strftime('%H%M', datetime(start, 'unixepoch', 'localtime')) between '${_config.queryOption.baseTime}' and '${_config.queryOption.baseTime}' then open else 0 end as dayOpen,
      strftime('%Y-%m-%d', datetime(start, 'unixepoch', 'localtime')) as date
    from candles_${_config.watch.currency}_${_config.watch.asset}
    where strftime('%Y%m%d', datetime('${_config.queryOption.baseDate}', 'localtime', '-1 day')) = strftime('%Y%m%d', datetime(start, 'unixepoch', 'localtime'))
      and strftime('%H%M', datetime(start, 'unixepoch', 'localtime')) between '${_config.queryOption.baseTime}' and '1200'
  ) a
  group by a.date
  
  union
  
  select 
    'prevDay' as dayOrAm,
    max(a.high) as high,
    min(a.low) as low,
    max(a.dayOpen) as open,
    date
  from (
    select 
      *,
      datetime(start, 'unixepoch', 'localtime') as localtime,
      case when strftime('%H%M', datetime(start, 'unixepoch', 'localtime')) between '${_config.queryOption.baseTime}' and '${_config.queryOption.baseTime}' then open else 0 end as dayOpen,
      strftime('%Y-%m-%d', datetime(start, 'unixepoch', 'localtime')) as date
    from candles_${_config.watch.currency}_${_config.watch.asset}
    where strftime('%Y%m%d', datetime('${_config.queryOption.baseDate}', 'localtime', '-1 day')) = strftime('%Y%m%d', datetime(start, 'unixepoch', 'localtime'))
  ) a
  group by a.date
  
  
    `;

    console.log(statement);
  db.all(statement, function(err, rows) {
    if(err) {

      // bail out if the table does not exist
      if(err.message.split(':')[1] === ' no such table')
        return next(false);

      log.error(err);
      return util.die('DB error !@#%^&*');
    }

    done(err, rows);
  });
};