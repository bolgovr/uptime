var TimeCalculator = function(date) {
  this.date = new Date(date);
};

TimeCalculator.prototype.getDate = function() {
  return this.date;
};

TimeCalculator.prototype.resetHour = function() {
  this.date.setUTCMinutes(0);
  this.date.setUTCSeconds(0);
  this.date.setUTCMilliseconds(0);
};

TimeCalculator.prototype.completeHour = function() {
  this.date.setUTCMinutes(59);
  this.date.setUTCSeconds(59);
  this.date.setUTCMilliseconds(999);
};

TimeCalculator.prototype.resetDay = function() {
  this.resetHour();
  this.date.setUTCHours(0);
};

TimeCalculator.prototype.completeDay = function() {
  this.completeHour();
  this.date.setUTCHours(23);
};

TimeCalculator.prototype.resetMonth = function() {
  this.resetDay();
  this.date.setUTCDate(1);
};

TimeCalculator.prototype.completeMonth = function() {
  this.completeDay();
  var currentMonth = this.date.getUTCMonth();
  this.date.setUTCDate(32);
  while (currentMonth < this.date.getUTCMonth()) {
    this.date.setUTCDate(this.date.getUTCDate() - 1);
  }
};

TimeCalculator.prototype.resetYear = function() {
  this.resetMonth();
  this.date.setUTCMonth(0);
};

['resetHour', 'completeHour', 'resetDay', 'completeDay', 'resetMonth', 'completeMonth', 'resetYear'].forEach(function(name) {
  exports[name] = function(moment) {
    var timeCalculator = new TimeCalculator(moment);
    timeCalculator[name]();
    return timeCalculator.getDate();
  }
});

var hour = 60 * 60 * 1000;
var day = 24 * hour;
var month = 31 * day;
var year = 366 * day;

exports.boundaryFunction = {
  '1h':  function(page) { return new Date(Date.now() - hour * page); },
  '6h':  function(page) { return new Date(Date.now() - 6 * hour * page); },
  '1d':  function(page) { return new Date(Date.now() - day * page); },
  '7d':  function(page) { return new Date(Date.now() - 7 * day * page); },
  'MTD': function(page) {
    var timeCalculator = new TimeCalculator(new Date(Date.now() - month * (page - 1)));
    timeCalculator.resetMonth();
    return timeCalculator.getDate();
   },
  '1m':  function(page) { return new Date(Date.now() - month * page); },
  '3m':  function(page) { return new Date(Date.now() - 3 * month * page); },
  '6m':  function(page) { return new Date(Date.now() - 6 * month * page); },
  'YTD': function(page) {
    var timeCalculator = new TimeCalculator(new Date(Date.now() - year * (page - 1)));
    timeCalculator.resetYear();
    return timeCalculator.getDate();
   },
  '1y':  function(page) { return new Date(Date.now() - year * page); },
  '3y':  function(page) { return new Date(Date.now() - 3 * year * page); }
}; 