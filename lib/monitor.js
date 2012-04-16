/**
 * Module dependencies.
 */
var http       = require('http'),
    url        = require('url'),
    Check      = require('../models/check'),
    CheckEvent = require('../models/checkEvent'),
    Ping       = require('../models/ping');

/**
 * Monitor constructor
 *
 * @param {Number} Interval between each poll in milliseconds, defaults to 10 seconds
 * @param {Number} Interval between each update of the QoS score in milliseconds, defaults to 1 minute
 * @param {Number} Interval between each daily and hourly aggregation the QoS score in milliseconds, defaults to 1 hour
 * @param {Number} Request timeout in milliseconds, defaults to 5 seconds
 * @param {Number} Oldest ping and checkEvent age to keep in milliseconds, defaults to 3 months
 * @api   public
 */
function Monitor(config) {
  config.pollingInterval = config.pollingInterval || 10 * 1000;
  config.updateInterval = config.updateInterval || 60 * 1000;
  config.qosAggregationInterval = config.qosAggregationInterval || 60 * 60 * 1000;
  config.timeout = config.timeout || 5 * 1000;
  config.oldestHistory = config.oldestHistory || 3 * 31 * 24 * 60 * 60 * 1000;
  config.proxy = config.proxy || {};
  this.config = config;
}

/**
 * Start the monitoring of all checks.
 *
 * The polling actually starts after the pollingInterval set to the constructor.
 *
 * @api   public
 */
Monitor.prototype.start = function() {
  // start polling right away
  this.pollChecksNeedingPoll();
  // schedule future polls
  this.intervalForPoll   = setInterval(this.pollChecksNeedingPoll.bind(this), this.config.pollingInterval);
  // schedule updates
  this.intervalForUpdate = setInterval(this.updateAllChecks.bind(this), this.config.updateInterval);
  this.intervalForAggregation = setInterval(this.aggregateQos.bind(this), this.config.qosAggregationInterval);
  console.log('Monitor ' + this.config.name + ' started');
}

/**
 * Stop the monitoring of all checks
 *
 * @api   public
 */
Monitor.prototype.stop = function() {
  clearInterval(this.config.intervalForPoll);
  clearInterval(this.config.intervalForUpdate);
  clearInterval(this.config.intervalForAggregation);
}

/**
 * Find checks that need to be polled.
 *
 * A check needs to be polled if it was last polled sine a longer time than its own interval.
 *
 * @param {Function} Callback function to be called with each Check
 * @api   private
 */
Monitor.prototype.pollChecksNeedingPoll = function(callback) {
  var self = this;
  this.findChecksNeedingPoll(function(err, checks) {
    if (err) {
      console.log(err);
      if (callback) callback(err);
      return;
    }
    checks.forEach(function(check) {
      self.pollCheck(check, function(err) {
        if (err) console.log(err);
      });
    });
  });
};

Monitor.prototype.findChecksNeedingPoll = function(callback) {
  var api = url.parse(this.config.apiUrl + '/check/needingPoll');
  var self = this;
  http.get(api, function(res) {
    if (res.statusCode != 200) {
      return callback(new Error(self.config.apiUrl + '/check/needingPollCheck resource responded with error code: ' + res.statusCode));
    }
    var body = '';
    res.on('data', function(chunk) {
      body += chunk.toString();
    });
    res.on('end', function() {
      callback(null, JSON.parse(body));
    });
  }).on('error', function(e) {
    callback(new Error(self.config.apiUrl + '/check/needingPollCheck resource not available: ' + e.message));
  });
};

/**
 * Poll a given check, and create a ping according to the result.
 *
 * @param {Object} check is a simple JSON object returned by the API, NOT a Check object
 * @api   private
 */
Monitor.prototype.pollCheck = function(check, callback) {
  if (!check) return;
  var self = this;
  var Poller = require('./pollers/' + (check.type || 'http'));
  p = new Poller(check.url, this.config.timeout, function(err, time) {
    self.createPing(check, err, time, callback);
  });
  //p.setDebug(true);
  p.poll();
}

Monitor.prototype.createPing = function(check, error, time, callback) {
  status = error ? 'false' : 'true';
  var postData = 'checkId=' + check._id + '&status=' + status + '&time=' + time + '&name=' + this.config.name + '&error=' + (error ? error.message : '');
  var options = url.parse(this.config.apiUrl + '/ping');
  options.method = 'POST';
  options.headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': postData.length
  }
  var self = this;
  var req = http.request(options, function(res) {
    if (res.statusCode != 200) {
      return callback(new Error(self.config.apiUrl + '/ping resource responded with error code: ' + res.statusCode));
    }
    var body = '';
    res.on('data', function(chunk) {
    body += chunk;
    });
    res.on('end', function() {
      if (callback) callback(null, body);
    });
  }).on('error', function(e) {
    callback(new Error(self.config.apiUrl + '/ping resource not available: ' + e.message));
  });
  req.write(postData);
  req.end();
}

/**
 * Update the QoS scores for each check once
 *
 * @api private
 */
Monitor.prototype.updateAllChecks = function() {
  Ping.updateLast24HoursQos.apply(Ping);
  Ping.updateLastHourQos.apply(Ping);
}

/**
 * Aggregate the QoS scores for each check
 *
 * @api private
 */
Monitor.prototype.aggregateQos = function() {
  var CheckHourlyStat = require('../models/checkHourlyStat');
  CheckHourlyStat.updateLastDayQos.apply(CheckHourlyStat);
  CheckHourlyStat.updateLastMonthQos.apply(CheckHourlyStat);
  var TagHourlyStat = require('../models/tagHourlyStat');
  TagHourlyStat.updateLastDayQos.apply(TagHourlyStat);
  TagHourlyStat.updateLastMonthQos.apply(TagHourlyStat);
  Ping.cleanup(this.config.oldestHistory);
  CheckEvent.cleanup(this.config.oldestHistory);
}

/**
 * Create a monitor to poll all checks at a given interval.
 *
 * Example:
 *
 *    m = monitor.createMonitor({ pollingInterval: 60000});
 *    m.start();
 *    // the polling starts, every 60 seconds
 *    m.stop();
 *
 * @param {Object} Configuration object
 * @api   public
 */
exports.createMonitor = function(config) {
  return new Monitor(config);
}
