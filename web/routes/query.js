const _ = require('lodash');
const promisify = require('promisify-node');

const query = promisify(require('../../core/workers/query/query'));
const query2 = promisify(require('../../core/workers/query/query2'));

// starts a scan
// requires a post body with configuration of:
// 
// - config.watch
const route = function *() {

  var config = require('./baseConfig');

  _.merge(config, this.request.body);

  let result = {
    history: yield query(config),
    yesterday: yield query2(config)
  }
  this.body = result;
};

module.exports = route;