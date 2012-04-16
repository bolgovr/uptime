var mongoose = require('mongoose'),
    Schema   = mongoose.Schema,
    TimeCalculator = require('../../lib/timeCalculator'),
    QosAggregator = require('../../lib/qosAggregator'),
    async    = require('async');

var ApacheStat = new Schema({
    timestamp    : { type: Date, default: Date.now }
  , isUp         : Boolean  // false if ping returned a non-OK status code or timed out
  , isResponsive : Boolean  // true if the ping time is less than the check max time
  , time         : Number
  , check        : { type: Schema.ObjectId, ref: 'Check' }
  , tags         : [String]
  , monitorName  : String
  // for pings in error, more details need to be persisted
  , downtime     : Number   // time since last ping if the ping is down
  , error        : String
  , responseData : {} //parsed response from apache http-status-module
});
ApacheStat.index({ timestamp: -1 });
ApacheStat.plugin(require('../../lib/lifecycleEventsPlugin'));

ApacheStat.methods.findCheck = function(callback) {
  return this.db.model('Check').findById(this.check, callback);
};

ApacheStat.statics.createForCheck = function(status, time, check, monitorName, error, callback) {
ApacheStat.statics.createForCheck = function(status, time, check, monitorName, error, result, callback) {
  var timestamp = new Date();
  var apacheStat = new this();
  apacheStat.timestamp = timestamp;
  apacheStat.isUp = status;
  if (status && check.maxTime) {
    apacheStat.isResponsive = time < check.maxTime;
  } else {
    apacheStat.isResponsive = false;
  }
  apacheStat.time = time;
  apacheStat.check = check;
  apacheStat.tags = check.tags;
  apacheStat.monitorName = monitorName;
  if (!status) {
    apacheStat.downtime = check.interval || 60000;
    apacheStat.error = error;
  }
  apacheStat.save(function(err) {
    callback(err, apacheStat);
    if (!err) {
      check.setLastTest(status, timestamp);
      check.save();
    }
  });
};

var mapCheckAndTags = function() {
  var qos = { count: 1, ups: this.isUp ? 1 : 0, responsives: this.isResponsive ? 1 : 0, time: this.time, downtime: this.downtime ? this.downtime : 0 };
  emit(this.check, qos);
  if (!this.tags) return;
  for (index in this.tags) {
    emit(this.tags[index], qos);
  }
};

ApacheStat.statics.updateHourlyQos = function(now, callback) {
  if ('undefined' == typeof callback) {
    // Mogoose Model.update() implementation requires a callback
    callback = function(err) { if (err) console.dir(err); };
  }
  var start = TimeCalculator.resetHour(now);
  var end   = TimeCalculator.completeHour(now);
  var CheckHourlyStat = require('../checkHourlyStat');
  var TagHourlyStat   = require('../tagHourlyStat');
  QosAggregator.getQosForPeriod(this.collection, mapCheckAndTags, start, end, function(err, results) {
    if (err) return;
    async.forEach(results, function(result, cb) {
      var stat = result.value;
      if (result._id.substr) {
        // the key is a string, so it's a tag
        TagHourlyStat.update({ name: result._id, timestamp: start }, { $set: { count: stat.count, ups: stat.ups, responsives: stat.responsives, time: stat.time, downtime: stat.downtime } }, { upsert: true }, cb);
      } else {
        // the key is a check
        CheckHourlyStat.update({ check: result._id, timestamp: start }, { $set: { count: stat.count, ups: stat.ups, responsives: stat.responsives, time: stat.time, downtime: stat.downtime } }, { upsert: true }, cb);
      }
    }, callback);
  });
};

ApacheStat.statics.updateLastHourQos = function(callback) {
  var now = new Date(Date.now() - 1000 * 60 * 6); // 6 minutes in the past, to accomodate script running every 5 minutes
  this.updateHourlyQos(now, callback);
};

ApacheStat.statics.updateLast24HoursQos = function(callback) {
  if ('undefined' == typeof callback) {
    // Mogoose Model.update() implementation requires a callback
    callback = function(err) { if (err) console.dir(err); };
  }
  var start = new Date(Date.now() - (24 * 60 * 60 * 1000));
  var end   = new Date();
  var Check = require('../../models/check');
  var Tag   = require('../../models/tag');
  QosAggregator.getQosForPeriod(this.collection, mapCheckAndTags, start, end, function(err, results) {
    if (err) return;
    async.forEach(results, function(result, cb) {
      if (result._id.substr) {
        // the key is a string, so it's a tag
        var stat = result.value;
        Tag.update({ name: result._id }, { $set: { lastUpdated: end, count: stat.count, ups: stat.ups, responsives: stat.responsives, time: stat.time, downtime: stat.downtime } }, { upsert: true }, cb);
      } else {
        // the key is a check
        Check.findById(result._id, function (err, check) {
          if (err || !check) return;
          check.qos = result.value;
          check.markModified('qos');
          check.save(cb);
        });
      }
    }, callback);
  });
};

ApacheStat.statics.cleanup = function(maxAge, callback) {
  var oldestDateToKeep = new Date(Date.now() - (maxAge ||  3 * 31 * 24 * 60 * 60 * 1000));
  this.find({ timestamp: { $lt: oldestDateToKeep } }).remove(callback);
};

module.exports = mongoose.model('ApacheStat', ApacheStat);
