var supportedStats = {
  'ping': require('./checkPlugins/ping.js')
};

module.exports = function (checkPluginName) {
  return supportedStats[checkPluginName];
};
module.exports.all = function () {
  var stats = [];
  for(var i in supportedStats) {
    stats.push(supportedStats[i]);
  }
  return stats;
};
